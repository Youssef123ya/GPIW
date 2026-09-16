/**
 * agro.js — MITER agronomy core.
 *
 * A deterministic FAO-56 (Allen et al., 1998) soil-water-balance model that runs
 * entirely on-device. No network, no model server: given a crop, a soil, a sowing
 * date and a daily weather series (rain + reference evapotranspiration), it answers
 * the only question a farmer actually asks: do I switch the pump on today?
 *
 * Everything below is pure functions over plain data, so it can be unit-tested and
 * so AI Yacoup can quote real numbers instead of inventing them.
 */

/* ------------------------------------------------------------------ crops -- */
/**
 * Kc = crop coefficient per growth stage, L = stage lengths in days, zr = max
 * rooting depth (m), p = soil-water depletion fraction at which the crop starts to
 * suffer, ec = [salinity threshold in dS/m, yield loss in % per dS/m above it].
 *
 * Kc and p follow FAO-56 Tables 12/22; salinity follows FAO-29 Table 4. The
 * perennials carry `cycle`: their Kc curve repeats on that period rather than
 * running once from a sowing date, so a date palm planted years ago still lands
 * in the right stage today, and alfalfa restarts on every cutting.
 */
export const CROPS = {
  /* --- field crops --------------------------------------------------------- */
  wheat:     { ponded: false, L: [20, 40, 45, 30],   kc: [0.40, 1.15, 0.35], zr: 1.20, p: 0.55, heat: 34, ec: [6.0, 7.1] },
  barley:    { ponded: false, L: [20, 35, 45, 25],   kc: [0.30, 1.15, 0.25], zr: 1.20, p: 0.55, heat: 34, ec: [8.0, 5.0] },
  maize:     { ponded: false, L: [20, 35, 40, 30],   kc: [0.30, 1.20, 0.50], zr: 1.20, p: 0.55, heat: 38, ec: [1.7, 12.0] },
  rice:      { ponded: true,  L: [30, 30, 60, 30],   kc: [1.05, 1.20, 0.90], zr: 0.50, p: 0.20, heat: 38, ec: [3.0, 12.0] },
  cotton:    { ponded: false, L: [30, 50, 60, 55],   kc: [0.35, 1.18, 0.60], zr: 1.40, p: 0.65, heat: 40, ec: [7.7, 5.2] },
  sugarcane: { ponded: false, L: [35, 60, 190, 120], kc: [0.40, 1.25, 0.75], zr: 1.50, p: 0.65, heat: 40, ec: [1.7, 5.9] },
  sugarbeet: { ponded: false, L: [30, 45, 90, 35],   kc: [0.35, 1.20, 0.70], zr: 1.00, p: 0.55, heat: 35, ec: [7.0, 5.9] },
  soybean:   { ponded: false, L: [20, 30, 60, 25],   kc: [0.40, 1.15, 0.50], zr: 1.00, p: 0.50, heat: 38, ec: [5.0, 20.0] },
  groundnut: { ponded: false, L: [25, 35, 45, 25],   kc: [0.40, 1.15, 0.60], zr: 0.80, p: 0.50, heat: 38, ec: [3.2, 29.0] },
  faba:      { ponded: false, L: [20, 30, 50, 20],   kc: [0.50, 1.15, 0.30], zr: 0.70, p: 0.45, heat: 30, ec: [1.5, 9.6] },
  gram:      { ponded: false, L: [20, 30, 40, 20],   kc: [0.40, 1.00, 0.35], zr: 0.90, p: 0.50, heat: 34, ec: [1.3, 14.0] },
  mustard:   { ponded: false, L: [20, 35, 45, 25],   kc: [0.35, 1.10, 0.35], zr: 1.20, p: 0.60, heat: 32, ec: [5.0, 13.0] },

  /* --- vegetables ---------------------------------------------------------- */
  potato:    { ponded: false, L: [25, 30, 45, 30],   kc: [0.50, 1.15, 0.75], zr: 0.50, p: 0.35, heat: 30, ec: [1.7, 12.0] },
  onion:     { ponded: false, L: [20, 35, 110, 45],  kc: [0.70, 1.05, 0.75], zr: 0.40, p: 0.30, heat: 35, ec: [1.2, 16.0] },
  tomato:    { ponded: false, L: [30, 40, 40, 25],   kc: [0.60, 1.15, 0.80], zr: 0.80, p: 0.40, heat: 34, ec: [2.5, 9.9] },
  cucumber:  { ponded: false, L: [20, 30, 40, 15],   kc: [0.60, 1.00, 0.75], zr: 0.70, p: 0.50, heat: 33, ec: [2.5, 13.0] },

  /* --- forage -------------------------------------------------------------- */
  berseem:   { ponded: false, L: [10, 20, 20, 15],   kc: [0.40, 1.15, 1.10], zr: 0.70, p: 0.55, heat: 32, ec: [1.5, 5.7] },
  alfalfa:   { ponded: false, L: [5, 10, 12, 8],     kc: [0.40, 1.20, 1.15], zr: 1.50, p: 0.55, heat: 38, ec: [2.0, 7.3],
               perennial: true, cycle: 35 },

  /* --- trees --------------------------------------------------------------- */
  date_palm: { ponded: false, L: [60, 90, 120, 95],  kc: [0.90, 0.95, 0.95], zr: 1.70, p: 0.50, heat: 45, ec: [4.0, 3.6],
               perennial: true, cycle: 365 },
  olive:     { ponded: false, L: [90, 90, 120, 65],  kc: [0.65, 0.70, 0.70], zr: 1.50, p: 0.65, heat: 40, ec: [2.7, 16.0],
               perennial: true, cycle: 365 },
  citrus:    { ponded: false, L: [60, 90, 120, 95],  kc: [0.70, 0.65, 0.70], zr: 1.20, p: 0.50, heat: 38, ec: [1.7, 16.0],
               perennial: true, cycle: 365 }
};

