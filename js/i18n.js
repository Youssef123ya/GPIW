/**
 * i18n.js — two languages, loaded up front.
 *
 * The whole string table ships in the bundle rather than being fetched per
 * locale. It costs a few kilobytes and it means a farmer can switch language
 * with no signal, which is the situation the app is built for.
 *
 * Arabic is right-to-left, so `dir()` below is authoritative and the stylesheet
 * uses logical properties throughout. Nothing in the UI should hard-code "left".
 */

/**
 * The Arabic locale pins `-u-nu-latn` deliberately. Left implicit, "ar" resolves to
 * Arabic-Indic digits (١٢٣) in some engines and Latin digits in others, and the
 * number inputs in the field form render Latin digits whatever we do — so the
 * screen would mix two numeral systems. Latin digits are also read everywhere
 * Arabic is spoken, which Arabic-Indic is not. Month and weekday names stay Arabic.
 */
export const LANGS = {
  ar: { name: 'العربية', short: 'ع', speech: 'ar-SA', dir: 'rtl', locale: 'ar-u-nu-latn' },
  en: { name: 'English', short: 'EN', speech: 'en-US', dir: 'ltr', locale: 'en' }
};

export const STRINGS = {
  /* ---------------------------------------------------------------- shell -- */
  appName:      { en: 'MITER', ar: 'MITER' },
  assistantName:{ en: 'AI Yacoup', ar: 'يعقوب الذكي' },
  tagline:      { en: "A farmer's digital companion", ar: 'رفيق المزارع الرقمي' },
  navToday:     { en: 'Today', ar: 'اليوم' },
  navWater:     { en: 'Water', ar: 'الماء' },
  navAssistant: { en: 'Yacoup', ar: 'يعقوب' },
  navSettings:  { en: 'Settings', ar: 'الإعدادات' },

  offline:      { en: 'Offline', ar: 'غير متصل' },
  online:       { en: 'Live', ar: 'متصل' },
  savedData:    { en: 'Showing saved data', ar: 'نعرض بيانات محفوظة' },
  updated:      { en: 'Updated', ar: 'آخر تحديث' },
  justNow:      { en: 'just now', ar: 'الآن' },
  minsAgo:      { en: '{n} min ago', ar: 'قبل {n} دقيقة' },
  hoursAgo:     { en: '{n} h ago', ar: 'قبل {n} ساعة' },
  daysAgo:      { en: '{n} d ago', ar: 'قبل {n} يوم' },
  loading:      { en: 'Loading…', ar: 'جارٍ التحميل…' },
  retry:        { en: 'Try again', ar: 'حاول مرة أخرى' },
  save:         { en: 'Save', ar: 'حفظ' },
  cancel:       { en: 'Cancel', ar: 'إلغاء' },
  delete:       { en: 'Delete', ar: 'حذف' },
  edit:         { en: 'Edit', ar: 'تعديل' },
  close:        { en: 'Close', ar: 'إغلاق' },
  confirmDelete:{ en: 'Delete this field?', ar: 'هل تريد حذف هذا الحقل؟' },

  /* ---------------------------------------------------------------- today -- */
  feelsLike:    { en: 'Feels like', ar: 'الإحساس' },
  humidity:     { en: 'Humidity', ar: 'الرطوبة' },
  wind:         { en: 'Wind', ar: 'الرياح' },
  rainToday:    { en: 'Rain today', ar: 'مطر اليوم' },
  rain7:        { en: 'Rain this week', ar: 'مطر هذا الأسبوع' },
  forecast:     { en: 'Next 7 days', ar: 'الأيام السبعة القادمة' },
  alertsTitle:  { en: 'Alerts', ar: 'التنبيهات' },
  noAlerts:     { en: 'No warnings. Good farming weather.', ar: 'لا توجد تحذيرات. الطقس مناسب للزراعة.' },
  todayAdvice:  { en: "Today's advice", ar: 'نصيحة اليوم' },
  searchPlace:  { en: 'Search your village or town', ar: 'ابحث عن قريتك أو مدينتك' },
  useGps:       { en: 'Use my location', ar: 'استخدم موقعي' },
  noPlace:      { en: 'No place found', ar: 'لم يتم العثور على مكان' },

  /* ----------------------------------------------------------- the verdict -- */
  vIrrigate:    { en: 'Irrigate today', ar: 'اسقِ اليوم' },
  vUrgent:      { en: 'Irrigate now — crop under stress', ar: 'اسقِ الآن — المحصول تحت إجهاد' },
  vWait:        { en: 'Wait — rain is coming', ar: 'انتظر — المطر قادم' },
  vOk:          { en: 'No water needed today', ar: 'لا حاجة للماء اليوم' },

  rSevere:      { en: 'The root zone is nearly empty. Delay will cost yield.', ar: 'منطقة الجذور شبه خالية من الماء. التأخير يقلل المحصول.' },
  rBelow:       { en: 'Soil water has fallen below the safe line for this crop.', ar: 'رطوبة التربة نزلت تحت الحد الآمن لهذا المحصول.' },
  rRainCovers:  { en: 'Expected rain covers what the crop needs. Keep the pump off.', ar: 'المطر المتوقع يغطي حاجة المحصول. أبقِ المضخة متوقفة.' },
  rRainExpect:  { en: 'Soil is holding, and rain is expected before it runs low.', ar: 'التربة ما زالت تحتفظ بالماء، والمطر متوقع قبل أن ينفد.' },
  rSoilHas:     { en: 'The soil still holds enough water for this crop.', ar: 'التربة ما زالت تحتوي على ماء كافٍ لهذا المحصول.' },

  /* ------------------------------------------------------------ water tab -- */
  fieldsTitle:  { en: 'My fields', ar: 'حقولي' },
  addField:     { en: 'Add a field', ar: 'أضف حقلاً' },
  noFields:     { en: 'Add your first field to get irrigation advice.', ar: 'أضف حقلك الأول للحصول على نصائح الري.' },
  fieldName:    { en: 'Field name', ar: 'اسم الحقل' },
  crop:         { en: 'Crop', ar: 'المحصول' },
  sowingDate:   { en: 'Sowing date', ar: 'تاريخ الزراعة' },
  area:         { en: 'Area (hectare)', ar: 'المساحة (هكتار)' },
  soil:         { en: 'Soil type', ar: 'نوع التربة' },
  method:       { en: 'Irrigation method', ar: 'طريقة الري' },
  useAwd:       { en: 'Use Alternate Wetting & Drying', ar: 'استخدم التبليل والتجفيف المتناوب' },

  waterDepth:   { en: 'Water to apply', ar: 'كمية الماء المطلوبة' },
  volume:       { en: 'Volume', ar: 'الحجم' },
  pumpTime:     { en: 'Pump time', ar: 'مدة تشغيل المضخة' },
  runningCost:  { en: 'Running cost', ar: 'التكلفة' },
  soilWater:    { en: 'Water left in soil', ar: 'الماء المتبقي في التربة' },
  pondLevel:    { en: 'Standing water', ar: 'الماء الراكد' },
  stageLabel:   { en: 'Stage', ar: 'المرحلة' },
  dayNo:        { en: 'Day {n} after sowing', ar: 'اليوم {n} بعد الزراعة' },
  nextWater:    { en: 'Next irrigation', ar: 'الري القادم' },
  inDays:       { en: 'in {n} days', ar: 'خلال {n} يوم' },
  tomorrow:     { en: 'tomorrow', ar: 'غداً' },
  logWater:     { en: 'I watered this field', ar: 'سقيت هذا الحقل' },
  logged:       { en: 'Saved. Advice updated.', ar: 'تم الحفظ. تم تحديث النصيحة.' },
  savingTitle:  { en: 'You are saving', ar: 'ما توفره' },
  savingBody:   { en: 'Holding the pump today saves {m3} m³ of water and about {money}.', ar: 'إيقاف المضخة اليوم يوفر {m3} م³ من الماء وحوالي {money}.' },
  awdSaving:    { en: 'Alternate wetting & drying on this field saves about {m3} m³ ({pct}%) a season.', ar: 'التبليل والتجفيف المتناوب في هذا الحقل يوفر حوالي {m3} م³ ({pct}٪) في الموسم.' },
  seasonSoFar:  { en: 'This season so far', ar: 'هذا الموسم حتى الآن' },
  irrigApplied: { en: 'Water applied', ar: 'الماء المضاف' },
  rainReceived: { en: 'Rain received', ar: 'المطر المتساقط' },
  cropUsed:     { en: 'Crop water use', ar: 'استهلاك المحصول' },
  efficiencyTip:{ en: 'Switching from flood to drip on this field would cut pumped water by about {pct}%.', ar: 'التحول من الري بالغمر إلى التنقيط في هذا الحقل يقلل الماء المضخوخ بحوالي {pct}٪.' },

  /* ------------------------------------------------------------- assistant -- */
  assistantIntro:{ en: 'Ask me about your crop, the rain, or when to water.', ar: 'اسألني عن محصولك أو المطر أو موعد الري.' },
  askPlaceholder:{ en: 'Type your question…', ar: 'اكتب سؤالك…' },
  send:         { en: 'Send', ar: 'إرسال' },
  speakBtn:     { en: 'Speak', ar: 'تحدث' },
  listening:    { en: 'Listening…', ar: 'أستمع…' },
  thinking:     { en: 'Thinking…', ar: 'أفكر…' },
  q1:           { en: 'When should I water?', ar: 'متى أسقي؟' },
  q2:           { en: 'Will it rain this week?', ar: 'هل سيمطر هذا الأسبوع؟' },
  q3:           { en: 'How much water does my crop need?', ar: 'كم ماءً يحتاج محصولي؟' },
  q4:           { en: 'How can I save water?', ar: 'كيف أوفر الماء؟' },
  q5:           { en: 'Is there a flood risk?', ar: 'هل هناك خطر فيضان؟' },
  q6:           { en: 'What will this irrigation cost?', ar: 'كم تكلفة هذه الرية؟' },
  q7:           { en: 'Is my water too salty?', ar: 'هل مياهي مالحة؟' },
  q8:           { en: 'What is my plan this week?', ar: 'إيه خطة الري هذا الأسبوع؟' },
  noFieldYet:   { en: 'Add a field first and I can answer with your own numbers.', ar: 'أضف حقلاً أولاً حتى أجيبك بأرقامك أنت.' },
  dontKnow:     { en: 'I am not sure about that one. Try asking about water, rain, cost or your crop stage.', ar: 'لست متأكداً من هذا. جرب السؤال عن الماء أو المطر أو التكلفة أو مرحلة المحصول.' },
  offlineBrain: { en: 'Answered offline from your field data', ar: 'إجابة من بيانات حقلك، بدون إنترنت' },
  /* ------------------------------------------------------------- salinity -- */
  salinityTitle:{ en: 'Water quality', ar: 'جودة المياه' },
  ecwLabel:     { en: 'Water salinity, EC (dS/m)', ar: 'ملوحة مياه الري، EC (دس/م)' },
  ecwHelp:      { en: 'Ask your well or canal supplier, or have a sample tested. Leave it at 0 if you do not know.', ar: 'اسأل عن تحليل مياه البئر أو الترعة، أو حلّل عينة. اتركها 0 لو ما تعرفش.' },
  saltNone:     { en: 'Water salinity is safe for this crop.', ar: 'ملوحة المياه آمنة على هذا المحصول.' },
  saltMild:     { en: 'Slightly salty water: expect about {pct}% yield loss on this crop.', ar: 'المياه مالحة قليلاً: متوقع فقد حوالي {pct}٪ من المحصول.' },
  saltHigh:     { en: 'Salty water. About {pct}% yield loss expected on {crop}. Consider a more tolerant crop.', ar: 'مياه مالحة. متوقع فقد حوالي {pct}٪ من محصول {crop}. فكّر في محصول أكثر تحملاً.' },
  saltSevere:   { en: 'This water is too salty for {crop} — about {pct}% yield loss. Salt will build up in the soil.', ar: 'المياه مالحة جداً على {crop} — فقد حوالي {pct}٪. الملح هيتراكم في التربة.' },
  leachNote:    { en: 'Of this, {mm} mm is extra water to flush salt below the roots.', ar: 'منها {mm} ملم ماء إضافي لغسل الملح تحت الجذور.' },
  trySalt:      { en: 'Copes better with your water: {crops}', ar: 'محاصيل تتحمل مياهك أكثر: {crops}' },

  /* ------------------------------------------------------ plan and savings -- */
  weekPlan:     { en: 'Your week', ar: 'خطة أسبوعك' },
  planNote:     { en: 'Based on the forecast — it will shift if the rain does.', ar: 'مبنية على التوقعات — هتتغير لو المطر اتغير.' },
  planWater:    { en: 'Water', ar: 'ري' },
  planRest:     { en: 'No water', ar: 'بدون ري' },
  savedTitle:   { en: 'Water saved this season', ar: 'المياه الموفرة هذا الموسم' },
  savedBody:    { en: '{m3} m³ — about {pct}% less than watering on a fixed habit that ignores rain. Worth about {money}.', ar: '{m3} م³ — أقل بحوالي {pct}٪ من الري بعادة ثابتة بتتجاهل المطر. بقيمة حوالي {money}.' },
  savedNone:    { en: 'No savings recorded yet. They appear once rain falls during the season.', ar: 'لا توجد وفورات بعد. هتظهر أول ما ينزل مطر خلال الموسم.' },
  exportCsv:    { en: 'Export records (CSV)', ar: 'تصدير السجلات (CSV)' },
  exported:     { en: 'File saved.', ar: 'تم حفظ الملف.' },

  // Units appear inside sentences, so they are translated like any other word.
  uPct:         { en: '%', ar: '٪' },
  uMm:          { en: 'mm', ar: 'ملم' },
  uM3:          { en: 'm³', ar: 'م³' },
  uHour:        { en: 'h', ar: 'ساعة' },
  stressLine:   { en: 'stress line', ar: 'خط الإجهاد' },
  beforeSowing: { en: 'Sowing on {d}', ar: 'الزراعة في {d}' },
  notSownYet:   { en: 'Advice starts once this field is sown.', ar: 'تبدأ النصائح بعد زراعة هذا الحقل.' },

  /* ------------------------------------------------------- online features -- */
  diagnoseBtn:  { en: 'Diagnose from a photo', ar: 'تشخيص بالصورة' },
  reportBtn:    { en: 'Farm review', ar: 'تقرير المزرعة' },
  analysing:    { en: 'Looking at your photo…', ar: 'بشوف الصورة…' },
  writingReport:{ en: 'Reviewing your farm…', ar: 'براجع مزرعتك…' },
  photoSent:    { en: 'Photo of {field}', ar: 'صورة من {field}' },
  needOnline:   { en: 'This needs an internet connection. Everything else works offline.', ar: 'دي محتاجة إنترنت. باقي التطبيق شغال من غيره.' },
  needBridge:   { en: 'Turn on AI Yacoup in Settings to use this.', ar: 'فعّل يعقوب الذكي من الإعدادات عشان تستخدمها.' },
  photoFailed:  { en: 'Could not read that photo. Try another one.', ar: 'مقدرتش أقرا الصورة. جرب واحدة تانية.' },
  aiFailed:     { en: 'Could not reach AI Yacoup. Try again when the signal is better.', ar: 'مقدرتش أوصل ليعقوب الذكي. جرب تاني لما الشبكة تبقى أحسن.' },
  aiAdvice:     { en: 'AI Yacoup, using your field data', ar: 'يعقوب الذكي، باستخدام بيانات حقلك' },
  aiOnlineOn:   { en: 'Online features are on', ar: 'المميزات الأونلاين شغالة' },
  aiOnlineOff:  { en: 'Online features are off', ar: 'المميزات الأونلاين مقفولة' },

  /* ------------------------------------------------------------- settings -- */
  language:     { en: 'Language', ar: 'اللغة' },
  locationSet:  { en: 'Location', ar: 'الموقع' },
  pumpSet:      { en: 'Pump', ar: 'المضخة' },
  discharge:    { en: 'Pump output (litres per second)', ar: 'تصريف المضخة (لتر في الثانية)' },
  costPerHour:  { en: 'Cost per hour ({cur})', ar: 'التكلفة في الساعة ({cur})' },
  currencyLabel:{ en: 'Currency symbol', ar: 'رمز العملة' },
  voiceSet:     { en: 'Speak answers aloud', ar: 'اقرأ الإجابات بصوت عالٍ' },
  installApp:   { en: 'Install on phone', ar: 'ثبّت على الهاتف' },
  aiBridge:     { en: 'AI Yacoup (online)', ar: 'يعقوب الذكي (متصل)' },
  aiBridgeHelp: { en: 'When your phone has signal, open questions go to a language model. Your field numbers are always computed on the phone.', ar: 'عند توفر الشبكة، تُرسل الأسئلة المفتوحة إلى نموذج لغوي. أرقام حقلك تُحسب دائماً على الهاتف نفسه.' },
  clearData:    { en: 'Clear all data', ar: 'حذف كل البيانات' },
  about:        { en: 'About', ar: 'حول التطبيق' },

  /* --------------------------------------------------------------- alerts -- */
  aFloodWarn:   { en: 'Flood warning: about {mm} mm of rain in 3 days. Open field drains and move stored grain up.', ar: 'تحذير من فيضان: حوالي {mm} ملم مطر خلال ٣ أيام. افتح مصارف الحقل وارفع المحصول المخزن.' },
  aFloodWatch:  { en: 'Heavy rain watch: about {mm} mm in 3 days. Clear your drainage channels today.', ar: 'مراقبة أمطار غزيرة: حوالي {mm} ملم خلال ٣ أيام. نظّف قنوات الصرف اليوم.' },
  aHeavyRain:   { en: 'About {mm} mm of rain expected today. Hold off on irrigation and spraying.', ar: 'يتوقع حوالي {mm} ملم مطر اليوم. أجّل الري والرش.' },
  aDrought:     { en: 'Dry spell of {n} days. Rain is {mm} mm behind what crops have used.', ar: 'جفاف منذ {n} يوماً. المطر أقل من استهلاك المحاصيل بـ {mm} ملم.' },
  aDryspell:    { en: 'No useful rain for {n} days. Watch your soil moisture closely.', ar: 'لا مطر مفيد منذ {n} يوماً. راقب رطوبة التربة عن قرب.' },
  aHeat:        { en: 'Heat stress: {t}°C expected. Irrigate in the early morning or evening.', ar: 'إجهاد حراري: {t}°م متوقعة. اسقِ في الصباح الباكر أو المساء.' },
  aRiverHigh:   { en: 'The river near you is running {x}× its normal flow.', ar: 'النهر القريب منك يجري بـ {x} ضعف تدفقه الطبيعي.' },
  aSprayWindow: { en: 'Calm and dry today — a good window for spraying.', ar: 'اليوم هادئ وجاف — وقت مناسب للرش.' }
};

