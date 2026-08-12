import 'server-only';
import { cookies } from 'next/headers';
import { env } from '@/lib/config/env';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  verifySessionToken,
  type SessionPayload,
} from '@/lib/auth/token';

/**
 * نشست مدیر (§۱۱.۴ / S10).
 *
 * توکن در کوکی httpOnly + SameSite=Lax ذخیره می‌شود تا از JavaScript
 * قابل خواندن نباشد و در برابر CSRF ساده مقاوم باشد. کلید امضا فقط
 * سمت سرور است و هرگز به کلاینت نمی‌رسد (§۱۱.۱).
 */

export type { SessionPayload };
export { SESSION_COOKIE_NAME };

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await signSessionToken(payload);
  const store = await cookies();

  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  return verifySessionToken(token);
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}
