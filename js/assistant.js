/**
 * assistant.js — AI Yacoup.
 *
 * Two brains, in this order:
 *
 *  1. An on-device intent matcher that answers from the water balance the phone
 *     just computed. It works with the radio off, it is instant, and it cannot
 *     invent a number, because every number it says came out of agro.js.
 *  2. An optional online bridge for open questions, used only when the farmer has
 *     signal and has configured one. The field numbers are still computed locally
 *     and passed in as grounding, so the model narrates facts rather than guessing.
 *
 * Brain 1 is the default on purpose. A farmer standing in a field at 5 a.m. with
 * one bar of signal should not have to wait on a round trip to be told to wait
 * for the rain.
 */

import { t, tCrop, tStage, num, money, getLang, dateLabel } from './i18n.js';
import { METHODS, addDays, tolerantCrops } from './agro.js';

/* ------------------------------------------------------- text normalisation -- */
/**
 * Arabic is written with optional diacritics and several interchangeable letter
 * forms, and a phone keyboard produces whichever the writer happens to use. Both
 * the query and the keywords are folded to one form before matching, so "أسقي",
 * "اسقي" and "اسقِ" are the same word as far as the matcher is concerned.
 */
const AR_MARKS = /[ً-ْٰـ]/g; // harakat, dagger alef, tatweel
const fold = (s) => String(s).toLowerCase()
  .replace(AR_MARKS, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ؤ/g, 'و')
  .replace(/ئ/g, 'ي')
  .replace(/ة/g, 'ه');

/* --------------------------------------------------------------- intents -- */
/**
 * Keyword sets per intent, in Arabic and English. Matching is deliberately loose:
 * recall matters more than precision here, because the fallback is a useful
 * summary rather than an error.
 */
const INTENTS = [
  { id: 'water_when', words: [
    'when water', 'when irrigate', 'when to water', 'should i water', 'irrigate today', 'water today',
    'متى اسق', 'متى الري', 'متى ارو', 'اسق اليوم', 'هل اسق', 'وقت الري', 'موعد الري'
  ] },
  { id: 'water_how_much', words: [
    'how much water', 'how many mm', 'how much irrigation', 'depth', 'litre', 'liter',
    'كم ماء', 'كم من الماء', 'كميه الري', 'كميه الماء', 'كم ملم', 'كم متر مكعب'
  ] },
  { id: 'rain', words: [
    'rain', 'rainfall', 'monsoon', 'shower',
    'مطر', 'امطار', 'هطول', 'الامطار'
  ] },
  { id: 'weather', words: [
    'weather', 'temperature', 'hot', 'cold', 'wind', 'humid',
    'طقس', 'حراره', 'درجه الحراره', 'رياح', 'رطوبه', 'الجو'
  ] },
  { id: 'save_water', words: [
    'save water', 'less water', 'water saving', 'drip', 'sprinkler', 'awd',
    'توفير', 'اوفر', 'وفر', 'ترشيد', 'تنقيط', 'بالتنقيط', 'اقتصاد الماء'
  ] },
  { id: 'cost', words: [
    'cost', 'price', 'money', 'bill', 'diesel', 'expense',
    'تكلفه', 'كلفه', 'سعر', 'مصاريف', 'ديزل', 'سولار', 'فلوس', 'كهرباء'
  ] },
  { id: 'stage', words: [
    'stage', 'growth', 'harvest', 'flowering', 'sowing', 'crop age',
    'مرحله', 'نمو', 'حصاد', 'ازهار', 'عمر المحصول', 'الزراعه'
  ] },
  { id: 'flood', words: [
    'flood', 'waterlog', 'drain',
    'فيضان', 'غرق', 'صرف', 'تصريف', 'سيول', 'غمر'
  ] },
  { id: 'drought', words: [
    'drought', 'dry spell', 'no rain',
    'جفاف', 'قحط', 'جاف', 'بدون مطر'
  ] },
  { id: 'salinity', words: [
    'salinity', 'salt', 'salty', 'brackish', 'ec ',
    'ملوحه', 'ملح', 'مالحه', 'مالح', 'جوده المياه', 'تحليل المياه'
  ] },
  // Deliberately narrow. "Week" alone is not a plan question: "will it rain this
  // week" is about rain, and a greedy match on الأسبوع stole it.
  { id: 'plan', words: [
    'plan', 'schedule', 'my week',
    'خطه', 'جدول', 'برنامج الري', 'خطه الري', 'مواعيد الري'
  ] },
  { id: 'greeting', words: [
    'hello', 'hi ', 'help', 'salam',
    'مرحبا', 'السلام عليكم', 'اهلا', 'مساعده', 'صباح الخير'
  ] }
];

