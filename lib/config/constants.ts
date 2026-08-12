/**
 * ثابت‌های مشترک محصول.
 *
 * این فایل عمداً بدون `server-only` است چون هم سرور و هم کلاینت
 * به برچسب‌ها و دسته‌ها نیاز دارند. هیچ مقدار حساسی اینجا نیست.
 */

// ── وضعیت مکالمه (§فاز ۱) ────────────────────────────────────
export const CONVERSATION_STATES = [
  'idle',
  'listening',
  'thinking',
  'speaking',
  'interrupted',
  'error',
] as const;

export type ConversationState = (typeof CONVERSATION_STATES)[number];

export const STATE_LABELS: Record<ConversationState, string> = {
  idle: 'آماده',
  listening: 'در حال گوش دادن',
  thinking: 'در حال فکر کردن',
  speaking: 'در حال پاسخ دادن',
  interrupted: 'قطع شد',
  error: 'خطا',
};

// ── دسته‌های محدودشده (§۷.۲) ─────────────────────────────────
export const BLOCKED_CATEGORIES = [
  'political',
  'religious',
  'medical',
  'legal',
  'financial',
  'explicit',
  'personal_data',
] as const;

export type BlockedCategory = (typeof BLOCKED_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<BlockedCategory, string> = {
  political: 'سیاسی',
  religious: 'مذهبی',
  medical: 'پزشکی',
  legal: 'حقوقی',
  financial: 'مالی و سرمایه‌گذاری',
  explicit: 'محتوای نامناسب',
  personal_data: 'اطلاعات شخصی افراد',
};

/**
 * پیام‌های امتناع پیش‌فرض.
 *
 * برای هر دسته چند نسخه تعریف شده تا پاسخ‌ها تکراری و رباتیک
 * به نظر نرسند (F11.5). مدیر می‌تواند این‌ها را ویرایش کند (F11.2).
 */
export const DEFAULT_REFUSAL_MESSAGES: Record<BlockedCategory, string[]> = {
  political: [
    'من در این زمینه اظهارنظر نمی‌کنم. اگر سؤالی دربارهٔ خدمات ما دارید، خوشحال می‌شوم کمک کنم.',
    'بحث‌های سیاسی خارج از حوزهٔ کاری من است. بفرمایید چطور می‌توانم دربارهٔ محصولات کمکتان کنم؟',
    'ترجیح می‌دهم وارد این موضوع نشوم. سؤال دیگری دربارهٔ خدمات ما دارید؟',
  ],
  religious: [
    'این موضوع خارج از حوزهٔ کاری من است. چطور می‌توانم دربارهٔ محصولات کمکتان کنم؟',
    'من در مسائل اعتقادی اظهارنظر نمی‌کنم. اگر سؤال دیگری دارید در خدمتم.',
  ],
  medical: [
    'برای مسائل پزشکی حتماً با پزشک مشورت کنید. من در این زمینه صلاحیت ندارم.',
    'توصیهٔ پزشکی از من برنمی‌آید؛ بهتر است با یک پزشک صحبت کنید. کار دیگری از دستم برمی‌آید؟',
  ],
  legal: [
    'برای مشاورهٔ حقوقی بهتر است با یک وکیل صحبت کنید.',
    'من در مسائل حقوقی صلاحیت اظهارنظر ندارم. سؤال دیگری دربارهٔ خدمات ما دارید؟',
  ],
  financial: [
    'من مشاور مالی نیستم و در این مورد توصیه‌ای نمی‌کنم.',
    'دربارهٔ سرمایه‌گذاری اظهارنظر نمی‌کنم. اگر سؤالی دربارهٔ قیمت محصولات ما دارید بفرمایید.',
  ],
  explicit: ['نمی‌توانم در این مورد کمک کنم.', 'این درخواست خارج از چیزی است که می‌توانم انجام دهم.'],
  personal_data: [
    'اطلاعات شخصی افراد را در اختیار نمی‌گذارم.',
    'نمی‌توانم اطلاعات شخصی کسی را بازگو کنم. سؤال دیگری دارید؟',
  ],
};

export const OUT_OF_SCOPE_MESSAGE =
  'در این مورد اطلاعات کافی ندارم. اگر سؤال دیگری دربارهٔ خدمات ما دارید، خوشحال می‌شوم کمک کنم.';

// ── دسته‌بندی موضوعی (§۱۰.۲) ─────────────────────────────────
export const TOPICS = [
  'pricing',
  'products',
  'orders',
  'support',
  'booking',
  'complaint',
  'greeting',
  'other',
] as const;

export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABELS: Record<Topic, string> = {
  pricing: 'قیمت و خرید',
  products: 'محصولات',
  orders: 'سفارش و ارسال',
  support: 'پشتیبانی فنی',
  booking: 'رزرو و قرار ملاقات',
  complaint: 'شکایت و بازخورد',
  greeting: 'احوال‌پرسی',
  other: 'سایر',
};

// ── محدودیت‌های آپلود (F1.1 / F2.1 / F3.1) ───────────────────
export const UPLOAD_LIMITS = {
  avatarImage: {
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    label: 'JPG، PNG یا WebP تا ۱۰ مگابایت',
  },
  voiceSample: {
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a'],
    minSeconds: 30,
    label: 'WAV، MP3 یا M4A تا ۲۵ مگابایت (حداقل ۳۰ ثانیه)',
  },
  document: {
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
    ],
    extensions: ['.pdf', '.docx', '.txt', '.md'],
    label: 'PDF، DOCX، TXT یا Markdown تا ۲۵ مگابایت',
  },
} as const;

