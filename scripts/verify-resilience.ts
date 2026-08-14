/**
 * تنزل تدریجی و تلاش مجدد (§۱۲).
 *
 *   npm run verify:resilience -- [http://localhost:3000]
 *
 * سرویس بیرونی عمداً خراب می‌شود و رفتار اپلیکیشن از دید کاربر
 * سنجیده می‌شود:
 *
 *   E1 — هیچ خطای فنی خام به کاربر نمی‌رسد
 *   E2 — خطا با جزئیات کامل سمت سرور ثبت می‌شود
 *   E3 — همان لاگ به تفکیک سرویس در داشبورد دیده می‌شود
 *   E4 — خطای گذرا خودکار و با Backoff نمایی تکرار می‌شود
 *
 * پیش‌نیاز: اپلیکیشن در حال اجرا + پایگاه داده + سرور نمونه:
 *   node scripts/stub-services.mjs
 *
 * سرور نمونه یک مسیر `/__control` دارد که تعداد و نوع خرابی بعدی را
 * می‌گیرد؛ پس خرابی‌ها صریح و قابل تکرارند، نه تصادفی.
 */

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { sendTurn, type TurnResult } from './lib/sse-client';

try {
  process.loadEnvFile();
} catch {
  // متغیرها باید از محیط بیایند.
}

const BASE_URL = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const STUB_URL = (process.env.LLM_BASE_URL ?? 'http://localhost:11500').replace(/\/$/, '');
const prisma = new PrismaClient();

let failures = 0;
const assert = (name: string, ok: boolean, detail = ''): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const conversationId = randomUUID();

