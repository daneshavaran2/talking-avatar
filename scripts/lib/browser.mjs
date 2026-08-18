/**
 * راه‌اندازی کرومیوم برای آزمون‌های مرورگری.
 *
 * چرا یک‌جا: مسیر کرومیوم بین محیط‌ها فرق می‌کند. در برخی محیط‌های
 * توسعه مرورگر از قبل در مسیر ثابتی نصب شده، ولی روی یک ماشین
 * معمولی یا روی GitHub Actions باید همان نسخه‌ای اجرا شود که
 * `npx playwright install` نصب کرده است.
 *
 * قاعده: اگر `CHROMIUM_PATH` تنظیم شده باشد همان استفاده می‌شود؛
 * وگرنه اگر مسیر از پیش نصب‌شده وجود داشت از آن؛ و اگر هیچ‌کدام،
 * `executablePath` اصلاً پاس داده نمی‌شود تا خود Playwright مرورگر
 * خودش را پیدا کند. دادن یک مسیر ناموجود باعث شکست فوری می‌شود.
 */

import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const PRESET_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/**
 * مسیر اجرایی مرورگر، یا `undefined` تا Playwright خودش تصمیم بگیرد.
 *
 * `presetPath` پارامتر است تا هر دو شاخه قابل آزمون باشد؛ روی یک
 * ماشین که مسیر از پیش نصب‌شده دارد، شاخهٔ «پیدا نشد» وگرنه هرگز
 * اجرا نمی‌شود و بی‌آزمون می‌ماند.
 */
export function chromiumExecutablePath(presetPath = PRESET_PATH) {
  const fromEnv = process.env.CHROMIUM_PATH?.trim();
  if (fromEnv) return fromEnv;
  return existsSync(presetPath) ? presetPath : undefined;
}

/**
 * `chromium.launch` با مسیر درست و آرگومان‌های مشترک.
 * `args` ورودی به آرگومان‌های پیش‌فرض اضافه می‌شود، نه جایگزینشان.
 */
export function launchChromium({ args = [], ...rest } = {}) {
  const executablePath = chromiumExecutablePath();

  return chromium.launch({
    // در کانتینر بدون user namespace، سندباکس کروم بالا نمی‌آید.
    args: ['--no-sandbox', ...args],
    ...(executablePath ? { executablePath } : {}),
    ...rest,
  });
}