/* ------------------------------------------------------------------ soils -- */
/** taw = total available water (mm of water per metre of root depth); ro = runoff coefficient. */
export const SOILS = {
  sand:       { taw: 70,  ro: 0.05, perc: 8 },
  sandy_loam: { taw: 110, ro: 0.10, perc: 5 },
  loam:       { taw: 150, ro: 0.15, perc: 3 },
  clay_loam:  { taw: 170, ro: 0.22, perc: 2 },
  clay:       { taw: 180, ro: 0.30, perc: 1.5 },
  black:      { taw: 200, ro: 0.28, perc: 1.5 }
};

/** Field application efficiency: the share of pumped water the root zone keeps. */
export const METHODS = { flood: 0.55, furrow: 0.65, sprinkler: 0.75, drip: 0.90 };

/**
 * The most net water one irrigation should put on, in mm, by method. Without this
 * the model would tell a farmer whose profile has run dry to replace the whole
 * deficit in a single pass: physically possible, agronomically wrong. Water beyond
 * these depths runs off or drains below the roots instead of being stored.
 */
export const MAX_APPLICATION = { flood: 75, furrow: 70, sprinkler: 50, drip: 25 };

export const CROP_KEYS = Object.keys(CROPS);
export const SOIL_KEYS = Object.keys(SOILS);
export const METHOD_KEYS = Object.keys(METHODS);

/* ------------------------------------------------------------- date utils -- */
export const DAY_MS = 86400000;
export const iso = (d) => new Date(d).toISOString().slice(0, 10);
export const daysBetween = (a, b) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY_MS);
export const addDays = (isoDate, n) => iso(Date.parse(isoDate + 'T00:00:00Z') + n * DAY_MS);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ----------------------------------------------------------- growth stage -- */
/**
 * Crop coefficient and stage for a given day-after-sowing, using the FAO-56
 * four-stage curve with a linear ramp through development and late season.
 */
