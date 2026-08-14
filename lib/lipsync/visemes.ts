/**
 * نگاشت واج فارسی به ویزیم (شکل دهان) — هستهٔ زبانی لیپ‌سینک (§F7).
 *
 * چرا ویزیم و نه واج: چشم انسان واج نمی‌بیند، شکل دهان می‌بیند. چند
 * واج مختلف («ت»، «د»، «ن») دقیقاً یک شکل دهان دارند. مجموعهٔ ویزیم
 * زیر بر پایهٔ دسته‌بندی کلاسیک Preston Blair است که در انیمیشن و
 * موتورهای گفتار (Oculus LipSync، ویزیم‌های Azure) استفاده می‌شود.
 *
 * نکتهٔ مهم دربارهٔ فارسی: املای فارسی مصوت‌های کوتاه را نمی‌نویسد.
 * «مدرسه» با پنج حرف نوشته می‌شود ولی /modrese/ تلفظ می‌شود. اگر فقط
 * حروف نوشته‌شده را ویزیم کنیم، دهان بین شکل‌های بسته می‌پرد و
 * غیرطبیعی می‌شود. برای همین بین همخوان‌های پشت‌سرهم یک مصوت
 * پیش‌فرض تزریق می‌شود (ساختار هجایی فارسی عمدتاً CV(C) است).
 *
 * همچنین حروفی که در عربی دندانی‌اند در فارسی این‌طور نیستند:
 * «ث» و «ذ» و «ظ» در فارسی /s/ و /z/ تلفظ می‌شوند، نه /θ/ و /ð/.
 * نگاشت زیر بر اساس تلفظ فارسی است، نه شکل نوشتاری عربی.
 */

export const VISEMES = [
  'sil', // سکوت — لب‌ها بسته و آرام
  'PP', // بستن کامل لب: پ ب م
  'FF', // لب و دندان: ف
  'DD', // لثوی: ت د ن ل ر س ز ش ژ ص ض ط ظ ث ذ
  'CH', // پس‌لثوی با گردی لب: چ ج ش ژ
  'KK', // نرم‌کامی و چاکنایی: ک گ ق غ خ ح ه ع
  'AA', // مصوت باز: ا آ فتحه
  'E', // مصوت میانی: کسره، هِ پایانی
  'IH', // مصوت پیشین بسته: ی
  'OH', // مصوت پسین میانی گرد: ضمه
  'OU', // مصوت پسین بسته گرد: و او
] as const;

export type Viseme = (typeof VISEMES)[number];

/**
 * هندسهٔ هر ویزیم.
 *
 * open   — میزان باز شدن عمودی دهان (۰ تا ۱)
 * wide   — کشیدگی افقی؛ منفی یعنی جمع شدن و گرد شدن لب
 * round  — گردی لب (برای «و» و «ش»)
 * press  — فشردگی لب‌ها روی هم (برای «پ ب م»)
 */
export type VisemeShape = {
  open: number;
  wide: number;
  round: number;
  press: number;
};

export const VISEME_SHAPES: Record<Viseme, VisemeShape> = {
  sil: { open: 0.0, wide: 0.0, round: 0.0, press: 0.15 },
  PP: { open: 0.0, wide: 0.02, round: 0.0, press: 1.0 },
  FF: { open: 0.14, wide: 0.12, round: 0.0, press: 0.55 },
  DD: { open: 0.3, wide: 0.22, round: 0.0, press: 0.0 },
  CH: { open: 0.28, wide: -0.2, round: 0.62, press: 0.0 },
  KK: { open: 0.42, wide: 0.06, round: 0.05, press: 0.0 },
  AA: { open: 0.95, wide: 0.16, round: 0.0, press: 0.0 },
  E: { open: 0.5, wide: 0.34, round: 0.0, press: 0.0 },
  IH: { open: 0.3, wide: 0.52, round: 0.0, press: 0.0 },
  OH: { open: 0.55, wide: -0.24, round: 0.7, press: 0.0 },
  OU: { open: 0.34, wide: -0.42, round: 0.95, press: 0.0 },
};

/** آیا این ویزیم مصوت است؟ مصوت‌ها کشیده‌تر تلفظ می‌شوند. */
const VOWEL_VISEMES = new Set<Viseme>(['AA', 'E', 'IH', 'OH', 'OU']);

