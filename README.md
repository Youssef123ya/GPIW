# 🌧️ MITER

**A farmer's digital companion.** Weather, rainfall alerts and water-saving irrigation
advice for smallholder farmers — offline-first, voice-enabled, in Arabic and English.

The question this app answers is small and specific: **should I run the pump today?**
Everything else in it exists to answer that question well.

---

## Quick start

```bash
node server/serve.mjs      # or: npm start
# open http://localhost:8787
```

No install step, no build step, no dependencies. Node 18+ is used only to serve
files and (optionally) to hold an API key; the app itself is plain ES modules.

```bash
npm test                   # 121 checks: engine, salinity, AI tasks, translations, RTL, rendering, store
npm run icons              # regenerate the PWA icons from tools/make-icons.mjs
```

---

## What it does

| | |
|---|---|
| 🌦 **Weather intelligence** | Current conditions, 7-day forecast, and rainfall totals from Open-Meteo. |
| 💧 **Irrigation decisions** | A FAO-56 soil-water balance per field: how much water, how many pump-hours, how much money. |
| ✋ **Deferral** | When credible rain covers the crop's need, the app says *wait* and shows the water and money that holding the pump saves. |
| 🌊 **Flood & drought alerts** | Rainfall accumulation thresholds plus GloFAS river discharge, so upstream water is visible too. |
| 🌾 **Alternate Wetting & Drying** | For paddy, models AWD against continuous flooding and reports the seasonal saving. |
| 🧂 **Salinity & leaching** | Computes the FAO-29 leaching requirement from your water's EC, sizes the flush into every irrigation, and names crops that would cope better. |
| 📅 **Week plan** | Seven days of "water / no water" with depths, so a pump, a canal turn or a day's labour can be arranged in advance. |
| 📊 **Season saving** | Cumulative cubic metres saved against a fixed habit that ignores rainfall. |
| 📄 **CSV export** | Irrigation history and season summary, for co-operative or subsidy records. |
| 🗣 **AI Yacoup** | Ask questions by voice or text; answered on-device from your own field numbers. |
| 📷 **Photo diagnosis** | Photograph a struggling plant; the model reads the symptoms *against* that field's real water balance and salinity. |
| 📋 **Farm review** | A written review across every field: where the farm stands, its biggest water problem, what to change, what is already working. |
| 🌍 **Arabic & English** | Full right-to-left layout in Arabic, not a translated left-to-right screen. |
| 📵 **Offline** | Installs as a PWA and opens with the radio off, showing clearly-dated saved data. |

---

## How the advice is produced

This is the part that makes it a water-technology tool rather than a weather app.
All of it is in [`js/agro.js`](js/agro.js), as pure functions with no I/O.

**1. Crop demand.** Each field has a crop, a sowing date and a soil. From the sowing
date the model derives the growth stage and the crop coefficient `Kc` on the FAO-56
four-stage curve, and multiplies it by the reference evapotranspiration `ET₀` that
Open-Meteo publishes per day:

```
ETc = Kc(stage) × ET₀
```

**2. A daily water balance.** Root-zone depletion `Dr` is tracked in millimetres
across 60 days of observed weather and 14 days of forecast:

```
Dr(i) = Dr(i−1) + ETc − effective rain − irrigation applied     bounded to [0, TAW]
```

Total available water `TAW` comes from the soil type and the current rooting depth.
Effective rain deducts interception and a soil-dependent runoff fraction, so a
30 mm cloudburst on heavy clay is not credited as 30 mm reaching the roots.

**3. The threshold.** Each crop tolerates depletion down to a fraction `p` of `TAW`
before yield suffers. That readily available water `RAW = p × TAW` is the stress
line, and `p` is adjusted for evaporative demand — crops tolerate more depletion in
mild weather than in a heatwave.

**4. The decision.** Depletion below the stress line means the crop needs water. But
before recommending the pump, the model weighs the forecast: rain over the next
three days, discounted by its probability. If that rain covers the need, the verdict
is **wait**, and the app reports the cubic metres and the money not spent. Severe
stress overrides this, unless meaningful rain arrives within two days.

**5. The amount.** A single application is capped at the lesser of the deficit, `RAW`,
and a practical per-method ceiling. Telling a farmer to replace a 130 mm deficit in
one flood pass would send most of that water below the root zone.

**6. Salinity decides whether any of this is sustainable.** Irrigating with salty
water concentrates salt in the root zone, because the crop transpires pure water
and leaves the salt behind. The only way out is to push extra water through to
flush it below the roots. Given the water's electrical conductivity, the model
computes the FAO-29 leaching requirement:

```
LR = ECw / (5 × ECe_threshold − ECw)          gross depth = net / (Ea × (1 − LR))
```

so every irrigation on salty water is correctly sized larger, and the extra is
reported separately as flushing rather than hidden in the total. Each crop carries
its own FAO-29 threshold and yield-loss slope, so the app can say "this water costs
you about 53% of an onion crop — barley, cotton or sugar beet would cope", which is
a cropping decision no amount of irrigation scheduling can substitute for.

**7. Paddy is modelled differently.** Rice is a ponding problem, not a depletion
problem, so the model tracks standing-water depth. Two shadow schedules run in
parallel — AWD against continuous flooding — and their difference is the reported
saving. The saving is real because a ponded field seeps and percolates continuously
while a dried-back field largely does not.

**Perennials.** Date palm, olive, citrus and alfalfa have no single season, so
their Kc curve repeats on a cycle (365 days for the trees, 35 for an alfalfa
cutting) rather than running once from a planting date, and their root depth is
held at maturity instead of regrowing each year. A grove planted in 2009 is read
at the right point of this year.

**What "saved" means.** The season saving is not a guess about compliance. Two
shadow schedules run over the same weather: both irrigate on the same rule, but
one credits rainfall and the other ignores it the way a fixed habit does. The gap
between them is the water that watching the forecast actually bought. The
counterfactual is stated on the card, because a saving without a stated
comparison is just a number.

> **Calibration.** A 0.4 ha wheat plot on loam with an electric pump comes out at
> roughly 545 m³ and about 900 currency units per irrigation; the same field under
> drip needs about 40% less pumped water. Plot size, pump output, tariff and the
> currency symbol are all set in Settings.

---

## Architecture

```
index.html            app shell; four tabs, two dialogs, one onboarding overlay
css/app.css           design tokens, light + dark, logical properties for RTL, 56px targets
js/agro.js            FAO-56 engine — 21 crops, soils, water balance, salinity, risk
js/i18n.js            Arabic/English strings, vocabulary, direction, numerals, currency
js/weather.js         Open-Meteo forecast, geocoding, GloFAS flood layer, caching
js/store.js           localStorage state: fields, pump, language, last good forecast
js/assistant.js       on-device intent matching + optional grounded LLM bridge
js/ui.js              string-template rendering for the four screens
js/app.js             wiring: routing, events, speech, service worker, boot order
sw.js                 shell cache-first, weather network-first with cache fallback
server/serve.mjs      static host + AI bridge (Azure / Claude / Gemini), holds the key
.env                  provider keys, gitignored — see .env.example
tools/                icon generator and the test suite
```

**No framework and no build.** The whole app is about 100 KB of source, served as
ES modules. On the phones this targets, a framework would cost more than it saves.

**Why Open-Meteo.** It needs no API key. A key shipped inside a PWA is a key
published to every phone that installs it, and a proxy would put a server between
the farmer and their forecast — unacceptable for a tool whose main promise is
working when the network does not.

---

## Language and direction

Arabic is a layout, not a translation. Choosing it sets `dir="rtl"` on the root
element; the stylesheet uses logical properties (`border-inline-start`,
`text-align: start`, `inset-inline-start`) and hard-codes no left or right, so the
whole interface mirrors rather than being rebuilt. The soil-water gauge, the chat
bubbles and the alert rules all flip with it.

Numerals are pinned to Latin digits in Arabic, deliberately. Left implicit, `ar`
resolves to Arabic-Indic digits (١٢٣) in some engines and Latin in others, and the
number inputs in the field form render Latin whatever we do — so the same screen
would show two numeral systems. Month and weekday names stay Arabic.

The header button is a direct toggle rather than a menu, and shows the language you
would switch *to*. Switching takes one tap and works offline, because the entire
string table ships in the bundle.

---

## AI Yacoup

Three brains, in this order:

1. **On-device, always.** An intent matcher over both languages. Arabic input is
   folded first — diacritics stripped, alef and taa-marbuta variants normalised —
   so أسقي, اسقي and اسقِ are one word whatever the phone keyboard produced. It
   answers from the water balance the phone just computed. It works with the radio
   off, it is instant, and it cannot invent a number, because every number it says
   came out of `agro.js`.

2. **Online, for open questions.** Free-form questions go to a language model with
   the already-computed farm snapshot attached as ground truth.

