'use client';

import { SaveIcon, TriangleAlertIcon } from 'lucide-react';
import { toast } from 'sonner';

import { SectionCard } from '@/components/admin/ui';
import { useSettings } from '@/components/admin/use-settings';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';

const PROVIDERS = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'groq', label: 'Groq' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'ollama', label: 'Ollama (محلی)' },
];

/** تنظیمات مدل زبانی و بازیابی. */
export function ModelSettingsPanel() {
  const { settings, capabilities, loading, saving, patch, save } = useSettings();

  if (loading || !settings) {
    return (
      <SectionCard title="مدل زبانی">
        <Skeleton className="h-48 w-full" />
      </SectionCard>
    );
  }

  const persist = async () => {
    const ok = await save({
      llmProvider: settings.llmProvider as never,
      llmModel: settings.llmModel,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      ragTopK: settings.ragTopK,
      ragThreshold: settings.ragThreshold,
    });
    if (ok) toast.success('تنظیمات ذخیره شد.');
    else toast.error('ذخیرهٔ تنظیمات ممکن نشد.');
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="مدل زبانی"
        description="کلید API از متغیرهای محیطی خوانده می‌شود و هرگز در پنل نمایش داده یا ذخیره نمی‌شود."
      >
        <div className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="llm-provider">سرویس</FieldLabel>
              <Select
                value={settings.llmProvider}
                onValueChange={(value) => patch({ llmProvider: value })}
              >
                <SelectTrigger id="llm-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {PROVIDERS.map((provider) => (
                      <SelectItem key={provider.value} value={provider.value}>
                        {provider.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="llm-model">نام مدل</FieldLabel>
              <Input
                id="llm-model"
                dir="ltr"
                value={settings.llmModel}
                onChange={(event) => patch({ llmModel: event.target.value })}
                className="text-start latn"
              />
            </Field>

            <Field>
              <FieldLabel className="flex items-center justify-between">
                <span>خلاقیت (Temperature)</span>
                <span className="latn text-xs text-muted-foreground">{settings.temperature}</span>
              </FieldLabel>
              <Slider
                value={[settings.temperature]}
                min={0}
                max={1.5}
                step={0.05}
                onValueChange={([next]) => {
                  if (typeof next === 'number') patch({ temperature: next });
                }}
              />
              <FieldDescription>
                برای پاسخ‌های مبتنی بر سند، مقادیر پایین‌تر دقیق‌ترند.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="max-tokens">حداکثر طول پاسخ (توکن)</FieldLabel>
              <Input
                id="max-tokens"
                type="number"
                min={64}
                max={8192}
                value={settings.maxTokens}
                onChange={(event) => patch({ maxTokens: Number(event.target.value) })}
                className="latn"
              />
              <FieldDescription>
                پاسخ‌های صوتی باید کوتاه باشند؛ حدود ۵۱۲ توکن معمولاً کافی است.
              </FieldDescription>
            </Field>
          </div>

          {capabilities && !capabilities.llm && (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertDescription>
                کلید مدل زبانی تنظیم نشده است. تا زمانی که{' '}
                <code className="latn">LLM_API_KEY</code> تنظیم نشود، آواتار نمی‌تواند پاسخ بدهد.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="بازیابی از پایگاه دانش"
        description="کنترل اینکه چند قطعه و با چه دقتی به مدل داده شود."
      >
        <FieldGroup className="sm:grid sm:grid-cols-2 sm:gap-5">
          <Field>
            <FieldLabel htmlFor="rag-topk">تعداد قطعات (K)</FieldLabel>
            <Input
              id="rag-topk"
              type="number"
              min={1}
              max={20}
              value={settings.ragTopK}
              onChange={(event) => patch({ ragTopK: Number(event.target.value) })}
              className="latn"
            />
          </Field>

          <Field>
            <FieldLabel className="flex items-center justify-between">
              <span>آستانهٔ شباهت</span>
              <span className="latn text-xs text-muted-foreground">{settings.ragThreshold}</span>
            </FieldLabel>
            <Slider
              value={[settings.ragThreshold]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([next]) => {
                if (typeof next === 'number') patch({ ragThreshold: next });
              }}
            />
            <FieldDescription>
              بالاتر یعنی سخت‌گیرانه‌تر. توزیع شباهت هر مدل تعبیه‌سازی فرق دارد — با ابزار «تست
              بازیابی» در صفحهٔ پایگاه دانش تنظیمش کنید.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </SectionCard>

      <div>
        <Button onClick={() => void persist()} disabled={saving}>
          {saving ? <Spinner /> : <SaveIcon />}
          ذخیرهٔ تغییرات
        </Button>
      </div>
    </div>
  );
}
