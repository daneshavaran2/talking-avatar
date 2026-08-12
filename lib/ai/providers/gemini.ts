import 'server-only';
import type {
  ChatMessage,
  LLMOptions,
  LLMProvider,
  LLMStreamChunk,
  ToolSchema,
} from '@/lib/ai/types';
import { ProviderRequestError } from '@/lib/ai/types';
import { describeHttpError, readSse, safeJsonParse } from '@/lib/ai/stream-utils';

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
};

type GeminiChunk = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
};

/** پیام‌های داخلی را به قالب `contents` جمنای تبدیل می‌کند. */
function toGeminiContents(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'user' as const,
          parts: [
            {
              functionResponse: {
                name: m.toolName ?? 'tool',
                response: { result: m.content },
              },
            },
          ],
        };
      }
      return {
        role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: m.content }],
      };
    });
}

function toGeminiTools(tools: ToolSchema[]) {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: { apiKey: string; model: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl || DEFAULT_BASE;
  }

  async *stream(messages: ChatMessage[], options: LLMOptions = {}): AsyncIterable<LLMStreamChunk> {
    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse`;

    const body: Record<string, unknown> = {
      contents: toGeminiContents(messages),
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 1024,
      },
    };

    if (options.systemPrompt) {
      body.systemInstruction = { parts: [{ text: options.systemPrompt }] };
    }
    if (options.tools?.length) {
      body.tools = toGeminiTools(options.tools);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok || !response.body) {
      throw new ProviderRequestError('llm', await describeHttpError(response), response.status);
    }

    let sawToolCall = false;
    let finishReason: 'stop' | 'length' | 'tool_calls' = 'stop';
    let toolCallIndex = 0;

    for await (const event of readSse(response.body, options.signal)) {
      if (options.signal?.aborted) {
        yield { type: 'done', finishReason: 'aborted' };
        return;
      }

      const parsed = safeJsonParse<GeminiChunk>(event.data);
      const candidate = parsed?.candidates?.[0];
      if (!candidate) continue;

      for (const part of candidate.content?.parts ?? []) {
        if (part.text) {
          yield { type: 'text', text: part.text };
        }
        if (part.functionCall) {
          sawToolCall = true;
          yield {
            type: 'tool_call',
            id: `gemini-tool-${toolCallIndex++}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args ?? {},
          };
        }
      }

      if (candidate.finishReason === 'MAX_TOKENS') finishReason = 'length';
    }

    yield { type: 'done', finishReason: sawToolCall ? 'tool_calls' : finishReason };
  }
}
