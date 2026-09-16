/**
 * app.js — wiring.
 *
 * Boot order matters on a slow phone: paint the cached state first, then go to
 * the network. A farmer who opens the app in a field with no signal should see
 * yesterday's advice immediately, marked as yesterday's, not a spinner.
 */

import * as store from './store.js';
import * as weatherApi from './weather.js';
import * as assistant from './assistant.js';
import * as ui from './ui.js';
import { t, setLang, getLang, LANGS, speechLang, num, setCurrency, getCurrency, otherLang } from './i18n.js';
import { waterBalance, assessRisks, iso, pumpCost, CROPS } from './agro.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const view = {
  tab: 'today',
  openFieldId: null,
  busy: false,
  placeResults: [],
  editingId: null,
  installPrompt: null,
  busyLabel: null,
  aiProvider: null,
  stale: false
};

/* ------------------------------------------------------------ view model -- */
/**
 * Recomputes every field's advice from the cached weather. Cheap enough (a few
 * hundred days of arithmetic per field) to run on every render rather than
 * maintaining a cache that could go stale against the store.
 */
function model() {
  const s = store.get();
  const weather = s.weather;
  const series = weather?.series || [];
  const today = iso(Date.now());
  // Every field is kept, advice or not. A field sown in the future has no balance
  // yet; dropping it here would make it unreachable in the UI.
  const cards = s.fields.map((f) => ({
    field: f,
    advice: series.length ? waterBalance(store.fieldWithPump(f), series, { today, ecw: s.ecw }) : null
  }));

  const risks = series.length ? assessRisks(series, today, s.river) : [];
  return { ...s, weather, cards, risks, today };
}

/** The field AI Yacoup answers about: the one that most needs attention. */
function focusCard(m) {
  const order = { urgent: 0, irrigate: 1, wait: 2, ok: 3 };
  return [...m.cards].sort((a, b) =>
    (order[a.advice?.verdict] ?? 9) - (order[b.advice?.verdict] ?? 9))[0] || null;
}

function assistantCtx() {
  const m = model();
  const card = focusCard(m);
  return {
    advice: card?.advice || null,
    field: card?.field || null,
    weather: m.weather, risks: m.risks, place: m.place, aiBridge: m.aiBridge
  };
}

/* ---------------------------------------------------------------- render -- */
function render() {
  const m = model();

  $('#place-label').textContent = m.place?.name || t('searchPlace');
  const net = $('#net-pill');
  net.textContent = navigator.onLine ? t('online') : t('offline');
  net.classList.toggle('off', !navigator.onLine);
  // The badge shows the language you would switch TO, which is what a toggle means.
  $('#lang-btn').textContent = LANGS[otherLang()].short;

  const age = weatherApi.ageOf(m.weather);
  const bar = $('#stale-bar');
  const oldData = age && (age.unit === 'hour' || age.unit === 'day');
  if (m.weather && (view.stale || !navigator.onLine) && oldData) {
    bar.hidden = false;
    bar.textContent = `${t('savedData')} · ${t('updated')} ${ageText(age)}`;
  } else {
    bar.hidden = true;
  }

  $$('.tabbtn').forEach((b) => {
    const on = b.dataset.goto === view.tab;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', String(on));
  });
  $$('.tab').forEach((sec) => { sec.hidden = sec.dataset.tab !== view.tab; });

  const host = $(`#tab-${view.tab}`);
  if (view.tab === 'today') host.innerHTML = ui.renderToday(m);
  else if (view.tab === 'water') host.innerHTML = ui.renderWater({ ...m, openFieldId: view.openFieldId });
  else if (view.tab === 'assistant') {
    host.innerHTML = ui.renderAssistant({ chat: m.chat, chips: assistant.quickQuestions(), busy: view.busy, busyLabel: view.busyLabel });
    const chat = $('#chat');
    if (chat) chat.scrollIntoView({ block: 'end' });
    $('#ask-input')?.focus({ preventScroll: true });
  } else {
    host.innerHTML = ui.renderSettings({
      ...m, canInstall: !!view.installPrompt, currency: getCurrency(), aiProvider: view.aiProvider
    });
  }
}

