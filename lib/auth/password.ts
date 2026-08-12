import 'server-only';
import bcrypt from 'bcryptjs';

/**
 * هش رمز عبور (§۱۱.۴ / S10).
 * ۱۲ دور bcrypt: تعادل بین مقاومت در برابر Brute Force و زمان
 * پاسخ ورود (حدود ۲۰۰ میلی‌ثانیه روی سخت‌افزار متعارف).
 */

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
