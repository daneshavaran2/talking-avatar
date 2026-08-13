/**
 * نرمال‌سازی متن فارسی (§F3.3).
 *
 * چرا لازم است: یک کلمهٔ فارسی می‌تواند با نویسه‌های مختلف نوشته شود
 * («کتابهای» / «کتاب‌های»، «یک» با ی فارسی یا ي عربی، «۱۲» با ارقام
 * فارسی/عربی/لاتین). بدون نرمال‌سازی، جستجوی برداری و فیلترهای
 * کلیدواژه‌ای روی نیمی از ورودی‌های واقعی شکست می‌خورند.
 */

const ARABIC_TO_PERSIAN: Record<string, string> = {
  'ي': 'ی', // ي → ی
  'ى': 'ی', // ى → ی
  'ك': 'ک', // ك → ک
  'ڪ': 'ک', // ڪ → ک
  'ة': 'ه', // ة → ه
  'ؤ': 'و', // ؤ → و
  'ئ': 'ی', // ئ → ی  (فقط در نرمال‌سازی جستجو)
};

/** اعراب، تشدید، و علائم کوچک که در متن تایپی معمولاً حذف می‌شوند. */
const DIACRITICS = /[ً-ٰٟۖ-ۭ]/g;

/** نویسه‌های نامرئی: ZWNJ، ZWJ، LRM/RLM، BOM */
const ZWNJ = '‌';
const INVISIBLE_EXCEPT_ZWNJ = /[​‍‎‏﻿]/g;

const DIGIT_MAP: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

/**
 * نرمال‌سازی «نمایشی» — متن را برای ذخیره و نمایش تمیز می‌کند ولی
 * نیم‌فاصله و ساختار جمله را حفظ می‌کند.
 */
export function normalizePersian(input: string): string {
  let text = input.normalize('NFC');

  text = text.replace(INVISIBLE_EXCEPT_ZWNJ, '');
  text = text.replace(DIACRITICS, '');
  text = text.replace(/[يىكڪةؤ]/g, (c) => ARABIC_TO_PERSIAN[c] ?? c);

  // ارقام عربی به فارسی (نمایش یکدست)، لاتین دست‌نخورده می‌ماند.
  text = text.replace(/[٠-٩]/g, (c) => {
    const latin = DIGIT_MAP[c];
    return latin ? String.fromCharCode(0x06f0 + Number(latin)) : c;
  });

  // فاصله‌های تکراری و فاصلهٔ پیش از علائم
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/ ([،؛.!؟:])/g, '$1');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * پیشوند فعلی «می» و «نمی» در فارسی با نیم‌فاصله می‌آید («می‌کنم»)
 * ولی خیلی‌ها سرِ هم می‌نویسند («میکنم»). چون نیم‌فاصله بالاتر به
 * فاصله تبدیل شده، این دو املا به دو رشتهٔ متفاوت می‌رسیدند و
 * کلیدواژه‌ای که با یکی نوشته شده بود با دیگری تطبیق نمی‌خورد.
 * چسباندن پیشوند، هر دو املا را به یک شکل می‌رساند.
 */
const VERB_PREFIX = /(^| )(ن?می) (?=\p{L})/gu;

/** الف با کلاه و همزه‌دار — در جستجو با «ا» یکی گرفته می‌شوند. */
const ALEF_VARIANTS = /[آأإٱ]/g;

/**
 * نرمال‌سازی «جستجویی» — تهاجمی‌تر: نیم‌فاصله به فاصله، همهٔ ارقام
 * به لاتین، علائم حذف. فقط برای تطبیق کلیدواژه و کلیدِ یکتاسازی
 * استفاده می‌شود، نه برای نمایش.
 */
export function normalizeForMatching(input: string): string {
  let text = normalizePersian(input).toLowerCase();

  text = text.replace(new RegExp(ZWNJ, 'g'), ' ');
  text = text.replace(/[۰-۹٠-٩]/g, (c) => {
    const code = c.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
  text = text.replace(/[ئ]/g, 'ی');
  text = text.replace(ALEF_VARIANTS, 'ا');
  text = text.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  text = text.replace(/\s+/g, ' ');
  text = text.replace(VERB_PREFIX, '$1$2');

  return text.trim();
}

/** ارقام لاتین را به فارسی تبدیل می‌کند — برای تلفظ درست در TTS (F6.6). */
export function toPersianDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => String.fromCharCode(0x06f0 + Number(d)));
}

/** ارقام فارسی/عربی را به لاتین تبدیل می‌کند — برای پردازش عددی. */
export function toLatinDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (d) => DIGIT_MAP[d] ?? d);
}

/**
 * تخمین تعداد توکن.
 *
 * شمارش دقیق نیازمند توکنایزر همان مدل است؛ برای قطعه‌بندی، تخمین
 * کافی است. متن فارسی به‌طور میانگین حدود ۳ کاراکتر به ازای هر توکن
 * دارد (بیشتر از انگلیسی، چون بیشتر مدل‌ها فارسی را ریزتر می‌شکنند).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}
