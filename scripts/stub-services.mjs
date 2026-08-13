/**
 * سرور محلی که پروتکل‌های سرویس‌های بیرونی را پیاده می‌کند تا کل
 * زنجیرهٔ مکالمه → ابزار → صدا → لیپ‌سینک بدون سرویس ابری آزمایش شود:
 *
 *   /api/chat, /api/embed   → پروتکل Ollama (مدل زبانی و تعبیه‌سازی)
 *   /tts/stream             → پروتکل media-engine (صدای WAV واقعی)
 *   /webhook/<path>         → پروتکل n8n (با بررسی واقعی امضای HMAC)
 *
 * هیچ چیزی در اپلیکیشن برای این آزمون تغییر نکرده؛ فقط LLM_BASE_URL و
 * MEDIA_ENGINE_URL و N8N_BASE_URL به اینجا اشاره می‌کنند، پس کد واقعی
 * OllamaProvider و MediaEngineTtsProvider و N8nToolProvider اجرا می‌شود.
 *
 * ⚠️ این سرور فقط ابزار آزمون است. جای سرویس واقعی را نمی‌گیرد:
 * پاسخ مدل از یک جدول مسیریابیِ ثابت می‌آید، نه از یک مدل زبانی.
 * آنچه آزموده می‌شود مسیر داده است، نه کیفیت پاسخ.
 *
 *   node scripts/stub-services.mjs           # پورت پیش‌فرض ۱۱۵۰۰
 *   PORT=11500 N8N_WEBHOOK_SECRET=... node scripts/stub-services.mjs
 */
import { createServer } from 'node:http';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 11500);
const WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET ?? 'stub-webhook-secret';
const DIM = 1536;
const SAMPLE_RATE = 24000;

function embed(text) {
  const vector = new Float64Array(DIM);
  for (const word of text.toLowerCase().split(/\s+/).filter(Boolean)) {
    const digest = createHash('sha256').update(word).digest();
    for (let k = 0; k < 8; k += 1) {
      vector[digest.readUInt16BE(k * 2) % DIM] += digest[k + 16] % 2 === 0 ? 1 : -1;
    }
  }
  let magnitude = 0;
  for (const v of vector) magnitude += v * v;
  magnitude = Math.sqrt(magnitude) || 1;
  return Array.from(vector, (v) => v / magnitude);
}

/**
 * ساخت WAV واقعی: طول متناسب با متن، با دامنهٔ متغیر تا تحلیلگر
 * دامنهٔ صف صدا چیزی برای اندازه‌گیری داشته باشد.
 */
function buildWav(text) {
  const seconds = Math.max(0.6, Math.min(6, text.length * 0.07));
  const samples = Math.floor(SAMPLE_RATE * seconds);
  const pcm = Buffer.alloc(samples * 2);

  for (let i = 0; i < samples; i += 1) {
    const t = i / SAMPLE_RATE;
    // پاکت هجایی: دامنه با ~۴ هرتز بالا و پایین می‌رود، مثل گفتار
    const envelope = 0.35 + 0.65 * Math.abs(Math.sin(2 * Math.PI * 4 * t));
    const carrier = Math.sin(2 * Math.PI * 140 * t) * 0.6 + Math.sin(2 * Math.PI * 320 * t) * 0.3;
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, carrier * envelope * 22000)), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return { wav: Buffer.concat([header, pcm]), seconds };
}

// ── پاسخ‌های n8n ────────────────────────────────────────────────
// بدنهٔ پاسخ همان شکلی است که یک Workflow واقعی برمی‌گرداند: JSON
// تخت با کلیدهای معنادار، نه متن آزاد.
const WEBHOOK_RESPONSES = {
  'get-price': (args) => ({
    productId: args.productId ?? 'نامشخص',
    price: 4850000,
    currency: 'ریال',
    quantity: args.quantity ?? 1,
    updatedAt: new Date().toISOString(),
  }),
  'get-inventory': (args) => ({ productId: args.productId ?? 'نامشخص', inStock: 12 }),
  'get-product': (args) => ({
    query: args.query ?? '',
    title: 'دستگاه نمونه مدل A',
    status: 'available',
  }),
  'get-order-status': (args) => ({
    orderId: args.orderId ?? '',
    status: 'ارسال شده',
    trackingCode: 'IR-99120045',
  }),
  'create-lead': (args) => ({ leadId: 'LEAD-1042', name: args.name ?? '' }),
  'send-catalog': (args) => ({ sent: true, destination: args.destination ?? '' }),
  'book-meeting': (args) => ({ meetingId: 'MTG-77', at: args.preferredTime ?? '' }),
  'create-support-ticket': () => ({ ticketId: 'TCK-3391', slaHours: 24 }),
};

/**
 * آزمون Timeout (§F9.5): اگر شناسهٔ محصول SLOW-TEST باشد، Workflow
 * عمداً هیچ‌وقت پاسخ نمی‌دهد تا مهلت سمت اپلیکیشن فعال شود.
 */
function isDeliberatelySlow(args) {
  return String(args.productId ?? args.query ?? '').includes('SLOW-TEST');
}

