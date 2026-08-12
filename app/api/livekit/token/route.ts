import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AccessToken } from 'livekit-server-sdk';
import { env } from '@/lib/config/env';
import { badRequest, notImplemented, serverError, validationError } from '@/lib/http/errors';
import { logServiceError } from '@/lib/observability/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const tokenSchema = z.object({
  conversationId: z.string().uuid(),
});

/**
 * `POST /api/livekit/token` — توکن اتاق رسانهٔ بلادرنگ (§۹.۱).
 *
 * قاعدهٔ امنیتی S1: توکن **فقط سمت سرور** ساخته می‌شود. کلید و
 * Secret لایوکیت هرگز به مرورگر نمی‌رسند.
 *
 * هر مکالمه اتاق خودش را دارد: `room-{conversationId}`.
 */
export async function POST(request: NextRequest) {
  if (!env.livekitUrl || !env.livekitApiKey || !env.livekitApiSecret) {
    return notImplemented('livekit', 'سرور رسانهٔ بلادرنگ در این نصب پیکربندی نشده است.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('بدنهٔ درخواست JSON معتبر نیست.');
  }

  const parsed = tokenSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const room = `room-${parsed.data.conversationId}`;

  try {
    const token = new AccessToken(env.livekitApiKey, env.livekitApiSecret, {
      identity: `visitor-${parsed.data.conversationId}`,
      ttl: '1h',
    });

    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return NextResponse.json({ token: await token.toJwt(), url: env.livekitUrl, room });
  } catch (error) {
    await logServiceError(
      'livekit',
      'ساخت توکن شکست خورد',
      error instanceof Error ? error.message : String(error),
    );
    return serverError('ساخت توکن اتاق ممکن نشد.');
  }
}
