/**
 * تعریف نوع برای `browser.mjs`.
 *
 * خودِ ماژول عمداً `.mjs` است تا اسکریپت‌های آزمونِ `.mjs` بتوانند
 * مستقیم با `node` اجرایش کنند بدون مرحلهٔ ترجمه؛ ولی `verify-core`
 * که TypeScript است هم آن را ایمپورت می‌کند و به نوع نیاز دارد.
 */

import type { LaunchOptions, Browser } from 'playwright';

export function chromiumExecutablePath(presetPath?: string): string | undefined;

export function launchChromium(options?: LaunchOptions): Promise<Browser>;
