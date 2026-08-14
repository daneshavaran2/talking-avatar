/**
 * آزمون یکپارچهٔ فراخوانی ابزار و دروازهٔ n8n (§F9).
 *
 *   npm run verify:tools -- [http://localhost:3000]
 *
 * مسیر کاملی که سنجیده می‌شود:
 *
 *   پیام کاربر → رجیستری ابزار → مدل زبانی (tool_call) →
 *   Webhook امضاشده با HMAC → نتیجه در تاریخچه →
 *   دور دوم مدل → رویدادهای SSE → ردیف ToolCall در پایگاه داده
 *
 * پیش‌نیاز: اپلیکیشن در حال اجرا، پایگاه داده، و سرور نمونه:
 *   N8N_WEBHOOK_SECRET=<همان مقدار .env> node scripts/stub-services.mjs
 *
 * و در .env:
 *   N8N_BASE_URL=http://localhost:11500
 *   N8N_WEBHOOK_SECRET=<یک رشتهٔ دلخواه>
 */

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { sendTurn, toolEvents, type TurnResult } from './lib/sse-client';

try {
  process.loadEnvFile();
} catch {
  // متغیرها باید از محیط بیایند.
}

const BASE_URL = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const N8N_URL = (process.env.N8N_BASE_URL ?? '').replace(/\/$/, '');
const prisma = new PrismaClient();

let failures = 0;
const assert = (name: string, ok: boolean, detail = ''): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const conversationId = randomUUID();

async function ask(message: string, timeoutMs = 30_000): Promise<TurnResult> {
  const result = await sendTurn({
    baseUrl: BASE_URL,
    conversationId,
    turnId: randomUUID(),
    message,
    timeoutMs,
  });
  if (result.status !== 200) throw new Error(`/api/chat پاسخ ${result.status} داد`);
  return result;
}

async function toolCallRows() {
  return prisma.toolCall.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: {
      name: true,
      argumentsJson: true,
      resultJson: true,
      status: true,
      latencyMs: true,
      errorMessage: true,
    },
  });
}

