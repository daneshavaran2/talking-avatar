import 'server-only';
import type { EmbeddingKind, EmbeddingProvider } from '@/lib/ai/types';
import { ProviderNotConfiguredError, ProviderRequestError } from '@/lib/ai/types';
import { env } from '@/lib/config/env';
import { describeHttpError } from '@/lib/ai/stream-utils';

/**
 * تعبیه‌سازی متن برای RAG.
 *
 * همهٔ خروجی‌ها به بردار واحد (طول ۱) نرمال می‌شوند تا فاصلهٔ
 * کسینوسی در pgvector بین سرویس‌های مختلف رفتار یکسانی داشته باشد
 * — جمنای وقتی ابعاد خروجی را کم می‌کند بردار را نرمال نمی‌کند.
 */

function normalize(vector: number[]): number[] {
  let sumOfSquares = 0;
  for (const value of vector) sumOfSquares += value * value;
  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const OPENAI_BASE = 'https://api.openai.com/v1';
const OLLAMA_BASE = 'http://localhost:11434';

class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'gemini';
  constructor(
    readonly model: string,
    readonly dimensions: number,
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  async embed(texts: string[], kind: EmbeddingKind, signal?: AbortSignal): Promise<number[][]> {
    if (texts.length === 0) return [];

    const taskType = kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
    const response = await fetch(
      `${this.baseUrl}/models/${encodeURIComponent(this.model)}:batchEmbedContents`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${this.model}`,
            content: { parts: [{ text }] },
            taskType,
            outputDimensionality: this.dimensions,
          })),
        }),
        signal,
      },
    );

    if (!response.ok) {
      throw new ProviderRequestError(
        'embedding',
        await describeHttpError(response),
        response.status,
      );
    }

    const body = (await response.json()) as { embeddings?: Array<{ values?: number[] }> };
    return (body.embeddings ?? []).map((e) => normalize(e.values ?? []));
  }
}

class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  constructor(
    readonly model: string,
    readonly dimensions: number,
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  async embed(texts: string[], _kind: EmbeddingKind, signal?: AbortSignal): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: texts, dimensions: this.dimensions }),
      signal,
    });

    if (!response.ok) {
      throw new ProviderRequestError(
        'embedding',
        await describeHttpError(response),
        response.status,
      );
    }

    const body = (await response.json()) as {
      data?: Array<{ embedding: number[]; index: number }>;
    };
    const rows = [...(body.data ?? [])].sort((a, b) => a.index - b.index);
    return rows.map((row) => normalize(row.embedding));
  }
}

class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'ollama';
  constructor(
    readonly model: string,
    readonly dimensions: number,
    private readonly baseUrl: string,
  ) {}

  async embed(texts: string[], _kind: EmbeddingKind, signal?: AbortSignal): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
      signal,
    });

    if (!response.ok) {
      throw new ProviderRequestError(
        'embedding',
        await describeHttpError(response),
        response.status,
      );
    }

    const body = (await response.json()) as { embeddings?: number[][] };
    return (body.embeddings ?? []).map(normalize);
  }
}

export function createEmbeddingProvider(): EmbeddingProvider {
  const model = env.embeddingModel;
  const dimensions = env.embeddingDim;
  const apiKey = env.embeddingApiKey;
  const baseUrl = env.embeddingBaseUrl;

  if (!model) {
    throw new ProviderNotConfiguredError('embedding', 'مدل تعبیه‌سازی تنظیم نشده (EMBEDDING_MODEL).');
  }

  switch (env.embeddingProvider) {
    case 'gemini':
      if (!apiKey) throw new ProviderNotConfiguredError('embedding', 'کلید API تعبیه‌سازی تنظیم نشده.');
      return new GeminiEmbeddingProvider(model, dimensions, apiKey, baseUrl || GEMINI_BASE);

    case 'openai':
      if (!apiKey) throw new ProviderNotConfiguredError('embedding', 'کلید API تعبیه‌سازی تنظیم نشده.');
      return new OpenAiEmbeddingProvider(model, dimensions, apiKey, baseUrl || OPENAI_BASE);

    case 'ollama':
      return new OllamaEmbeddingProvider(model, dimensions, baseUrl || OLLAMA_BASE);

    default:
      throw new ProviderNotConfiguredError(
        'embedding',
        `سرویس ناشناختهٔ «${env.embeddingProvider}» برای تعبیه‌سازی.`,
      );
  }
}
