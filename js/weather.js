/**
 * weather.js — Open-Meteo access, built for a bad connection.
 *
 * Open-Meteo needs no API key, which is deliberate: a key in a client-side app is
 * a key in every farmer's phone, and a proxy would put a server between the farmer
 * and their forecast. Everything here degrades to the last good payload on disk.
 */

import * as store from './store.js';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const FLOOD = 'https://flood-api.open-meteo.com/v1/flood';

const DAILY = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min',
  'precipitation_sum', 'rain_sum', 'precipitation_probability_max',
  'et0_fao_evapotranspiration', 'wind_speed_10m_max', 'sunrise', 'sunset'
].join(',');

const CURRENT = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
  'precipitation', 'weather_code', 'wind_speed_10m'
].join(',');

const HOURLY = ['precipitation', 'precipitation_probability'].join(',');

async function getJSON(url, { timeout = 12000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------- geocoding -- */
export async function searchPlace(name, lang = 'en') {
  const url = `${GEOCODE}?name=${encodeURIComponent(name)}&count=8&language=${lang}&format=json`;
  const data = await getJSON(url, { timeout: 8000 });
  return (data.results || []).map((r) => ({
    name: r.name,
    admin: [r.admin2, r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude
  }));
}

export function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no-geolocation'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: +pos.coords.latitude.toFixed(4), lon: +pos.coords.longitude.toFixed(4) }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 }
    );
  });
}

/* ---------------------------------------------------------------- forecast -- */
/**
 * Fetches 60 past days and 14 forecast days in one call. The past window is what
 * lets the water balance reconstruct the soil's current state from the sowing
 * date without the farmer having logged anything.
 */
export async function fetchWeather(lat, lon) {
  const url = `${FORECAST}?latitude=${lat}&longitude=${lon}`
    + `&daily=${DAILY}&current=${CURRENT}&hourly=${HOURLY}`
    + '&past_days=60&forecast_days=14&timezone=auto';
  const raw = await getJSON(url);
  return normalise(raw, lat, lon);
}

/** Flattens Open-Meteo's parallel arrays into the day records the model expects. */
function normalise(raw, lat, lon) {
  const d = raw.daily || {};
  const today = new Date().toISOString().slice(0, 10);
  const series = (d.time || []).map((date, i) => ({
    date,
    code: d.weather_code?.[i] ?? 3,
    tmax: d.temperature_2m_max?.[i],
    tmin: d.temperature_2m_min?.[i],
    rain: d.precipitation_sum?.[i] ?? 0,
    pop: d.precipitation_probability_max?.[i] ?? null,
    // ET0 is the engine's fuel; a missing day falls back to a plausible default
    // rather than silently becoming zero, which would read as "no crop demand".
    et0: d.et0_fao_evapotranspiration?.[i] ?? 4.5,
    wind: d.wind_speed_10m_max?.[i],
    sunrise: d.sunrise?.[i],
    sunset: d.sunset?.[i],
    forecast: date >= today
  }));

  const c = raw.current || {};
  return {
    lat, lon,
    timezone: raw.timezone,
    fetchedAt: Date.now(),
    current: {
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      rain: c.precipitation,
      code: c.weather_code,
      wind: c.wind_speed_10m,
      time: c.time
    },
    hourly: compactHourly(raw.hourly),
    series
  };
}

/** Next 24 hours of rain, kept small so the offline cache stays light. */
function compactHourly(h) {
  if (!h?.time) return [];
  const now = Date.now();
  const out = [];
  for (let i = 0; i < h.time.length; i++) {
    const ts = Date.parse(h.time[i]);
    if (ts < now - 3600000 || ts > now + 86400000) continue;
    out.push({ t: h.time[i], mm: h.precipitation?.[i] ?? 0, pop: h.precipitation_probability?.[i] ?? null });
  }
  return out;
}

/* ------------------------------------------------------------------- flood -- */
/**
 * River discharge from the GloFAS-backed flood API. Rainfall tells a farmer what
 * lands on their field; discharge tells them what is coming down the river at
 * them from upstream, which is the part that arrives without warning.
 */
export async function fetchRiver(lat, lon) {
  try {
    const url = `${FLOOD}?latitude=${lat}&longitude=${lon}`
      + '&daily=river_discharge,river_discharge_mean&forecast_days=30&past_days=30';
    const raw = await getJSON(url, { timeout: 9000 });
    const d = raw.daily || {};
    const today = new Date().toISOString().slice(0, 10);
    const i = Math.max(0, (d.time || []).indexOf(today));
    const discharge = d.river_discharge?.[i];
    const normal = d.river_discharge_mean?.[i];
    if (discharge == null) return null;
    const peak = Math.max(...(d.river_discharge || []).slice(i, i + 10).filter((x) => x != null));
    return { discharge, normal, peak, fetchedAt: Date.now() };
  } catch {
    return null; // A missing flood layer must never block the forecast.
  }
}

/* --------------------------------------------------------------- refresh -- */
/**
 * The one call the UI makes. Returns { data, stale, error } and always leaves the
 * best available payload in the store, so a failed refresh shows yesterday's
 * numbers with an honest "saved data" badge instead of an empty screen.
 */
export async function refresh({ force = false } = {}) {
  const s = store.get();
  const place = s.place;
  if (!place) return { data: s.weather, stale: true, error: 'no-place' };

  const cached = s.weather;
  const fresh = cached
    && cached.lat === place.lat && cached.lon === place.lon
    && Date.now() - cached.fetchedAt < 30 * 60 * 1000;
  if (fresh && !force) return { data: cached, stale: false };

  if (!navigator.onLine) return { data: cached, stale: true, error: 'offline' };

  try {
    const data = await fetchWeather(place.lat, place.lon);
    const river = await fetchRiver(place.lat, place.lon);
    store.set({ weather: data, river });
    return { data, stale: false };
  } catch (err) {
    console.warn('Weather refresh failed', err);
    return { data: cached, stale: true, error: String(err.message || err) };
  }
}

/** How old the numbers on screen are, for the staleness badge. */
export function ageOf(data) {
  if (!data?.fetchedAt) return null;
  const mins = Math.floor((Date.now() - data.fetchedAt) / 60000);
  if (mins < 2) return { unit: 'now' };
  if (mins < 60) return { unit: 'min', n: mins };
  if (mins < 1440) return { unit: 'hour', n: Math.floor(mins / 60) };
  return { unit: 'day', n: Math.floor(mins / 1440) };
}
