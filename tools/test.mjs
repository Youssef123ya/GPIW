/**
 * test.mjs — a dependency-free check of the parts that must not break.
 *
 * It shims just enough of the browser to import the real modules, then asserts on
 * the engine's decisions and renders every screen to a string. Run: npm test
 */

/* ------------------------------------------------------------- shims -- */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
// Node 22 exposes a read-only `navigator`, so patch the property in place.
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: false, language: 'en-US' }, configurable: true, writable: true
});

const agro = await import('../js/agro.js');
const i18n = await import('../js/i18n.js');
const assistant = await import('../js/assistant.js');
const ui = await import('../js/ui.js');
const store = await import('../js/store.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra); }
};
const section = (s) => console.log('\n' + s);

/* --------------------------------------------------------- fixtures -- */
const TODAY = '2026-08-21';
function series({ rain = () => 0, et0 = 5.0, days = 75, start = '2026-06-15', popAfter = 0.9 } = {}) {
  const out = [];
  let d = start;
  for (let i = 0; i < days; i++) {
    out.push({
      date: d, rain: rain(i), et0, tmax: 34, tmin: 25, wind: 8, code: rain(i) > 1 ? 61 : 0,
      pop: i / days > popAfter ? 85 : 10, forecast: d >= TODAY
    });
    d = agro.addDays(d, 1);
  }
  return out;
}
const field = (over = {}) => ({
  id: 'f1', name: 'Upper plot', crop: 'wheat', soil: 'loam', method: 'flood',
  sowing: '2026-06-15', area: 1.2, irrigations: [], awd: true,
  pump: { dischargeLps: 10, costPerHour: 120 }, ...over
});

/* ------------------------------------------------------ engine tests -- */
section('Water balance');
{
  const dry = agro.waterBalance(field(), series(), { today: TODAY });
  ok('a long dry spell calls for irrigation', ['irrigate', 'urgent'].includes(dry.verdict), dry.verdict);
  ok('depletion never exceeds the soil it lives in', dry.depletion <= dry.taw + 1e-6);
  ok('gross depth exceeds net depth at 55% flood efficiency',
    dry.grossMm > dry.netMm && Math.abs(dry.grossMm - dry.netMm / 0.55) < 0.01);
  ok('volume matches depth x area', Math.abs(dry.volumeM3 - dry.grossMm * 1.2 * 10) < 0.01);
  ok('cost follows pump hours', Math.abs(dry.cost - dry.pumpHours * 120) < 0.01);
  ok('soil water percentage stays in range', dry.soilWaterPct >= 0 && dry.soilWaterPct <= 100);
}
{
  // Rain arriving inside the forecast window should hold the pump.
  const s = series({ rain: (i) => (i >= 68 ? 40 : 0) });
  const wet = agro.waterBalance(field(), s, { today: TODAY });
  ok('credible rain ahead defers irrigation', wet.verdict === 'wait' || wet.verdict === 'ok', wet.verdict);
  ok('a deferral reports the water it saves', wet.savedM3 > 0, String(wet.savedM3));
}
{
  const wet = agro.waterBalance(field(), series({ rain: () => 12 }), { today: TODAY });
  ok('daily rain keeps the crop out of stress', wet.verdict === 'ok', wet.verdict);
  ok('a satisfied crop needs no water today', wet.netMm < 5, String(wet.netMm));
}
{
  const logged = agro.waterBalance(
    field({ irrigations: [{ date: '2026-08-20', mm: 120 }] }), series(), { today: TODAY });
  const notLogged = agro.waterBalance(field(), series(), { today: TODAY });
  ok('logging an irrigation reduces the deficit', logged.depletion < notLogged.depletion,
    `${logged.depletion} vs ${notLogged.depletion}`);
}

section('Crop coverage');
for (const crop of agro.CROP_KEYS) {
  const a = agro.waterBalance(field({ crop }), series(), { today: TODAY });
  const sane = a && Number.isFinite(a.grossMm) && a.grossMm >= 0 && Number.isFinite(a.cost)
    && ['ok', 'wait', 'irrigate', 'urgent'].includes(a.verdict);
  ok(`${crop} produces a sane verdict`, sane, JSON.stringify(a && { v: a.verdict, mm: a.grossMm }));
}

