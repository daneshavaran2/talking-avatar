import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/client';
import { notFound } from '@/lib/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `GET /api/admin/conversations/:id` — نمای کامل یک مکالمه (§۱۰.۳). */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true,
      topic: true,
      summary: true,
      inputMode: true,
      messageCount: true,
      startedAt: true,
      endedAt: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          content: true,
          inputType: true,
          topic: true,
          wasRefused: true,
          refusalReason: true,
          refusalLayer: true,
          injectionFlag: true,
          ragUsed: true,
          latencyMs: true,
          createdAt: true,
        },
      },
      toolCalls: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          status: true,
          latencyMs: true,
          errorMessage: true,
          createdAt: true,
        },
      },
      turns: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, status: true, createdAt: true, completedAt: true },
      },
    },
  });

  if (!conversation) return notFound('مکالمه پیدا نشد.');

  return NextResponse.json({ conversation });
}

/** `DELETE /api/admin/conversations/:id` — حذف کامل یک مکالمه (§۱۱.۲ / P4). */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  const existing = await prisma.conversation.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return notFound('مکالمه پیدا نشد.');

  await prisma.conversation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
