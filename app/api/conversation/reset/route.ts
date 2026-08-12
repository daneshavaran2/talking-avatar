import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { interruptTurn } from '@/lib/conversation/turn-registry';
import { badRequest, tooManyRequests, validationError } from '@/lib/http/errors';
import { checkRateLimit, clientKey } from '@/lib/http/rate-limit';
import { RATE_LIMITS } from '@/lib/config/constants';
import { resetConversationSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

/**
 * `POST /api/conversation/reset` — شروع مکالمهٔ جدید (§۹.۱).
 * مکالمهٔ قبلی بسته می‌شود (نه پاک؛ آرشیو مدیر باید کامل بماند).
 */
export async function POST(request: NextRequest) {
  const limit = checkRateLimit(clientKey(request, 'reset'), RATE_LIMITS.chat);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return badRequest('بدنهٔ درخواست JSON معتبر نیست.');
  }

  const parsed = resetConversationSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  if (parsed.data.conversationId) {
    interruptTurn(parsed.data.conversationId, 'reset');
    await prisma.conversation
      .update({
        where: { id: parsed.data.conversationId },
        data: { endedAt: new Date() },
      })
      .catch(() => null);
  }

  return NextResponse.json({ conversationId: randomUUID() });
}