function detect(text) {
  const q = ' ' + fold(text).trim() + ' ';
  let best = null, bestScore = 0;
  for (const intent of INTENTS) {
    let score = 0;
    for (const w of intent.words) {
      const needle = fold(w);
      if (q.includes(needle)) score += needle.length;
    }
    if (score > bestScore) { bestScore = score; best = intent.id; }
  }
  return bestScore > 0 ? best : null;
}

/* ------------------------------------------------------- answer builders -- */
const pct = (x) => Math.round(x);

function whenLabel(advice) {
  if (advice.verdict === 'irrigate' || advice.verdict === 'urgent') return t('vIrrigate');
  if (advice.nextIrrigationDate) {
    const days = Math.max(0, Math.round(
      (Date.parse(advice.nextIrrigationDate) - Date.parse(advice.date)) / 86400000));
    if (days <= 1) return t('tomorrow');
    return t('inDays', { n: num(days) });
  }
  return t('inDays', { n: num(Math.max(advice.daysOfSlack, 1)) });
}

/**
 * Builds the answer for one intent from a live advice object. Each branch reads
 * numbers straight off the model; nothing here is phrased as a certainty the
 * model did not produce.
 */
function answerFor(intent, ctx) {
  const { advice, field, weather, risks } = ctx;
  const L = [];

  if (!advice && ['water_when', 'water_how_much', 'cost', 'stage', 'save_water', 'salinity', 'plan'].includes(intent)) {
    return t('noFieldYet');
  }

  switch (intent) {
    case 'water_when': {
      L.push(verdictLine(advice, field));
      L.push(`${t('soilWater')}: ${num(advice.soilWaterPct)}%`);
      if (advice.verdict === 'wait') {
        L.push(t('savingBody', { m3: num(advice.savedM3), money: money(advice.cost) }));
      } else if (advice.verdict === 'ok') {
        L.push(`${t('nextWater')}: ${whenLabel(advice)}`);
      }
      break;
    }
    case 'water_how_much': {
      L.push(`${t('waterDepth')}: ${num(advice.grossMm)} ${t('uMm')}`);
      L.push(`${t('volume')}: ${num(advice.volumeM3)} ${t('uM3')}`);
      L.push(`${t('pumpTime')}: ${num(advice.pumpHours, 1)} ${t('uHour')}`);
      L.push(`${t('runningCost')}: ${money(advice.cost)}`);
      break;
    }
    case 'cost': {
      L.push(`${t('runningCost')}: ${money(advice.cost)} (${num(advice.pumpHours, 1)} ${t('uHour')}, ${num(advice.volumeM3)} ${t('uM3')})`);
      if (advice.savedM3 > 0) L.push(t('savingBody', { m3: num(advice.savedM3), money: money(advice.cost) }));
      break;
    }
    case 'rain': {
      const days = (weather?.series || []).filter((d) => d.forecast).slice(0, 7);
      const total = days.reduce((a, d) => a + (d.rain || 0), 0);
      L.push(`${t('rain7')}: ${num(total)} ${t('uMm')}`);
      const wet = days.filter((d) => (d.rain || 0) >= 2.5);
      for (const d of wet.slice(0, 4)) {
        L.push(`• ${dateLabel(d.date)} — ${num(d.rain, 1)} ${t('uMm')}${d.pop != null ? ` (${pct(d.pop)}%)` : ''}`);
      }
      if (!wet.length) L.push(t('aDryspell', { n: num(7) }));
      break;
    }
    case 'weather': {
      const c = weather?.current;
      if (c) {
        L.push(`${num(c.temp, 1)}°C · ${t('feelsLike')} ${num(c.feels, 1)}°C`);
        L.push(`${t('humidity')} ${pct(c.humidity)}% · ${t('wind')} ${num(c.wind)} km/h`);
      }
      const d0 = (weather?.series || []).find((d) => d.forecast);
      if (d0) L.push(`${t('rainToday')}: ${num(d0.rain, 1)} ${t('uMm')}`);
      break;
    }
    case 'save_water': {
      if (advice.ponded && advice.awd) {
        L.push(t('awdSaving', { m3: num(advice.awd.savedM3), pct: num(advice.awd.savedPct) }));
      }
      if (field && field.method !== 'drip') {
        const gain = Math.round((1 - METHODS[field.method] / METHODS.drip) * 100);
        if (gain > 0) L.push(t('efficiencyTip', { pct: num(gain) }));
      }
      if (advice.verdict === 'wait') {
        L.push(t('savingBody', { m3: num(advice.savedM3), money: money(advice.cost) }));
      }
      if (advice.season?.savedM3 > 0) {
        L.push(t('savedBody', {
          m3: num(advice.season.savedM3), pct: num(advice.season.savedPct),
          money: money(advice.season.savedM3 * (advice.volumeM3 > 0 ? advice.cost / advice.volumeM3 : 0))
        }));
      }
      if (!L.length) L.push(t('rSoilHas'));
      break;
    }
    case 'stage': {
      L.push(`${tCrop(field.crop)} · ${tStage(advice.stage)}`);
      L.push(t('dayNo', { n: num(advice.das) }));
      L.push(`${t('cropUsed')}: ${num(advice.etc, 1)} ${t('uMm')}`);
      break;
    }
    case 'flood': {
      const f = risks?.find((r) => r.key === 'floodWarning' || r.key === 'floodWatch' || r.key === 'riverHigh');
      L.push(f ? riskLine(f) : t('noAlerts'));
      break;
    }
    case 'drought': {
      const d = risks?.find((r) => r.key === 'drought' || r.key === 'dryspell');
      L.push(d ? riskLine(d) : t('noAlerts'));
      break;
    }
    case 'salinity': {
      const s = advice.salt;
      if (!s || s.ecw <= 0) { L.push(t('ecwHelp')); break; }
      const crop = tCrop(field.crop);
      const pctLoss = num(s.yieldLoss);
      L.push({
        none: t('saltNone'),
        mild: t('saltMild', { pct: pctLoss }),
        high: t('saltHigh', { pct: pctLoss, crop }),
        severe: t('saltSevere', { pct: pctLoss, crop })
      }[s.level]);
      if (advice.leachingMm > 0.5) L.push(t('leachNote', { mm: num(advice.leachingMm) }));
      if (s.level === 'high' || s.level === 'severe') {
        const better = tolerantCrops(s.ecw, 3)
          .filter((x) => x.key !== field.crop)
          .map((x) => `${tCrop(x.key)} (${num(x.loss)}${t('uPct')})`)
          .join('، ');
        if (better) L.push(t('trySalt', { crops: better }));
      }
      break;
    }
    case 'plan': {
      if (!advice.plan?.length) { L.push(t('noFieldYet')); break; }
      L.push(t('weekPlan') + ':');
      for (const p of advice.plan) {
        L.push(`• ${dateLabel(p.date)} — ${p.irrigate
          ? `${t('planWater')} ${num(p.grossMm)} ${t('uMm')} (${num(p.volumeM3)} ${t('uM3')})`
          : t('planRest')}`);
      }
      L.push(t('planNote'));
      break;
    }
    case 'greeting':
      L.push(`${t('assistantName')} — ${t('assistantIntro')}`);
      break;
    default:
      return null;
  }
  return L.filter(Boolean).join('\n');
}