function ageText(age) {
  if (!age) return '';
  if (age.unit === 'now') return t('justNow');
  if (age.unit === 'min') return t('minsAgo', { n: num(age.n) });
  if (age.unit === 'hour') return t('hoursAgo', { n: num(age.n) });
  return t('daysAgo', { n: num(age.n) });
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function goto(tab) {
  view.tab = tab;
  history.replaceState(null, '', '#' + tab);
  render();
  window.scrollTo({ top: 0 });
}

/* --------------------------------------------------------------- weather -- */
async function refreshWeather({ force = false } = {}) {
  const res = await weatherApi.refresh({ force });
  view.stale = !!res.stale;
  render();
  return res;
}

/* ------------------------------------------------------------ onboarding -- */
function showOnboarding() {
  const s = store.get();
  const onboard = $('#onboard');
  if (s.lang && s.place) { onboard.hidden = true; return false; }
  onboard.hidden = false;
  $('#lang-grid').innerHTML = ui.langOptions(s.lang || null);
  $('#step-place').hidden = !s.lang;
  return true;
}

async function pickPlace(p) {
  store.set({ place: p });
  $('#onboard').hidden = true;
  $('#place-dialog').close();
  render();
  toast(p.name);
  await refreshWeather({ force: true });
}

let searchTimer = null;
function wireSearch(inputId, resultsId) {
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 2) { results.innerHTML = ''; return; }
    // Debounced: a farmer typing a village name on a 2G link should trigger one
    // request, not one per keystroke.
    searchTimer = setTimeout(async () => {
      results.innerHTML = `<div class="muted" style="padding:8px 2px">${t('loading')}</div>`;
      try {
        view.placeResults = await weatherApi.searchPlace(q, getLang());
        results.innerHTML = ui.placeOptions(view.placeResults);
      } catch {
        results.innerHTML = `<div class="muted" style="padding:8px 2px">${t('offline')}</div>`;
      }
    }, 450);
  });
}

async function useGps() {
  try {
    toast(t('loading'));
    const { lat, lon } = await weatherApi.locate();
    let name = `${lat.toFixed(2)}, ${lon.toFixed(2)}`, admin = '';
    try {
      const near = await weatherApi.searchPlace(`${lat},${lon}`, getLang());
      if (near[0]) { name = near[0].name; admin = near[0].admin; }
    } catch { /* a name is a nicety; the coordinates are what matter */ }
    await pickPlace({ name, admin, lat, lon });
  } catch {
    toast(t('noPlace'));
  }
}

/* ----------------------------------------------------------- field sheet -- */
function openFieldDialog(id) {
  view.editingId = id || null;
  const dlg = $('#field-dialog');
  ui.fillSelects();
  const f = id ? store.get().fields.find((x) => x.id === id) : null;
  $('#field-dialog-title').textContent = t(id ? 'edit' : 'addField');
  $('#f-name').value = f?.name || '';
  $('#f-crop').value = f?.crop || 'wheat';
  $('#f-sowing').value = f?.sowing || iso(Date.now() - 30 * 86400000);
  $('#f-area').value = f?.area ?? 0.4;
  $('#f-soil').value = f?.soil || 'loam';
  $('#f-method').value = f?.method || 'flood';
  $('#f-awd').checked = f ? f.awd !== false : true;
  syncAwdRow();
  dlg.showModal();
}

function syncAwdRow() {
  $('#awd-row').hidden = !CROPS[$('#f-crop').value]?.ponded;
}

function saveField(e) {
  e.preventDefault();
  const data = {
    name: $('#f-name').value.trim(),
    crop: $('#f-crop').value,
    sowing: $('#f-sowing').value,
    area: Number($('#f-area').value) || 0.4,
    soil: $('#f-soil').value,
    method: $('#f-method').value,
    awd: $('#f-awd').checked
  };
  if (!data.sowing) return;
  if (view.editingId) store.updateField(view.editingId, data);
  else view.openFieldId = store.addField(data).id;
  $('#field-dialog').close();
  view.tab = 'water';
  render();
}

