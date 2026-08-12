import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/token';

/**
 * لایهٔ اول حفاظت از مسیرهای مدیریتی.
 *
 * Middleware روی Edge اجرا می‌شود و به پایگاه داده دسترسی ندارد؛
 * فقط امضا و انقضای توکن بررسی می‌شود. بررسی عمیق‌تر در خود
 * Handlerها انجام می‌شود — هیچ Handler‌ی نباید صرفاً به Middleware
 * تکیه کند (lib/auth/guard.ts).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // مسیر ورود باید باز بماند وگرنه هدایت حلقه می‌شود.
  if (pathname === '/admin/login' || pathname === '/api/admin/login') {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (session) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'برای این کار باید وارد شوید.', code: 'unauthorized' },
      { status: 401 },
    );
  }

  const loginUrl = new URL('/admin/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