/** وزن طول نسبی هر ویزیم در زنجیره. */
const DURATION_WEIGHT: Record<Viseme, number> = {
  sil: 0.9,
  PP: 0.55,
  FF: 0.8,
  DD: 0.65,
  CH: 0.8,
  KK: 0.7,
  AA: 1.5,
  E: 1.25,
  IH: 1.2,
  OH: 1.3,
  OU: 1.35,
};

/** نگاشت تک‌حرفی. حروفی که اینجا نیستند نادیده گرفته می‌شوند. */
const LETTER_TO_VISEME: Record<string, Viseme> = {
  // بستن کامل لب
  'ب': 'PP',
  'پ': 'PP',
  'م': 'PP',

  // لب و دندان
  'ف': 'FF',

  // لثوی (در فارسی همهٔ این‌ها /s/ /z/ /t/ /d/ /n/ /l/ /r/ هستند)
  'ت': 'DD',
  'ط': 'DD',
  'د': 'DD',
  'ن': 'DD',
  'ل': 'DD',
  'ر': 'DD',
  'س': 'DD',
  'ص': 'DD',
  'ث': 'DD',
  'ز': 'DD',
  'ذ': 'DD',
  'ض': 'DD',
  'ظ': 'DD',

  // پس‌لثوی با گردی لب
  'ش': 'CH',
  'ژ': 'CH',
  'چ': 'CH',
  'ج': 'CH',

  // نرم‌کامی و چاکنایی
  'ک': 'KK',
  'گ': 'KK',
  'ق': 'KK',
  'غ': 'KK',
  'خ': 'KK',
  'ح': 'KK',
  'ه': 'KK',
  'ع': 'KK',
  'ء': 'KK',
  'أ': 'KK',
  'ؤ': 'KK',

  // مصوت‌ها
  'ا': 'AA',
  'آ': 'AA',
  'ی': 'IH',
  'ئ': 'IH',
  'و': 'OU',

  // اعراب (به‌ندرت نوشته می‌شوند ولی اگر بودند دقیق‌ترند)
  'َ': 'AA',
  'ِ': 'E',
  'ُ': 'OH',
  'ٓ': 'AA',
};

/** لاتین — برای اسامی و اصطلاحات انگلیسی داخل متن فارسی. */
const LATIN_TO_VISEME: Record<string, Viseme> = {
  a: 'AA', e: 'E', i: 'IH', o: 'OH', u: 'OU', y: 'IH',
  b: 'PP', p: 'PP', m: 'PP',
  f: 'FF', v: 'FF', w: 'OU',
  t: 'DD', d: 'DD', n: 'DD', l: 'DD', r: 'DD', s: 'DD', z: 'DD',
  c: 'DD', x: 'KK', j: 'CH', g: 'KK', k: 'KK', q: 'KK', h: 'KK',
};

export type VisemeFrame = {
  viseme: Viseme;
  startMs: number;
  endMs: number;
};

/**
 * متن را به دنبالهٔ ویزیم تبدیل می‌کند (بدون زمان‌بندی).
 *
 * تزریق مصوت: اگر دو همخوان پشت‌سرهم بیایند و مصوتی نوشته نشده
 * باشد، یک مصوت کوتاه بین‌شان می‌گذاریم — بدون این کار دهان روی
 * کلمات فارسی تقریباً بسته می‌ماند.
 */
export function textToVisemes(text: string): Viseme[] {
  const sequence: Viseme[] = [];
  let previousWasConsonant = false;

  for (const rawChar of text) {
    const char = rawChar.toLowerCase();

    if (/\s/.test(char)) {
      // فاصلهٔ بین کلمات: یک مکث کوتاه
      if (sequence[sequence.length - 1] !== 'sil') sequence.push('sil');
      previousWasConsonant = false;
      continue;
    }

    if (/[.!?؟،؛:]/.test(char)) {
      if (sequence[sequence.length - 1] !== 'sil') sequence.push('sil');
      previousWasConsonant = false;
      continue;
    }

    const viseme = LETTER_TO_VISEME[rawChar] ?? LATIN_TO_VISEME[char];
    if (!viseme) continue;

    const isVowel = VOWEL_VISEMES.has(viseme);

    if (!isVowel && previousWasConsonant) {
      // مصوت کوتاهِ نانوشته — «کسره» شایع‌ترین مصوت کوتاه فارسی است.
      sequence.push('E');
    }

    sequence.push(viseme);
    previousWasConsonant = !isVowel;
  }

  if (sequence.length === 0) return ['sil'];
  return sequence;
}