section('Soils and methods');
{
  const sandy = agro.waterBalance(field({ soil: 'sand' }), series(), { today: TODAY });
  const heavy = agro.waterBalance(field({ soil: 'black' }), series(), { today: TODAY });
  ok('light soil holds less water than heavy soil', sandy.taw < heavy.taw, `${sandy.taw} vs ${heavy.taw}`);

  const flood = agro.waterBalance(field({ method: 'flood' }), series(), { today: TODAY });
  const drip = agro.waterBalance(field({ method: 'drip' }), series(), { today: TODAY });
  ok('drip pumps less than flood for the same deficit', drip.volumeM3 < flood.volumeM3,
    `${drip.volumeM3} vs ${flood.volumeM3}`);
}

section('Paddy and AWD');
{
  const p = agro.waterBalance(field({ crop: 'rice', soil: 'clay' }), series(), { today: TODAY });
  ok('pond level stays physically bounded', p.level >= -161 && p.level <= 100, String(p.level));
  ok('AWD saves water against continuous flooding', p.awd.savedM3 > 0, String(p.awd.savedM3));
  ok('AWD saving is a believable share', p.awd.savedPct > 0 && p.awd.savedPct < 60, String(p.awd.savedPct));
}

section('Risk assessment');
{
  const flood = agro.assessRisks(series({ rain: (i) => (i >= 67 ? 90 : 0) }), TODAY);
  ok('sustained heavy rain raises a flood warning', flood.some((r) => r.key === 'floodWarning'),
    JSON.stringify(flood.map((r) => r.key)));
  const dryRisks = agro.assessRisks(series(), TODAY);
  ok('a long rainless run is reported', dryRisks.some((r) => r.key === 'drought' || r.key === 'dryspell'),
    JSON.stringify(dryRisks.map((r) => r.key)));
  const hot = agro.assessRisks(series().map((d) => ({ ...d, tmax: 43 })), TODAY);
  ok('extreme heat is reported', hot.some((r) => r.key === 'heat'));
}

section('Escaping');
{
  const nasty = '<img src=x onerror=alert(1)>';
  ok('field names are escaped', !ui.esc(nasty).includes('<img'), ui.esc(nasty));
  ok('quotes are escaped', ui.esc(`a"b'c`) === 'a&quot;b&#39;c', ui.esc(`a"b'c`));
}

section('Translation completeness');
{
  // Checked against the exported table rather than by comparing t(key) to the key,
  // which would false-positive on English strings that equal their own key.
  const keys = Object.keys(i18n.STRINGS);
  const missing = keys.flatMap((key) =>
    Object.keys(i18n.LANGS)
      .filter((lang) => !i18n.STRINGS[key][lang]?.trim())
      .map((lang) => `${key}/${lang}`));
  ok(`all ${keys.length} keys exist in both languages`, missing.length === 0, missing.slice(0, 8).join(', '));

  // A placeholder dropped in translation silently renders "{n}" to the farmer.
  const slotGaps = keys.flatMap((key) => {
    const slots = (i18n.STRINGS[key].en.match(/\{\w+\}/g) || []).sort().join();
    return Object.keys(i18n.LANGS)
      .filter((l) => ((i18n.STRINGS[key][l] || '').match(/\{\w+\}/g) || []).sort().join() !== slots)
      .map((l) => `${key}/${l}`);
  });
  ok('placeholders survive every translation', slotGaps.length === 0, slotGaps.slice(0, 8).join(', '));

  for (const map of ['CROP_NAMES', 'SOIL_NAMES', 'METHOD_NAMES', 'STAGE_NAMES']) {
    const gaps = Object.entries(i18n[map]).flatMap(([k, row]) =>
      Object.keys(i18n.LANGS).filter((l) => !row[l]).map((l) => `${k}/${l}`));
    ok(`${map} is complete`, gaps.length === 0, gaps.join(', '));
  }
  const cropGaps = agro.CROP_KEYS.filter((k) => !i18n.CROP_NAMES[k]);
  ok('every crop in the engine has a name', cropGaps.length === 0, cropGaps.join(', '));
  const soilGaps = agro.SOIL_KEYS.filter((k) => !i18n.SOIL_NAMES[k]);
  ok('every soil in the engine has a name', soilGaps.length === 0, soilGaps.join(', '));
}

