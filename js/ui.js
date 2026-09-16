/**
 * ui.js — rendering.
 *
 * Plain string templates into innerHTML, with event delegation handled in app.js.
 * No virtual DOM and no reactive framework: the whole app is four screens, and on
 * the phones this targets a 30 KB framework costs more than it saves.
 *
 * Every value that reaches the page goes through esc(). The only untrusted strings
 * are place names from the geocoder and field names the farmer types, but both end
 * up in innerHTML, so both are escaped.
 */

import {
  t, tCrop, tSoil, tMethod, tStage, tWx, num, money, weekday, dateLabel, LANGS, getLang, dir, getCurrency
} from './i18n.js';
import { CROP_KEYS, SOIL_KEYS, METHOD_KEYS, METHODS, tolerantCrops } from './agro.js';
import { riskLine } from './assistant.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const VERDICT_EMOJI = { urgent: '🚨', irrigate: '💧', wait: '✋', ok: '✅' };
const ALERT_EMOJI = {
  floodWarning: '🌊', floodWatch: '🌊', heavyRain: '🌧️', drought: '🏜️',
  dryspell: '☀️', heat: '🔥', riverHigh: '🌊', sprayWindow: '🌿'
};

/** Applies the string table to everything marked up with data-i18n. */
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((n) => {
    n.placeholder = t(n.dataset.i18nPlaceholder);
  });
  document.documentElement.lang = getLang();
  document.documentElement.dir = dir();
  document.title = t('appName');
}

/* ------------------------------------------------------------- today tab -- */
export function renderToday(ctx) {
  const { weather, risks, cards } = ctx;
  if (!weather) return `<div class="empty"><span class="empty-emoji">🌦️</span>${esc(t('loading'))}</div>`;

  const c = weather.current || {};
  const wx = tWx(c.code ?? 3);
  const today = (weather.series || []).find((d) => d.forecast) || {};
  const week = (weather.series || []).filter((d) => d.forecast).slice(0, 7);
  const weekRain = week.reduce((a, d) => a + (d.rain || 0), 0);

  const head = cards.find((x) => x.advice && (x.advice.verdict === 'urgent' || x.advice.verdict === 'irrigate'))
    || cards.find((x) => x.advice && x.advice.verdict === 'wait')
    || cards[0];

  return `
  <div class="stack">
    <section class="hero">
      <div class="hero-top">
        <div class="hero-icon" aria-hidden="true">${wx.icon}</div>
        <div>
          <div class="hero-temp">${c.temp != null ? esc(num(c.temp)) + '°' : '—'}</div>
          <div class="hero-cond">${esc(wx.text)}</div>
        </div>
      </div>
      <div class="hero-grid">
        <div class="hero-cell"><b>${c.feels != null ? esc(num(c.feels)) + '°' : '—'}</b><span>${esc(t('feelsLike'))}</span></div>
        <div class="hero-cell"><b>${c.humidity != null ? esc(num(c.humidity)) + '%' : '—'}</b><span>${esc(t('humidity'))}</span></div>
        <div class="hero-cell"><b>${esc(num(today.rain || 0, 1))} ${esc(t('uMm'))}</b><span>${esc(t('rainToday'))}</span></div>
      </div>
    </section>

    ${head?.advice ? `
    <section>
      <div class="section-title">${esc(t('todayAdvice'))}</div>
      ${verdictCard(head.field, head.advice, { compact: true })}
    </section>` : `
    <section class="card">
      <div class="empty"><span class="empty-emoji">🌱</span>${esc(t('noFields'))}</div>
      <button class="btn btn-primary btn-lg full" data-act="add-field">${esc(t('addField'))}</button>
    </section>`}

    <section>
      <div class="card-head">
        <div class="section-title">${esc(t('forecast'))}</div>
        <div class="muted">${esc(t('rain7'))}: <b>${esc(num(weekRain))} ${esc(t('uMm'))}</b></div>
      </div>
      <div class="strip">${week.map(dayCell).join('')}</div>
    </section>

    ${savedCard(cards)}

    <section>
      <div class="section-title">${esc(t('alertsTitle'))}</div>
      <div style="margin-top:10px">
        ${risks?.length
          ? risks.map((r) => `
            <div class="alert a-${esc(r.level)}">
              <span class="alert-emoji" aria-hidden="true">${ALERT_EMOJI[r.key] || 'ℹ️'}</span>
              <div>${esc(riskLine(r))}</div>
            </div>`).join('')
          : `<div class="alert a-good"><span class="alert-emoji" aria-hidden="true">✅</span><div>${esc(t('noAlerts'))}</div></div>`}
      </div>
    </section>
  </div>`;
}