/* --------------------------------------------------------- domain vocabulary -- */
export const CROP_NAMES = {
  wheat:     { en: 'Wheat', ar: 'قمح' },
  barley:    { en: 'Barley', ar: 'شعير' },
  maize:     { en: 'Maize', ar: 'ذرة' },
  rice:      { en: 'Rice', ar: 'أرز' },
  cotton:    { en: 'Cotton', ar: 'قطن' },
  sugarcane: { en: 'Sugarcane', ar: 'قصب السكر' },
  sugarbeet: { en: 'Sugar beet', ar: 'بنجر السكر' },
  soybean:   { en: 'Soybean', ar: 'فول الصويا' },
  groundnut: { en: 'Groundnut', ar: 'فول سوداني' },
  faba:      { en: 'Faba bean', ar: 'فول بلدي' },
  gram:      { en: 'Chickpea', ar: 'حمص' },
  mustard:   { en: 'Mustard', ar: 'خردل' },
  potato:    { en: 'Potato', ar: 'بطاطس' },
  onion:     { en: 'Onion', ar: 'بصل' },
  tomato:    { en: 'Tomato', ar: 'طماطم' },
  cucumber:  { en: 'Cucumber', ar: 'خيار' },
  berseem:   { en: 'Berseem clover', ar: 'برسيم مصري' },
  alfalfa:   { en: 'Alfalfa', ar: 'برسيم حجازي' },
  date_palm: { en: 'Date palm', ar: 'نخيل البلح' },
  olive:     { en: 'Olive', ar: 'زيتون' },
  citrus:    { en: 'Citrus', ar: 'موالح' }
};

