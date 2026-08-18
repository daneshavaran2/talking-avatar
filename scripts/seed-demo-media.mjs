/**
 * ساخت آواتار و پروفایل صدای نمایشی — برای CI و دموی محلی.
 *
 *   npm run db:seed:demo
 *
 * چرا لازم است: سه مجموعهٔ آزمون مرورگری (`verify:e2e`،
 * `verify:degradation`، `verify:reconnect`) بدون آواتار و بدون TTS
 * فعال **رد می‌شوند، نه شکست** — که رفتار درستی است، ولی در CI یعنی
 * سبزِ توخالی. این اسکریپت همان چیزی را می‌سازد که مدیر در Setup
 * Wizard آپلود می‌کند تا آن آزمون‌ها واقعاً اجرا شوند.
 *
 * ⚠️ چهره اینجا **کشیده می‌شود، نه تولید**: یک صورت ساده و ساختگی
 * است، نه عکس کسی. برای نصب واقعی، عکس واقعی را از پنل مدیر آپلود
 * کنید. پروفایل صدا هم فقط یک ردیف است که می‌گوید «سرویس TTS آماده
 * است»؛ هیچ صدایی Clone نمی‌شود.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { launchChromium } from './lib/browser.mjs';

try {
  process.loadEnvFile();
} catch {
  // متغیرها باید از محیط بیایند.
}

const STORAGE_DIR = path.resolve(process.cwd(), process.env.STORAGE_DIR ?? './storage');

const prisma = new PrismaClient();

/**
 * یک صورت سادهٔ ساختگی می‌کشد.
 *
 * چرا با مرورگر: کرومیوم از قبل وابستگی این پروژه است و Canvas
 * خروجی PNG معتبر می‌دهد؛ افزودن یک کتابخانهٔ تصویر فقط برای این
 * کار زیاده‌روی بود.
 */
async function drawFace() {
  const browser = await launchChromium();
  const page = await browser.newPage();

  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1c1a24';
    ctx.fillRect(0, 0, 512, 640);

    // سر
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath();
    ctx.ellipse(256, 300, 150, 190, 0, 0, Math.PI * 2);
    ctx.fill();

    // گردن و شانه‌ها
    ctx.fillRect(216, 450, 80, 80);
    ctx.beginPath();
    ctx.ellipse(256, 620, 200, 110, 0, 0, Math.PI * 2);
    ctx.fill();

    // مو
    ctx.fillStyle = '#2b2119';
    ctx.beginPath();
    ctx.ellipse(256, 190, 155, 105, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // چشم‌ها — موتور لیپ‌سینک روی همین‌ها پلک می‌کشد
    ctx.fillStyle = '#ffffff';
    for (const x of [200, 312]) {
      ctx.beginPath();
      ctx.ellipse(x, 285, 26, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#2a2118';
    for (const x of [200, 312]) {
      ctx.beginPath();
      ctx.arc(x, 285, 11, 0, Math.PI * 2);
      ctx.fill();
    }

    // بینی و دهان بسته
    ctx.strokeStyle = '#c9a179';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(256, 300);
    ctx.lineTo(248, 350);
    ctx.stroke();

    ctx.fillStyle = '#8d4a45';
    ctx.beginPath();
    ctx.ellipse(256, 395, 46, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    return canvas.toDataURL('image/png');
  });

  await browser.close();
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function main() {
  const png = await drawFace();

  const name = `${randomUUID()}.png`;
  await mkdir(path.join(STORAGE_DIR, 'avatars'), { recursive: true });
  await writeFile(path.join(STORAGE_DIR, 'avatars', name), png);

  // مختصات دقیقاً همان چیزی است که بالا کشیده شد (نسبت به ۵۱۲×۶۴۰).
  const faceGeometry = {
    mouth: { x: 256 / 512 - 0.09, y: 395 / 640 - 0.02, width: 0.18, height: 0.045 },
    leftEye: { x: 200 / 512 - 0.05, y: 285 / 640 - 0.02, width: 0.1, height: 0.045 },
    rightEye: { x: 312 / 512 - 0.05, y: 285 / 640 - 0.02, width: 0.1, height: 0.045 },
    chinY: 490 / 640,
  };

  await prisma.avatarProfile.updateMany({ data: { isActive: false } });
  const avatar = await prisma.avatarProfile.create({
    data: {
      imageUrl: `/api/files/avatars/${name}`,
      status: 'ready',
      width: 512,
      height: 640,
      faceGeometry,
      isActive: true,
    },
    select: { id: true, imageUrl: true },
  });

  // پروفایل صدا فقط اعلام می‌کند سرویس TTS آماده است؛ چیزی Clone
  // نمی‌شود و رضایتی هم ثبت نمی‌شود چون صدای کسی در کار نیست.
  await prisma.voiceProfile.updateMany({ data: { isActive: false } });
  const voice = await prisma.voiceProfile.create({
    data: {
      sourceAudioUrl: '',
      status: 'ready',
      providerName: process.env.TTS_PROVIDER ?? 'media-engine',
      providerVoiceId: null,
      isActive: true,
    },
    select: { id: true },
  });

  console.log(`✓ آواتار نمایشی ساخته شد: ${avatar.imageUrl}`);
  console.log(`✓ پروفایل صدا آماده شد: ${voice.id}`);
  console.log('  (چهره ساختگی است و صدایی Clone نشده — فقط برای آزمون و دمو)');
}

main()
  .catch((error) => {
    console.error('ساخت دادهٔ نمایشی شکست خورد:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
