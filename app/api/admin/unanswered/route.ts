import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/client';
import { badRequest, validationError } from '@/lib/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/admin/unanswered` — سؤالاتی که RAG جوابی برایشان نداشت.
 * این فهرست دقیقاً «کارهای بهبود پایگاه دانش» مدیر است (§۱۰.۴).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const resolved = request.nextUrl.searchParams.get('resolved') === 'true';

  const questions = await prisma.unansweredQuestion.findMany({
    where: { resolved },
    orderBy: [{ askCount: 'desc' }, { lastAskedAt: 'desc' }],
    take: 100,
    select: {
      id: true,
      question: true,
      askCount: true,
      resolved: true,
      lastAskedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ questions });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  resolved: z.boolean(),
});

/** `PATCH /api/admin/unanswered` — علامت‌گذاری به‌عنوان رسیدگی‌شده. */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('بدنهٔ درخواست JSON معتبر نیست.');
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  await prisma.unansweredQuestion.update({
    where: { id: parsed.data.id },
    data: { resolved: parsed.data.resolved },
  });

  return NextResponse.json({ ok: true });
}
