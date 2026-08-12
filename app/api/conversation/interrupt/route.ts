import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { interruptTurn } from '@/lib/conversation/turn-registry';
import { prisma } from '@/lib/db/client';
import { badRequest, validationError } from '@/lib/http/errors';
import { interruptSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

/**
 * `POST /api/conversation/interrupt` — اعلام Barge-In (§F8).
 *
 * کلاینت به‌محض تشخیص صدای کاربر (VAD) این را صدا می‌زند. سرور
 * زنجیرهٔ لغو را اجرا می‌کند: AbortSignal نوبت فعال لغو می‌شود،
 * که به‌نوبهٔ خود جریان LLM و TTS و آواتار را قطع می‌کند.
 *
 * کلاینت نباید منتظر پاسخ این مسیر بماند تا صدا را قطع کند — سکوت
 * فوری سمت کلاینت اتفاق می‌افتد (بودجهٔ زیر ۳۰۰ میلی‌ثانیه، F8.1)
 * و این فراخوانی فقط منابع سمت سرور را آزاد می‌کند.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('بدنهٔ درخواست JSON معتبر نیست.');
  }

  const parsed = interruptSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const interruptedTurnId = interruptTurn(parsed.data.conversationId, 'barge-in');

  if (interruptedTurnId) {
    await prisma.turn
      .update({
        where: { id: interruptedTurnId },
        data: { status: 'interrupted', completedAt: new Date() },
      })
      .catch(() => null);
  }

  return NextResponse.json({ interruptedTurnId });
}