export const SOIL_NAMES = {
  sand:       { en: 'Sandy', ar: 'رملية' },
  sandy_loam: { en: 'Sandy loam', ar: 'طميية رملية' },
  loam:       { en: 'Loam', ar: 'طميية' },
  clay_loam:  { en: 'Clay loam', ar: 'طميية طينية' },
  clay:       { en: 'Clay', ar: 'طينية' },
  black:      { en: 'Black cotton soil', ar: 'طينية سوداء' }
};

export const METHOD_NAMES = {
  flood:     { en: 'Flood / basin', ar: 'غمر / أحواض' },
  furrow:    { en: 'Furrow', ar: 'خطوط' },
  sprinkler: { en: 'Sprinkler', ar: 'رش' },
  drip:      { en: 'Drip', ar: 'تنقيط' }
};

export const STAGE_NAMES = {
  initial:     { en: 'Establishment', ar: 'التأسيس' },
  development: { en: 'Growing', ar: 'النمو' },
  mid:         { en: 'Flowering / peak', ar: 'الإزهار / الذروة' },
  late:        { en: 'Ripening', ar: 'النضج' },
  harvest:     { en: 'Ready to harvest', ar: 'جاهز للحصاد' }
};

/** Open-Meteo WMO weather codes, grouped into the handful a farmer cares about. */
export const WX = {
  clear:   { en: 'Clear', ar: 'صحو' },
  cloudy:  { en: 'Cloudy', ar: 'غائم' },
  fog:     { en: 'Fog', ar: 'ضباب' },
  drizzle: { en: 'Drizzle', ar: 'رذاذ' },
  rain:    { en: 'Rain', ar: 'مطر' },
  heavy:   { en: 'Heavy rain', ar: 'مطر غزير' },
  storm:   { en: 'Thunderstorm', ar: 'عاصفة رعدية' },
  snow:    { en: 'Snow', ar: 'ثلج' }
};

