/**
 * لایهٔ Provider-Agnostic — §۵.۳ سند محصول.
 *
 * قواعد این لایه:
 *  ۱. هر متد جریانی باید `AsyncIterable` برگرداند، نه Promise از نتیجهٔ کامل.
 *  ۲. هر متد باید `AbortSignal` بپذیرد تا Barge-In (§F8) قابل پیاده‌سازی باشد.
 *  ۳. مصرف‌کنندگان (Route Handlerها و کامپوننت‌ها) هرگز نباید یک
 *     پیاده‌سازی مشخص را ایمپورت کنند؛ فقط Factory و همین Interfaceها.
 */

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type ChatMessage = {
  role: MessageRole;
  content: string;
  /** فقط برای پیام‌های نقش tool */
  toolName?: string;
  toolCallId?: string;
};

export type ToolSchema = {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
  };
};

export type JsonSchemaProperty = {
  type: 'string' | 'number' | 'integer' | 'boolean';
  description?: string;
  enum?: string[];
};

export type LLMOptions = {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolSchema[];
  signal?: AbortSignal;
};

export type LLMStreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'done'; finishReason: 'stop' | 'length' | 'tool_calls' | 'aborted' };

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  stream(messages: ChatMessage[], options?: LLMOptions): AsyncIterable<LLMStreamChunk>;
}

// ── تعبیه‌سازی (برای RAG) ────────────────────────────────────

export type EmbeddingKind = 'document' | 'query';

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[], kind: EmbeddingKind, signal?: AbortSignal): Promise<number[][]>;
}

// ── گفتار ────────────────────────────────────────────────────

export type STTResult = {
  text: string;
  /** `false` یعنی متن جزئی و در حال تغییر است (F5.3) */
  isFinal: boolean;
  confidence?: number;
};

export interface STTProvider {
  readonly name: string;
  transcribeStream(
    audio: AsyncIterable<Uint8Array>,
    signal?: AbortSignal,
  ): AsyncIterable<STTResult>;
}

export type TTSOptions = {
  voiceId?: string;
  /** قالب خروجی؛ پیش‌فرض mp3 چون در همهٔ مرورگرها قابل پخش است. */
  format?: 'mp3' | 'pcm16';
  speed?: number;
  signal?: AbortSignal;
};

export interface TTSProvider {
  readonly name: string;
  /** ساخت صدا به‌صورت جریانی — انتظار برای فایل کامل ممنوع است (F6.1). */
  synthesizeStream(text: string, options?: TTSOptions): AsyncIterable<Uint8Array>;
  /** ساخت پروفایل صوتی. یک‌بار اجرا می‌شود و نتیجه Cache می‌شود (F2.4). */
  cloneVoice?(sample: {
    data: Uint8Array;
    fileName: string;
    mimeType: string;
    displayName: string;
  }): Promise<{ voiceId: string }>;
  readonly supportsCloning: boolean;
}

// ── آواتار ───────────────────────────────────────────────────

export type AvatarFrame = {
  /** فریم کدشده (JPEG/WebP) یا قطعهٔ ویدئویی */
  data: Uint8Array;
  encoding: 'jpeg' | 'webp' | 'h264';
  index: number;
  timestampMs: number;
};

export interface AvatarProvider {
  readonly name: string;
  readonly available: boolean;
  renderStream(
    audio: AsyncIterable<Uint8Array>,
    signal?: AbortSignal,
  ): AsyncIterable<AvatarFrame>;
  /** آدرس حلقهٔ Idle از پیش تولیدشده (F1.4). */
  getIdleLoopUrl(): Promise<string | null>;
  /** پیش‌پردازش عکس: تشخیص چهره، برش، نقاط کلیدی، ساخت حلقهٔ Idle. */
  prepareFace?(image: {
    data: Uint8Array;
    fileName: string;
    mimeType: string;
  }): Promise<FacePreparation>;
}

export type FacePreparation = {
  faceCount: number;
  landmarks?: unknown;
  embedding?: unknown;
  idleLoopUrl?: string;
  width?: number;
  height?: number;
};

// ── ابزارها ──────────────────────────────────────────────────

export type ToolCallResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  timedOut?: boolean;
};

export interface ToolProvider {
  readonly name: string;
  listTools(): ToolSchema[];
  execute(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolCallResult>;
}

// ── خطای مشترک لایهٔ Provider ────────────────────────────────

export class ProviderNotConfiguredError extends Error {
  readonly service: string;

  constructor(service: string, detail?: string) {
    super(detail ?? `سرویس «${service}» پیکربندی نشده است.`);
    this.name = 'ProviderNotConfiguredError';
    this.service = service;
  }
}

export class ProviderRequestError extends Error {
  readonly service: string;
  readonly status?: number;

  constructor(service: string, message: string, status?: number) {
    super(message);
    this.name = 'ProviderRequestError';
    this.service = service;
    this.status = status;
  }
}
