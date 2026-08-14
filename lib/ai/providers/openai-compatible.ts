import 'server-only';
import type { ChatMessage, LLMOptions, LLMProvider, LLMStreamChunk } from '@/lib/ai/types';
import { ProviderRequestError } from '@/lib/ai/types';
import { describeHttpError, readSse, safeJsonParse } from '@/lib/ai/stream-utils';
import { fetchWithRetry, logRetry } from '@/lib/http/retry';

/**
 * پیاده‌سازی مشترک برای هر سرویسی که API سازگار با OpenAI دارد
 * (OpenAI، Groq، Together، vLLM، LM Studio و …). تفاوت فقط در
 * آدرس پایه است.
 */

type Delta = {
  content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
};

type StreamChunk = {
  choices?: Array<{ delta?: Delta; finish_reason?: string | null }>;
};

type PendingToolCall = { id: string; name: string; args: string };

export class OpenAiCompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: { name: string; apiKey: string; model: string; baseUrl: string }) {
    this.name = config.name;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
  }

  async *stream(messages: ChatMessage[], options: LLMOptions = {}): AsyncIterable<LLMStreamChunk> {
    const payload: ChatMessage[] = options.systemPrompt
      ? [{ role: 'system', content: options.systemPrompt }, ...messages]
      : messages;

    const body: Record<string, unknown> = {
      model: this.model,
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
      messages: payload.map((m) =>
        m.role === 'tool'
          ? { role: 'tool', content: m.content, tool_call_id: m.toolCallId ?? m.toolName ?? 'tool' }
          : { role: m.role, content: m.content },
      ),
    };

    if (options.tools?.length) {
      body.tools = options.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      body.tool_choice = 'auto';
    }

    const response = await fetchWithRetry(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: options.signal,
      },
      { signal: options.signal, onRetry: logRetry('llm') },
    );

    if (!response.ok || !response.body) {
      throw new ProviderRequestError('llm', await describeHttpError(response), response.status);
    }

    // آرگومان‌های ابزار به‌صورت تکه‌تکه می‌رسند و باید تجمیع شوند.
    const pending = new Map<number, PendingToolCall>();
    let finishReason: 'stop' | 'length' | 'tool_calls' = 'stop';

    for await (const event of readSse(response.body, options.signal)) {
      if (options.signal?.aborted) {
        yield { type: 'done', finishReason: 'aborted' };
        return;
      }
      if (event.data === '[DONE]') break;

      const chunk = safeJsonParse<StreamChunk>(event.data);
      const choice = chunk?.choices?.[0];
      if (!choice) continue;

      const text = choice.delta?.content;
      if (text) yield { type: 'text', text };

      for (const call of choice.delta?.tool_calls ?? []) {
        const existing = pending.get(call.index) ?? { id: '', name: '', args: '' };
        pending.set(call.index, {
          id: call.id ?? existing.id,
          name: call.function?.name ?? existing.name,
          args: existing.args + (call.function?.arguments ?? ''),
        });
      }

      if (choice.finish_reason === 'length') finishReason = 'length';
      if (choice.finish_reason === 'tool_calls') finishReason = 'tool_calls';
    }

    for (const [index, call] of pending) {
      if (!call.name) continue;
      finishReason = 'tool_calls';
      yield {
        type: 'tool_call',
        id: call.id || `${this.name}-tool-${index}`,
        name: call.name,
        arguments: safeJsonParse<Record<string, unknown>>(call.args || '{}') ?? {},
      };
    }

    yield { type: 'done', finishReason };
  }
}