section('AI Yacoup (offline brain)');
{
  const advice = agro.waterBalance(field(), series(), { today: TODAY });
  const ctx = {
    advice, field: field(), weather: { series: series(), current: { temp: 33, feels: 36, humidity: 58, wind: 9, code: 0 } },
    risks: agro.assessRisks(series(), TODAY), place: { name: 'Nashik' }, aiBridge: ''
  };
  const asks = [
    ['متى أسقي؟', 'water_when'],
    ['when should i water', 'water_when'],
    ['كم ماءً يحتاج محصولي؟', 'water_how_much'],
    ['هل سيمطر هذا الأسبوع؟', 'rain'],
    ['كيف أوفر الماء؟', 'save_water'],
    ['كم تكلفة هذه الرية؟', 'cost'],
    ['ما مرحلة المحصول', 'stage'],
    ['هل هناك خطر فيضان؟', 'flood'],
    ['flood risk?', 'flood'],
    ['how much water', 'water_how_much'],
    ['هل مياهي مالحة؟', 'salinity'],
    ['إيه خطة الري هذا الأسبوع؟', 'plan'],
    ['is my water salty', 'salinity'],
    ['what is my plan', 'plan']
  ];
  for (const [q, want] of asks) {
    const r = await assistant.ask(q, ctx);
    ok(`"${q}" → ${want}`, r.intent === want && r.text.length > 0, `got ${r.intent}: ${r.text.slice(0, 40)}`);
  }
  const unknown = await assistant.ask('zzzz qqqq', ctx);
  ok('an unknown question still returns advice, offline', unknown.source === 'local' && unknown.text.length > 0);

  const noField = await assistant.ask('متى أسقي؟', { ...ctx, advice: null, field: null });
  ok('with no field it says so instead of inventing numbers',
    noField.text === i18n.t('noFieldYet'), noField.text.slice(0, 40));

  // Every number the assistant says must come from the model, formatted the same
  // way the screen formats it.
  i18n.setLang('en');
  const cost = await assistant.ask('what will it cost', ctx);
  ok('quoted cost matches the model', cost.text.includes(i18n.num(advice.cost)), cost.text);
}

section('Rendering every screen, in every language');
{
  const weather = {
    current: { temp: 33.2, feels: 36.1, humidity: 58, wind: 9, code: 61 },
    series: series(), fetchedAt: Date.now()
  };
  const cards = [
    { field: field(), advice: agro.waterBalance(field(), series(), { today: TODAY }) },
    { field: field({ id: 'f2', crop: 'rice', soil: 'clay', name: '<script>x</script>' }),
      advice: agro.waterBalance(field({ id: 'f2', crop: 'rice', soil: 'clay' }), series(), { today: TODAY }) },
    { field: field({ id: 'f3', name: 'Not sown', sowing: '2026-12-01' }), advice: null }
  ];
  const base = {
    weather, cards, risks: agro.assessRisks(series(), TODAY), openFieldId: 'f1',
    chat: [{ role: 'user', text: 'hi' }, { role: 'bot', text: 'ok', source: 'local' }],
    chips: [], busy: false, pump: { dischargeLps: 10, costPerHour: 60 },
    place: { name: 'الفيوم', admin: 'Egypt' }, voice: true, aiBridge: '', canInstall: true, currency: 'ج.م'
  };
  for (const lang of Object.keys(i18n.LANGS)) {
    i18n.setLang(lang);
    const screens = {
      today: ui.renderToday(base),
      water: ui.renderWater(base),
      assistant: ui.renderAssistant({ ...base, chips: assistant.quickQuestions() }),
      settings: ui.renderSettings(base)
    };
    let good = true, why = '';
    for (const [name, html] of Object.entries(screens)) {
      if (!html || html.length < 80) { good = false; why = name + ' too short'; }
      if (html.includes('undefined')) { good = false; why = name + ' contains "undefined"'; }
      if (html.includes('NaN')) { good = false; why = name + ' contains NaN'; }
      if (html.includes('[object Object]')) { good = false; why = name + ' leaked an object'; }
      if (html.includes('<script>x</script>')) { good = false; why = name + ' failed to escape a field name'; }
    }
    ok(`all four screens render in ${i18n.LANGS[lang].name}`, good, why);
  }
  i18n.setLang('en');
  const water = ui.renderWater(base);
  ok('an unsown field is still listed', water.includes('Not sown'));
  ok('the open field shows its water numbers', water.includes('m³') && water.includes('ج.م'));
}

