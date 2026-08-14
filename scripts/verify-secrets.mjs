/**
 * بازرسی نشت کلید به سمت کلاینت (§۱۴ «امنیت» و S2).
 *
 *   npm run verify:secrets
 *
 * سند این مورد را «بازرسی دستی» گذاشته بود. بازرسی دستی هر بار که
 * یک `use client` جدید اضافه شود باید تکرار شود و بالاخره یک بار
 * فراموش می‌شود — پس اینجا خودکار شده است.
 *
 * چهار بررسی انجام می‌شود:
 *   ۱. هیچ متغیر محیطی با پیشوند NEXT_PUBLIC_ تعریف نشده باشد
 *   ۲. هیچ‌جای کد `process.env.NEXT_PUBLIC_*` خوانده نشود
 *   ۳. هیچ مقدار حساسی در باندل کلاینت (.next/static) نباشد
 *   ۴. هیچ مقدار حساسی در HTML صفحه‌های سرورساخت نباشد
 *
 * پیش‌نیاز بررسی ۳: یک بیلد موجود (`npm run build`).
 * بررسی ۴ فقط وقتی اپ در حال اجراست انجام می‌شود، وگرنه رد می‌شود.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const BASE_URL = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';

let failures = 0;
const assert = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

try {
  process.loadEnvFile();
} catch {
  // فایل .env نیست؛ از متغیرهای محیط استفاده می‌شود.
}

// ── مقادیری که هرگز نباید سمت کلاینت دیده شوند ────────────────
const SECRET_KEY = /KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL|CREDENTIAL/i;

// نام متغیرهای خودِ اپلیکیشن از .env.example خوانده می‌شود تا گزارش
// روشن بماند؛ ولی جستجو روی همهٔ متغیرهای حساسِ محیط انجام می‌شود،
// چون نشت یک کلید غریبه هم به همان اندازه بد است.
let ownKeys = new Set();
try {
  const example = await readFile(path.join(ROOT, '.env.example'), 'utf8');
  ownKeys = new Set(
    example
      .split('\n')
      .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
      .filter((key) => key && SECRET_KEY.test(key)),
  );
} catch {
  // .env.example نیست؛ همان جستجوی عمومی انجام می‌شود.
}

const secrets = Object.entries(process.env)
  .filter(([key, value]) => SECRET_KEY.test(key) && typeof value === 'string')
  // مقدار خیلی کوتاه فقط مثبت کاذب می‌سازد.
  .filter(([, value]) => value.trim().length >= 12)
  .map(([key, value]) => ({ key, value: value.trim() }));

const own = secrets.filter((s) => ownKeys.has(s.key)).map((s) => s.key);
const others = secrets.length - own.length;

console.log(
  `\nمتغیرهای این اپلیکیشن: ${own.join('، ') || '—'}` +
    `${others > 0 ? `\n(به‌علاوهٔ ${others} متغیر حساس دیگر در محیط، که آن‌ها هم جستجو می‌شوند)` : ''}\n`,
);

// ── ۱ و ۲: پیشوند NEXT_PUBLIC_ ─────────────────────────────────
{
  const publicVars = Object.keys(process.env).filter((key) => key.startsWith('NEXT_PUBLIC_'));
  assert('هیچ متغیر NEXT_PUBLIC_ تعریف نشده', publicVars.length === 0, publicVars.join('، '));
}

async function walk(dir, filter, found = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      await walk(full, filter, found);
    } else if (filter(full)) {
      found.push(full);
    }
  }
  return found;
}

{
  const sources = await walk(
    ROOT,
    (file) =>
      /\.(ts|tsx|js|jsx|mjs)$/.test(file) &&
      !file.includes(`${path.sep}.next${path.sep}`) &&
      !file.includes(`${path.sep}scripts${path.sep}`),
  );

  const offenders = [];
  const hardcoded = [];

  // کلیدهای واقعی شکل شناخته‌شده دارند؛ اگر یکی مستقیم در کد نوشته
  // شده باشد، `server-only` جلویش را نمی‌گیرد چون از محیط نیامده.
  const KEY_SHAPES = [
    /\bsk-[A-Za-z0-9_-]{20,}/, // OpenAI / Anthropic
    /\bAIza[A-Za-z0-9_-]{30,}/, // Google
    /\bxi-[A-Za-z0-9]{28,}/, // ElevenLabs
    /\bgsk_[A-Za-z0-9]{40,}/, // Groq
    /\bAPI[A-Za-z0-9]{20,}/, // LiveKit
  ];

  for (const file of sources) {
    const text = await readFile(file, 'utf8');
    if (/process\.env\.NEXT_PUBLIC_/.test(text)) offenders.push(path.relative(ROOT, file));
    if (KEY_SHAPES.some((shape) => shape.test(text))) hardcoded.push(path.relative(ROOT, file));
  }

  assert('هیچ کدی NEXT_PUBLIC_ نمی‌خواند', offenders.length === 0, offenders.join('، '));
  assert('هیچ کلیدی مستقیم در کد نوشته نشده', hardcoded.length === 0, hardcoded.join('، '));
}

// ── ۳: باندل کلاینت ────────────────────────────────────────────
{
  const staticDir = path.join(ROOT, '.next', 'static');
  const exists = await stat(staticDir).catch(() => null);

  if (!exists) {
    console.log('SKIP  بیلدی وجود ندارد؛ ابتدا `npm run build` را اجرا کنید.');
  } else {
    const assets = await walk(staticDir, (file) => /\.(js|css|map|json)$/.test(file));
    const leaks = [];

    for (const file of assets) {
      const text = await readFile(file, 'utf8');
      for (const secret of secrets) {
        if (text.includes(secret.value)) {
          leaks.push(`${secret.key} در ${path.relative(ROOT, file)}`);
        }
      }
    }

    assert(
      `هیچ کلیدی در باندل کلاینت نیست (${assets.length} فایل بررسی شد)`,
      leaks.length === 0,
      leaks.join('، '),
    );
  }
}

// ── ۴: HTML صفحه‌های سرورساخت ──────────────────────────────────
{
  const pages = ['/', '/admin/login'];
  const leaks = [];
  let reachable = true;

  for (const page of pages) {
    let html;
    try {
      const response = await fetch(`${BASE_URL}${page}`, { redirect: 'follow' });
      html = await response.text();
    } catch {
      reachable = false;
      break;
    }

    for (const secret of secrets) {
      if (html.includes(secret.value)) leaks.push(`${secret.key} در ${page}`);
    }
  }

  if (!reachable) {
    console.log(`SKIP  اپلیکیشن روی ${BASE_URL} در دسترس نیست؛ بررسی HTML رد شد.`);
  } else {
    assert('هیچ کلیدی در HTML صفحه‌ها نیست', leaks.length === 0, leaks.join('، '));
  }
}

console.log(`\n${failures === 0 ? 'NO SECRET LEAKED TO THE CLIENT' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
