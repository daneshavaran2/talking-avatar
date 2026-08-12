import 'server-only';
import type { LLMProvider } from '@/lib/ai/types';
import { ProviderNotConfiguredError } from '@/lib/ai/types';
import { env, type LlmProviderName } from '@/lib/config/env';
import { GeminiProvider } from '@/lib/ai/providers/gemini';
import { OpenAiCompatibleProvider } from '@/lib/ai/providers/openai-compatible';
import { AnthropicProvider } from '@/lib/ai/providers/anthropic';
import { OllamaProvider } from '@/lib/ai/providers/ollama';

/**
 * انتخاب Provider از روی پیکربندی.
 *
 * تعویض سرویس نباید بیش از این فایل را تغییر دهد (§۵.۳). هیچ
 * مصرف‌کننده‌ای نباید مستقیم یک کلاس Provider را ایمپورت کند.
 */

const OPENAI_BASE = 'https://api.openai.com/v1';
const GROQ_BASE = 'https://api.groq.com/openai/v1';

export type LlmOverride = {
  provider?: string;
  model?: string;
};

export function createLLMProvider(override: LlmOverride = {}): LLMProvider {
  const provider = (override.provider || env.llmProvider) as LlmProviderName;
  const model = override.model || env.llmModel;
  const apiKey = env.llmApiKey;
  const baseUrl = env.llmBaseUrl;

  if (!model) {
    throw new ProviderNotConfiguredError('llm', 'مدل زبانی انتخاب نشده است (LLM_MODEL).');
  }

  switch (provider) {
    case 'gemini':
      requireKey(apiKey, 'Gemini');
      return new GeminiProvider({ apiKey, model, baseUrl: baseUrl || undefined });

    case 'openai':
      requireKey(apiKey, 'OpenAI');
      return new OpenAiCompatibleProvider({
        name: 'openai',
        apiKey,
        model,
        baseUrl: baseUrl || OPENAI_BASE,
      });

    case 'groq':
      requireKey(apiKey, 'Groq');
      return new OpenAiCompatibleProvider({
        name: 'groq',
        apiKey,
        model,
        baseUrl: baseUrl || GROQ_BASE,
      });

    case 'anthropic':
      requireKey(apiKey, 'Anthropic');
      return new AnthropicProvider({ apiKey, model, baseUrl: baseUrl || undefined });

    case 'ollama':
      // مدل محلی کلید نمی‌خواهد.
      return new OllamaProvider({ model, baseUrl: baseUrl || undefined });

    default:
      throw new ProviderNotConfiguredError('llm', `سرویس ناشناختهٔ «${provider}» برای مدل زبانی.`);
  }
}

function requireKey(key: string, label: string): void {
  if (!key) {
    throw new ProviderNotConfiguredError(
      'llm',
      `کلید API برای ${label} تنظیم نشده است (LLM_API_KEY).`,
    );
  }
}
