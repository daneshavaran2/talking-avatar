/**
 * اعتبارسنجی نمودارهای Mermaid داخل مستندات.
 *
 *   npm run verify:diagrams            # README.md
 *   npm run verify:diagrams -- a.md b.md
 *
 * GitHub نمودارهای Mermaid را خودش رندر می‌کند، ولی اگر نحو یک بلوک
 * اشتباه باشد به‌جای نمودار یک کادر خطای قرمز نشان می‌دهد — و چون
 * هیچ‌چیز در زمان توسعه نمی‌شکند، اشتباه تا وقتی کسی README را در
 * GitHub باز کند پنهان می‌ماند.
 *
 * این اسکریپت هر بلوک را با خودِ کتابخانهٔ Mermaid در کروم **رندر**
 * می‌کند و اگر SVG تولید نشد شکست می‌دهد. هیچ درخواست شبکه‌ای بیرونی
 * لازم نیست: بستهٔ محلی روی یک سرور موقتی سرو می‌شود، چون بستهٔ ESM
 * مرمید قطعه‌هایش را با مسیر نسبی ایمپورت می‌کند و از `file://`
 * قابل بارگذاری نیست.
 */

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'node_modules', 'mermaid', 'dist');
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const FILES = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['README.md'];

let failures = 0;

/** بلوک‌های ```mermaid را با شمارهٔ خط استخراج می‌کند. */
function extractBlocks(text) {
  const blocks = [];
  let current = null;

  text.split('\n').forEach((line, index) => {
    if (current) {
      if (line.trim() === '```') {
        blocks.push({ line: current.line, code: current.code.join('\n') });
        current = null;
      } else {
        current.code.push(line);
      }
      return;
    }
    if (line.trim() === '```mermaid') current = { line: index + 1, code: [] };
  });

  if (current) blocks.push({ line: current.line, code: current.code.join('\n'), unterminated: true });
  return blocks;
}

const documents = [];
for (const file of FILES) {
  const text = await readFile(path.join(ROOT, file), 'utf8').catch(() => null);
  if (text === null) {
    console.log(`FAIL  فایل پیدا نشد: ${file}`);
    failures += 1;
    continue;
  }
  documents.push({ file, blocks: extractBlocks(text) });
}

const total = documents.reduce((sum, doc) => sum + doc.blocks.length, 0);
if (total === 0) {
  console.log('SKIP  هیچ بلوک Mermaid پیدا نشد.');
  process.exit(failures === 0 ? 0 : 1);
}

if (!(await stat(DIST).catch(() => null))) {
  console.log('SKIP  بستهٔ mermaid نصب نیست؛ `npm install` را اجرا کنید.');
  process.exit(0);
}

// ── سرور موقتی برای بستهٔ محلی مرمید ───────────────────────────
const PAGE = `<!doctype html><html><body><script type="module">
  import mermaid from './mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
  window.mermaid = mermaid;
</script></body></html>`;

const server = createServer(async (request, response) => {
  const urlPath = (request.url ?? '/').split('?')[0];

  if (urlPath === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(PAGE);
    return;
  }

  // فقط از پوشهٔ dist سرو می‌شود؛ مسیرهای بیرون‌رونده رد می‌شوند.
  const target = path.join(DIST, path.normalize(urlPath));
  if (!target.startsWith(DIST)) {
    response.writeHead(403).end();
    return;
  }

  // وجود فایل پیش از نوشتن هدر بررسی می‌شود، وگرنه خطای استریم پس
  // از رفتن هدرها می‌آید و دیگر نمی‌شود ۴۰۴ داد.
  if (!(await stat(target).catch(() => null))) {
    response.writeHead(404).end();
    return;
  }

  response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
  createReadStream(target).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(origin, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.mermaid), null, { timeout: 20_000 });

let index = 0;
for (const doc of documents) {
  console.log(`\n${doc.file} — ${doc.blocks.length} نمودار`);

  for (const block of doc.blocks) {
    index += 1;
    const kind = block.code.trim().split(/[\s\n]/)[0] || '؟';

    if (block.unterminated) {
      failures += 1;
      console.log(`FAIL  خط ${block.line} · بلوک بسته نشده است`);
      continue;
    }

    const result = await page.evaluate(
      async ([source, graphId]) => {
        try {
          const { svg } = await window.mermaid.render(graphId, source);
          return { ok: typeof svg === 'string' && svg.includes('<svg'), error: '' };
        } catch (error) {
          return { ok: false, error: error?.message ?? String(error) };
        }
      },
      [block.code, `diagram-${index}`],
    );

    if (!result.ok) failures += 1;
    console.log(
      `${result.ok ? 'PASS' : 'FAIL'}  خط ${block.line} · ${kind}` +
        (result.error ? ` — ${result.error.split('\n')[0]}` : ''),
    );
  }
}

await browser.close();
await new Promise((resolve) => server.close(resolve));

console.log(
  `\n${failures === 0 ? `ALL ${total} DIAGRAMS RENDER` : `${failures} DIAGRAM(S) FAILED`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
