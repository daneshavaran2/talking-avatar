import 'server-only';
import type { ChatMessage, LLMOptions, LLMProvider, LLMStreamChunk } from '@/lib/ai/types';
import { ProviderRequestError } from '@/lib/ai/types';
import { describeHttpError, readLines, safeJsonParse } from '@/lib/ai/stream-utils';
import { fetchWithRetry, logRetry } from '@/lib/http/retry';

const DEFAULT_BASE = 'http://localhost:11434';

/** پاسخ Ollama به‌صورت NDJSON است، نه SSE. */
type OllamaChunk = {
  message?: {
    content?: string;
    tool_calls?: Array<{ function?: { name?: string; arguments?: Record<string, unknown> } }>;
  };
  done?: boolean;
  done_reason?: string;
};

/** مدل زبانی محلی — بدون هزینهٔ متغیر و بدون ارسال داده به بیرون. */
export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  readonly model: string;
  private readonly baseUrl: string;

  constructor(config: { model: string; baseUrl?: string }) {
    this.model = config.model;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
  }

  async *stream(messages: ChatMessage[], options: LLMOptions = {}): AsyncIterable<LLMStreamChunk> {
    const payload: ChatMessage[] = options.systemPrompt
      ? [{ role: 'system', content: options.systemPrompt }, ...messages]
      : messages;

    const body: Record<string, unknown> = {
      model: this.model,
      stream: true,
      messages: payload.map((m) => ({
        role: m.role === 'tool' ? 'tool' : m.role,
        content: m.content,
      })),
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 1024,
      },
    };

    if (options.tools?.length) {
      body.tools = options.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const response = await fetchWithRetry(
      `${this.baseUrl}/api/chat`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: options.signal,
      },
      { signal: options.signal, onRetry: logRetry('llm') },
    );

    if (!response.ok || !response.body) {
      throw new ProviderRequestError('llm', await describeHttpError(response), response.status);
    }

    let sawToolCall = false;
    let finishReason: 'stop' | 'length' | 'tool_calls' = 'stop';
    let toolIndex = 0;

    for await (const line of readLines(response.body, options.signal)) {
      if (options.signal?.aborted) {
        yield { type: 'done', finishReason: 'aborted' };
        return;
      }
      if (!line.trim()) continue;

      const chunk = safeJsonParse<OllamaChunk>(line);
      if (!chunk) continue;

      const text = chunk.message?.content;
      if (text) yield { type: 'text', text };

      for (const call of chunk.message?.tool_calls ?? []) {
        const name = call.function?.name;
        if (!name) continue;
        sawToolCall = true;
        yield {
          type: 'tool_call',
          id: `ollama-tool-${toolIndex++}`,
          name,
          arguments: call.function?.arguments ?? {},
        };
      }

      if (chunk.done) {
        if (chunk.done_reason === 'length') finishReason = 'length';
        break;
      }
    }

    yield { type: 'done', finishReason: sawToolCall ? 'tool_calls' : finishReason };
  }
}