function verifySignature(rawBody, signature) {
  if (!signature) return false;
  const expected = Buffer.from(
    createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex'),
    'utf8',
  );
  const received = Buffer.from(signature, 'utf8');
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

// ── پاسخ مدل زبانی ──────────────────────────────────────────────
/**
 * جدول مسیریابی پاسخ مدل. ورودی همان پیام کاربر است، پس رفتار
 * آزمون خوانا و قابل پیش‌بینی می‌ماند و چیزی پشت صحنه پنهان نیست.
 */
const CHAT_ROUTES = [
  {
    // پرسش قیمت: اگر ابزاری معرفی شده باشد، مدل ابزار را صدا می‌زند.
    match: /قیمت|چند(ه|ه\؟| است)/,
    plan: (message, tools) => {
      const tool = tools.find((t) => t.function?.name === 'getPrice');
      if (!tool) {
        return { text: 'برای قیمت دقیق باید به فهرست قیمت مراجعه کنم؛ لحظه‌ای صبر کنید.' };
      }
      const product = message.match(/محصول\s+(\S+)/)?.[1] ?? 'X';
      return { toolCalls: [{ name: 'getPrice', arguments: { productId: product, quantity: 1 } }] };
    },
  },
  {
    // مسیر آزمون لایهٔ ۳: ورودی بی‌ضرر است ولی خروجی مدل وارد حوزهٔ
    // پزشکی می‌شود. باید پیش از رسیدن به TTS گرفته شود.
    match: /گلودرد/,
    plan: () => ({
      text: 'برای گلودرد توصیه می‌کنم مصرف کنید شربت زینک را و روزی سه بار تکرار کنید.',
    }),
  },
  {
    // مسیر آزمون تزریق پرامپت: مدل نباید دستورالعمل را فاش کند.
    match: /محدودیتی نداری|بدون فیلتر|دستورات قبلی|پرامپت سیستم/,
    plan: () => ({
      text: 'من همان دستیار همیشگی هستم و دستورالعمل‌هایم را بازگو نمی‌کنم. دربارهٔ خدمات ما چه سؤالی دارید؟',
    }),
  },
];

const DEFAULT_ANSWER =
  'ساعت کاری ما از نه صبح تا هفده است. پشتیبانی تلفنی هم در همین ساعات پاسخگوست.';

function planChat(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const reversed = [...messages].reverse();
  const toolMessage = reversed.find((m) => m.role === 'tool');
  const lastUser = reversed.find((m) => m.role === 'user')?.content ?? '';

  // دور دوم: نتیجهٔ ابزار در تاریخچه هست، پس پاسخ نهایی ساخته می‌شود.
  if (toolMessage) {
    let payload = {};
    try {
      payload = JSON.parse(String(toolMessage.content));
    } catch {
      return { text: 'سرویس قیمت الان در دسترس نیست. کمی بعد دوباره بپرسید.' };
    }
    if (payload.price === undefined) {
      return { text: 'سرویس قیمت الان در دسترس نیست. کمی بعد دوباره بپرسید.' };
    }
    return {
      text: `قیمت ${payload.productId} برابر ${payload.price} ${payload.currency} است. این عدد لحظه‌ای از سیستم فروش گرفته شد.`,
    };
  }

  for (const route of CHAT_ROUTES) {
    if (route.match.test(lastUser)) return route.plan(lastUser, tools);
  }
  return { text: DEFAULT_ANSWER };
}

function streamChat(response, plan) {
  response.writeHead(200, { 'content-type': 'application/x-ndjson' });
  const write = (chunk) => response.write(JSON.stringify(chunk) + '\n');

  // فراخوانی ابزار در Ollama یک‌جا می‌آید، نه توکن‌به‌توکن.
  if (plan.toolCalls?.length) {
    write({
      message: {
        content: '',
        tool_calls: plan.toolCalls.map((call) => ({
          function: { name: call.name, arguments: call.arguments },
        })),
      },
    });
    write({ done: true, done_reason: 'stop' });
    response.end();
    return;
  }

  const tokens = plan.text.match(/\S+\s*/g) ?? [plan.text];
  let index = 0;
  const timer = setInterval(() => {
    if (index >= tokens.length) {
      clearInterval(timer);
      write({ done: true, done_reason: 'stop' });
      response.end();
      return;
    }
    write({ message: { content: tokens[index] } });
    index += 1;
  }, 15);
  response.on('close', () => clearInterval(timer));
}

async function readRaw(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (request, response) => {
  const raw = await readRaw(request);
  const url = (request.url ?? '').split('?')[0];
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }

  if (url === '/api/embed') {
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ embeddings: inputs.map((t) => embed(String(t))) }));
    return;
  }

  if (url === '/api/chat') {
    streamChat(response, planChat(body));
    return;
  }

  if (url === '/tts/stream') {
    const { wav, seconds } = buildWav(String(body.text ?? ''));
    process.stdout.write(`TTS "${String(body.text).slice(0, 40)}" → ${seconds.toFixed(2)}s\n`);
    response.writeHead(200, { 'content-type': 'audio/wav', 'content-length': wav.length });
    response.end(wav);
    return;
  }

  if (url.startsWith('/webhook/')) {
    const path = url.slice('/webhook/'.length);
    const signature = request.headers['x-signature'];

    // F9.4 — بدون امضای معتبر هیچ منطق کسب‌وکاری اجرا نمی‌شود.
    if (!verifySignature(raw, Array.isArray(signature) ? signature[0] : signature)) {
      process.stdout.write(`n8n ${path} ← امضای نامعتبر، رد شد\n`);
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid signature' }));
      return;
    }

    if (!(path in WEBHOOK_RESPONSES)) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'workflow not found' }));
      return;
    }

    const args = body.arguments ?? {};
    if (isDeliberatelySlow(args)) {
      process.stdout.write(`n8n ${path} ← عمداً بی‌پاسخ (آزمون Timeout)\n`);
      return; // پاسخی نمی‌دهیم تا مهلت سمت اپلیکیشن فعال شود
    }

    const build = WEBHOOK_RESPONSES[path];
    process.stdout.write(`n8n ${path} ← امضا تأیید شد · ${JSON.stringify(args)}\n`);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(build(args)));
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => process.stdout.write(`stub services on ${PORT}\n`));
