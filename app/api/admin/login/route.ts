import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { RATE_LIMITS } from '@/lib/config/constants';
import { prisma } from '@/lib/db/client';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { badRequest, jsonError, serverError, tooManyRequests, validationError } from '@/lib/http/errors';
import { checkRateLimit, clientKey } from '@/lib/http/rate-limit';
import { loginSchema } from '@/lib/validation/schemas';
import { logServiceError } from '@/lib/observability/log';

export const runtime = 'nodejs';

/** `POST /api/admin/login` — ورود مدیر. */
export async function POST(request: NextRequest) {
  const limit = checkRateLimit(clientKey(request, 'login'), RATE_LIMITS.login);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('بدنهٔ درخواست JSON معتبر نیست.');
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
    });

    // پیام خطا عمداً یکسان است تا وجود یا نبود یک ایمیل لو نرود.
    const invalid = jsonError('ایمیل یا رمز عبور نادرست است.', 401, 'invalid_credentials');
    if (!user) {
      // اجرای یک مقایسهٔ ساختگی تا زمان پاسخ حالت «کاربر ناموجود»
      // با «رمز اشتباه» تفاوت محسوسی نداشته باشد.
      await verifyPassword(parsed.data.password, '$2a$12$' + 'x'.repeat(53)).catch(() => false);
      return invalid;
    }

    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok) return invalid;

    await createSession({ userId: user.id, email: user.email, role: user.role });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await logServiceError(
      'auth',
      'ورود مدیر شکست خورد',
      error instanceof Error ? error.message : String(error),
    );
    return serverError('ورود ممکن نشد. پیکربندی پایگاه داده و AUTH_SECRET را بررسی کنید.');
  }
}
