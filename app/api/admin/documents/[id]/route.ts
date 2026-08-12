import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/client';
import { notFound, serverError } from '@/lib/http/errors';
import { logServiceError } from '@/lib/observability/log';
import { deleteStoredFile } from '@/lib/storage/files';

export const runtime = 'nodejs';

/**
 * `DELETE /api/admin/documents/:id` — حذف سند و قطعاتش (F3.6).
 * قطعات با Cascade در Schema پاک می‌شوند؛ فایل روی دیسک هم حذف می‌شود.
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { id: true, sourceUrl: true },
    });
    if (!document) return notFound('سند پیدا نشد.');

    await prisma.document.delete({ where: { id } });
    await deleteStoredFile(document.sourceUrl);

    return NextResponse.json({ ok: true });
  } catch (error) {
    await logServiceError(
      'rag',
      `حذف سند ${id} شکست خورد`,
      error instanceof Error ? error.message : String(error),
    );
    return serverError('حذف سند ممکن نشد.');
  }
}
