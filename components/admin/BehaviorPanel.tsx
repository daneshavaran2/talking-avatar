'use client';

import { PlusIcon, SaveIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { SectionCard } from '@/components/admin/ui';
import { useSettings } from '@/components/admin/use-settings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
  const { settings, loading, saving, patch, save } = useSettings();
  const [keywordDraft, setKeywordDraft] = useState('');

  if (loading || !settings) {
    return (
      <SectionCard title="رفتار و محدودیت‌ها">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </SectionCard>
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

  const addKeyword = () => {
    const keyword = keywordDraft.trim();
    if (keyword.length < 2) return;
    patch({ customBlockedKeywords: [...new Set([...settings.customBlockedKeywords, keyword])] });
    setKeywordDraft('');
  };

  const persist = async () => {
    const ok = await save({
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
    if (ok) toast.success('تغییرات ذخیره شد.');
    else toast.error('ذخیرهٔ تنظیمات ممکن نشد.');
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="هویت و لحن"
        description="این متن به‌عنوان System Prompt به مدل زبانی داده می‌شود."
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="business-name">نام کسب‌وکار</FieldLabel>
            <Input
              id="business-name"
              value={settings.businessName}
              onChange={(event) => patch({ businessName: event.target.value })}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="system-prompt">دستورالعمل پایه</FieldLabel>
            <Textarea
              id="system-prompt"
              value={settings.systemPrompt}
              onChange={(event) => patch({ systemPrompt: event.target.value })}
              rows={14}
              // عمداً font-mono نیست: فونت‌های تک‌عرض حروف فارسی را
              // به هم نمی‌چسبانند و متن شکسته و ناخوانا می‌شود.
              className="text-xs leading-7"
            />
            <FieldDescription>
              محدودیت‌های محتوایی و قطعات پایگاه دانش به‌صورت خودکار به انتهای این متن اضافه
              می‌شوند؛ لازم نیست دستی بنویسیدشان.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="kiosk-reset">بازنشانی خودکار پس از بی‌فعالیتی (ثانیه)</FieldLabel>
            <Input
              id="kiosk-reset"
              type="number"
              min={15}
              max={1800}
              value={settings.kioskResetSeconds}
              onChange={(event) => patch({ kioskResetSeconds: Number(event.target.value) })}
              className="max-w-40 latn"
            />
            <FieldDescription>
              برای نصب کیوسکی؛ مکالمه پس از این مدت بی‌فعالیتی تازه می‌شود.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </SectionCard>

      <SectionCard
        title="دسته‌های محدودشده"
        description="آواتار دربارهٔ دسته‌های فعال اظهارنظر نمی‌کند و مؤدبانه به موضوع اصلی برمی‌گردد."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {BLOCKED_CATEGORIES.map((category) => (
            <label
              key={category}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              {CATEGORY_LABELS[category]}
              <Switch
                checked={settings.blockedCategories.includes(category)}
                onCheckedChange={(checked) => toggleCategory(category, checked)}
              />
            </label>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="پیام‌های امتناع"
        description="برای هر دسته چند نسخه بنویسید تا پاسخ‌ها تکراری و رباتیک به نظر نرسند."
      >
        <div className="flex flex-col gap-4">
          {settings.blockedCategories.length === 0 && (
            <p className="text-xs text-muted-foreground">هیچ دسته‌ای فعال نیست.</p>
          )}

          {BLOCKED_CATEGORIES.filter((category) =>
            settings.blockedCategories.includes(category),
          ).map((category) => (
            <div key={category} className="rounded-xl border bg-muted/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium">{CATEGORY_LABELS[category]}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    patch({
                      refusalMessages: {
                        ...settings.refusalMessages,
                        [category]: [...(settings.refusalMessages[category] ?? []), ''],
                      },
                    })
                  }
                >
                  <PlusIcon />
                  نسخهٔ جدید
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                {(settings.refusalMessages[category] ?? []).map((message, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={message}
                      onChange={(event) => updateRefusal(category, index, event.target.value)}
                      maxLength={500}
                      className="flex-1 text-xs"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="حذف نسخه"
                      onClick={() =>
                        patch({
                          refusalMessages: {
                            ...settings.refusalMessages,
                            [category]: (settings.refusalMessages[category] ?? []).filter(
                              (_, i) => i !== index,
                            ),
                          },
                        })
                      }
                    >
                      <XIcon />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="کلیدواژه‌های سفارشی"
        description="عبارت‌هایی که مخصوص کسب‌وکار شماست و آواتار نباید واردشان شود."
      >
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              value={keywordDraft}
              onChange={(event) => setKeywordDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addKeyword();
                }
              }}
              placeholder="مثلاً: قرارداد محرمانه"
              className="flex-1"
            />
            <Button type="button" variant="outline" onClick={addKeyword}>
              <PlusIcon />
              افزودن
            </Button>
          </div>

          {settings.customBlockedKeywords.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {settings.customBlockedKeywords.map((keyword) => (
                <li key={keyword}>
                  <Badge variant="secondary" className="gap-1.5">
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
                      aria-label={`حذف ${keyword}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
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