export function cropStage(cropKey, das) {
  const c = CROPS[cropKey] || CROPS.wheat;
  const [Li, Ld, Lm, Ll] = c.L;
  const [kcI, kcM, kcE] = c.kc;
  const total = Li + Ld + Lm + Ll;
  // A perennial has no single season: its curve repeats, so an olive grove
  // planted in 2009 is read at the right point of this year, not off the end.
  const d = c.perennial
    ? ((das % (c.cycle || total)) + (c.cycle || total)) % (c.cycle || total)
    : clamp(das, 0, total + 30);
  let kc, stage;
  if (d <= Li) { kc = kcI; stage = 'initial'; }
  else if (d <= Li + Ld) { kc = kcI + (kcM - kcI) * ((d - Li) / Ld); stage = 'development'; }
  else if (d <= Li + Ld + Lm) { kc = kcM; stage = 'mid'; }
  else if (d <= total) { kc = kcM + (kcE - kcM) * ((d - Li - Ld - Lm) / Ll); stage = 'late'; }
  else { kc = kcE; stage = 'harvest'; }
  // Roots deepen through the initial and development stages, then hold. A
  // perennial is already fully rooted, so its depth must not reset each cycle.
  const zr = c.perennial
    ? c.zr
    : Math.min(c.zr, 0.15 + (c.zr - 0.15) * clamp(d / (Li + Ld), 0, 1));
  return {
    kc, stage, zr, das: d, seasonDays: total,
    perennial: !!c.perennial,
    daysToHarvest: c.perennial ? null : Math.max(0, total - d)
  };
}

/* ---------------------------------------------------------------- salinity -- */
/**
 * Salinity, the constraint that decides whether irrigation is sustainable in an
 * arid region. Watering with salty water concentrates salt in the root zone as
 * the crop transpires pure water; the only way out is to deliberately push extra
 * water through to flush it below the roots.
 *
 * `lr` is the leaching requirement (Rhoades, FAO-29): the fraction of applied
 * water that must drain past the root zone to hold soil salinity at a level the
 * crop tolerates. It makes every irrigation bigger, which is the honest answer —
 * pretending salty water goes as far as fresh water is how soils are ruined.
 */
export function salinity(cropKey, ecw) {
  const c = CROPS[cropKey] || CROPS.wheat;
  const [threshold, slope] = c.ec || [3, 10];
  const water = Math.max(0, Number(ecw) || 0);
  if (water <= 0) return { ecw: 0, threshold, lr: 0, ece: 0, yieldLoss: 0, level: 'none' };

  // LR = ECw / (5·ECe_threshold − ECw), capped: past ~0.45 the practice is not
  // leaching any more, it is wasting water on a crop that cannot cope.
  const denom = 5 * threshold - water;
  const lr = denom <= 0 ? 0.45 : clamp(water / denom, 0, 0.45);

  // Average root-zone salinity under ordinary leaching is roughly 1.5x the water.
  const ece = water * 1.5;
  const yieldLoss = clamp((ece - threshold) * slope, 0, 100);
  const level = yieldLoss >= 25 ? 'severe' : yieldLoss >= 10 ? 'high' : yieldLoss > 0 ? 'mild' : 'none';
  return { ecw: water, threshold, lr, ece, yieldLoss, level };
}

/**
 * The crops that cope best with a given water salinity, best first. It always
 * returns the top options rather than filtering to a "safe" set: on genuinely
 * bad water nothing is safe, and a farmer is far better served by "barley is
 * your least bad choice, about 5% down" than by an empty list.
 */
export function tolerantCrops(ecw, limit = 4) {
  return Object.entries(CROPS)
    .map(([key]) => ({ key, loss: salinity(key, ecw).yieldLoss }))
    .sort((a, b) => a.loss - b.loss)
    .slice(0, limit);
}

/* -------------------------------------------------------- water accounting -- */
/** Effective rainfall: gross rain minus interception and surface runoff. */
export function effectiveRain(mm, soilKey) {
  const s = SOILS[soilKey] || SOILS.loam;
  if (!mm || mm <= 0) return 0;
  // Light showers are largely lost to interception and evaporation off wet leaves.
  const intercepted = Math.min(mm, 1.5);
  return Math.max(0, (mm - intercepted) * (1 - s.ro));
}

/** A net depth (mm) over an area (ha) expressed as a pumped volume in cubic metres. */
export const mmToM3 = (mm, ha) => mm * ha * 10;

/** Pump run time and running cost for a given volume of water. */
export function pumpCost(volumeM3, pump) {
  const lps = Math.max(0.5, pump?.dischargeLps || 10);
  const hours = volumeM3 / (lps * 3.6); // L/s x 3.6 = cubic metres per hour
  return { hours, cost: hours * (pump?.costPerHour ?? 120) };
}

/* ---------------------------------------------------------- the main model -- */
/**
 * Runs the daily water balance across the supplied weather series.
 *
 * series: [{ date, rain, et0, tmax, tmin, pop, wind, code, forecast }]
 * Days flagged `forecast` are projected, not observed, and are reported separately
 * so the UI never presents a prediction as a measurement.
 */
