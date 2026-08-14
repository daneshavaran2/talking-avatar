/**
 * بودجهٔ تأخیر (§۱۰.۱) — شاخص اصلی محصول.
 *
 *   npm run verify:latency -- [http://localhost:3000]
 *
 * ── این آزمون چه چیزی را می‌سنجد و چه چیزی را نه ───────────────
 * هدف سند «زیر ۲ ثانیه از پایان صحبت تا اولین صدا» است. بخش بزرگی
 * از آن بودجه به سرویس‌های بیرونی تعلق دارد: ۴۰۰ میلی‌ثانیه برای
 * اولین توکن مدل، ۲۰۰ میلی‌ثانیه برای اولین بایت صدا. آن اعداد به
 * انتخاب سرویس شما بستگی دارند، نه به این کد.
 *
 * پس آنچه اینجا سنجیده می‌شود **سربار خودِ خط لوله** است: چقدر
 * زمان بین رسیدن درخواست و رفتن اولین جمله به سمت TTS صرف کاری
 * می‌شود که این اپلیکیشن انجام می‌دهد — تنظیمات، Guardrail، بازیابی
 * برداری، ساخت پرامپت، و جمله‌سازی.
 *
 * با سرور نمونه (که تقریباً بی‌تأخیر پاسخ می‌دهد) این سربار تقریباً
 * خالص دیده می‌شود. عددی که می‌گیرید را باید به بودجهٔ سرویس واقعی
 * خودتان **اضافه** کنید، نه اینکه نتیجه بگیرید بودجه رعایت شده.
 *
 * پیش‌نیاز: اپلیکیشن در حال اجرا + پایگاه داده + یک مدل.
 */

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

try {
  process.loadEnvFile();
} catch {
  // متغیرها باید از محیط بیایند.
}

const BASE_URL = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const RUNS = Number(process.env.LATENCY_RUNS ?? 5);
const prisma = new PrismaClient();

let failures = 0;
const assert = (name: string, ok: boolean, detail = ''): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

type Sample = {
  toMeta: number;
  toFirstToken: number;
  toFirstSentence: number;
  toDone: number;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
    : Math.round(sorted[middle] ?? 0);
};

/**
 * یک نوبت را با مهر زمانی رویدادها اجرا می‌کند.
 *
 * `sendTurn` مشترک، رویدادها را بدون زمان برمی‌گرداند، پس اینجا
 * جریان را خودمان می‌خوانیم تا لحظهٔ رسیدن هر رویداد ثبت شود.
 */
async function timedTurn(conversationId: string, message: string): Promise<Sample> {
  const startedAt = Date.now();
  const marks: Partial<Sample> = {};

  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      conversationId,
      turnId: randomUUID(),
      message,
      inputType: 'text',
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok || !response.body) throw new Error(`/api/chat پاسخ ${response.status} داد`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    for (const block of buffer.split('\n\n')) {
      const name = block.match(/^event:\s*(\S+)/m)?.[1];
      if (!name) continue;
      const at = Date.now() - startedAt;

      if (name === 'meta' && marks.toMeta === undefined) marks.toMeta = at;
      if (name === 'token' && marks.toFirstToken === undefined) marks.toFirstToken = at;
      if (name === 'sentence' && marks.toFirstSentence === undefined) marks.toFirstSentence = at;
      if (name === 'done') marks.toDone = at;
    }
  }

  return {
    toMeta: marks.toMeta ?? -1,
    toFirstToken: marks.toFirstToken ?? -1,
    toFirstSentence: marks.toFirstSentence ?? -1,
    toDone: marks.toDone ?? Date.now() - startedAt,
  };
}