/**
 * The season's water saving, summed across fields. This is the number the whole
 * app exists to move, so it gets its own card rather than being buried in a
 * field detail. The comparison is stated in the text, because a saving without
 * a stated counterfactual is just a number.
 */
function savedCard(cards) {
  const withSaving = cards.filter((c) => c.advice?.season?.savedM3 > 0);
  if (!withSaving.length) return '';
  const m3 = withSaving.reduce((a, c) => a + c.advice.season.savedM3, 0);
  const blind = withSaving.reduce((a, c) => a + (c.advice.season.blindMm || 0), 0);
  const saved = withSaving.reduce((a, c) => a + (c.advice.season.savedMm || 0), 0);
  const pct = blind > 0 ? Math.round((saved / blind) * 100) : 0;
  // Value the saving at the pumping cost per cubic metre of the first field.
  const ref = withSaving[0].advice;
  const perM3 = ref.volumeM3 > 0 ? ref.cost / ref.volumeM3 : 0;

  return `
    <section class="card saved-card">
      <div class="card-head" style="margin-bottom:8px">
        <div class="section-title">${esc(t('savedTitle'))}</div>
        <span class="saved-big">${esc(num(m3))} ${esc(t('uM3'))}</span>
      </div>
      <p class="muted" style="margin:0">
        ${esc(t('savedBody', { m3: num(m3), pct: num(pct), money: money(m3 * perM3) }))}
      </p>
    </section>`;
}

function dayCell(d) {
  const wx = tWx(d.code ?? 3);
  return `
  <div class="day">
    <div class="day-name">${esc(weekday(d.date))}</div>
    <div class="day-icon" aria-hidden="true">${wx.icon}</div>
    <div class="day-temp">${d.tmax != null ? esc(num(d.tmax)) + '°' : '—'}</div>
    <div class="day-rain">${(d.rain || 0) >= 0.5 ? esc(num(d.rain, 1)) + ' ' + esc(t('uMm')) : ''}</div>
  </div>`;
}

/* ------------------------------------------------------------- water tab -- */
export function renderWater(ctx) {
  const { cards } = ctx;
  if (!cards.length) {
    return `
    <div class="stack">
      <div class="card">
        <div class="empty"><span class="empty-emoji">🌱</span>${esc(t('noFields'))}</div>
        <button class="btn btn-primary btn-lg full" data-act="add-field">${esc(t('addField'))}</button>
      </div>
    </div>`;
  }
  return `
  <div class="stack">
    <div class="card-head">
      <div class="section-title">${esc(t('fieldsTitle'))}</div>
      <button class="btn btn-ghost" data-act="add-field">＋ ${esc(t('addField'))}</button>
    </div>
    ${cards.map((x) => fieldCard(x, ctx.openFieldId)).join('')}
  </div>`;
}

function fieldCard({ field, advice }, openId) {
  const open = field.id === openId;
  const v = advice?.verdict || 'ok';
  // A field sown in the future has no balance to show yet, but it must still be
  // listed so the farmer can find it, edit the date, or delete it.
  const sub = advice
    ? [tCrop(field.crop), tSoil(field.soil), `${num(field.area, 2)} ha`].join(' · ')
    : `${tCrop(field.crop)} · ${t('beforeSowing', { d: dateLabel(field.sowing) })}`;
  return `
  <article class="field-card">
    <button class="field-top" data-act="toggle-field" data-id="${esc(field.id)}" aria-expanded="${open}">
      <span class="field-dot d-${esc(v)}" aria-hidden="true"></span>
      <span class="field-meta">
        <span class="field-name">${esc(field.name || tCrop(field.crop))}</span>
        <span class="field-sub">${esc(sub)}</span>
      </span>
      <span class="chev" aria-hidden="true">${open ? '▴' : '▾'}</span>
    </button>
    ${open ? `<div class="field-body">${
      advice ? fieldDetail(field, advice) : pendingDetail(field)
    }</div>` : ''}
  </article>`;
}