export function waterBalance(field, series, settings = {}) {
  const crop = CROPS[field.crop] || CROPS.wheat;
  const soil = SOILS[field.soil] || SOILS.loam;
  const eff = METHODS[field.method] ?? 0.6;
  const irrigations = field.irrigations || [];
  const today = settings.today || iso(Date.now());

  if (crop.ponded) return pondedBalance(field, series, settings);

  let dr = null;                 // root-zone depletion in mm; 0 means field capacity
  const days = [];
  let seasonIrrigationMm = 0, seasonRainMm = 0, seasonEtcMm = 0;

  // Two self-scheduling shadow runs answer "what did watching the weather buy
  // me?" without needing the farmer to have logged anything. Both irrigate on
  // the same rule; one credits rainfall and the other ignores it, the way a
  // fixed habit does. The gap between them is water this app actually saved.
  let drResp = null, drBlind = null;
  let respMm = 0, blindMm = 0;

  for (const d of series) {
    const das = daysBetween(field.sowing, d.date);
    if (das < 0) continue;       // before sowing there is no crop to water
    const { kc, zr, stage, das: cycleDay, perennial } = cropStage(field.crop, das);
    const taw = soil.taw * zr;
    // Seed the balance the first day we have weather for. For a recently sown
    // crop that is the sowing date; for a long-season crop it is wherever the
    // 60-day history starts. Either way 35% depleted is a neutral prior, and the
    // balance converges on reality within a couple of wetting cycles.
    if (dr === null) dr = taw * 0.35;

    const etc = (d.et0 ?? 4) * kc;
    const pe = effectiveRain(d.rain ?? 0, field.soil);
    // The depletion fraction rises when demand is low and falls in high-ET weather.
    const pAdj = clamp(crop.p + 0.04 * (5 - etc), 0.1, 0.8);
    const raw = pAdj * taw;

    const appliedNet = irrigations
      .filter((x) => x.date === d.date)
      .reduce((a, x) => a + (x.mm || 0) * eff, 0);

    const before = dr;
    dr = clamp(before + etc - pe - appliedNet, 0, taw);
    const deepPerc = Math.max(0, pe + appliedNet - before);

    // The two shadow schedules, stepped on the same day and the same rule.
    const cap = Math.min(raw, MAX_APPLICATION[field.method] ?? 75);
    const step = (depletion, rainCredit) => {
      let next = clamp((depletion ?? taw * 0.35) + etc - rainCredit, 0, taw);
      let applied = 0;
      if (next > raw) { applied = Math.min(next, cap); next -= applied; }
      return { next, applied };
    };
    const r = step(drResp, pe);
    const b = step(drBlind, 0);
    drResp = r.next; drBlind = b.next;

    if (!d.forecast) {
      seasonIrrigationMm += appliedNet / eff;
      seasonRainMm += d.rain ?? 0;
      seasonEtcMm += etc;
      respMm += r.applied / eff;
      blindMm += b.applied / eff;
    }
    days.push({
      date: d.date, das: cycleDay, perennial, stage, kc, taw, raw, dr, etc, pe,
      rain: d.rain ?? 0, pop: d.pop ?? 0, tmax: d.tmax, tmin: d.tmin,
      deepPerc, forecast: !!d.forecast,
      stress: dr > raw, severe: dr > taw * 0.85
    });
  }

  if (!days.length) return null;
  const nowIdx = Math.max(0, days.findIndex((x) => x.date === today));
  const now = days[nowIdx] || days[days.length - 1];
  const ahead = days.slice(nowIdx + 1);

  const savedMm = Math.max(0, blindMm - respMm);
  return buildAdvice({
    field, eff, days, now, ahead, ponded: false, settings,
    season: {
      irrigationMm: seasonIrrigationMm, rainMm: seasonRainMm, etcMm: seasonEtcMm,
      // What responding to rainfall was worth over the season so far.
      savedMm, savedM3: mmToM3(savedMm, field.area || 1),
      savedPct: blindMm > 0 ? Math.round((savedMm / blindMm) * 100) : 0,
      blindMm, respMm
    }
  });
}

