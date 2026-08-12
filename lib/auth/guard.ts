import 'server-only';
import { redirect } from 'next/navigation';
import { getSession, type SessionPayload } from '@/lib/auth/session';
import { unauthorized } from '@/lib/http/errors';

/**
 * محافظ مسیرهای مدیریتی (§۹.۳).
 *
 * `requireAdminApi` برای Route Handlerها: پاسخ ۴۰۱ برمی‌گرداند.
 * `requireAdminPage` برای صفحات: به صفحهٔ ورود هدایت می‌کند.
 *
 * Middleware هم لایهٔ اول را می‌گیرد، ولی این توابع لایهٔ دوم‌اند:
 * هیچ Handler‌ی نباید صرفاً به Middleware تکیه کند.
 */

export async function requireAdminApi(): Promise<
  { ok: true; session: SessionPayload } | { ok: false; response: ReturnType<typeof unauthorized> }
> {
  const session = await getSession();
  if (!session) return { ok: false, response: unauthorized() };
  return { ok: true, session };
}

export async function requireAdminPage(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect('/admin/login');
  return session;
}