async function main(): Promise<void> {
  if (!N8N_URL) throw new Error('N8N_BASE_URL تنظیم نشده است؛ بدون آن ابزاری فعال نمی‌شود.');
  if (!process.env.N8N_WEBHOOK_SECRET) {
    throw new Error('N8N_WEBHOOK_SECRET تنظیم نشده است؛ طبق F9.4 ابزارها عمداً غیرفعال می‌مانند.');
  }

  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  if (!settings) throw new Error('ردیف تنظیمات وجود ندارد؛ ابتدا `npm run db:seed` را اجرا کنید.');
  const originalTools = settings.enabledTools;

  console.log('\n── امنیت Webhook (F9.4) ─────────────────────');

  // درخواست بدون امضا باید رد شود، وگرنه هر کسی که آدرس را بداند
  // می‌تواند سیستم فروش را صدا بزند.
  {
    const body = JSON.stringify({ tool: 'getPrice', arguments: { productId: 'X' } });
    const unsigned = await fetch(`${N8N_URL}/webhook/get-price`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    assert('Webhook بدون امضا رد می‌شود', unsigned.status === 401, `HTTP ${unsigned.status}`);

    const wrong = await fetch(`${N8N_URL}/webhook/get-price`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-signature': 'a'.repeat(64) },
      body,
    });
    assert('Webhook با امضای غلط رد می‌شود', wrong.status === 401, `HTTP ${wrong.status}`);
  }

  console.log('\n── ابزار غیرفعال ────────────────────────────');

  // F9.3 — فقط ابزارهای فعال به مدل معرفی می‌شوند.
  {
    await prisma.settings.update({ where: { id: 'singleton' }, data: { enabledTools: [] } });
    const result = await ask('قیمت محصول آلفا چنده؟');
    assert('هیچ ابزاری صدا زده نشد', toolEvents(result).length === 0);
    assert('ولی پاسخ متنی داده شد', result.text.trim().length > 0, result.text.slice(0, 50));
    assert('هیچ ردیف ToolCall ساخته نشد', (await toolCallRows()).length === 0);
  }

  console.log('\n── دور کامل فراخوانی ابزار ──────────────────');

  {
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: { enabledTools: ['getPrice'] },
    });

    const result = await ask('قیمت محصول آلفا چنده؟');
    const events = toolEvents(result);

    assert('رویداد شروع ابزار فرستاده شد', events[0]?.status === 'started', JSON.stringify(events));
    assert('نام ابزار درست است', events[0]?.name === 'getPrice');
    assert('رویداد موفقیت فرستاده شد', events[1]?.status === 'success', JSON.stringify(events));

    // دور دوم مدل باید از دادهٔ ابزار استفاده کند، نه از حافظهٔ خودش.
    assert('پاسخ نهایی حاوی عدد ابزار است', /4850000/.test(result.text), result.text.slice(0, 90));
    assert('جمله‌ای برای TTS بیرون رفت', result.sentences.length > 0);

    const rows = await toolCallRows();
    const row = rows[0];
    assert('ردیف ToolCall ثبت شد', rows.length === 1, `${rows.length} ردیف`);
    assert('وضعیت ردیف success است', row?.status === 'success');
    assert(
      'آرگومان‌های مدل ذخیره شدند',
      (row?.argumentsJson as Record<string, unknown> | null)?.productId === 'آلفا',
      JSON.stringify(row?.argumentsJson),
    );
    assert(
      'پاسخ Workflow ذخیره شد',
      (row?.resultJson as Record<string, unknown> | null)?.price === 4850000,
      JSON.stringify(row?.resultJson),
    );
    assert('زمان پاسخ اندازه‌گیری شد', typeof row?.latencyMs === 'number' && row.latencyMs >= 0);
  }

  console.log('\n── مهلت پاسخ ابزار (F9.5) ───────────────────');

  // Workflow عمداً پاسخ نمی‌دهد؛ باید پس از مهلت رها شود و مکالمه
  // ادامه پیدا کند، نه اینکه نوبت قفل شود (§۱۲.۱).
  {
    const startedAt = Date.now();
    const result = await ask('قیمت محصول SLOW-TEST چنده؟', 40_000);
    const elapsed = Date.now() - startedAt;
    const events = toolEvents(result);

    assert('رویداد timeout فرستاده شد', events[1]?.status === 'timeout', JSON.stringify(events));
    assert('مهلت حدود ۵ ثانیه بود', elapsed >= 4500 && elapsed < 15_000, `${elapsed}ms`);
    assert('مکالمه با پاسخ بسته شد، نه با خطا', result.text.trim().length > 0, result.text.slice(0, 60));
    assert(
      'رویداد done فرستاده شد',
      result.events.some((e) => e.event === 'done'),
    );

    const timeoutRow = (await toolCallRows()).find((r) => r.status === 'timeout');
    assert('ردیف ToolCall با وضعیت timeout ثبت شد', Boolean(timeoutRow));
    assert('پیام خطا ثبت شد', Boolean(timeoutRow?.errorMessage), timeoutRow?.errorMessage ?? '');
  }

  console.log('\n── تلاش مجدد فقط برای ابزار خواندنی (E4) ────');

  // خرابی گذرا روی Workflow: ابزار خواندنی باید دوباره تلاش کند،
  // ولی ابزار نوشتنی نه — تکرار «ثبت سرنخ» یعنی دو سرنخ تکراری در
  // سیستم مشتری، ضرری بدتر از خودِ خطای گذرا.
  const controlUrl = `${N8N_URL}/__control`;
  const control = await fetch(controlUrl).catch(() => null);
  if (!control?.ok) {
    console.log('SKIP  سرور نمونه مسیر /__control ندارد؛ این بخش رد شد.');
  } else {
    const breakNext = async (failNext: number, path: string) => {
      await fetch(controlUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ failNext, status: 503, path }),
      });
    };
    const remaining = async (): Promise<number> =>
      Number(((await (await fetch(controlUrl)).json()) as { remaining: number }).remaining);

    {
      await prisma.settings.update({
        where: { id: 'singleton' },
        data: { enabledTools: ['getPrice'] },
      });
      await breakNext(2, '/webhook/get-price');

      const result = await ask('قیمت محصول بتا چنده؟');
      assert('ابزار خواندنی: هر دو خرابی مصرف شد', (await remaining()) === 0);
      assert(
        'ابزار خواندنی: در نهایت موفق شد',
        toolEvents(result).some((e) => e.status === 'success'),
        JSON.stringify(toolEvents(result)),
      );
      assert('ابزار خواندنی: پاسخ نهایی دادهٔ واقعی دارد', /4850000/.test(result.text));
    }

    {
      await prisma.settings.update({
        where: { id: 'singleton' },
        data: { enabledTools: ['createLead'] },
      });
      await breakNext(2, '/webhook/create-lead');

      const result = await ask('لطفاً یک سرنخ برای من ثبت کنید');
      assert('ابزار نوشتنی: فقط یک بار تلاش شد', (await remaining()) === 1, `${await remaining()}`);
      assert(
        'ابزار نوشتنی: خطا گزارش شد، تکرار نشد',
        toolEvents(result).some((e) => e.status === 'error'),
        JSON.stringify(toolEvents(result)),
      );
      assert(
        'ابزار نوشتنی: مکالمه با اعلام صادقانه ادامه یافت',
        /دسترسی ندارم/.test(result.text),
        result.text.slice(0, 70),
      );

      await breakNext(0, '/webhook/create-lead');
    }
  }

  // بازگرداندن تنظیمات و پاک‌سازی مکالمهٔ آزمون
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: { enabledTools: originalTools },
  });
  await prisma.conversation.delete({ where: { id: conversationId } }).catch(() => null);
}

main()
  .then(() => {
    console.log(`\n${failures === 0 ? 'TOOL CALLING PASSED' : `${failures} CHECK(S) FAILED`}\n`);
    process.exitCode = failures === 0 ? 0 : 1;
  })
  .catch((error: unknown) => {
    console.error('\nآزمون اجرا نشد:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
