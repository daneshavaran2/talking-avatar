'use client';

import { useState } from 'react';
import { Alert, Card, Spinner, Toggle } from '@/components/admin/ui';
import { useSettings } from '@/components/admin/use-settings';
import {
  BLOCKED_CATEGORIES,
  CATEGORY_LABELS,
  type BlockedCategory,
} from '@/lib/config/constants';

/**
 * رفتار آواتار و محدودیت‌های محتوایی (§۷).
 *
 * هر دسته مستقلاً قابل فعال/غیرفعال شدن است (F11.1) و متن پیام
 * امتناع هر دسته قابل ویرایش (F11.2). چند پیام برای هر دسته
 * نگه داشته می‌شود تا پاسخ‌ها تکراری نشوند (F11.5).
 */
export function BehaviorPanel() {
  const { settings, loading, saving, saved, error, patch, save } = useSettings();
  const [keywordDraft, setKeywordDraft] = useState('');

  if (loading || !settings) {
    return (
      <Card title="رفتار و محدودیت‌ها">
        <div className="flex justify-center py-8 text-content-faint">
          <Spinner className="h-5 w-5" />
        </div>
      </Card>
    );
  }

  const toggleCategory = (category: BlockedCategory, enabled: boolean) => {
    const next = enabled
      ? [...new Set([...settings.blockedCategories, category])]
      : settings.blockedCategories.filter((item) => item !== category);
    patch({ blockedCategories: next });
  };

  const updateRefusal = (category: BlockedCategory, index: number, value: string) => {
    const current = settings.refusalMessages[category] ?? [];
    const next = [...current];
    next[index] = value;
    patch({ refusalMessages: { ...settings.refusalMessages, [category]: next } });
  };

  const addRefusal = (category: BlockedCategory) => {
    const current = settings.refusalMessages[category] ?? [];
    patch({
      refusalMessages: { ...settings.refusalMessages, [category]: [...current, ''] },
    });
  };

  const removeRefusal = (category: BlockedCategory, index: number) => {
    const current = settings.refusalMessages[category] ?? [];
    patch({
      refusalMessages: {
        ...settings.refusalMessages,
        [category]: current.filter((_, i) => i !== index),
      },
    });
  };

  const addKeyword = () => {
    const keyword = keywordDraft.trim();
    if (keyword.length < 2) return;
    patch({
      customBlockedKeywords: [...new Set([...settings.customBlockedKeywords, keyword])],
    });
    setKeywordDraft('');
  };

  const persist = () =>
    void save({
      businessName: settings.businessName,
      systemPrompt: settings.systemPrompt,
      blockedCategories: settings.blockedCategories,
      refusalMessages: Object.fromEntries(
        Object.entries(settings.refusalMessages).map(([key, value]) => [
          key,
          value.filter((message) => message.trim().length > 0),
        ]),
      ),
      customBlockedKeywords: settings.customBlockedKeywords,
      kioskResetSeconds: settings.kioskResetSeconds,
    });

  return (
    <div className="space-y-5">
      <Card title="هویت و لحن" description="این متن به‌عنوان System Prompt به مدل زبانی داده می‌شود.">
        <div className="space-y-4">
          <div>
            <label htmlFor="business-name" className="label">
              نام کسب‌وکار
            </label>
            <input
              id="business-name"
              value={settings.businessName}
              onChange={(event) => patch({ businessName: event.target.value })}
              className="field"
            />
          </div>

          <div>
            <label htmlFor="system-prompt" className="label">
              دستورالعمل پایه
            </label>
            <textarea
              id="system-prompt"
              value={settings.systemPrompt}
              onChange={(event) => patch({ systemPrompt: event.target.value })}
              rows={14}
              className="field font-mono text-xs leading-6"
            />
            <p className="mt-1.5 hint">
              محدودیت‌های محتوایی و قطعات پایگاه دانش به‌صورت خودکار به انتهای این متن اضافه
              می‌شوند؛ لازم نیست دستی بنویسیدشان.
            </p>
          </div>

          <div>
            <label htmlFor="kiosk-reset" className="label">
              بازنشانی خودکار پس از بی‌فعالیتی (ثانیه)
            </label>
            <input
              id="kiosk-reset"
              type="number"
              min={15}
              max={1800}
              value={settings.kioskResetSeconds}
              onChange={(event) => patch({ kioskResetSeconds: Number(event.target.value) })}
              className="field max-w-[10rem] latn"
            />
            <p className="mt-1.5 hint">برای نصب کیوسکی؛ مکالمه پس از این مدت بی‌فعالیتی تازه می‌شود.</p>
          </div>
        </div>
      </Card>

      <Card
        title="دسته‌های محدودشده"
        description="آواتار دربارهٔ دسته‌های فعال اظهارنظر نمی‌کند و مؤدبانه به موضوع اصلی برمی‌گردد."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {BLOCKED_CATEGORIES.map((category) => (
            <Toggle
              key={category}
              checked={settings.blockedCategories.includes(category)}
              onChange={(next) => toggleCategory(category, next)}
              label={CATEGORY_LABELS[category]}
            />
          ))}
        </div>
      </Card>

      <Card
        title="پیام‌های امتناع"
        description="برای هر دسته چند نسخه بنویسید تا پاسخ‌ها تکراری و رباتیک به نظر نرسند."
      >
        <div className="space-y-4">
          {settings.blockedCategories.length === 0 && (
            <p className="hint">هیچ دسته‌ای فعال نیست.</p>
          )}

          {BLOCKED_CATEGORIES.filter((category) =>
            settings.blockedCategories.includes(category),
          ).map((category) => (
            <div key={category} className="rounded-xl border border-line bg-surface-sunken p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-content">{CATEGORY_LABELS[category]}</p>
                <button
                  type="button"
                  onClick={() => addRefusal(category)}
                  className="text-[11px] text-brand-soft hover:underline"
                >
                  + افزودن نسخه
                </button>
              </div>

              <div className="space-y-2">
                {(settings.refusalMessages[category] ?? []).map((message, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      value={message}
                      onChange={(event) => updateRefusal(category, index, event.target.value)}
                      className="field flex-1 text-xs"
                      maxLength={500}
                    />
                    <button
                      type="button"
                      onClick={() => removeRefusal(category, index)}
                      className="shrink-0 rounded-lg px-2 text-xs text-content-faint hover:text-state-error"
                    >
                      حذف
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="کلیدواژه‌های سفارشی"
        description="عبارت‌هایی که مخصوص کسب‌وکار شماست و آواتار نباید واردشان شود."
      >
        <div className="flex gap-2">
          <input
            value={keywordDraft}
            onChange={(event) => setKeywordDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addKeyword();
              }
            }}
            placeholder="مثلاً: قرارداد محرمانه"
            className="field flex-1"
          />
          <button type="button" onClick={addKeyword} className="btn-ghost shrink-0">
            افزودن
          </button>
        </div>

        {settings.customBlockedKeywords.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {settings.customBlockedKeywords.map((keyword) => (
              <li
                key={keyword}
                className="flex items-center gap-1.5 rounded-lg bg-surface-raised px-2 py-1 text-xs text-content"
              >
                {keyword}
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      customBlockedKeywords: settings.customBlockedKeywords.filter(
                        (item) => item !== keyword,
                      ),
                    })
                  }
                  className="text-content-faint hover:text-state-error"
                  aria-label={`حذف ${keyword}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex items-center gap-3">
        <button type="button" onClick={persist} disabled={saving} className="btn-primary">
          {saving && <Spinner />}
          ذخیرهٔ تغییرات
        </button>
        {saved && <span className="text-xs text-state-listening">ذخیره شد.</span>}
      </div>
    </div>
  );
}
