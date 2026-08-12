import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/guard';
import { getSettings } from '@/lib/db/settings';
import { badRequest, serverError, validationError } from '@/lib/http/errors';
import { retrieve } from '@/lib/rag/retrieve';
import { ragTestSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/admin/rag/test` — ابزار تست بازیابی (F3.8).
 *
 * مدیر سؤال نمونه می‌پرسد و **دقیقاً همان قطعاتی** را می‌بیند که به
 * مدل زبانی داده می‌شود، با نمرهٔ شباهت. این تنها راه فهمیدن اینکه
 * آستانه درست تنظیم شده یا نه است.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('بدنهٔ درخواست JSON معتبر نیست.');
  }

  const parsed = ragTestSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const settings = await getSettings();
    const result = await retrieve(parsed.data.question, settings, request.signal);

    return NextResponse.json({
      hasKnowledgeBase: result.hasKnowledgeBase,
      threshold: settings.ragThreshold,
      topK: settings.ragTopK,
      matches: result.matches.map((match) => ({
        id: match.id,
        documentTitle: match.documentTitle,
        page: match.page,
        section: match.section,
        similarity: Number(match.similarity.toFixed(4)),
        preview: match.content.slice(0, 400),
      })),
    });
  } catch (error) {
    return serverError(
      error instanceof Error ? error.message : 'تست بازیابی ممکن نشد.',
    );
  }
}