function pendingDetail(field) {
  return `
    <div class="alert a-info">
      <span class="alert-emoji" aria-hidden="true">🌱</span><div>${esc(t('notSownYet'))}</div>
    </div>
    <div class="field-actions">
      <button class="btn btn-ghost" data-act="edit-field" data-id="${esc(field.id)}">${esc(t('edit'))}</button>
      <button class="btn btn-ghost" data-act="delete-field" data-id="${esc(field.id)}">${esc(t('delete'))}</button>
    </div>`;
}

function fieldDetail(field, a) {
  return `
    ${verdictCard(field, a)}
    ${gauge(a)}
    <div class="metrics">
      <div class="metric"><b>${esc(num(a.grossMm))} ${esc(t('uMm'))}</b><span>${esc(t('waterDepth'))}</span></div>
      <div class="metric"><b>${esc(num(a.volumeM3))} ${esc(t('uM3'))}</b><span>${esc(t('volume'))}</span></div>
      <div class="metric"><b>${esc(num(a.pumpHours, 1))} ${esc(t('uHour'))}</b><span>${esc(t('pumpTime'))}</span></div>
      <div class="metric"><b>${esc(money(a.cost))}</b><span>${esc(t('runningCost'))}</span></div>
    </div>

    <div class="metrics">
      <div class="metric"><b>${esc(tStage(a.stage))}</b><span>${esc(t('dayNo', { n: num(a.das) }))}</span></div>
      <div class="metric"><b>${esc(num(a.etc, 1))} ${esc(t('uMm'))}</b><span>${esc(t('cropUsed'))}</span></div>
      <div class="metric"><b>${esc(num(a.season.rainMm))} ${esc(t('uMm'))}</b><span>${esc(t('rainReceived'))}</span></div>
      <div class="metric"><b>${esc(num(a.season.irrigationMm))} ${esc(t('uMm'))}</b><span>${esc(t('irrigApplied'))}</span></div>
    </div>

    ${a.awd?.savedM3 > 0 ? `
      <div class="alert a-good" style="margin-top:14px">
        <span class="alert-emoji" aria-hidden="true">🌾</span>
        <div>${esc(t('awdSaving', { m3: num(a.awd.savedM3), pct: num(a.awd.savedPct) }))}</div>
      </div>` : ''}

    ${saltNote(field, a)}
    ${savingNote(field, a)}
    ${weekPlan(a)}

    <div class="field-actions">
      <button class="btn btn-primary" data-act="log-water" data-id="${esc(field.id)}">💧 ${esc(t('logWater'))}</button>
      <button class="btn btn-ghost" data-act="edit-field" data-id="${esc(field.id)}">${esc(t('edit'))}</button>
      <button class="btn btn-ghost" data-act="delete-field" data-id="${esc(field.id)}">${esc(t('delete'))}</button>
    </div>`;
}

/**
 * Salinity. Shown only when the farmer has told the app what their water is
 * like — inventing a salinity figure would be worse than saying nothing.
 */
function saltNote(field, a) {
  const s = a.salt;
  if (!s || s.level === 'none') return '';
  const crop = tCrop(field.crop);
  const pct = num(s.yieldLoss);
  const body = {
    mild: t('saltMild', { pct }),
    high: t('saltHigh', { pct, crop }),
    severe: t('saltSevere', { pct, crop })
  }[s.level];
  const tone = { mild: 'info', high: 'warn', severe: 'danger' }[s.level];
  const better = tolerantCrops(s.ecw, 3)
    .filter((x) => x.key !== field.crop)
    .map((x) => `${tCrop(x.key)} (${num(x.loss)}${t('uPct')})`)
    .join('، ');
  return `
    <div class="alert a-${esc(tone)}" style="margin-top:14px">
      <span class="alert-emoji" aria-hidden="true">🧂</span>
      <div>
        ${esc(body)}
        ${a.leachingMm > 0.5 ? `<br><span class="muted">${esc(t('leachNote', { mm: num(a.leachingMm) }))}</span>` : ''}
        ${s.level !== 'mild' && better ? `<br><span class="muted">${esc(t('trySalt', { crops: better }))}</span>` : ''}
      </div>
    </div>`;
}

