import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ToolCallResult, ToolProvider, ToolSchema } from '@/lib/ai/types';
import { ProviderNotConfiguredError } from '@/lib/ai/types';
import { env } from '@/lib/config/env';
import { enabledToolSchemas, findTool } from '@/lib/tools/registry';
import { isTimeoutError, withTimeout } from '@/lib/ai/stream-utils';

/**
 * دروازهٔ n8n (§F9).
 *
 * امنیت (F9.4): هر درخواست با HMAC-SHA256 روی بدنه امضا می‌شود.
 * Workflow سمت n8n باید همین امضا را با کلید مشترک بررسی کند —
 * بدون آن، هر کسی که آدرس Webhook را بداند می‌تواند سیستم‌های
 * کسب‌وکار را صدا بزند.
 */

export class N8nToolProvider implements ToolProvider {
  readonly name = 'n8n';

  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
    private readonly enabledNames: string[],
  ) {}

  listTools(): ToolSchema[] {
    return enabledToolSchemas(this.enabledNames);
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolCallResult> {
    const definition = findTool(name);
    if (!definition) {
      return { ok: false, error: `ابزار ناشناخته: ${name}` };
    }
    if (!this.enabledNames.includes(name)) {
      return { ok: false, error: `ابزار «${name}» فعال نیست.` };
    }

    const body = JSON.stringify({ tool: name, arguments: args, requestedAt: Date.now() });
    const { signal: timedSignal, cleanup } = withTimeout(signal, definition.timeoutMs);

    try {
      const response = await fetch(
        `${this.baseUrl.replace(/\/$/, '')}/webhook/${definition.webhookPath}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-signature': signPayload(body, this.secret),
          },
          body,
          signal: timedSignal,
        },
      );

      if (!response.ok) {
        return { ok: false, error: `سرویس بیرونی پاسخ ${response.status} داد.` };
      }

      const contentType = response.headers.get('content-type') ?? '';
      const data = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

      return { ok: true, data };
    } catch (error) {
      // تفکیک Timeout از خطاهای دیگر، چون پیام کاربر فرق می‌کند (F9.5).
      // اگر سیگنال بیرونی لغو شده باشد، این Barge-In است نه کندی سرویس.
      const timedOut = isTimeoutError(error) && !signal?.aborted;

      return {
        ok: false,
        timedOut,
        error: timedOut
          ? `سرویس بیرونی در ${definition.timeoutMs} میلی‌ثانیه پاسخ نداد.`
          : error instanceof Error
            ? error.message
            : 'خطای ناشناخته در فراخوانی ابزار.',
      };
    } finally {
      cleanup();
    }
  }
}

/** وقتی n8n پیکربندی نشده، هیچ ابزاری به مدل معرفی نمی‌شود. */
export class NoToolProvider implements ToolProvider {
  readonly name = 'none';

  listTools(): ToolSchema[] {
    return [];
  }

  async execute(name: string): Promise<ToolCallResult> {
    return { ok: false, error: `ابزار «${name}» در دسترس نیست: اتوماسیون پیکربندی نشده است.` };
  }
}

export function createToolProvider(enabledNames: string[]): ToolProvider {
  if (!env.n8nBaseUrl || enabledNames.length === 0) return new NoToolProvider();

  if (!env.n8nWebhookSecret) {
    // بدون کلید مشترک، Webhook احراز هویت ندارد؛ بهتر است ابزار
    // غیرفعال بماند تا اینکه ناامن کار کند (F9.4).
    throw new ProviderNotConfiguredError(
      'tool',
      'کلید مخفی Webhook تنظیم نشده است (N8N_WEBHOOK_SECRET).',
    );
  }

  return new N8nToolProvider(env.n8nBaseUrl, env.n8nWebhookSecret, enabledNames);
}

export function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** بررسی امضای درخواست‌های ورودی از n8n (اگر Callback تعریف شود). */
export function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(signPayload(payload, secret), 'utf8');
  const received = Buffer.from(signature, 'utf8');
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
