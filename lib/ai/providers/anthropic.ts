import 'server-only';
import type { ChatMessage, LLMOptions, LLMProvider, LLMStreamChunk } from '@/lib/ai/types';
import { ProviderRequestError } from '@/lib/ai/types';
import { describeHttpError, readSse, safeJsonParse } from '@/lib/ai/stream-utils';
import { fetchWithRetry, logRetry } from '@/lib/http/retry';

const DEFAULT_BASE = 'https://api.anthropic.com/v1';
const API_VERSION = '2023-06-01';

type StreamEvent = {
  type: string;
  index?: number;
  content_block?: { type: string; id?: string; name?: string };
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
};

type PendingToolCall = { id: string; name: string; args: string };

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: { apiKey: string; model: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
  }

  async *stream(messages: ChatMessage[], options: LLMOptions = {}): AsyncIterable<LLMStreamChunk> {
    const body: Record<string, unknown> = {
      model: this.model,
      stream: true,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      messages: messages
        .filter((m) => m.role !== 'system')
        .map((m) =>
          m.role === 'tool'
            ? {
                role: 'user' as const,
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: m.toolCallId ?? m.toolName ?? 'tool',
                    content: m.content,
                  },
                ],
              }
            : { role: m.role as 'user' | 'assistant', content: m.content },
        ),
    };

    if (options.systemPrompt) body.system = options.systemPrompt;
    if (options.tools?.length) {
      body.tools = options.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const response = await fetchWithRetry(
      `${this.baseUrl}/messages`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify(body),
        signal: options.signal,
      },
      { signal: options.signal, onRetry: logRetry('llm') },
    );

    if (!response.ok || !response.body) {
      throw new ProviderRequestError('llm', await describeHttpError(response), response.status);
    }

    const pending = new Map<number, PendingToolCall>();
    let finishReason: 'stop' | 'length' | 'tool_calls' = 'stop';

    for await (const event of readSse(response.body, options.signal)) {
      if (options.signal?.aborted) {
        yield { type: 'done', finishReason: 'aborted' };
        return;
      }

      const parsed = safeJsonParse<StreamEvent>(event.data);
      if (!parsed) continue;

      switch (parsed.type) {
        case 'content_block_start': {
          if (parsed.content_block?.type === 'tool_use' && parsed.index !== undefined) {
            pending.set(parsed.index, {
              id: parsed.content_block.id ?? `anthropic-tool-${parsed.index}`,
              name: parsed.content_block.name ?? '',
              args: '',
            });
          }
          break;
        }
        case 'content_block_delta': {
          if (parsed.delta?.text) {
            yield { type: 'text', text: parsed.delta.text };
          }
          if (parsed.delta?.partial_json !== undefined && parsed.index !== undefined) {
            const existing = pending.get(parsed.index);
            if (existing) existing.args += parsed.delta.partial_json;
          }
          break;
        }
        case 'message_delta': {
          if (parsed.delta?.stop_reason === 'max_tokens') finishReason = 'length';
          if (parsed.delta?.stop_reason === 'tool_use') finishReason = 'tool_calls';
          break;
        }
        default:
          break;
      }
    }

    for (const call of pending.values()) {
      if (!call.name) continue;
      finishReason = 'tool_calls';
      yield {
        type: 'tool_call',
        id: call.id,
        name: call.name,
        arguments: safeJsonParse<Record<string, unknown>>(call.args || '{}') ?? {},
      };
    }

    yield { type: 'done', finishReason };
  }
}
