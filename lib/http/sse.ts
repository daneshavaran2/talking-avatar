import 'server-only';

/**
 * رویدادهای Server-Sent Events مسیر `/api/chat` (§۹.۱).
 *
 * هر رویداد `turnId` دارد تا کلاینت بتواند داده‌های نوبت‌های
 * لغوشده را دور بیندازد، حتی اگر دیر برسند (F8.3).
 */

export type ChatSseEvent =
  | { event: 'token'; data: { turnId: string; token: string } }
  | { event: 'sentence'; data: { turnId: string; sentence: string; index: number } }
  | {
      event: 'tool_call';
      data: { turnId: string; name: string; status: 'started' | 'success' | 'error' | 'timeout' };
    }
  | { event: 'refused'; data: { turnId: string; reason: string; layer: 'pre' | 'post' } }
  | { event: 'aborted'; data: { turnId: string; reason: string } }
  | {
      event: 'meta';
      data: {
        turnId: string;
        messageId?: string;
        ragUsed?: boolean;
        sources?: Array<{ title: string; page: number | null }>;
        topic?: string;
      };
    }
  | { event: 'done'; data: { turnId: string; latencyMs: number } }
  | { event: 'error'; data: { turnId: string; error: string } };

export type SseWriter = {
  send: (event: ChatSseEvent) => void;
  close: () => void;
  readonly closed: boolean;
};

/** یک ReadableStream به‌همراه نویسنده‌ای که رویدادها را در آن می‌گذارد. */
export function createSseStream(): { stream: ReadableStream<Uint8Array>; writer: SseWriter } {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
    cancel() {
      closed = true;
      controller = null;
    },
  });

  const writer: SseWriter = {
    send(event) {
      if (closed || !controller) return;
      const payload = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
      try {
        controller.enqueue(encoder.encode(payload));
      } catch {
        // کلاینت اتصال را بسته است.
        closed = true;
      }
    },
    close() {
      if (closed || !controller) return;
      closed = true;
      try {
        controller.close();
      } catch {
        // قبلاً بسته شده.
      }
      controller = null;
    },
    get closed() {
      return closed;
    },
  };

  return { stream, writer };
}

export const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  // جلوگیری از بافر کردن پاسخ توسط nginx — بدون این، Streaming
  // در استقرار پشت Reverse Proxy بی‌اثر می‌شود.
  'x-accel-buffering': 'no',
} as const;
