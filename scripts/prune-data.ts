/**
 * پاک‌سازی دورهٔ نگهداری داده (§۱۱.۲ / P3).
 *
 * اجرا:  npm run db:prune
 *
 * برای اجرای خودکار، یک cron روزانه بگذارید — مثلاً هر شب ساعت ۳:
 *   0 3 * * *  cd /path/to/app && npm run db:prune >> /var/log/dh-prune.log 2>&1
 *
 * عمداً داخل خود اپلیکیشن زمان‌بندی نشده تا در استقرار چند-نمونه‌ای
 * چند بار هم‌زمان اجرا نشود.
 */

import { PrismaClient } from '@prisma/client';
import { previewRetention, pruneOldData } from '@/lib/privacy/retention';

// این اسکریپت خارج از Next.js اجرا می‌شود، پس .env خودکار خوانده نمی‌شود.
try {
  process.loadEnvFile();
} catch {
  // فایل .env وجود ندارد؛ متغیرها باید از محیط بیایند.
}

const prisma = new PrismaClient();

function retentionDays(): number | undefined {
  const raw = process.env.DATA_RETENTION_DAYS?.trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function main(): Promise<void> {
  const days = retentionDays();
  const preview = await previewRetention(prisma, days);
  const cutoff = preview.policy.cutoff.toISOString().slice(0, 10);

  console.log(`سیاست نگهداری: ${preview.policy.retentionDays} روز (مرز: ${cutoff})`);
  console.log(
    `کاندید حذف: ${preview.conversations} مکالمه · ${preview.messages} پیام · ${preview.serviceErrors} لاگ خطا`,
  );

  if (preview.conversations === 0 && preview.serviceErrors === 0) {
    console.log('چیزی برای پاک کردن نیست.');
    return;
  }

  const result = await pruneOldData(prisma, days);
  console.log(
    `✓ حذف شد: ${result.deletedConversations} مکالمه · ${result.deletedServiceErrors} لاگ خطا`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('پاک‌سازی شکست خورد:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
