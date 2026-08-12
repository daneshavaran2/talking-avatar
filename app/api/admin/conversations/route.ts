import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/guard';
import { conversationArchive } from '@/lib/analytics/aggregate';
import { serverError, validationError } from '@/lib/http/errors';
import { conversationQuerySchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `GET /api/admin/conversations` — آرشیو مکالمات با فیلتر و جستجو (§۱۰.۳). */
export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const parsed = conversationQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return validationError(parsed.error);

  const to = parsed.data.to ? new Date(parsed.data.to) : new Date();
  const from = parsed.data.from
    ? new Date(parsed.data.from)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    const result = await conversationArchive({ ...parsed.data, from, to });
    return NextResponse.json(result);
  } catch (error) {
    return serverError(
      error instanceof Error ? error.message : 'خواندن آرشیو مکالمات ممکن نشد.',
    );
  }
}