// ── محدودیت نرخ (§۹.۳) ───────────────────────────────────────
export const RATE_LIMITS = {
  chat: { limit: 30, windowMs: 60_000 },
  upload: { limit: 10, windowMs: 60_000 },
  tool: { limit: 20, windowMs: 60_000 },
  speech: { limit: 60, windowMs: 60_000 },
  login: { limit: 8, windowMs: 60_000 },
} as const;

// ── قطعه‌بندی RAG (§F3) ──────────────────────────────────────
export const CHUNKING = {
  targetTokens: 650,
  maxTokens: 800,
  minTokens: 120,
  overlapTokens: 100,
} as const;

// ── بودجهٔ تأخیر (§۱۰.۱) — برای نمایش هدف در داشبورد ─────────
export const LATENCY_BUDGET_MS = {
  vad: 150,
  stt: 200,
  rag: 100,
  llmFirstToken: 400,
  firstSentence: 300,
  ttsFirstByte: 200,
  avatarFirstFrame: 250,
  total: 1600,
} as const;

// ── System Prompt پایه (§۷.۴) ────────────────────────────────
export function defaultSystemPrompt(businessName = 'کسب‌وکار شما'): string {
  return `شما دستیار دیجیتال ${businessName} هستید.

زبان و لحن:
- همیشه به فارسی طبیعی و روان پاسخ دهید
- پاسخ‌ها برای مکالمهٔ صوتی هستند: کوتاه، شفاف، بدون فهرست‌های طولانی
- لحن: حرفه‌ای اما گرم و صمیمی

منابع اطلاعات:
- برای اطلاعات اختصاصی، فقط از پایگاه دانش ارائه‌شده استفاده کنید
- اگر اطلاعات کافی ندارید، صادقانه بگویید «در این مورد اطلاعات کافی ندارم»
- هرگز حدس نزنید و اطلاعات نادرست نسازید
- برای اطلاعات لحظه‌ای (قیمت، موجودی، سفارش) از ابزارهای موجود استفاده کنید

حریم خصوصی:
- اطلاعات شخصی کاربران دیگر را فاش نکنید
- اطلاعات محرمانهٔ داخلی شرکت را بازگو نکنید`;
}