/**
 * The week ahead. The verdict card answers "today"; this answers "when do I need
 * the pump, the canal turn, or a day of labour", which has to be known in advance.
 */
function weekPlan(a) {
  if (!a.plan?.length) return '';
  return `
    <div class="gauge">
      <div class="card-head" style="margin-bottom:8px">
        <div class="section-title">${esc(t('weekPlan'))}</div>
        <span class="muted">${esc(t('planNote'))}</span>
      </div>
      <div class="strip">
        ${a.plan.map((p) => `
          <div class="day ${p.irrigate ? 'day-water' : ''}">
            <div class="day-name">${esc(weekday(p.date))}</div>
            <div class="day-icon" aria-hidden="true">${p.irrigate ? '💧' : (p.rain >= 2.5 ? '🌧️' : '·')}</div>
            <div class="day-temp">${p.irrigate ? esc(num(p.grossMm)) + ' ' + esc(t('uMm')) : esc(num(p.soilWaterPct)) + '%'}</div>
            <div class="day-rain">${p.rain >= 0.5 ? esc(num(p.rain, 1)) + ' ' + esc(t('uMm')) : ''}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function savingNote(field, a) {
  const notes = [];
  if (a.verdict === 'wait' || (a.verdict === 'ok' && a.savedM3 > 0)) {
    notes.push({ emoji: '💰', text: t('savingBody', { m3: num(a.savedM3), money: money(a.cost) }) });
  }
  if (field.method !== 'drip') {
    const gain = Math.round((1 - METHODS[field.method] / METHODS.drip) * 100);
    if (gain > 0) notes.push({ emoji: '🚿', text: t('efficiencyTip', { pct: num(gain) }) });
  }
  if (!notes.length) return '';
  return notes.map((n) => `
    <div class="alert a-info" style="margin-top:14px">
      <span class="alert-emoji" aria-hidden="true">${n.emoji}</span><div>${esc(n.text)}</div>
    </div>`).join('');
}

export function verdictCard(field, a, { compact = false } = {}) {
  const head = { urgent: t('vUrgent'), irrigate: t('vIrrigate'), wait: t('vWait'), ok: t('vOk') }[a.verdict];
  const why = {
    severeStress: t('rSevere'), belowThreshold: t('rBelow'),
    rainCoversNeed: t('rRainCovers'), rainExpected: t('rRainExpect'), soilHasWater: t('rSoilHas')
  }[a.reasonKey];
  const next = a.verdict === 'ok' && a.nextIrrigationDate
    ? `<div class="muted" style="margin-top:8px">${esc(t('nextWater'))}: <b>${esc(dateLabel(a.nextIrrigationDate))}</b></div>`
    : '';
  return `
  <div class="verdict v-${esc(a.verdict)}">
    ${compact ? `<div class="verdict-field">${esc(field.name || tCrop(field.crop))} · ${esc(tCrop(field.crop))}</div>` : ''}
    <div class="verdict-head">
      <span class="verdict-emoji" aria-hidden="true">${VERDICT_EMOJI[a.verdict]}</span>
      <span class="verdict-title">${esc(head)}</span>
    </div>
    <div class="verdict-why">${esc(why)}</div>
    ${a.verdict !== 'ok' ? `
      <div class="metrics">
        <div class="metric"><b>${esc(num(a.grossMm))} ${esc(t('uMm'))}</b><span>${esc(t('waterDepth'))}</span></div>
        <div class="metric"><b>${esc(money(a.cost))}</b><span>${esc(t('runningCost'))}</span></div>
      </div>` : next}
  </div>`;
}

/**
 * The soil-water gauge. The red mark is the stress line (RAW): the farmer's whole
 * job is keeping the blue bar to the right of it.
 */
function gauge(a) {
  const pctLeft = Math.round(a.soilWaterPct);
  const markAt = Math.round(100 * (1 - a.raw / Math.max(1, a.taw)));
  const label = a.ponded ? t('pondLevel') : t('soilWater');
  return `
  <div class="gauge">
    <div class="card-head" style="margin-bottom:6px">
      <div class="section-title">${esc(label)}</div>
      <b>${esc(num(pctLeft))}%</b>
    </div>
    <div class="gauge-track" role="img" aria-label="${esc(label)} ${pctLeft}%">
      <div class="gauge-fill" style="width:${pctLeft}%"></div>
      <div class="gauge-mark" style="inset-inline-start:${Math.min(98, Math.max(0, markAt))}%"></div>
    </div>
    <div class="gauge-legend">
      <span>0%</span>
      <span>⏐ ${esc(t('stressLine'))}</span>
      <span>100%</span>
    </div>
  </div>`;
}

/* --------------------------------------------------------- assistant tab -- */
export function renderAssistant(ctx) {
  const { chat, chips, busy, busyLabel } = ctx;
  // Every answer is labelled with where it came from. A farmer deciding whether
  // to trust it deserves to know if it was their own numbers or a model online.
  const body = chat.length
    ? chat.map((m) => `
      <div class="bubble ${m.role === 'user' ? 'me' : 'bot'}">${esc(m.text)}${
        m.role === 'bot'
          ? `<span class="bubble-tag">${esc(m.source === 'cloud' ? t('aiAdvice') : t('offlineBrain'))}</span>`
          : ''}</div>`).join('')
    : `<div class="bubble bot">${esc(t('assistantIntro'))}</div>`;

  return `
  <div class="chat" id="chat">${body}${
    busy ? `<div class="bubble bot">${esc(busyLabel || t('thinking'))}</div>` : ''}</div>
  <div class="ai-tasks">
    <button class="btn btn-ghost ai-task" data-act="diagnose">📷 ${esc(t('diagnoseBtn'))}</button>
    <button class="btn btn-ghost ai-task" data-act="report">📋 ${esc(t('reportBtn'))}</button>
  </div>
  <input id="photo-input" type="file" accept="image/*" capture="environment" hidden>
  <div class="chips">${chips.map((q) =>
    `<button class="chip" data-act="quick" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
  <form class="composer" id="ask-form">
    <input id="ask-input" class="input" autocomplete="off" data-i18n-placeholder="askPlaceholder"
           placeholder="${esc(t('askPlaceholder'))}">
    <button type="button" class="btn btn-ghost mic" id="mic-btn" aria-label="${esc(t('speakBtn'))}">🎤</button>
    <button type="submit" class="btn btn-primary" aria-label="${esc(t('send'))}">➤</button>
  </form>`;
}

/* ---------------------------------------------------------- settings tab -- */
export function renderSettings(ctx) {
  const { pump, place, voice, aiBridge, canInstall } = ctx;
  const currency = ctx.currency ?? getCurrency();
  return `
  <div class="stack">
    <section class="card">
      <div class="section-title">${esc(t('language'))}</div>
      <div class="lang-grid" id="lang-grid3" style="margin-top:12px">
        ${Object.entries(LANGS).map(([code, l]) => `
          <button class="lang-opt ${code === getLang() ? 'is-on' : ''}" data-act="set-lang" data-lang="${esc(code)}">
            ${esc(l.name)}
          </button>`).join('')}
      </div>
    </section>

    <section class="card">
      <div class="section-title">${esc(t('locationSet'))}</div>
      <p style="margin-top:10px"><b>${esc(place?.name || '—')}</b><br>
        <span class="muted">${esc(place?.admin || '')}</span></p>
      <button class="btn btn-ghost full" data-act="change-place">${esc(t('useGps'))} / ${esc(t('searchPlace'))}</button>
    </section>

    <section class="card">
      <div class="section-title">${esc(t('pumpSet'))}</div>
      <label class="lbl" for="s-lps">${esc(t('discharge'))}</label>
      <input id="s-lps" class="input input-lg" type="number" min="1" step="1" inputmode="decimal" value="${esc(pump.dischargeLps)}">
      <label class="lbl" for="s-cur">${esc(t('currencyLabel'))}</label>
      <input id="s-cur" class="input input-lg" type="text" maxlength="4" value="${esc(currency)}">
      <label class="lbl" for="s-cost">${esc(t('costPerHour', { cur: currency }))}</label>
      <input id="s-cost" class="input input-lg" type="number" min="0" step="5" inputmode="decimal" value="${esc(pump.costPerHour)}">
      <label class="switch">
        <input id="s-voice" type="checkbox" ${voice ? 'checked' : ''}>
        <span>${esc(t('voiceSet'))}</span>
      </label>
      <button class="btn btn-primary full" data-act="save-settings" style="margin-top:16px">${esc(t('save'))}</button>
    </section>

    <section class="card">
      <div class="section-title">${esc(t('salinityTitle'))}</div>
      <label class="lbl" for="s-ecw">${esc(t('ecwLabel'))}</label>
      <input id="s-ecw" class="input input-lg" type="number" min="0" max="30" step="0.1"
             inputmode="decimal" value="${esc(ctx.ecw ?? 0)}">
      <p class="muted" style="margin-top:8px">${esc(t('ecwHelp'))}</p>
      <button class="btn btn-primary full" data-act="save-salinity">${esc(t('save'))}</button>
    </section>

    <section class="card">
      <div class="card-head" style="margin-bottom:0">
        <div class="section-title">${esc(t('aiBridge'))}</div>
        <span class="pill ${ctx.aiProvider ? 'ai-on' : 'ai-off'}">${
          esc(ctx.aiProvider ? `${t('aiOnlineOn')} · ${ctx.aiProvider}` : t('aiOnlineOff'))}</span>
      </div>
      <p class="muted" style="margin-top:10px">${esc(t('aiBridgeHelp'))}</p>
      <input id="s-bridge" class="input input-lg" type="url" placeholder="http://localhost:8787/api/assistant"
             value="${esc(aiBridge || '')}">
      <button class="btn btn-ghost full" data-act="save-bridge" style="margin-top:12px">${esc(t('save'))}</button>
    </section>

    ${canInstall ? `
    <section class="card">
      <button class="btn btn-primary btn-lg full" data-act="install">⬇️ ${esc(t('installApp'))}</button>
    </section>` : ''}

    <section class="card">
      <div class="section-title">${esc(t('about'))}</div>
      <p class="muted" style="margin-top:10px">
        ${esc(t('appName'))} · v1.3 — FAO-56 water balance, Open-Meteo forecasts.
      </p>
      <button class="btn btn-ghost full" data-act="export-csv" style="margin-bottom:10px">⬇️ ${esc(t('exportCsv'))}</button>
      <button class="btn btn-danger full" data-act="clear-data">${esc(t('clearData'))}</button>
    </section>
  </div>`;
}

/* ------------------------------------------------------------- fragments -- */
export function fillSelects() {
  const fill = (id, keys, namer) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = keys.map((k) => `<option value="${esc(k)}">${esc(namer(k))}</option>`).join('');
    if (prev) sel.value = prev;
  };
  fill('f-crop', CROP_KEYS, tCrop);
  fill('f-soil', SOIL_KEYS, tSoil);
  fill('f-method', METHOD_KEYS, tMethod);
}

export function placeOptions(list) {
  if (!list.length) return `<div class="muted" style="padding:8px 2px">${esc(t('noPlace'))}</div>`;
  return list.map((p, i) => `
    <button class="place-opt" data-act="pick-place" data-i="${i}">
      <b>${esc(p.name)}</b><span>${esc(p.admin)}</span>
    </button>`).join('');
}

export function langOptions(active) {
  return Object.entries(LANGS).map(([code, l]) => `
    <button class="lang-opt ${code === active ? 'is-on' : ''}" data-act="set-lang" data-lang="${esc(code)}">
      ${esc(l.name)}
    </button>`).join('');
}



