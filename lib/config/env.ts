import 'server-only';

/**
 * دسترسی متمرکز و Type-safe به متغیرهای محیطی.
 *
 * قاعدهٔ امنیتی (§۱۱.۱ / S2): هیچ‌کدام از این مقادیر با پیشوند
 * `NEXT_PUBLIC_` تعریف نشده‌اند، و ایمپورت `server-only` تضمین می‌کند
 * که این ماژول هرگز به باندل کلاینت راه پیدا نکند.
 */

function str(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export type LlmProviderName = 'gemini' | 'groq' | 'openai' | 'anthropic' | 'ollama';
export type EmbeddingProviderName = 'gemini' | 'openai' | 'ollama';
export type TtsProviderName = 'elevenlabs' | 'media-engine' | 'none';
export type SttProviderName = 'browser' | 'media-engine' | 'none';
export type AvatarProviderName = 'media-engine' | 'none';

export const env = {
  get nodeEnv(): string {
    return str('NODE_ENV', 'development');
  },
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },

  // ── مدل زبانی ──────────────────────────────────────────────
  get llmProvider(): LlmProviderName {
    return str('LLM_PROVIDER', 'gemini') as LlmProviderName;
  },
  get llmModel(): string {
    return str('LLM_MODEL');
  },
  get llmApiKey(): string {
    return str('LLM_API_KEY');
  },
  get llmBaseUrl(): string {
    return str('LLM_BASE_URL');
  },

  // ── تعبیه‌سازی ─────────────────────────────────────────────
  get embeddingProvider(): EmbeddingProviderName {
    return str('EMBEDDING_PROVIDER', 'gemini') as EmbeddingProviderName;
  },
  get embeddingModel(): string {
    return str('EMBEDDING_MODEL', 'gemini-embedding-001');
  },
  get embeddingApiKey(): string {
    return str('EMBEDDING_API_KEY') || str('LLM_API_KEY');
  },
  get embeddingBaseUrl(): string {
    return str('EMBEDDING_BASE_URL');
  },
  get embeddingDim(): number {
    return num('EMBEDDING_DIM', 1536);
  },

  // ── صدا ────────────────────────────────────────────────────
  get ttsProvider(): TtsProviderName {
    return str('TTS_PROVIDER', 'none') as TtsProviderName;
  },
  get ttsApiKey(): string {
    return str('TTS_API_KEY');
  },
  get ttsModel(): string {
    return str('TTS_MODEL', 'eleven_turbo_v2_5');
  },
  get ttsVoiceId(): string {
    return str('TTS_VOICE_ID');
  },
  get sttProvider(): SttProviderName {
    return str('STT_PROVIDER', 'browser') as SttProviderName;
  },
  get sttModel(): string {
    return str('STT_MODEL', 'large-v3');
  },

  // ── آواتار و رسانه ─────────────────────────────────────────
  get avatarProvider(): AvatarProviderName {
    return str('AVATAR_PROVIDER', 'none') as AvatarProviderName;
  },
  get mediaEngineUrl(): string {
    return str('MEDIA_ENGINE_URL');
  },
  get mediaEngineToken(): string {
    return str('MEDIA_ENGINE_TOKEN');
  },
  get livekitUrl(): string {
    return str('LIVEKIT_URL');
  },
  get livekitApiKey(): string {
    return str('LIVEKIT_API_KEY');
  },
  get livekitApiSecret(): string {
    return str('LIVEKIT_API_SECRET');
  },

  // ── اتوماسیون ──────────────────────────────────────────────
  get n8nBaseUrl(): string {
    return str('N8N_BASE_URL');
  },
  get n8nWebhookSecret(): string {
    return str('N8N_WEBHOOK_SECRET');
  },

  // ── احراز هویت ─────────────────────────────────────────────
  get authSecret(): string {
    return str('AUTH_SECRET');
  },
  get adminEmail(): string {
    return str('ADMIN_EMAIL');
  },
  get adminPassword(): string {
    return str('ADMIN_PASSWORD');
  },

  // ── عمومی ──────────────────────────────────────────────────
  get kioskResetSeconds(): number {
    return num('KIOSK_RESET_SECONDS', 120);
  },
  get dataRetentionDays(): number {
    return num('DATA_RETENTION_DAYS', 90);
  },
  get storageDir(): string {
    return str('STORAGE_DIR', './storage');
  },
};

/**
 * وضعیت پیکربندی هر قابلیت — برای اینکه UI بتواند بخش‌های
 * پیکربندی‌نشده را صادقانه غیرفعال کند به‌جای وانمود کردن.
 */
export type CapabilityReport = {
  llm: boolean;
  embedding: boolean;
  tts: boolean;
  stt: 'browser' | 'server' | 'off';
  avatar: boolean;
  livekit: boolean;
  tools: boolean;
};

export function capabilities(): CapabilityReport {
  const localLlm = env.llmProvider === 'ollama';
  const localEmbedding = env.embeddingProvider === 'ollama';

  return {
    llm: localLlm ? Boolean(env.llmModel) : Boolean(env.llmApiKey && env.llmModel),
    embedding: localEmbedding
      ? Boolean(env.embeddingModel)
      : Boolean(env.embeddingApiKey && env.embeddingModel),
    tts:
      env.ttsProvider === 'elevenlabs'
        ? Boolean(env.ttsApiKey)
        : env.ttsProvider === 'media-engine'
          ? Boolean(env.mediaEngineUrl)
          : false,
    stt:
      env.sttProvider === 'browser'
        ? 'browser'
        : env.sttProvider === 'media-engine' && env.mediaEngineUrl
          ? 'server'
          : 'off',
    avatar: env.avatarProvider === 'media-engine' && Boolean(env.mediaEngineUrl),
    livekit: Boolean(env.livekitUrl && env.livekitApiKey && env.livekitApiSecret),
    tools: Boolean(env.n8nBaseUrl),
  };
}