/* ------------------------------------------- paddy: a ponding-depth model -- */
/**
 * Transplanted paddy is not a depletion problem, it is a standing-water problem.
 * We track ponding depth in mm (negative means the surface has dried back) so the
 * app can offer Alternate Wetting and Drying, the single biggest water saving
 * available to a rice farmer.
 */
function pondedBalance(field, series, settings = {}) {
  const soil = SOILS[field.soil] || SOILS.clay;
  const eff = METHODS[field.method] ?? 0.55;
  const today = settings.today || iso(Date.now());
  const awd = field.awd !== false;
  const REFILL_TO = 50;                   // mm of standing water after irrigating
  const TRIGGER = awd ? -100 : 10;        // AWD lets the pond drop below the surface
  const BUND = field.bundHeight || 100;   // mm; anything above this runs off

  // Once the pond is gone the soil itself dries back, but only so far before the
  // crop is simply in drought: the floor keeps the state physically meaningful.
  const FLOOR = TRIGGER - 60;

  // Two self-scheduling shadow runs, AWD against continuous flooding, give an
  // honest "this is what the practice saves" figure independent of what the
  // farmer actually did. The live `level` run uses the real logged irrigations.
  let level = null;
  const sim = { awd: null, cont: null };
  let simAwdMm = 0, simContMm = 0;
  const days = [];
  let seasonIrrigationMm = 0, seasonRainMm = 0, seasonEtcMm = 0;

  for (const d of series) {
    const das = daysBetween(field.sowing, d.date);
    if (das < 0) continue;
    const { kc, stage, das: cycleDay, perennial } = cropStage(field.crop, das);
    if (level === null) { level = REFILL_TO; sim.awd = REFILL_TO; sim.cont = REFILL_TO; }

    const etc = (d.et0 ?? 4) * kc;
    const pe = effectiveRain(d.rain ?? 0, field.soil);
    const applied = (field.irrigations || [])
      .filter((x) => x.date === d.date)
      .reduce((a, x) => a + (x.mm || 0) * eff, 0);

    // This is where AWD actually saves water. A ponded field loses water to
    // seepage and percolation the whole time it is ponded; once the pond is gone
    // that loss largely stops. Letting the field dry between irrigations cuts the
    // loss, and it also leaves headroom to catch rain that a full field would
    // have spilled over the bund.
    const percOf = (lvl) => (lvl > 0 ? soil.perc : soil.perc * 0.25);

    const step = (lvl, trigger) => {
      let next = Math.max(FLOOR, Math.min(BUND, lvl + pe - etc - percOf(lvl)));
      let topUp = 0;
      if (next <= trigger) { topUp = REFILL_TO - next; next = REFILL_TO; }
      return { next, topUp };
    };
    const a = step(sim.awd, -100);
    const c = step(sim.cont, 10);
    sim.awd = a.next; sim.cont = c.next;

    const perc = percOf(level);
    level = Math.max(FLOOR, Math.min(BUND, level + pe + applied - etc - perc));

    if (!d.forecast) {
      seasonIrrigationMm += applied / eff;
      simAwdMm += a.topUp / eff;
      simContMm += c.topUp / eff;
      seasonRainMm += d.rain ?? 0;
      seasonEtcMm += etc;
    }
    // Refilling a field that has dried past the surface also has to re-wet the
    // top of the profile, not just restore the pond.
    const deficit = Math.min(REFILL_TO + 40, Math.max(0, REFILL_TO - level));
    days.push({
      date: d.date, das: cycleDay, perennial, stage, kc, level, taw: BUND, raw: Math.abs(TRIGGER) + REFILL_TO,
      dr: deficit, etc, pe, rain: d.rain ?? 0, pop: d.pop ?? 0, tmax: d.tmax, tmin: d.tmin,
      deepPerc: perc, forecast: !!d.forecast,
      stress: level <= TRIGGER, severe: level <= TRIGGER - 50
    });
  }

  if (!days.length) return null;
  const nowIdx = Math.max(0, days.findIndex((x) => x.date === today));
  const now = days[nowIdx] || days[days.length - 1];
  const ahead = days.slice(nowIdx + 1);
  const res = buildAdvice({
    field, eff, days, now, ahead, ponded: true, settings,
    season: { irrigationMm: seasonIrrigationMm, rainMm: seasonRainMm, etcMm: seasonEtcMm }
  });
  const savedMm = Math.max(0, simContMm - simAwdMm);
  res.awd = {
    enabled: awd,
    savedMm,
    savedM3: mmToM3(savedMm, field.area || 1),
    savedPct: simContMm > 0 ? Math.round((savedMm / simContMm) * 100) : 0,
    continuousMm: simContMm, awdMm: simAwdMm
  };
  res.level = now.level;
  return res;
}

