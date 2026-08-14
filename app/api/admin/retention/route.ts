import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/guard';
import { env } from '@/lib/config/env';
import { prisma } from '@/lib/db/client';
import { previewRetention, pruneOldData } from '@/lib/privacy/retention';
import { serverError } from '@/lib/http/errors';
import { logServiceError } from '@/lib/observability/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/admin/retention` — سیاست نگهداری داده و پیش‌نمایش پاک‌سازی.
 * `POST /api/admin/retention` — اجرای پاک‌سازی (§۱۱.۲ / P3).
 */
export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const preview = await previewRetention(prisma, env.dataRetentionDays);
    return NextResponse.json({
      retentionDays: preview.policy.retentionDays,
      cutoff: preview.policy.cutoff.toISOString(),
      conversations: preview.conversations,
      messages: preview.messages,
      serviceErrors: preview.serviceErrors,
    });
  } catch (error) {
    // پیام خام پایگاه داده حتی برای مدیر هم بیرون نمی‌رود (E1)؛
    // جزئیات فقط در لاگ سرور می‌ماند.
    const detail = error instanceof Error ? error.message : String(error);
    await logServiceError('auth', 'خواندن سیاست نگهداری شکست خورد', detail);
    return serverError('خواندن سیاست نگهداری ممکن نشد.');
  }
}

export async function POST() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const result = await pruneOldData(prisma, env.dataRetentionDays);
    return NextResponse.json({
      retentionDays: result.policy.retentionDays,
      deletedConversations: result.deletedConversations,
      deletedServiceErrors: result.deletedServiceErrors,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await logServiceError('auth', 'پاک‌سازی دادهٔ قدیمی شکست خورد', detail);
    return serverError('پاک‌سازی داده ممکن نشد.');
  }
}