export function verdictLine(advice, field) {
  const head = {
    urgent: t('vUrgent'), irrigate: t('vIrrigate'), wait: t('vWait'), ok: t('vOk')
  }[advice.verdict];
  const why = {
    severeStress: t('rSevere'), belowThreshold: t('rBelow'),
    rainCoversNeed: t('rRainCovers'), rainExpected: t('rRainExpect'), soilHasWater: t('rSoilHas')
  }[advice.reasonKey];
  const who = field?.name ? `${field.name} (${tCrop(field.crop)})` : tCrop(field?.crop || '');
  return `${who} — ${head}. ${why}`;
}

export function riskLine(r) {
  switch (r.key) {
    case 'floodWarning': return t('aFloodWarn', { mm: num(r.mm) });
    case 'floodWatch':   return t('aFloodWatch', { mm: num(r.mm) });
    case 'heavyRain':    return t('aHeavyRain', { mm: num(r.mm) });
    case 'drought':      return t('aDrought', { n: num(r.days), mm: num(r.deficit) });
    case 'dryspell':     return t('aDryspell', { n: num(r.days) });
    case 'heat':         return t('aHeat', { t: num(r.tmax) });
    case 'riverHigh':    return t('aRiverHigh', { x: r.x });
    case 'sprayWindow':  return t('aSprayWindow');
    default: return '';
  }
}