async function main(): Promise<void> {
  const conversationId = randomUUID();
  const question = 'ساعت کاری شما چطور است؟';

  // نوبت اول همیشه کندتر است: اتصال پایگاه داده، Prisma، و مسیرها
  // هنوز گرم نشده‌اند. آن را می‌اندازیم دور تا عدد نمایندهٔ حالت
  // عادی باشد، نه حالت سرد.
  await timedTurn(conversationId, question);

  const samples: Sample[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    samples.push(await timedTurn(conversationId, question));
  }

  const toMeta = median(samples.map((s) => s.toMeta));
  const toFirstToken = median(samples.map((s) => s.toFirstToken));
  const toFirstSentence = median(samples.map((s) => s.toFirstSentence));
  const toDone = median(samples.map((s) => s.toDone));

  console.log(`\n${RUNS} نوبت (میانه، میلی‌ثانیه از رسیدن درخواست):\n`);
  console.log(`  تنظیمات + Guardrail + بازیابی برداری → meta   : ${toMeta}`);
  console.log(`  تا اولین توکن مدل                            : ${toFirstToken}`);
  console.log(`  تا اولین جملهٔ کامل (لحظهٔ شروع TTS)          : ${toFirstSentence}`);
  console.log(`  تا پایان پاسخ                                : ${toDone}\n`);

  // مهرهای زمانی سمت سرور هم بررسی می‌شوند تا بدانیم واقعاً ثبت
  // می‌شوند؛ داشبورد تأخیر بدون این‌ها عدد ندارد.
  const turn = await prisma.turn.findFirst({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    select: { llmStartAt: true, firstTokenAt: true, ttsStartAt: true, status: true },
  });

  console.log('── بررسی‌ها ──────────────────────────────────');

  assert('همهٔ مراحل رویداد خودشان را فرستادند', toMeta >= 0 && toFirstToken >= 0 && toFirstSentence >= 0);

  // §F6.4 — جمله‌ها باید حین تولید بیرون بروند، نه پس از پایان پاسخ.
  assert(
    'اولین جمله پیش از پایان پاسخ بیرون رفت (Sentence Streaming)',
    toFirstSentence < toDone,
    `${toFirstSentence} < ${toDone}`,
  );

  // بازیابی برداری بودجهٔ ۱۰۰ میلی‌ثانیه دارد؛ اینجا تنظیمات و
  // Guardrail هم داخلش است، پس با حاشیه می‌سنجیم.
  assert('مرحلهٔ پیش از مدل زیر ۳۰۰ میلی‌ثانیه', toMeta < 300, `${toMeta}ms`);

  // سربار خودِ خط لوله پس از رسیدن اولین توکن: فقط جمله‌سازی و
  // Guardrail لایهٔ ۳. باید ناچیز باشد.
  // این فاصله عمدتاً زمان تولید خودِ مدل تا کامل شدن جملهٔ اول است،
  // نه کار ما؛ اینجا فقط مطمئن می‌شویم چیزی وسطش گیر نکرده.
  const toFirstSentenceAfterToken = toFirstSentence - toFirstToken;
  assert(
    'جملهٔ اول بلافاصله پس از کامل شدن بیرون می‌رود',
    toFirstSentenceAfterToken < 400,
    `${toFirstSentenceAfterToken}ms پس از اولین توکن (شامل زمان تولید خود مدل)`,
  );

  assert('مهرهای زمانی سمت سرور ثبت شدند', Boolean(turn?.llmStartAt && turn?.firstTokenAt));
  assert('لحظهٔ شروع TTS ثبت شد', Boolean(turn?.ttsStartAt));
  assert('نوبت با وضعیت completed بسته شد', turn?.status === 'completed');

  console.log(
    '\nیادآوری: این اعداد سربار خط لوله‌اند، نه تأخیر سرویس واقعی.' +
      '\nبودجهٔ ۴۰۰ms اولین توکن و ۲۰۰ms اولین بایت صدا را باید به این‌ها افزود.',
  );

  await prisma.conversation.delete({ where: { id: conversationId } }).catch(() => null);
}

main()
  .then(() => {
    console.log(`\n${failures === 0 ? 'LATENCY BUDGET CHECKED' : `${failures} CHECK(S) FAILED`}\n`);
    process.exitCode = failures === 0 ? 0 : 1;
  })
  .catch((error: unknown) => {
    console.error('\nآزمون اجرا نشد:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