section('Direction and currency');
{
  i18n.setLang('ar');
  ok('Arabic reports right-to-left', i18n.dir() === 'rtl', i18n.dir());
  ok('the toggle offers English from Arabic', i18n.otherLang() === 'en');
  i18n.setCurrency('SAR');
  const arMoney = i18n.money(1234);
  ok('Arabic puts the symbol after the number', arMoney.endsWith('SAR'), arMoney);
  // Pinned to Latin digits on purpose: number inputs render Latin whatever we do,
  // so an Arabic-Indic display would mix two numeral systems on one screen.
  ok('Arabic pins Latin digits', /^[0-9,]+$/.test(i18n.num(1234)), i18n.num(1234));
  ok('Arabic dates still use Arabic month names',
    /[\u0600-\u06ff]/.test(i18n.dateLabel('2026-08-21')), i18n.dateLabel('2026-08-21'));

  i18n.setLang('en');
  ok('English reports left-to-right', i18n.dir() === 'ltr');
  ok('the toggle offers Arabic from English', i18n.otherLang() === 'ar');
  const enMoney = i18n.money(1234);
  ok('English puts the symbol before the number', enMoney.startsWith('SAR'), enMoney);

  i18n.setCurrency('');
  ok('an empty currency falls back rather than vanishing', i18n.getCurrency() === '\u062C.\u0645', i18n.getCurrency());

  // The cost on screen must be the exact string the assistant speaks.
  const a = agro.waterBalance(field(), series(), { today: TODAY });
  const shown = ui.renderWater({ cards: [{ field: field(), advice: a }], openFieldId: 'f1' });
  ok('screen and assistant agree on the cost string', shown.includes(i18n.money(a.cost)), i18n.money(a.cost));
  // The rupee was the old default and must not reappear from anywhere.
  ok('no rupee sign survives anywhere in a rendered screen', !shown.includes('\u20B9'));
}

section('Salinity');
{
  // FAO-29: salt-sensitive crops must suffer sooner than tolerant ones.
  const onion = agro.salinity('onion', 3);
  const barley = agro.salinity('barley', 3);
  ok('a sensitive crop loses more yield than a tolerant one at the same EC',
    onion.yieldLoss > barley.yieldLoss, `onion ${onion.yieldLoss} vs barley ${barley.yieldLoss}`);
  ok('clean water costs no yield', agro.salinity('onion', 0).yieldLoss === 0);
  ok('clean water needs no leaching', agro.salinity('onion', 0).lr === 0);
  ok('salty water needs leaching', agro.salinity('maize', 3).lr > 0);
  ok('the leaching fraction stays physical', agro.salinity('onion', 25).lr <= 0.45);
  ok('yield loss can never exceed 100%', agro.salinity('citrus', 30).yieldLoss <= 100);

  // Leaching must make the pump run longer, not shorter.
  const fresh = agro.waterBalance(field(), series(), { today: TODAY, ecw: 0 });
  const salty = agro.waterBalance(field(), series(), { today: TODAY, ecw: 4 });
  ok('salty water means a bigger gross application', salty.grossMm > fresh.grossMm,
    `${salty.grossMm} vs ${fresh.grossMm}`);
  ok('net crop requirement is unchanged by salinity', Math.abs(salty.netMm - fresh.netMm) < 0.01);
  ok('the extra water is reported as leaching', salty.leachingMm > 0 && fresh.leachingMm === 0);

  const best = agro.tolerantCrops(6, 3);
  ok('tolerant crops are ranked best first', best.length === 3 && best[0].loss <= best[1].loss,
    JSON.stringify(best));
  ok('bad water still returns options rather than an empty list', agro.tolerantCrops(20, 3).length === 3);
}

section('Perennials');
{
  const planted = '2009-03-01';
  for (const crop of ['date_palm', 'olive', 'citrus', 'alfalfa']) {
    const a = agro.waterBalance(field({ crop, sowing: planted }), series(), { today: TODAY });
    const cycle = agro.CROPS[crop].cycle;
    ok(`${crop} reads a day inside its own cycle, not days since planting`,
      a && a.perennial && a.das >= 0 && a.das < cycle, a && `das ${a.das} of ${cycle}`);
  }
  // A perennial is fully rooted; its root zone must not reset every cycle.
  const y1 = agro.cropStage('olive', 200);
  const y9 = agro.cropStage('olive', 200 + 365 * 9);
  ok('a perennial holds the same root depth across years', y1.zr === y9.zr && y1.kc === y9.kc);
  ok('an annual still reports days since sowing', !agro.cropStage('wheat', 60).perennial);
}