/* --------------------------------------------------- the online-only tasks -- */
/**
 * The bridge URL for a task. The farmer configures one base URL in Settings and
 * every task hangs off the same origin, so there is one thing to get right.
 */
const taskUrl = (bridge, task) => bridge.replace(/\/api\/[a-z]+\/?$/, '') + '/api/' + task;

async function postTask(url, payload, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.answer) throw new Error(data.error || 'empty');
    return data.answer;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Photo diagnosis. The image goes up with the same field numbers the phone
 * computed, so leaf symptoms can be read against the actual water balance
 * rather than guessed at in isolation.
 */
export async function diagnose(imageDataUrl, ctx, note) {
  if (!ctx.aiBridge) throw new Error('no-bridge');
  return postTask(taskUrl(ctx.aiBridge, 'diagnose'), {
    image: imageDataUrl,
    note,
    grounding: groundingFor(ctx)
  }, 60000);
}

/**
 * A whole-farm review. Every field at once is the one question the on-device
 * brain genuinely cannot answer: it can decide one field's irrigation, but it
 * cannot weigh a cropping pattern against a water budget.
 */
export async function farmReport(ctx) {
  if (!ctx.aiBridge) throw new Error('no-bridge');
  const grounding = {
    language: getLang(),
    today: new Date().toISOString().slice(0, 10),
    place: ctx.place?.name,
    waterSalinityEc: ctx.ecw ?? 0,
    fields: (ctx.cards || []).filter((c) => c.advice).map(({ field, advice }) => ({
      name: field.name || field.crop,
      crop: field.crop, soil: field.soil, method: field.method, areaHa: field.area,
      stage: advice.stage,
      verdict: advice.verdict,
      soilWaterPercent: Math.round(advice.soilWaterPct),
      cropWaterUseMmPerDay: +advice.etc.toFixed(1),
      seasonRainMm: Math.round(advice.season.rainMm),
      seasonAppliedMm: Math.round(advice.season.irrigationMm),
      seasonCropUseMm: Math.round(advice.season.etcMm),
      savedM3: Math.round(advice.season.savedM3 ?? 0),
      savedPercent: advice.season.savedPct ?? 0,
      salinityYieldLossPercent: Math.round(advice.salt?.yieldLoss ?? 0),
      leachingFraction: +(advice.salt?.lr ?? 0).toFixed(2),
      nextIrrigation: advice.nextIrrigationDate
    })),
    warnings: (ctx.risks || []).map((r) => r.key)
  };
  return postTask(taskUrl(ctx.aiBridge, 'report'), { grounding }, 60000);
}

