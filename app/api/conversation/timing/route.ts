import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { badRequest, validationError } from '@/lib/http/errors';

export const runtime = 'nodejs';

/**
 * `POST /api/conversation/timing` — گزارش زمان‌بندی سمت کلاینت.
 *
 * چرا لازم است: «اولین بایت صدا» و «اولین فریم آواتار» فقط در
 * مرورگر قابل اندازه‌گیری‌اند. بدون این گزارش، تفکیک تأخیر در
 * داشبورد (§۱۰.۵) ناقص می‌ماند و شاخص اصلی محصول — پایان صحبت
 * کاربر تا اولین صدای آواتار — قابل محاسبه نیست.
 */

const timingSchema = z.object({
  turnId: z.string().uuid(),
  firstAudioAt: z.number().int().positive().optional(),
  firstFrameAt: z.number().int().positive().optional(),
  avatarStartAt: z.number().int().positive().optional(),
  sttStartAt: z.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('بدنهٔ درخواست JSON معتبر نیست.');
  }

  const parsed = timingSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { turnId, ...timings } = parsed.data;
  const data: Record<string, Date> = {};
  for (const [key, value] of Object.entries(timings)) {
    if (typeof value === 'number') data[key] = new Date(value);
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

  await prisma.turn.update({ where: { id: turnId }, data }).catch(() => null);
  return NextResponse.json({ ok: true });
}
