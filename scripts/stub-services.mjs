/**
 * سرور محلی که سه پروتکل را پیاده می‌کند تا زنجیرهٔ کامل
 * مکالمه → صدا → لیپ‌سینک بدون سرویس ابری آزمایش شود:
 *
 *   /api/chat, /api/embed   → پروتکل Ollama (مدل زبانی و تعبیه‌سازی)
 *   /tts/stream             → پروتکل media-engine (صدای WAV واقعی)
 *
 * هیچ چیزی در اپلیکیشن برای این آزمون تغییر نکرده؛ فقط
 * LLM_BASE_URL و MEDIA_ENGINE_URL به اینجا اشاره می‌کنند، پس کد
 * واقعی OllamaProvider و MediaEngineTtsProvider اجرا می‌شود.
 */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

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

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const server = createServer(async (request, response) => {
  const body = await readBody(request);
  const url = (request.url ?? '').split('?')[0];

  if (url === '/api/embed') {
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ embeddings: inputs.map((t) => embed(String(t))) }));
    return;
  }

  if (url === '/api/chat') {
    const answer =
      'ساعت کاری ما از نه صبح تا هفده است. پشتیبانی تلفنی هم در همین ساعات پاسخگوست.';
    response.writeHead(200, { 'content-type': 'application/x-ndjson' });

    const tokens = answer.match(/\S+\s*/g) ?? [answer];
    let index = 0;
    const timer = setInterval(() => {
      if (index >= tokens.length) {
        clearInterval(timer);
        response.write(JSON.stringify({ done: true, done_reason: 'stop' }) + '\n');
        response.end();
        return;
      }
      response.write(JSON.stringify({ message: { content: tokens[index] } }) + '\n');
      index += 1;
    }, 15);
    request.on('close', () => clearInterval(timer));
    return;
  }

  if (url === '/tts/stream') {
    const { wav, seconds } = buildWav(String(body.text ?? ''));
    process.stdout.write(`TTS "${String(body.text).slice(0, 40)}" → ${seconds.toFixed(2)}s\n`);
    response.writeHead(200, { 'content-type': 'audio/wav', 'content-length': wav.length });
    response.end(wav);
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not found' }));
});

server.listen(11500, () => process.stdout.write('stub services on 11500\n'));
