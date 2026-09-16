/**
 * store.js — all persistent state, in localStorage.
 *
 * A farmer's fields, pump and language have to survive a dead battery and a week
 * without signal, so nothing here depends on the network or on a login. Every
 * read is defensive: a corrupted or missing key returns defaults rather than
 * breaking the app on a phone we cannot debug.
 */

const KEY = 'miter/v1';

const DEFAULTS = {
  lang: null,                   // null until the farmer picks, then a code
  place: null,                  // { name, admin, lat, lon }
  fields: [],
  pump: { type: 'electric', dischargeLps: 10, costPerHour: 60 },
  currency: 'ج.م',               // just a symbol — one field in Settings changes it
  ecw: 0,                       // irrigation water salinity, dS/m; 0 = unknown
  voice: true,
  aiBridge: '',                 // optional proxy URL for online AI Yacoup
  weather: null,                // last good payload, with fetchedAt
  river: null,
  chat: []
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...parsed };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let writeTimer = null;
function persist() {
  clearTimeout(writeTimer);
  // Batch writes: on a low-end phone, serialising on every keystroke is felt.
  writeTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn('Could not save state', e); }
  }, 120);
}

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } });

export const get = () => state;

export function set(patch) {
  state = { ...state, ...patch };
  persist();
  emit();
  return state;
}

/* ---------------------------------------------------------------- fields -- */
const uid = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function addField(field) {
  const f = {
    id: uid(),
    name: field.name || '',
    crop: field.crop || 'wheat',
    soil: field.soil || 'loam',
    method: field.method || 'flood',
    sowing: field.sowing,
    area: Number(field.area) || 0.4,
    awd: field.awd !== false,
    irrigations: field.irrigations || [],
    createdAt: Date.now()
  };
  set({ fields: [...state.fields, f] });
  return f;
}

export function updateField(id, patch) {
  set({ fields: state.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
}

export function removeField(id) {
  set({ fields: state.fields.filter((f) => f.id !== id) });
}

/**
 * Records an irrigation. `mm` is the gross depth the farmer actually applied; the
 * balance model converts it to what the root zone kept using the field's method.
 */
export function logIrrigation(id, mm, date) {
  const f = state.fields.find((x) => x.id === id);
  if (!f) return;
  const day = date || new Date().toISOString().slice(0, 10);
  const irrigations = [...(f.irrigations || []).filter((x) => x.date !== day), { date: day, mm: Number(mm) || 0 }];
  irrigations.sort((a, b) => a.date.localeCompare(b.date));
  updateField(id, { irrigations });
}

/* ------------------------------------------------------------------ chat -- */
export function pushChat(msg) {
  // Keep the transcript short: an old phone should not carry a season of chat.
  const chat = [...state.chat, msg].slice(-40);
  set({ chat });
}
export const clearChat = () => set({ chat: [] });

/* ----------------------------------------------------------------- reset -- */
export function clearAll() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
  state = structuredClone(DEFAULTS);
  emit();
}

/** Fields carry the pump settings into the model, which treats them per-field. */
export const fieldWithPump = (f) => ({ ...f, pump: state.pump });
