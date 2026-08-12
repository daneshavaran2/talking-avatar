import 'server-only';
import type { NextRequest } from 'next/server';

/**
 * محدودیت نرخ (§۹.۳).
 *
 * پیاده‌سازی: پنجرهٔ کشویی ساده در حافظهٔ فرآیند. برای یک نصب
 * تک-نمونه‌ای (که معماری هدف همین است، §۵.۲) کافی است.
 *
 * ⚠️ محدودیت شناخته‌شده: با چند نمونهٔ Next.js پشت Load Balancer،
 * هر نمونه شمارندهٔ خودش را دارد. در آن حالت باید به Redis منتقل شود.
 */

type Bucket = { hits: number[]; };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 60_000;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function checkRateLimit(
  key: string,
  config: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key) ?? { hits: [] };
  const cutoff = now - config.windowMs;
  bucket.hits = bucket.hits.filter((time) => time > cutoff);

  if (bucket.hits.length >= config.limit) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + config.windowMs - now) / 1000)),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  return {
    allowed: true,
    remaining: config.limit - bucket.hits.length,
    retryAfterSeconds: 0,
  };
}

/**
 * شناسایی درخواست‌دهنده.
 * پشت Reverse Proxy، `x-forwarded-for` معتبر است — استقرار باید
 * تضمین کند این هدر از بیرون قابل جعل نیست.
 */
export function clientKey(request: NextRequest, scope: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return `${scope}:${ip}`;
}

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;

  const cutoff = now - 5 * 60_000;
  for (const [key, bucket] of buckets) {
    const last = bucket.hits[bucket.hits.length - 1];
    if (last === undefined || last < cutoff) buckets.delete(key);
  }
}