/* --------------------------------------------------------- the actual call -- */
/**
 * Turns the balance into a decision. The rule that matters: if the crop needs water
 * today but credible rain is coming inside the window the crop can wait, hold the
 * pump. That deferral is where the water and the money are actually saved.
 */
function buildAdvice({ field, eff, days, now, ahead, ponded, season, settings = {} }) {
  const area = field.area || 1;
  // A paddy field is refilling a pond to a known depth, so it is not subject to
  // the root-zone caps; every other crop is.
  const cap = ponded
    ? Infinity
    : Math.min(now.raw, MAX_APPLICATION[field.method] ?? 75);
  const netMm = Math.min(Math.max(0, now.dr), cap);

  // Salty water has to carry its own flushing allowance, so the pump runs longer
  // for the same benefit to the crop. Ignoring this is how root zones silt up
  // with salt over a few seasons.
  const salt = salinity(field.crop, settings.ecw ?? field.ecw ?? 0);
  const grossMm = netMm / (eff * (1 - salt.lr));
  const leachingMm = grossMm - netMm / eff;
  const volumeM3 = mmToM3(grossMm, area);

  // How many more days can the crop coast before it crosses the stress line?
  let daysOfSlack = 0;
  for (const d of ahead) { if (d.stress) break; daysOfSlack++; }

  // Credible rain ahead: probability-weighted, counting only the next five days.
  const window = ahead.slice(0, 5);
  const rainAhead = window.map((d) => ({
    date: d.date, rain: d.rain, pop: d.pop,
    expected: effectiveRain(d.rain, field.soil) * clamp((d.pop ?? 60) / 100, 0.3, 1)
  }));
  const rain3 = rainAhead.slice(0, 3).reduce((a, x) => a + x.expected, 0);
  const firstWetDay = rainAhead.find((x) => x.expected >= 5);

  // Even a badly stressed crop should not be watered the day before a downpour:
  // that is the pump run this whole app exists to prevent. But stress is real
  // damage, so overriding it takes rain that both starts tomorrow and adds up to
  // most of the need within two days. Anything less and the crop waits too long.
  const rain2 = rainAhead.slice(0, 2).reduce((a, x) => a + x.expected, 0);
  const reliefSoon = (rainAhead[0]?.expected ?? 0) >= 10 && rain2 >= netMm * 0.6;

  let verdict, reasonKey, deferDays = 0, savedM3 = 0;
  if (now.severe && reliefSoon) {
    verdict = 'wait'; reasonKey = 'rainCoversNeed'; deferDays = 1; savedM3 = volumeM3;
  } else if (now.severe) {
    verdict = 'urgent'; reasonKey = 'severeStress';
  } else if (now.stress) {
    if (rain3 >= netMm * 0.8 && firstWetDay) {
      verdict = 'wait'; reasonKey = 'rainCoversNeed';
      deferDays = Math.max(1, daysBetween(now.date, firstWetDay.date));
      savedM3 = volumeM3;
    } else {
      verdict = 'irrigate'; reasonKey = 'belowThreshold';
    }
  } else {
    const nextStress = ahead.find((d) => d.stress);
    verdict = 'ok';
    if (nextStress && rain3 >= 10 && firstWetDay) { reasonKey = 'rainExpected'; savedM3 = volumeM3; }
    else { reasonKey = 'soilHasWater'; }
    deferDays = daysOfSlack;
  }

  const { hours, cost } = pumpCost(volumeM3, field.pump);
  const nextIrrigationDate = (verdict === 'irrigate' || verdict === 'urgent')
    ? now.date
    : (ahead.find((d) => d.stress)?.date ?? null);

  return {
    fieldId: field.id, date: now.date, ponded,
    stage: now.stage, das: now.das, perennial: !!now.perennial,
    kc: now.kc, etc: now.etc, taw: now.taw, raw: now.raw, depletion: now.dr,
    soilWaterPct: clamp(100 * (1 - now.dr / Math.max(1, now.taw)), 0, 100),
    verdict, reasonKey, deferDays, daysOfSlack,
    netMm, grossMm, volumeM3, pumpHours: hours, cost, savedM3,
    salt, leachingMm,
    rainAhead, rain3, firstWetDay: firstWetDay?.date ?? null,
    nextIrrigationDate, days, season,
    plan: buildPlan({ field, days, now, ahead, eff, salt, ponded }),
    heatRisk: now.tmax != null && now.tmax >= (CROPS[field.crop]?.heat ?? 38)
  };
}

