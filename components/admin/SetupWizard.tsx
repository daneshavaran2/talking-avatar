'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { AvatarPanel } from '@/components/admin/AvatarPanel';
import { BehaviorPanel } from '@/components/admin/BehaviorPanel';
import { KnowledgePanel } from '@/components/admin/KnowledgePanel';
import { VoicePanel } from '@/components/admin/VoicePanel';
import { Alert, Card, Spinner } from '@/components/admin/ui';
import { CheckIcon } from '@/components/ui/icons';

/**
 * Setup Wizard چهارمرحله‌ای (§۴.۱).
 *
 * هدف G1: مدیر ظرف کمتر از ۱۵ دقیقه از صفر تا آواتار فعال برسد.
 *
 * هر مرحله از همان پنلی استفاده می‌کند که صفحهٔ مستقلش هم استفاده
 * می‌کند — یعنی رفتار و اعتبارسنجی دقیقاً یکی است و دو مسیر
 * جداگانه برای نگهداری وجود ندارد.
 */

const STEPS = [
  { key: 'avatar', title: 'چهرهٔ آواتار', hint: 'یک عکس با چهرهٔ واضح' },
  { key: 'voice', title: 'صدای آواتار', hint: 'یک نمونهٔ صوتی' },
  { key: 'knowledge', title: 'پایگاه دانش', hint: 'اسناد کسب‌وکار' },
  { key: 'behavior', title: 'رفتار و محدودیت‌ها', hint: 'لحن و موضوعات ممنوعه' },
] as const;

export function SetupWizard() {
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState({ avatar: false, voice: false, knowledge: false });
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const markAvatar = useCallback((value: boolean) => {
    setReady((current) => (current.avatar === value ? current : { ...current, avatar: value }));
  }, []);
  const markVoice = useCallback((value: boolean) => {
    setReady((current) => (current.voice === value ? current : { ...current, voice: value }));
  }, []);
  const markKnowledge = useCallback((value: boolean) => {
    setReady((current) =>
      current.knowledge === value ? current : { ...current, knowledge: value },
    );
  }, []);

  const finish = async () => {
    setFinishing(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupCompleted: true }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'ثبت پایان راه‌اندازی ممکن نشد.');
        return;
      }

      setDone(true);
    } catch {
      setError('ارتباط با سرور برقرار نشد.');
    } finally {
      setFinishing(false);
    }
  };

  if (done) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-state-listening/15 text-state-listening">
            <CheckIcon className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-content">راه‌اندازی کامل شد</h2>
            <p className="mt-1 hint">آواتار شما آمادهٔ گفتگوست.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/" target="_blank" className="btn-primary">
              مشاهدهٔ آواتار
            </Link>
            <Link href="/admin" className="btn-ghost">
              رفتن به داشبورد
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <ol className="grid gap-2 sm:grid-cols-4">
        {STEPS.map((item, index) => {
          const state =
            index < step ? 'done' : index === step ? 'current' : ('upcoming' as const);
          const complete =
            (item.key === 'avatar' && ready.avatar) ||
            (item.key === 'voice' && ready.voice) ||
            (item.key === 'knowledge' && ready.knowledge);

          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => setStep(index)}
                className={clsx(
                  'w-full rounded-xl border p-3 text-start transition-colors',
                  state === 'current'
                    ? 'border-brand/50 bg-brand-wash'
                    : 'border-line bg-surface hover:border-line-strong',
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium',
                      complete
                        ? 'bg-state-listening/20 text-state-listening'
                        : state === 'current'
                          ? 'bg-brand text-ink'
                          : 'bg-surface-raised text-content-faint',
                    )}
                  >
                    {complete ? <CheckIcon className="h-3 w-3" /> : index + 1}
                  </span>
                  <span
                    className={clsx(
                      'text-xs font-medium',
                      state === 'current' ? 'text-brand-soft' : 'text-content',
                    )}
                  >
                    {item.title}
                  </span>
                </div>
                <p className="mt-1 ps-7 text-[11px] text-content-faint">{item.hint}</p>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="h-1 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      {step === 0 && <AvatarPanel onReady={markAvatar} />}
      {step === 1 && <VoicePanel onReady={markVoice} />}
      {step === 2 && <KnowledgePanel onReady={markKnowledge} />}
      {step === 3 && <BehaviorPanel />}

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0}
          className="btn-ghost"
        >
          مرحلهٔ قبل
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))}
            className="btn-primary"
          >
            مرحلهٔ بعد
          </button>
        ) : (
          <button type="button" onClick={() => void finish()} disabled={finishing} className="btn-primary">
            {finishing && <Spinner />}
            پایان راه‌اندازی
          </button>
        )}
      </div>

      <p className="hint text-center">
        هر مرحله را می‌توانید بعداً از منوی کناری تغییر دهید. مراحلی که سرویس‌شان پیکربندی نشده،
        قابل رد کردن هستند.
      </p>
    </div>
  );
}
