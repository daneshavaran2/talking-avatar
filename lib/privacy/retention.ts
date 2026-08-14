import type { PrismaClient } from '@prisma/client';

/**
 * سیاست نگهداری داده (§۱۱.۲ / P3).
 *
 * سند می‌گوید سیاست نگهداری باید «مشخص و قابل تنظیم» باشد با پیش‌فرض
 * ۹۰ روز. مدت از `DATA_RETENTION_DAYS` می‌آید.
 *
 * چه چیزی پاک می‌شود: مکالمات قدیمی‌تر از بازه، به‌همراه پیام‌ها،
 * نوبت‌ها و فراخوانی‌های ابزارشان (با Cascade در Schema)، و لاگ
 * خطای سرویس‌ها.
 *
 * چه چیزی پاک **نمی‌شود**: سؤالات بی‌پاسخ (فهرست کارهای بهبود پایگاه
 * دانش است، نه دادهٔ شخصی)، اسناد، پروفایل آواتار و صدا، و تنظیمات.
 *
 * نکتهٔ طراحی: این ماژول `PrismaClient` را به‌صورت پارامتر می‌گیرد و
 * هیچ ماژول `server-only`‌ای ایمپورت نمی‌کند. دلیلش این است که علاوه
 * بر Route Handler، از یک اسکریپت مستقل (`npm run db:prune`) هم صدا
 * زده می‌شود که خارج از زمینهٔ سرور Next.js اجرا می‌گردد.
 */

export type RetentionPolicy = {
  retentionDays: number;
  cutoff: Date;
};

export type RetentionPreview = {
  policy: RetentionPolicy;
  conversations: number;
  messages: number;
  serviceErrors: number;
};

export type RetentionResult = {
  policy: RetentionPolicy;
  deletedConversations: number;
  deletedServiceErrors: number;
};

export const DEFAULT_RETENTION_DAYS = 90;

export function retentionPolicy(retentionDays?: number): RetentionPolicy {
  const days =
    typeof retentionDays === 'number' && Number.isFinite(retentionDays) && retentionDays > 0
      ? Math.trunc(retentionDays)
      : DEFAULT_RETENTION_DAYS;

  return {
    retentionDays: days,
    cutoff: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
  };
}

/** شمارش آنچه پاک خواهد شد — بدون تغییر داده. */
export async function previewRetention(
  prisma: PrismaClient,
  retentionDays?: number,
): Promise<RetentionPreview> {
  const policy = retentionPolicy(retentionDays);

  const [conversations, messages, serviceErrors] = await Promise.all([
    prisma.conversation.count({ where: { startedAt: { lt: policy.cutoff } } }),
    prisma.message.count({ where: { conversation: { startedAt: { lt: policy.cutoff } } } }),
    prisma.serviceError.count({ where: { createdAt: { lt: policy.cutoff } } }),
  ]);

  return { policy, conversations, messages, serviceErrors };
}

/** اجرای واقعی پاک‌سازی. */
export async function pruneOldData(
  prisma: PrismaClient,
  retentionDays?: number,
): Promise<RetentionResult> {
  const policy = retentionPolicy(retentionDays);

  // پیام‌ها، نوبت‌ها و فراخوانی ابزار با onDelete: Cascade پاک می‌شوند.
  const conversations = await prisma.conversation.deleteMany({
    where: { startedAt: { lt: policy.cutoff } },
  });

  const errors = await prisma.serviceError.deleteMany({
    where: { createdAt: { lt: policy.cutoff } },
  });

  return {
    policy,
    deletedConversations: conversations.count,
    deletedServiceErrors: errors.count,
  };
}
