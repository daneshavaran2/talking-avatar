import type { NextRequest } from 'next/server';
import { RATE_LIMITS } from '@/lib/config/constants';
import { runTurn } from '@/lib/conversation/pipeline';
import { badRequest, tooManyRequests, validationError } from '@/lib/http/errors';
import { checkRateLimit, clientKey } from '@/lib/http/rate-limit';
import { createSseStream, SSE_HEADERS } from '@/lib/http/sse';
import { chatRequestSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/chat` — ارسال پیام و دریافت پاسخ جریانی (§۹.۱).
 *
 * پاسخ SSE است با رویدادهای:
 *   token · sentence · tool_call · refused · aborted · meta · done · error
 *
 * نکتهٔ مهم: این Handler **منتظر پایان `runTurn` نمی‌ماند**. استریم
 * بلافاصله برگردانده می‌شود و رویدادها همان‌طور که تولید می‌شوند
 * داخلش نوشته می‌شوند. اگر اینجا await کنیم، کل Streaming بی‌اثر
 * می‌شود و بودجهٔ تأخیر §۱۰.۱ از دست می‌رود.
 */
export async function POST(request: NextRequest) {
  const limit = checkRateLimit(clientKey(request, 'chat'), RATE_LIMITS.chat);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('بدنهٔ درخواست JSON معتبر نیست.');
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { stream, writer } = createSseStream();

  void runTurn(parsed.data, writer).catch(() => {
    writer.send({
      event: 'error',
      data: { turnId: parsed.data.turnId, error: 'خطای غیرمنتظره در پردازش پیام.' },
    });
    writer.close();
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