/* ------------------------------------------------------------ the week ahead -- */
/**
 * A seven-day watering plan. The verdict card answers "today"; this answers
 * "what is my week", which is what a farmer needs to arrange a pump, a canal
 * turn or a day's labour in advance.
 *
 * It is a projection off forecast rainfall, so every entry is explicitly a
 * forecast day and the UI must never show it as settled fact.
 */
function buildPlan({ field, now, ahead, eff, salt, ponded }) {
  const area = field.area || 1;
  const out = [];
  let dr = now.dr;

  for (const d of ahead.slice(0, 7)) {
    // Step the projection with the same rule the live model uses. The cap is
    // taken from that day's own readily-available water, not today's: the root
    // zone is still growing, so what it can usefully hold changes across the week.
    const cap = ponded ? Infinity : Math.min(d.raw, MAX_APPLICATION[field.method] ?? 75);
    let irrigate = false, netMm = 0;
    dr = Math.max(0, dr + d.etc - d.pe);
    if (dr > d.raw) {
      irrigate = true;
      netMm = Math.min(dr, cap);
      dr -= netMm;
    }
    const grossMm = netMm / (eff * (1 - salt.lr));
    out.push({
      date: d.date, irrigate, netMm, grossMm,
      volumeM3: mmToM3(grossMm, area),
      rain: d.rain, pop: d.pop, tmax: d.tmax,
      soilWaterPct: clamp(100 * (1 - dr / Math.max(1, d.taw)), 0, 100)
    });
  }
  return out;
}

/* -------------------------------------------------------------- warnings --- */
/** Catchment-scale risk read off the same series: floods, dry spells, heat. */
export function assessRisks(series, todayIso, river) {
  const today = todayIso || iso(Date.now());
  const past = series.filter((d) => d.date < today);
  const future = series.filter((d) => d.date >= today);
  const out = [];

  const rain3 = future.slice(0, 3).reduce((a, d) => a + (d.rain || 0), 0);
  const rain24 = future[0]?.rain || 0;
  if (rain3 >= 200 || rain24 >= 115) out.push({ key: 'floodWarning', level: 'danger', mm: Math.round(rain3) });
  else if (rain3 >= 100 || rain24 >= 65) out.push({ key: 'floodWatch', level: 'warn', mm: Math.round(rain3) });
  else if (rain24 >= 20) out.push({ key: 'heavyRain', level: 'info', mm: Math.round(rain24) });

  // A dry spell is consecutive days under 2.5 mm, the rain that never reaches roots.
  let dry = 0;
  for (let i = past.length - 1; i >= 0; i--) { if ((past[i].rain || 0) < 2.5) dry++; else break; }
  const p30 = past.slice(-30);
  const rain30 = p30.reduce((a, d) => a + (d.rain || 0), 0);
  const et30 = p30.reduce((a, d) => a + (d.et0 || 4), 0);
  if (p30.length >= 20 && rain30 < et30 * 0.4 && dry >= 10) {
    out.push({ key: 'drought', level: 'warn', days: dry, deficit: Math.round(et30 - rain30) });
  } else if (dry >= 7) {
    out.push({ key: 'dryspell', level: 'info', days: dry });
  }

  const hot = future.slice(0, 3).find((d) => (d.tmax ?? 0) >= 40);
  if (hot) out.push({ key: 'heat', level: 'warn', tmax: Math.round(hot.tmax), date: hot.date });

  if (river?.discharge && river?.normal && river.discharge > river.normal * 2.5) {
    out.push({ key: 'riverHigh', level: 'danger', x: (river.discharge / river.normal).toFixed(1) });
  }

  const d0 = future[0];
  if (d0 && (d0.rain || 0) < 1 && (d0.wind ?? 0) < 15) out.push({ key: 'sprayWindow', level: 'good' });
  return out;
}
