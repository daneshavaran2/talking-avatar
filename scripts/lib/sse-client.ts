/**
 * کلاینت کوچک SSE برای آزمون‌های یکپارچه.
 *
 * عمداً از کد کلاینت اپلیکیشن استفاده نمی‌کند: اگر آزمون و اپلیکیشن
 * از یک پیاده‌سازی استفاده کنند، خطای مشترک هر دو را با هم فریب
 * می‌دهد. اینجا فقط قرارداد سیم را می‌خوانیم (§۹.۱).
 */

export type SseEvent = { event: string; data: Record<string, unknown> };

export type TurnResult = {
  events: SseEvent[];
  /** متنی که کاربر می‌بیند (مجموع رویدادهای token) */
  text: string;
  /** جمله‌هایی که برای TTS بیرون رفتند، به ترتیب index */
  sentences: string[];
  status: number;
};

function eventsOfType(events: SseEvent[], type: string): SseEvent[] {
  return events.filter((e) => e.event === type);
}

export function refusal(result: TurnResult): { reason: string; layer: string } | null {
  const event = eventsOfType(result.events, 'refused')[0];
  if (!event) return null;
  return { reason: String(event.data.reason), layer: String(event.data.layer) };
}

export function toolEvents(result: TurnResult): Array<{ name: string; status: string }> {
  return eventsOfType(result.events, 'tool_call').map((e) => ({
    name: String(e.data.name),
    status: String(e.data.status),
  }));
}

export async function sendTurn(options: {
  baseUrl: string;
  conversationId: string;
  turnId: string;
  message: string;
  inputType?: 'text' | 'voice';
  timeoutMs?: number;
  /** شناسهٔ تلاش قبلی، وقتی این درخواست ادامهٔ یک نوبت قطع‌شده است */
  retryOfTurnId?: string;
}): Promise<TurnResult> {
  const post = () =>
    fetch(`${options.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        conversationId: options.conversationId,
        turnId: options.turnId,
        message: options.message,
        inputType: options.inputType ?? 'text',
        retryOfTurnId: options.retryOfTurnId,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });

  let response = await post();

  // محدودیت نرخ روی /api/chat فعال است (۳۰ در دقیقه). وقتی چند مجموعه
  // آزمون پشت سر هم اجرا می‌شوند طبیعی است که به سقف بخوریم؛ این
  // شکست آزمون نیست، پس همان‌قدر که سرور گفته صبر می‌کنیم.
  for (let attempt = 0; response.status === 429 && attempt < 2; attempt += 1) {
    const waitSeconds = Number(response.headers.get('retry-after') ?? '5');
    const waitMs = (Number.isFinite(waitSeconds) ? waitSeconds : 5) * 1000 + 500;
    console.log(`      (۴۲۹ از محدودیت نرخ — ${Math.round(waitMs / 1000)} ثانیه صبر)`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await post();
  }

  const events: SseEvent[] = [];
  if (!response.ok || !response.body) {
    return { events, text: '', sentences: [], status: response.status };
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';

  // هر رویداد SSE با یک خط خالی تمام می‌شود.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');

      let name = 'message';
      const dataLines: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) name = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;

      try {
        events.push({ event: name, data: JSON.parse(dataLines.join('\n')) });
      } catch {
        // رویداد بدشکل — همان‌طور که هست ثبت می‌شود تا آزمون ببیندش
        events.push({ event: name, data: { raw: dataLines.join('\n') } });
      }
    }
  }

  const sentenceEvents = eventsOfType(events, 'sentence')
    .map((e) => ({ index: Number(e.data.index ?? 0), sentence: String(e.data.sentence ?? '') }))
    .sort((a, b) => a.index - b.index);

  return {
    events,
    text: eventsOfType(events, 'token')
      .map((e) => String(e.data.token ?? ''))
      .join(''),
    sentences: sentenceEvents.map((s) => s.sentence),
    status: response.status,
  };
}