/* ------------------------------------------------------------- assistant -- */
async function askAssistant(question) {
  const q = question.trim();
  if (!q) return;
  store.pushChat({ role: 'user', text: q });
  view.busy = true;
  render();
  try {
    const res = await assistant.ask(q, assistantCtx());
    store.pushChat({ role: 'bot', text: res.text, source: res.source });
    speak(res.text);
  } catch (err) {
    store.pushChat({ role: 'bot', text: t('dontKnow'), source: 'local' });
    console.error(err);
  } finally {
    view.busy = false;
    render();
  }
}

/** Reads an answer aloud — the feature that matters most to a farmer who does not read. */
function speak(text) {
  if (!store.get().voice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[•]/g, ' '));
    u.lang = speechLang();
    u.rate = 0.95;
    const voice = speechSynthesis.getVoices().find((v) => v.lang === u.lang)
      || speechSynthesis.getVoices().find((v) => v.lang?.startsWith(getLang()));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  } catch { /* no speech engine on this device */ }
}

let recog = null;
function toggleMic(btn) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast(t('askPlaceholder')); return; }
  if (recog) { recog.stop(); recog = null; btn.classList.remove('is-live'); return; }
  recog = new SR();
  recog.lang = speechLang();
  recog.interimResults = false;
  recog.maxAlternatives = 1;
  btn.classList.add('is-live');
  toast(t('listening'));
  recog.onresult = (e) => {
    const said = e.results[0][0].transcript;
    recog = null;
    btn.classList.remove('is-live');
    askAssistant(said);
  };
  recog.onerror = () => { recog = null; btn.classList.remove('is-live'); };
  recog.onend = () => { recog = null; btn.classList.remove('is-live'); };
  recog.start();
}

/* ------------------------------------------------------- online AI tasks -- */
/**
 * Shrinks a phone photo before it goes anywhere. A modern camera produces four
 * megabytes; on the connection this app is built for that is a minute of upload
 * and a failed request. 1024px on the long edge is more than the model needs to
 * read a leaf, and it turns the upload into a couple of hundred kilobytes.
 */
function shrinkImage(file, maxEdge = 1024) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      try { resolve(canvas.toDataURL('image/jpeg', 0.82)); }
      catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

/**
 * If the app is being served by its own bridge, wire it up without asking. Making
 * a farmer type a URL to switch on a feature is a good way to have the feature
 * never used. A bridge configured by hand always wins over the detected one.
 */
async function detectBridge() {
  if (!navigator.onLine) return;
  try {
    const res = await fetch(new URL('api/health', location.href), { cache: 'no-store' });
    if (!res.ok) return;
    const health = await res.json();
    view.aiProvider = health.provider || null;
    if (health.provider && !store.get().aiBridge) {
      store.set({ aiBridge: new URL('api/assistant', location.href).href });
    }
    if (view.tab === 'settings') render();
  } catch { /* no bridge on this origin; the offline brain covers everything */ }
}

/** Guards both online tasks: no signal or no bridge means say so, not fail silently. */
function onlineTaskBlocked() {
  if (!navigator.onLine) { toast(t('needOnline')); return true; }
  if (!store.get().aiBridge) { toast(t('needBridge')); return true; }
  return false;
}

async function runDiagnosis(file) {
  if (onlineTaskBlocked()) return;
  const ctx = assistantCtx();
  let image;
  try { image = await shrinkImage(file); }
  catch { toast(t('photoFailed')); return; }

  store.pushChat({ role: 'user', text: t('photoSent', { field: ctx.field?.name || t('navWater') }) });
  view.busy = true;
  view.busyLabel = t('analysing');
  render();
  try {
    const answer = await assistant.diagnose(image, ctx);
    store.pushChat({ role: 'bot', text: answer, source: 'cloud' });
    speak(answer);
  } catch (err) {
    console.warn('diagnose failed', err);
    store.pushChat({ role: 'bot', text: t('aiFailed'), source: 'local' });
  } finally {
    view.busy = false;
    view.busyLabel = null;
    render();
  }
}

