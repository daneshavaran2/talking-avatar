import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/client';
import { notFound } from '@/lib/http/errors';
import { scheduleIndexing } from '@/lib/rag/index-document';

export const runtime = 'nodejs';

/**
 * `POST /api/admin/documents/:id/reindex` — ایندکس مجدد بدون آپلود دوباره (F3.7).
 * کاربرد: پس از تغییر مدل تعبیه‌سازی، یا وقتی ایندکس قبلی با خطا مواجه شده.
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  const document = await prisma.document.findUnique({ where: { id }, select: { id: true } });
  if (!document) return notFound('سند پیدا نشد.');

  await prisma.document.update({
    where: { id },
    data: { status: 'pending', errorMessage: null },
  });

  scheduleIndexing(id);

  return NextResponse.json({ ok: true, status: 'pending' });
}
