import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// وقتی این اسکریپت مستقیم اجرا می‌شود (npm run db:seed) برخلاف
// دستورهای خود Prisma، فایل .env به‌صورت خودکار خوانده نمی‌شود.
try {
  process.loadEnvFile();
} catch {
  // فایل .env وجود ندارد؛ متغیرها باید از محیط بیایند.
}

/**
 * داده‌های اولیه.
 *
 * فقط دو چیز می‌سازد: ردیف تنظیمات و حساب مدیر. هیچ دادهٔ نمایشی
 * یا مکالمهٔ ساختگی ساخته نمی‌شود — آمار داشبورد باید از روز اول
 * واقعی باشد.
 */

const prisma = new PrismaClient();

const DEFAULT_REFUSALS = {
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

function systemPrompt(businessName: string): string {
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

async function main(): Promise<void> {
  const businessName = 'کسب‌وکار شما';

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      businessName,
      systemPrompt: systemPrompt(businessName),
      llmProvider: process.env.LLM_PROVIDER?.trim() || 'gemini',
      llmModel: process.env.LLM_MODEL?.trim() || 'gemini-2.0-flash',
      blockedCategories: ['political', 'religious', 'medical', 'legal', 'financial', 'explicit'],
      refusalMessages: DEFAULT_REFUSALS,
      customBlockedKeywords: [],
      enabledTools: [],
      kioskResetSeconds: Number(process.env.KIOSK_RESET_SECONDS ?? 120),
    },
  });
  console.log('✓ تنظیمات پیش‌فرض آماده است.');

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD?.trim();

  if (!email || !password) {
    console.log(
      '! حساب مدیر ساخته نشد: ADMIN_EMAIL و ADMIN_PASSWORD در .env تنظیم نشده‌اند.',
    );
    return;
  }

  if (password.length < 8) {
    console.log('! حساب مدیر ساخته نشد: ADMIN_PASSWORD باید حداقل ۸ کاراکتر باشد.');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✓ حساب مدیر از قبل وجود دارد: ${email}`);
    return;
  }

  await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash(password, 12), role: 'admin' },
  });
  console.log(`✓ حساب مدیر ساخته شد: ${email}`);
  console.log('  ⚠️  پس از اولین ورود، رمز عبور را تغییر دهید و ADMIN_PASSWORD را از .env بردارید.');
}

main()
  .catch((error: unknown) => {
    console.error('خطا در اجرای seed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