section('Season savings and the week plan');
{
  const wet = series({ rain: (i) => (i % 8 === 0 ? 20 : 0) });
  const a = agro.waterBalance(field(), wet, { today: TODAY });
  ok('responding to rain saves water against ignoring it', a.season.savedM3 > 0, String(a.season.savedM3));
  ok('the saving is a share of the blind schedule, not of nothing',
    a.season.savedPct > 0 && a.season.savedPct <= 100, String(a.season.savedPct));
  ok('the saving never exceeds what the blind schedule would have pumped',
    a.season.savedMm <= a.season.blindMm + 1e-6);

  const dryA = agro.waterBalance(field(), series(), { today: TODAY });
  ok('with no rain all season there is nothing to save', dryA.season.savedM3 === 0, String(dryA.season.savedM3));

  ok('the plan covers the week ahead', a.plan.length > 0 && a.plan.length <= 7, String(a.plan.length));
  ok('every plan day is dated after today', a.plan.every((d) => d.date > TODAY));
  ok('plan volumes agree with their depths',
    a.plan.filter((d) => d.irrigate).every((d) => Math.abs(d.volumeM3 - d.grossMm * 1.2 * 10) < 0.01));
  ok('a rest day asks for no water', a.plan.filter((d) => !d.irrigate).every((d) => d.netMm === 0));
  ok('projected soil water stays in range', a.plan.every((d) => d.soilWaterPct >= 0 && d.soilWaterPct <= 100));
}

section('Online AI tasks');
{
  // The bridge URL is configured once; every task hangs off the same origin.
  const cases = [
    ['http://x/api/assistant', 'http://x/api/diagnose'],
    ['http://x/api/assistant/', 'http://x/api/diagnose'],
    ['http://x/api/report', 'http://x/api/diagnose'],
    ['http://x', 'http://x/api/diagnose']
  ];
  let good = true;
  for (const [given, want] of cases) {
    const got = assistant.__taskUrl(given, 'diagnose');
    if (got !== want) { good = false; console.log('      ', given, '->', got, 'wanted', want); }
  }
  ok('any bridge URL resolves to the right task endpoint', good);

  // Both online tasks must refuse loudly rather than fail silently with no bridge.
  let refused = 0;
  try { await assistant.diagnose('data:image/jpeg;base64,AAA', { aiBridge: '' }); }
  catch (e) { if (e.message === 'no-bridge') refused++; }
  try { await assistant.farmReport({ aiBridge: '' }); }
  catch (e) { if (e.message === 'no-bridge') refused++; }
  ok('online tasks refuse without a configured bridge', refused === 2, String(refused));

  // The report grounding must carry every field, with no invented numbers.
  const a = agro.waterBalance(field(), series({ rain: (i) => (i % 8 === 0 ? 20 : 0) }), { today: TODAY });
  const captured = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    captured.push({ url: String(url), body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ answer: 'ok' }) };
  };
  await assistant.farmReport({
    aiBridge: 'http://x/api/assistant', place: { name: 'الفيوم' }, ecw: 3, risks: [{ key: 'drought' }],
    cards: [{ field: field(), advice: a }, { field: field({ id: 'f2' }), advice: null }]
  });
  globalThis.fetch = realFetch;

  const sent = captured[0];
  ok('the report goes to the report endpoint', sent.url === 'http://x/api/report', sent.url);
  const g = sent.body.grounding;
  ok('fields without advice are left out of the report', g.fields.length === 1, String(g.fields.length));
  ok('the report carries the salinity the farmer entered', g.waterSalinityEc === 3);
  ok('the report carries the season saving', typeof g.fields[0].savedM3 === 'number');
  ok('the report states the language so the model replies in it', g.language === i18n.getLang());
  const json = JSON.stringify(g);
  ok('no NaN reaches the model', !json.includes('null,null') && !/NaN/.test(json));
}

section('Store');
{
  store.clearAll();
  const f = store.addField({ crop: 'cotton', sowing: '2026-06-01', area: 2 });
  ok('a field gets an id', !!f.id);
  store.logIrrigation(f.id, 60, '2026-08-01');
  store.logIrrigation(f.id, 80, '2026-08-01');
  const saved = store.get().fields[0];
  ok('logging twice on one day replaces rather than doubles', saved.irrigations.length === 1
    && saved.irrigations[0].mm === 80, JSON.stringify(saved.irrigations));
  store.updateField(f.id, { area: 3 });
  ok('updates persist', store.get().fields[0].area === 3);
  store.removeField(f.id);
  ok('removal works', store.get().fields.length === 0);
  for (let i = 0; i < 50; i++) store.pushChat({ role: 'user', text: 'x' + i });
  ok('chat history is capped', store.get().chat.length === 40, String(store.get().chat.length));
  store.clearAll();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