async function runFarmReport() {
  if (onlineTaskBlocked()) return;
  const m = model();
  if (!m.cards.some((c) => c.advice)) { toast(t('noFieldYet')); return; }

  store.pushChat({ role: 'user', text: t('reportBtn') });
  view.busy = true;
  view.busyLabel = t('writingReport');
  render();
  try {
    const answer = await assistant.farmReport({
      cards: m.cards, risks: m.risks, place: m.place, ecw: m.ecw, aiBridge: m.aiBridge
    });
    store.pushChat({ role: 'bot', text: answer, source: 'cloud' });
    speak(answer);
  } catch (err) {
    console.warn('report failed', err);
    store.pushChat({ role: 'bot', text: t('aiFailed'), source: 'local' });
  } finally {
    view.busy = false;
    view.busyLabel = null;
    render();
  }
}

/* ---------------------------------------------------------------- export -- */
/**
 * Writes the irrigation history and the season summary to a CSV the farmer owns.
 * Records like these are what a subsidy claim, a co-operative or a water
 * authority asks for, and a farmer should never have to re-type them out of an
 * app. Everything is computed here; nothing is uploaded.
 */
function exportCsv() {
  const m = model();
  const rows = [['field', 'crop', 'area_ha', 'date', 'applied_mm', 'volume_m3', 'cost', 'currency']];
  for (const { field } of m.cards) {
    for (const ir of field.irrigations || []) {
      const volume = ir.mm * (field.area || 1) * 10;
      const { cost } = pumpCost(volume, m.pump);
      rows.push([
        field.name || field.crop, field.crop, field.area, ir.date,
        ir.mm.toFixed(1), volume.toFixed(1), cost.toFixed(0), getCurrency()
      ]);
    }
  }
  rows.push([]);
  rows.push(['field', 'crop', 'season_rain_mm', 'season_crop_use_mm', 'season_applied_mm', 'saved_m3', 'saved_pct']);
  for (const { field, advice } of m.cards) {
    if (!advice) continue;
    const s = advice.season;
    rows.push([
      field.name || field.crop, field.crop,
      s.rainMm.toFixed(0), s.etcMm.toFixed(0), s.irrigationMm.toFixed(0),
      (s.savedM3 ?? 0).toFixed(0), s.savedPct ?? 0
    ]);
  }

  // Quote every cell: field names are free text and may contain a comma.
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  // A BOM, so Excel opens the Arabic field names as UTF-8 rather than mojibake.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `miter-${iso(Date.now())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t('exported'));
}

/** Switching language re-renders everything, including the text direction. */
function applyLang(code) {
  setLang(code);
  store.set({ lang: code });
  ui.applyStatic();
  ui.fillSelects();
  if (!store.get().place) {
    $('#step-place').hidden = false;
    $('#lang-grid').innerHTML = ui.langOptions(getLang());
  }
  render();
}