export function wxGroup(code) {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 65) return code >= 65 ? 'heavy' : 'rain';
  if (code >= 66 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return code === 82 ? 'heavy' : 'rain';
  if (code >= 95) return 'storm';
  return 'cloudy';
}

export const WX_ICON = {
  clear: '☀️', cloudy: '⛅', fog: '🌫️', drizzle: '🌦️',
  rain: '🌧️', heavy: '⛈️', storm: '🌩️', snow: '❄️'
};

/* -------------------------------------------------------------- the lookup -- */
let current = 'en';
export const getLang = () => current;
export function setLang(code) { if (LANGS[code]) current = code; return current; }

/** 'rtl' for Arabic, 'ltr' for English. The stylesheet keys off this. */
export const dir = () => LANGS[current].dir;

/** With only two languages the header button toggles rather than opening a list. */
export const otherLang = () => (current === 'ar' ? 'en' : 'ar');

/** t('dayNo', {n: 42}) — falls back to English, then to the key itself. */
export function t(key, vars) {
  const row = STRINGS[key];
  let s = row ? (row[current] ?? row.en ?? key) : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll('{' + k + '}', v);
  return s;
}

export const tCrop = (k) => CROP_NAMES[k]?.[current] ?? CROP_NAMES[k]?.en ?? k;
export const tSoil = (k) => SOIL_NAMES[k]?.[current] ?? SOIL_NAMES[k]?.en ?? k;
export const tMethod = (k) => METHOD_NAMES[k]?.[current] ?? METHOD_NAMES[k]?.en ?? k;
export const tStage = (k) => STAGE_NAMES[k]?.[current] ?? STAGE_NAMES[k]?.en ?? k;
export const tWx = (code) => {
  const g = wxGroup(code);
  return { text: WX[g]?.[current] ?? WX[g]?.en ?? '', icon: WX_ICON[g] };
};

