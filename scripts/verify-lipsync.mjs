/**
 * آزمون مرورگری موتور لیپ‌سینک (§F7).
 *
 *   npm run verify:lipsync
 *
 * چرا مرورگر واقعی: رندرر با Canvas 2D کار می‌کند و درستی‌اش را
 * فقط با اندازه‌گیری پیکسل‌های واقعی می‌شود ثابت کرد. این اسکریپت
 * رندرر را روی یک چهرهٔ ساختگی اجرا می‌کند و می‌سنجد که:
 *
 *   • مصوت باز دهان را واقعاً باز می‌کند
 *   • ویزیم لب‌بسته (پ ب م) دهان را باز نمی‌کند
 *   • ویزیم‌های مختلف شکل‌های متمایز می‌سازند
 *   • بلندی صدا میزان باز شدن را تعدیل می‌کند
 *   • انیمیشن Idle و پلک زدن در جریان‌اند
 *
 * نیازی به سرور در حال اجرا نیست؛ رندرر مستقیم بارگذاری می‌شود.
 */

import { build } from 'esbuild';
import { launchChromium } from './lib/browser.mjs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';


let failures = 0;
const assert = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const workDir = await mkdtemp(path.join(tmpdir(), 'lipsync-'));

try {
  // ── بستهٔ رندرر ─────────────────────────────────────────────
  const entry = path.join(workDir, 'entry.ts');
  await writeFile(
    entry,
    [
      "export { AvatarRenderer } from '@/lib/client/lipsync/renderer';",
      "export { VISEME_SHAPES, buildVisemeTimeline, sampleViseme } from '@/lib/lipsync/visemes';",
    ].join('\n'),
  );

  const bundled = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'LipSyncBundle',
    tsconfig: 'tsconfig.json',
    logLevel: 'error',
  });

  const bundle = bundled.outputFiles[0].text;

  // ── اجرا در کروم ────────────────────────────────────────────
  const browser = await launchChromium();

  const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: bundle });

  const result = await page.evaluate(async () => {
    const { AvatarRenderer, VISEME_SHAPES } = window.LipSyncBundle;

    // چهرهٔ ساختگی: پوست، ناحیهٔ پایین صورت روشن‌تر، خط لب، و
    // چشم‌های تیره (بدون چشم تیره، پلک روی پوست یکدست نامرئی است).
    const source = document.createElement('canvas');
    source.width = 300;
    source.height = 400;
    const sctx = source.getContext('2d');
    sctx.fillStyle = '#d8b49a';
    sctx.fillRect(0, 0, 300, 400);
    sctx.fillStyle = '#f2ddcc';
    sctx.fillRect(0, 240, 300, 160);
    sctx.fillStyle = '#7a3b3b';
    sctx.fillRect(120, 272, 60, 8);
    sctx.fillStyle = '#2b2018';
    for (const cx of [112, 188]) {
      sctx.beginPath();
      sctx.ellipse(cx, 176, 20, 11, 0, 0, Math.PI * 2);
      sctx.fill();
    }

    const image = new Image();
    await new Promise((resolve) => {
      image.onload = resolve;
      image.src = source.toDataURL();
    });

    const canvas = document.createElement('canvas');
    canvas.style.width = '300px';
    canvas.style.height = '400px';
    document.body.appendChild(canvas);

    const renderer = new AvatarRenderer(canvas);
    renderer.setImage(image);
    renderer.setGeometry({
      mouth: { x: 0.5, y: 0.7, width: 0.2, height: 0.085 },
      leftEye: { x: 0.375, y: 0.44, width: 0.13, height: 0.055 },
      rightEye: { x: 0.625, y: 0.44, width: 0.13, height: 0.055 },
      chinY: 0.88,
    });
    renderer.resize();

    const ctx = canvas.getContext('2d');

    const regionLuma = (xRatio, yRatio, wRatio, hRatio) => {
      const box = ctx.getImageData(
        Math.round(canvas.width * xRatio),
        Math.round(canvas.height * yRatio),
        Math.round(canvas.width * wRatio),
        Math.round(canvas.height * hRatio),
      );
      let sum = 0;
      for (let i = 0; i < box.data.length; i += 4) {
        sum += 0.299 * box.data[i] + 0.587 * box.data[i + 1] + 0.114 * box.data[i + 2];
      }
      return sum / (box.data.length / 4);
    };

    const mouthLuma = () => regionLuma(0.4, 0.65, 0.2, 0.1);

    const measure = (shape, amplitude, speaking) => {
      renderer.render({ shape, amplitude, speaking, timeMs: 0 });
      return mouthLuma();
    };

    const closed = measure(VISEME_SHAPES.sil, 0, false);
    const pp = measure(VISEME_SHAPES.PP, 1, true);
    const dd = measure(VISEME_SHAPES.DD, 1, true);
    const aa = measure(VISEME_SHAPES.AA, 1, true);
    const ou = measure(VISEME_SHAPES.OU, 1, true);
    const aaQuiet = measure(VISEME_SHAPES.AA, 0.05, true);
    const aaLoud = measure(VISEME_SHAPES.AA, 1, true);

    const idleFrames = [];
    for (const t of [0, 900, 1800, 2700]) {
      renderer.render({ shape: VISEME_SHAPES.sil, amplitude: 0, speaking: false, timeMs: t });
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 40) sum += data[i];
      idleFrames.push(sum);
    }

    let blinkDetected = false;
    let previousEyeLuma = null;
    for (let t = 0; t < 12000; t += 40) {
      renderer.render({ shape: VISEME_SHAPES.sil, amplitude: 0, speaking: false, timeMs: t });
      const luma = regionLuma(0.32, 0.41, 0.12, 0.05);
      if (previousEyeLuma !== null && Math.abs(luma - previousEyeLuma) > 0.4) blinkDetected = true;
      previousEyeLuma = luma;
    }

    return {
      closed,
      pp,
      dd,
      aa,
      ou,
      aaQuiet,
      aaLoud,
      idleVaries: new Set(idleFrames).size > 1,
      blinkDetected,
    };
  });

  await browser.close();

  const round = (n) => Math.round(n * 100) / 100;

  console.log('── روشنایی ناحیهٔ دهان به تفکیک ویزیم ──');
  console.log(`  sil : ${round(result.closed)}`);
  console.log(`  PP  : ${round(result.pp)}`);
  console.log(`  DD  : ${round(result.dd)}`);
  console.log(`  OU  : ${round(result.ou)}`);
  console.log(`  AA  : ${round(result.aa)}\n`);

  assert('no page errors', pageErrors.length === 0, pageErrors.join('; '));
  assert(
    'open vowel opens the mouth',
    result.aa < result.closed - 2,
    `AA=${round(result.aa)} sil=${round(result.closed)}`,
  );
  assert(
    'closed-lip viseme keeps mouth shut',
    Math.abs(result.pp - result.closed) < 3,
    `PP=${round(result.pp)}`,
  );
  assert('AA opens wider than DD', result.aa < result.dd);
  assert(
    'visemes render distinctly',
    new Set([round(result.aa), round(result.dd), round(result.ou)]).size >= 2,
  );
  assert(
    'audio amplitude modulates opening',
    result.aaLoud < result.aaQuiet - 1,
    `loud=${round(result.aaLoud)} quiet=${round(result.aaQuiet)}`,
  );
  assert('idle animation is running', result.idleVaries);
  assert('blink happens within 12s', result.blinkDetected);
} finally {
  await rm(workDir, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? 'ALL LIP-SYNC CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
