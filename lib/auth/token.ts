import { jwtVerify, SignJWT } from 'jose';

/**
 * امضا و بررسی توکن نشست.
 *
 * این ماژول عمداً از `next/headers` و Prisma استفاده نمی‌کند تا در
 * Middleware (که روی Edge Runtime اجرا می‌شود) هم قابل ایمپورت
 * باشد. کار با کوکی در lib/auth/session.ts انجام می‌شود.
 */

export const SESSION_COOKIE_NAME = 'dh_session';
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // ۸ ساعت

export type SessionPayload = {
  userId: string;
  email: string;
  role: string;
};

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET تنظیم نشده یا بیش از حد کوتاه است (حداقل ۱۶ کاراکتر).');
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    if (!payload.sub) return null;

    return {
      userId: payload.sub,
      email: String(payload.email ?? ''),
      role: String(payload.role ?? 'admin'),
    };
  } catch {
    return null;
  }
}