/**
 * زنجیرهٔ ویزیم را روی طول واقعی صدا پخش می‌کند.
 *
 * چون طول دقیق صدا را فقط پس از رمزگشایی می‌دانیم، زمان‌بندی
 * **نسبی** ساخته می‌شود و بعد روی مدت واقعی کشیده می‌شود. نتیجه:
 * پایان حرکت دهان دقیقاً با پایان صدا یکی است و در جمله‌های پشت‌سرهم
 * خطا انباشته نمی‌شود.
 */
export function buildVisemeTimeline(text: string, durationMs: number): VisemeFrame[] {
  const sequence = textToVisemes(text);

  const totalWeight = sequence.reduce((sum, viseme) => sum + DURATION_WEIGHT[viseme], 0);
  if (totalWeight === 0 || durationMs <= 0) {
    return [{ viseme: 'sil', startMs: 0, endMs: Math.max(0, durationMs) }];
  }

  const frames: VisemeFrame[] = [];
  let cursor = 0;

  for (const viseme of sequence) {
    const span = (DURATION_WEIGHT[viseme] / totalWeight) * durationMs;
    frames.push({ viseme, startMs: cursor, endMs: cursor + span });
    cursor += span;
  }

  // اصلاح خطای انباشتهٔ اعشار تا آخرین فریم دقیقاً روی پایان صدا بیفتد.
  const last = frames[frames.length - 1];
  if (last) last.endMs = durationMs;

  return frames;
}

/**
 * شکل دهان در یک لحظهٔ مشخص، با میان‌یابی نرم بین ویزیم جاری و بعدی.
 *
 * بدون میان‌یابی، دهان بین شکل‌ها «می‌پرد». انتقال روی ۴۵٪ پایانی هر
 * ویزیم انجام می‌شود که به حرکت طبیعی لب نزدیک است (هم‌تلفظی).
 */
export function sampleViseme(frames: VisemeFrame[], timeMs: number): VisemeShape {
  if (frames.length === 0) return VISEME_SHAPES.sil;

  // پیش از شروع یا پس از پایان: سکوت
  const first = frames[0]!;
  const final = frames[frames.length - 1]!;
  if (timeMs <= first.startMs) return VISEME_SHAPES[first.viseme];
  if (timeMs >= final.endMs) return VISEME_SHAPES.sil;

  let index = binarySearchFrame(frames, timeMs);
  if (index < 0) index = 0;

  const current = frames[index]!;
  const next = frames[index + 1];

  const shape = VISEME_SHAPES[current.viseme];
  if (!next) return shape;

  const span = current.endMs - current.startMs;
  if (span <= 0) return shape;

  const progress = (timeMs - current.startMs) / span;
  const BLEND_START = 0.55;
  if (progress < BLEND_START) return shape;

  const blend = (progress - BLEND_START) / (1 - BLEND_START);
  return mixShapes(shape, VISEME_SHAPES[next.viseme], easeInOut(blend));
}

export function mixShapes(a: VisemeShape, b: VisemeShape, t: number): VisemeShape {
  return {
    open: a.open + (b.open - a.open) * t,
    wide: a.wide + (b.wide - a.wide) * t,
    round: a.round + (b.round - a.round) * t,
    press: a.press + (b.press - a.press) * t,
  };
}

function easeInOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5 ? 2 * clamped * clamped : 1 - (-2 * clamped + 2) ** 2 / 2;
}

function binarySearchFrame(frames: VisemeFrame[], timeMs: number): number {
  let low = 0;
  let high = frames.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const frame = frames[mid]!;
    if (timeMs < frame.startMs) high = mid - 1;
    else if (timeMs >= frame.endMs) low = mid + 1;
    else return mid;
  }

  return Math.min(frames.length - 1, Math.max(0, low));
}