/* ---------------------------------------------------------------- events -- */
document.addEventListener('click', async (e) => {
  const closer = e.target.closest('[data-close]');
  if (closer) { closer.closest('dialog')?.close(); return; }

  const tabBtn = e.target.closest('[data-goto]');
  if (tabBtn) { goto(tabBtn.dataset.goto); return; }

  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, id } = el.dataset;

  switch (act) {
    case 'set-lang':
      applyLang(el.dataset.lang);
      break;
    case 'pick-place':
      await pickPlace(view.placeResults[Number(el.dataset.i)]);
      break;
    case 'change-place':
      $('#place-dialog').showModal();
      break;
    case 'add-field':
      openFieldDialog(null);
      break;
    case 'edit-field':
      openFieldDialog(id);
      break;
    case 'delete-field':
      if (confirm(t('confirmDelete'))) { store.removeField(id); render(); }
      break;
    case 'toggle-field':
      view.openFieldId = view.openFieldId === id ? null : id;
      render();
      break;
    case 'log-water': {
      // One tap logs the depth the app just recommended. That is the amount the
      // farmer was told to apply, so it is the honest default; they can edit the
      // field's history by logging again on the same day.
      const m = model();
      const card = m.cards.find((c) => c.field.id === id);
      const mm = Math.max(10, Math.round(card?.advice?.grossMm || 50));
      store.logIrrigation(id, mm);
      render();
      toast(`${t('logged')} (${num(mm)} mm)`);
      break;
    }
    case 'quick':
      askAssistant(el.dataset.q);
      break;
    case 'save-settings': {
      store.set({
        pump: {
          ...store.get().pump,
          dischargeLps: Number($('#s-lps').value) || 10,
          costPerHour: Number($('#s-cost').value) || 0
        },
        voice: $('#s-voice').checked,
        currency: setCurrency($('#s-cur').value)
      });
      render();
      toast(t('logged'));
      break;
    }
    case 'diagnose':
      $('#photo-input')?.click();
      break;
    case 'report':
      runFarmReport();
      break;
    case 'save-salinity':
      store.set({ ecw: Math.max(0, Number($('#s-ecw').value) || 0) });
      render();
      toast(t('logged'));
      break;
    case 'export-csv':
      exportCsv();
      break;
    case 'save-bridge':
      store.set({ aiBridge: $('#s-bridge').value.trim() });
      toast(t('logged'));
      break;
    case 'install':
      if (view.installPrompt) { view.installPrompt.prompt(); view.installPrompt = null; render(); }
      break;
    case 'clear-data':
      if (confirm(t('clearData') + '?')) { store.clearAll(); location.reload(); }
      break;
  }
});

document.addEventListener('submit', (e) => {
  if (e.target.id === 'ask-form') {
    e.preventDefault();
    const input = $('#ask-input');
    const q = input.value;
    input.value = '';
    askAssistant(q);
  } else if (e.target.id === 'field-form') {
    saveField(e);
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'f-crop') syncAwdRow();
  if (e.target.id === 'photo-input' && e.target.files?.[0]) {
    runDiagnosis(e.target.files[0]);
    e.target.value = ''; // so picking the same photo twice still fires
  }
});

document.addEventListener('click', (e) => {
  if (e.target.closest('#mic-btn')) toggleMic(e.target.closest('#mic-btn'));
});

$('#place-btn').addEventListener('click', () => $('#place-dialog').showModal());
$('#lang-btn').addEventListener('click', () => applyLang(otherLang()));
$('#gps-btn').addEventListener('click', useGps);
$('#gps-btn2').addEventListener('click', useGps);

window.addEventListener('online', () => { render(); refreshWeather({ force: true }); });
window.addEventListener('offline', render);
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  view.installPrompt = e;
  if (view.tab === 'settings') render();
});

// Coming back to the app after a few hours should not show stale numbers.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshWeather();
});

/* ------------------------------------------------------------------ boot -- */
async function boot() {
  const s = store.get();
  // Pick up the phone's language on first run, if we speak it.
  const guess = (navigator.language || 'ar').slice(0, 2);
  setLang(s.lang || (LANGS[guess] ? guess : 'ar'));
  setCurrency(s.currency);

  ui.applyStatic();
  ui.fillSelects();
  wireSearch('place-input', 'place-results');
  wireSearch('place-input2', 'place-results2');

  const hash = location.hash.replace('#', '');
  if (['today', 'water', 'assistant', 'settings'].includes(hash)) view.tab = hash;

  const needsOnboarding = showOnboarding();
  render();                       // paint cached state before touching the network
  if (!needsOnboarding) refreshWeather();
  detectBridge();                 // switch on the online features if a bridge is here

  if ('serviceWorker' in navigator) {
    try {
      // When a new worker takes over, the page in front of the farmer is still
      // the old build. Reload once so what they see matches what shipped;
      // without this an update can sit invisible behind the cache indefinitely.
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.update();
    } catch (e) {
      console.warn('Service worker not registered', e);
    }
  }
  // Voice lists load asynchronously on most browsers.
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
}


boot();