async function breakNext(failNext: number, status = 503, path = '/api/chat'): Promise<void> {
  const response = await fetch(`${STUB_URL}/__control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ failNext, status, path }),
  });
  if (!response.ok) {
    throw new Error(
      `سرور نمونه مسیر /__control ندارد (HTTP ${response.status}). نسخهٔ به‌روز آن را اجرا کنید.`,
    );
  }
}

async function ask(message: string): Promise<TurnResult> {
  const result = await sendTurn({
    baseUrl: BASE_URL,
    conversationId,
    turnId: randomUUID(),
    message,
  });
  if (result.status !== 200) throw new Error(`/api/chat پاسخ ${result.status} داد`);
  return result;
}

async function serviceErrorsSince(at: Date) {
  return prisma.serviceError.findMany({
    where: { createdAt: { gte: at } },
    orderBy: { createdAt: 'desc' },
    select: { service: true, message: true, detail: true },
  });
}

async function main(): Promise<void> {
  console.log('\n── خطای گذرا: باید خودکار تکرار شود (E4) ────');

  {
    // مدل دو بار ۵۰۳ می‌دهد و بار سوم جواب می‌دهد. از دید کاربر
    // باید هیچ اتفاقی نیفتاده باشد — فقط کمی دیرتر.
    const at = new Date();
    await breakNext(2, 503);

    const startedAt = Date.now();
    const result = await ask('ساعت کاری شما چطور است؟');
    const elapsed = Date.now() - startedAt;

    assert('پاسخ کامل رسید، انگار خرابی‌ای نبوده', result.text.trim().length > 0, result.text.slice(0, 50));
    assert(
      'خطایی به کاربر نشان داده نشد',
      !result.events.some((e) => e.event === 'error'),
    );
    assert(
      'نوبت با done بسته شد',
      result.events.some((e) => e.event === 'done'),
    );
    // دو Backoff با پایهٔ ۴۰۰ میلی‌ثانیه و Jitter برابر: دست‌کم ۶۰۰ میلی‌ثانیه
    assert('تأخیر نشان می‌دهد واقعاً صبر کرده', elapsed >= 600, `${elapsed}ms`);
    assert('تلاش موفق «خطا» ثبت نمی‌کند', (await serviceErrorsSince(at)).length === 0);
  }

  console.log('\n── خطای پایدار: پیام محترمانه (E1–E3) ───────');

  {
    // این بار سرویس اصلاً بالا نمی‌آید. کاربر نباید کد وضعیت،
    // Stack Trace یا نام سرویس بیرونی ببیند.
    const at = new Date();
    await breakNext(10, 500);

    const result = await ask('ساعت کاری شما چطور است؟');
    const errorEvent = result.events.find((e) => e.event === 'error');
    const shown = String(errorEvent?.data.error ?? '');

    assert('رویداد error فرستاده شد', Boolean(errorEvent));
    assert('پیام فارسی و قابل فهم است', /لطفاً|دوباره/.test(shown), shown);
    assert(
      'هیچ جزئیات فنی درز نکرد (E1)',
      !/HTTP|500|stack|fetch|localhost|11500/i.test(shown),
      shown,
    );

    const logged = await serviceErrorsSince(at);
    const llmError = logged.find((row) => row.service === 'llm');
    assert('خطا سمت سرور ثبت شد (E2)', Boolean(llmError));
    assert(
      'جزئیات کامل در لاگ هست، نه در پیام کاربر',
      Boolean(llmError?.detail && llmError.detail.length > 0),
      llmError?.detail?.slice(0, 60) ?? '',
    );
    assert('لاگ به تفکیک سرویس است (E3)', llmError?.service === 'llm');

    await breakNext(0);
  }

  console.log('\n── بازگشت به حالت سالم ──────────────────────');

  {
    // پس از رفع خرابی، مکالمه باید بدون دخالت دستی ادامه پیدا کند.
    const result = await ask('ساعت کاری شما چطور است؟');
    assert('پس از رفع خرابی، پاسخ عادی', result.text.trim().length > 0, result.text.slice(0, 50));
    assert(
      'بدون رویداد error',
      !result.events.some((e) => e.event === 'error'),
    );
  }

  console.log('\n── اتصال مجدد، بدون پرسش تکراری (§۱۲.۲) ────');

  // بدترین حالت قطعی شبکه: سرور نوبت را کامل کرده و ذخیره کرده، ولی
  // پاسخ هرگز به کلاینت نرسیده. کلاینت دوباره می‌پرسد و باید همان
  // نوبت جایگزین شود، نه اینکه پرسش دو بار در آرشیو بنشیند.
  {
    const retryConversation = randomUUID();
    const question = 'ساعت کاری شما چطور است؟';
    const firstTurn = randomUUID();
    const secondTurn = randomUUID();

    const send = (turnId: string, retryOfTurnId?: string) =>
      sendTurn({
        baseUrl: BASE_URL,
        conversationId: retryConversation,
        turnId,
        message: question,
        retryOfTurnId,
      });

    await send(firstTurn);
    const afterFirst = await prisma.message.count({ where: { conversationId: retryConversation } });
    assert('تلاش اول ثبت شد', afterFirst === 2, `${afterFirst} پیام`);

    const second = await send(secondTurn, firstTurn);
    assert('تلاش دوم پاسخ کامل داد', second.text.trim().length > 0, second.text.slice(0, 40));

    const rows = await prisma.message.findMany({
      where: { conversationId: retryConversation },
      orderBy: { createdAt: 'asc' },
      select: { role: true, turnId: true },
    });
    const turns = await prisma.turn.count({ where: { conversationId: retryConversation } });
    const conversation = await prisma.conversation.findUnique({
      where: { id: retryConversation },
      select: { messageCount: true },
    });

    assert('پرسش فقط یک بار ثبت شد', rows.filter((r) => r.role === 'user').length === 1);
    assert('پاسخ فقط یک بار ثبت شد', rows.filter((r) => r.role === 'assistant').length === 1);
    assert('ردیف نوبت قبلی پاک شد', turns === 1, `${turns} نوبت`);
    assert('همهٔ ردیف‌ها به نوبت تازه تعلق دارند', rows.every((r) => r.turnId === secondTurn));
    assert('شمارندهٔ پیام درست است', conversation?.messageCount === 2, `${conversation?.messageCount}`);

    // محافظ: نوبتی که به مکالمهٔ دیگری تعلق دارد نباید پاک شود.
    const otherConversation = randomUUID();
    const otherTurn = randomUUID();
    await sendTurn({
      baseUrl: BASE_URL,
      conversationId: otherConversation,
      turnId: otherTurn,
      message: question,
    });

    await sendTurn({
      baseUrl: BASE_URL,
      conversationId: retryConversation,
      turnId: randomUUID(),
      message: question,
      retryOfTurnId: otherTurn,
    });

    const otherRows = await prisma.message.count({ where: { conversationId: otherConversation } });
    assert('نوبت مکالمهٔ دیگر دست‌نخورده ماند', otherRows === 2, `${otherRows} پیام`);

    await prisma.conversation.delete({ where: { id: retryConversation } }).catch(() => null);
    await prisma.conversation.delete({ where: { id: otherConversation } }).catch(() => null);
  }

  await prisma.conversation.delete({ where: { id: conversationId } }).catch(() => null);
}

main()
  .then(() => {
    console.log(`\n${failures === 0 ? 'RESILIENCE PASSED' : `${failures} CHECK(S) FAILED`}\n`);
    process.exitCode = failures === 0 ? 0 : 1;
  })
  .catch((error: unknown) => {
    console.error('\nآزمون اجرا نشد:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