/* ------------------------------------------------------------ the bridge -- */
/**
 * Sends the question plus a compact, already-computed snapshot of the farm to a
 * proxy the farmer configured. The proxy holds the API key; this app never does.
 */
/** The farm snapshot every online task is grounded on. Computed here, never there. */
function groundingFor(ctx) {
  const { advice, field, weather, risks } = ctx;
  return {
    language: getLang(),
    today: advice?.date ?? new Date().toISOString().slice(0, 10),
    place: ctx.place?.name,
    field: field && {
      name: field.name, crop: field.crop, soil: field.soil,
      method: field.method, areaHa: field.area, sowing: field.sowing
    },
    computed: advice && {
      verdict: advice.verdict, reason: advice.reasonKey,
      stage: advice.stage, daysAfterSowing: advice.das,
      soilWaterPercent: Math.round(advice.soilWaterPct),
      applyGrossMm: Math.round(advice.grossMm),
      volumeM3: Math.round(advice.volumeM3),
      pumpHours: +advice.pumpHours.toFixed(1),
      cost: money(advice.cost),
      cropWaterUseMmPerDay: +advice.etc.toFixed(1),
      nextIrrigation: advice.nextIrrigationDate,
      rainNext3DaysMm: Math.round(advice.rain3)
    },
    forecast: (weather?.series || []).filter((d) => d.forecast).slice(0, 7)
      .map((d) => ({ date: d.date, rainMm: Math.round(d.rain), maxC: Math.round(d.tmax), rainChance: d.pop })),
    warnings: (risks || []).map((r) => r.key)
  };
}

/** Free-form question to the bridge, grounded on the same snapshot. */
async function askBridge(url, question, ctx) {
  return postTask(url, { question, grounding: groundingFor(ctx) }, 25000);
}

/* ---------------------------------------------------------------- public -- */
/**
 * Answers a question. Resolves to { text, source } where source is 'local' or
 * 'cloud', so the UI can be honest with the farmer about where the words came from.
 */
export async function ask(question, ctx) {
  const intent = detect(question);

  // A recognised, field-specific question is always answered on-device: it is
  // faster, it works offline, and the numbers are the ones already on screen.
  if (intent) {
    const local = answerFor(intent, ctx);
    if (local) return { text: local, source: 'local', intent };
  }

  const bridge = ctx.aiBridge;
  if (bridge && navigator.onLine) {
    try {
      const text = await askBridge(bridge, question, ctx);
      if (text) return { text, source: 'cloud', intent };
    } catch (e) {
      console.warn('AI Yacoup bridge unavailable', e);
    }
  }

  // Offline and unrecognised: give the farmer today's decision anyway rather
  // than an apology, then say plainly that the question was not understood.
  if (ctx.advice) {
    return {
      text: `${verdictLine(ctx.advice, ctx.field)}\n\n${t('dontKnow')}`,
      source: 'local', intent: null
    };
  }
  return { text: t('dontKnow'), source: 'local', intent: null };
}

/** The starter chips under the chat box. */
export const quickQuestions = () => ['q1', 'q2', 'q7', 'q4', 'q8', 'q6', 'q5'].map((k) => t(k));

/** Exposed for the daily-briefing card on the Today tab. */
export function briefing(ctx) {
  const parts = [];
  if (ctx.advice) parts.push(verdictLine(ctx.advice, ctx.field));
  const top = (ctx.risks || []).find((r) => r.level === 'danger' || r.level === 'warn');
  if (top) parts.push(riskLine(top));
  if (ctx.advice?.verdict === 'wait') {
    parts.push(t('savingBody', { m3: num(ctx.advice.savedM3), money: money(ctx.advice.cost) }));
  }
  return parts.join(' ');
}

// Exposed for the test suite: URL shaping is easy to get subtly wrong.
export { addDays, taskUrl as __taskUrl };
