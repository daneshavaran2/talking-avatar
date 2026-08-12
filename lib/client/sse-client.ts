'use client';

/**
 * مصرف‌کنندهٔ Server-Sent Events سمت مرورگر.
 *
 * چرا `EventSource` استفاده نشده: EventSource فقط GET می‌فرستد و
 * هدر یا بدنه نمی‌پذیرد. مسیر چت باید POST باشد، پس استریم را
 * مستقیم از `fetch` می‌خوانیم.
 */

export type ParsedSseEvent = { event: string; data: unknown };

export async function* streamSse(
  url: string,
  body: unknown,
  signal: AbortSignal,
): AsyncGenerator<ParsedSseEvent> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    let message = 'ارتباط با سرور برقرار نشد.';
    try {
      const error = (await response.json()) as { error?: string };
      if (error.error) message = error.error;
    } catch {
      /* بدنهٔ خطا JSON نبود */
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal.aborted) return;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const parsed = parseEvent(raw);
        if (parsed) yield parsed;

        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseEvent(raw: string): ParsedSseEvent | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
  }

  if (dataLines.length === 0) return null;

  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}