3. **Online, for things arithmetic cannot do.** Two tasks that are genuinely beyond
   a local model:

   - **Photo diagnosis.** The farmer photographs a plant. The image goes up with
     that field's soil water, salinity position and crop stage, so leaf symptoms
     are read *against* the water balance rather than guessed at in isolation. The
     model is instructed to say what it can actually see and to refuse a photo it
     cannot read — given a picture that is not a plant it says so and falls back to
     what the field data supports, rather than inventing a disease.
   - **Farm review.** Every field at once, which the on-device brain cannot do: it
     can schedule one field's irrigation, but it cannot weigh a cropping pattern
     against a water budget. The output is fixed to four parts — where the farm
     stands, the biggest water problem, two or three specific changes each citing
     the field and the number that justifies it, and one thing already going well.

Photos are resized to 1024px and re-encoded as JPEG **on the phone** before upload.
A modern camera produces four megabytes; on the connection this app is built for
that is a failed request, and 1024px is more than enough to read a leaf.

### Providers

The bridge speaks to whichever provider is configured — Azure OpenAI, Claude, or
Gemini — behind one `callModel({ system, user, image })` call, so the project is
not welded to a vendor. Azure is checked first.

```bash
cp .env.example .env     # then fill in one provider's keys
npm start
```

```
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com/openai/v1
AZURE_OPENAI_DEPLOYMENT=<deployment-name>
AZURE_OPENAI_KEY=...
```

The key never leaves the server process; the app holds no credential and the
bridge stores nothing. When the app is served by its own bridge it detects it on
start-up and switches the online features on, so nobody has to paste a URL.

**Azure's newer models reject parameters older ones required.** The call starts
minimal and, on a 400 that names an unsupported parameter, drops that parameter
and retries rather than failing a farmer's question over a knob we do not need.

With no key configured at all, the app is fully functional on the offline brain —
which is the default on purpose. A farmer standing in a field at 5 a.m. with one
bar of signal should not wait on a round trip to be told to wait for the rain.

## Design decisions worth knowing

- **Cached state paints before the network is touched.** Opening the app is never a
  network event. Stale data is shown with an explicit "saved data · updated 6 h ago"
  bar rather than hidden behind a spinner.
- **The forecast is never presented as a measurement.** Days are flagged observed or
  forecast throughout the engine, and seasonal totals count only observed days.
- **One tap to log an irrigation.** The recorded depth is the one the app just
  recommended, which keeps the balance honest without making data entry a chore.
- **Colour and icon carry the verdict, text confirms it** — red pump, blue hand,
  green tick — so the screen is readable by someone who does not read fluently.
- **Currency is a setting, not a constant.** The running cost of a pump is the
  number a farmer checks hardest, so it has to appear in money they recognise.
- **Every answer is labelled with where it came from** — the farmer's own numbers,
  or a model online — so they can judge how far to trust it.
- **Online features fail loudly.** No signal or no bridge says so; it never looks
  like the app is thinking when nothing is happening.

## Limitations, stated plainly

- Soil type is chosen by the farmer, not measured. A wrong choice shifts `TAW` and
  therefore the irrigation interval. Soil-moisture sensor input is the obvious next
  step.
- The balance is seeded at 35% depletion on the first day of available weather. It
  converges within a couple of wetting cycles, so advice in a field's first two
  weeks is weaker than it is later.
- Rainfall is gridded model output, not a gauge in the farmer's field. Convective
  showers are local, and the forecast will sometimes miss them.
- Crop coefficients are FAO-56 defaults with typical season lengths, not varietal or
  regionally calibrated values.
- Water salinity is entered by the farmer from a lab result or supplier figure, not
  measured continuously. Root-zone salinity is estimated at 1.5x the irrigation
  water under ordinary leaching; a real soil survey would be better.
- The season saving compares against a schedule that ignores rain entirely. Real
  farmers do notice rain, so treat the figure as an upper bound on what responding
  to the forecast is worth.
- Voice input depends on the browser's speech engine, which varies by device.
- Photo diagnosis is a second opinion, not an agronomist. It is instructed to refuse
  unclear photos and to say how confident it is, but a model looking at one leaf
  cannot rule out what a person standing in the field would see.

## Where this sits

Track B territory — TRL 4–7. The model and the application are built and testable
end to end against live forecast data; what it has not yet had is a season of field
validation against measured soil moisture and actual pump logs. That comparison,
across soil types and crops, is the work that would move it toward TRL 8.

---

*Built for smallholder farmers, who use most of the world's irrigation water and get
the least help deciding how to spend it.*