/* ------------------------------------------------------------ numbers, dates -- */
const localeOf = () => LANGS[current].locale;

export function weekday(isoDate) {
  try { return new Date(isoDate + 'T00:00:00').toLocaleDateString(localeOf(), { weekday: 'short' }); }
  catch { return isoDate.slice(5); }
}
export function dateLabel(isoDate) {
  try { return new Date(isoDate + 'T00:00:00').toLocaleDateString(localeOf(), { day: 'numeric', month: 'short' }); }
  catch { return isoDate; }
}
/** Digits in the script the reader expects, so numbers do not look foreign. */
export function num(n, digits = 0) {
  try {
    return new Intl.NumberFormat(localeOf(), {
      maximumFractionDigits: digits, minimumFractionDigits: 0
    }).format(n);
  } catch { return String(Math.round(n)); }
}

/**
 * Currency. The symbol is a setting rather than a constant: this app is not tied
 * to one country, and the running cost of a pump is the number a farmer checks
 * hardest, so it has to be shown in money they recognise.
 */
let currency = 'ج.م';
export const setCurrency = (s) => { currency = (s || '').trim() || 'ج.م'; return currency; };
export const getCurrency = () => currency;
/** Symbol leads in English and trails in Arabic, as each script expects. */
export const money = (n, digits = 0) =>
  (current === 'ar' ? `${num(n, digits)} ${currency}` : `${currency}${num(n, digits)}`);

export const speechLang = () => LANGS[current].speech;
