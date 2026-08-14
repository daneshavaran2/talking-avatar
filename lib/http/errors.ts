import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/**
 * قالب یکدست خطا (§۹.۳).
 * هیچ جزئیات فنی خامی به کاربر نمی‌رسد (§۱۲.۳ / E1)؛ جزئیات فقط
 * در لاگ سرور می‌ماند.
 */

export type ApiError = {
  error: string;
  code?: string;
};

export function jsonError(
  message: string,
  status: number,
  code?: string,
): NextResponse<ApiError> {
  return NextResponse.json(code ? { error: message, code } : { error: message }, { status });
}

export function badRequest(message = 'درخواست نامعتبر است.', code?: string) {
  return jsonError(message, 400, code);
}

export function unauthorized(message = 'برای این کار باید وارد شوید.') {
  return jsonError(message, 401, 'unauthorized');
}

export function notFound(message = 'موردی پیدا نشد.') {
  return jsonError(message, 404, 'not_found');
}

export function tooManyRequests(retryAfterSeconds: number) {
  const response = jsonError(
    'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.',
    429,
    'rate_limited',
  );
  response.headers.set('retry-after', String(retryAfterSeconds));
  return response;
}

export function notImplemented(service: string, message?: string) {
  return jsonError(
    message ?? `سرویس «${service}» در این نصب پیکربندی نشده است.`,
    501,
    'not_configured',
  );
}

export function serverError(message = 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.') {
  return jsonError(message, 500, 'internal_error');
}

/**
 * سرویس بیرونی در دسترس نبود یا پاسخ نداد.
 *
 * جدا از ۵۰۰ و ۵۰۱ نگه داشته شده چون کلاینت با هرکدام کار متفاوتی
 * می‌کند: ۵۰۱ یعنی «اصلاً پیکربندی نشده» (تنزل دائمی و بی‌صدا)، ولی
 * ۵۰۲ یعنی «الان خراب است» و باید به کاربر خبر داده شود (§۱۲.۲).
 */
export function badGateway(message = 'سرویس بیرونی در دسترس نیست.') {
  return jsonError(message, 502, 'upstream_unavailable');
}

/** خطای اعتبارسنجی Zod را به پیام فارسی قابل نمایش تبدیل می‌کند. */
export function validationError(error: ZodError) {
  const first = error.issues[0];
  const path = first?.path.join('.') ?? '';
  const detail = first?.message ?? 'ورودی نامعتبر است.';
  return jsonError(path ? `${path}: ${detail}` : detail, 400, 'validation_error');
}
