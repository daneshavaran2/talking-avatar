'use client';

import { Alert, Card, Spinner } from '@/components/admin/ui';
import { useSettings } from '@/components/admin/use-settings';

/** تنظیمات مدل زبانی و بازیابی. */
export function ModelSettingsPanel() {
  const { settings, capabilities, loading, saving, saved, error, patch, save } = useSettings();

  if (loading || !settings) {
    return (
      <Card title="تنظیمات مدل">
        <div className="flex justify-center py-8 text-content-faint">
          <Spinner className="h-5 w-5" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card
        title="مدل زبانی"
        description="کلید API از متغیرهای محیطی خوانده می‌شود و هرگز در پنل نمایش داده یا ذخیره نمی‌شود."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="llm-provider" className="label">
              سرویس
            </label>
            <select
              id="llm-provider"
              value={settings.llmProvider}
              onChange={(event) => patch({ llmProvider: event.target.value })}
              className="field"
            >
              <option value="gemini">Gemini</option>
              <option value="groq">Groq</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="ollama">Ollama (محلی)</option>
            </select>
          </div>

          <div>
            <label htmlFor="llm-model" className="label">
              نام مدل
            </label>
            <input
              id="llm-model"
              dir="ltr"
              value={settings.llmModel}
              onChange={(event) => patch({ llmModel: event.target.value })}
              className="field text-start latn"
            />
          </div>

          <div>
            <label htmlFor="temperature" className="label">
              خلاقیت (Temperature): <span className="latn">{settings.temperature}</span>
            </label>
            <input
              id="temperature"
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={settings.temperature}
              onChange={(event) => patch({ temperature: Number(event.target.value) })}
              className="w-full accent-[#E3A857]"
            />
            <p className="mt-1 hint">برای پاسخ‌های مبتنی بر سند، مقادیر پایین‌تر دقیق‌ترند.</p>
          </div>

          <div>
            <label htmlFor="max-tokens" className="label">
              حداکثر طول پاسخ (توکن)
            </label>
            <input
              id="max-tokens"
              type="number"
              min={64}
              max={8192}
              value={settings.maxTokens}
              onChange={(event) => patch({ maxTokens: Number(event.target.value) })}
              className="field latn"
            />
            <p className="mt-1 hint">پاسخ‌های صوتی باید کوتاه باشند؛ حدود ۵۱۲ توکن معمولاً کافی است.</p>
          </div>
        </div>

        {capabilities && !capabilities.llm && (
          <div className="mt-4">
            <Alert tone="error">
              کلید مدل زبانی تنظیم نشده است. تا زمانی که{' '}
              <code className="latn">LLM_API_KEY</code> تنظیم نشود، آواتار نمی‌تواند پاسخ بدهد.
            </Alert>
          </div>
        )}
      </Card>

      <Card
        title="بازیابی از پایگاه دانش"
        description="کنترل اینکه چند قطعه و با چه دقتی به مدل داده شود."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="rag-topk" className="label">
              تعداد قطعات (K)
            </label>
            <input
              id="rag-topk"
              type="number"
              min={1}
              max={20}
              value={settings.ragTopK}
              onChange={(event) => patch({ ragTopK: Number(event.target.value) })}
              className="field latn"
            />
          </div>

          <div>
            <label htmlFor="rag-threshold" className="label">
              آستانهٔ شباهت: <span className="latn">{settings.ragThreshold}</span>
            </label>
            <input
              id="rag-threshold"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={settings.ragThreshold}
              onChange={(event) => patch({ ragThreshold: Number(event.target.value) })}
              className="w-full accent-[#E3A857]"
            />
            <p className="mt-1 hint">
              بالاتر یعنی سخت‌گیرانه‌تر: قطعات کم‌ربط حذف می‌شوند ولی احتمال «اطلاعات کافی ندارم»
              بیشتر می‌شود. با ابزار تست در صفحهٔ پایگاه دانش تنظیمش کنید.
            </p>
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() =>
            void save({
              llmProvider: settings.llmProvider as never,
              llmModel: settings.llmModel,
              temperature: settings.temperature,
              maxTokens: settings.maxTokens,
              ragTopK: settings.ragTopK,
              ragThreshold: settings.ragThreshold,
            })
          }
          disabled={saving}
          className="btn-primary"
        >
          {saving && <Spinner />}
          ذخیرهٔ تغییرات
        </button>
        {saved && <span className="text-xs text-state-listening">ذخیره شد.</span>}
      </div>
    </div>
  );
}
