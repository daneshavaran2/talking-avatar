'use client';

import { CheckIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { AvatarPanel } from '@/components/admin/AvatarPanel';
import { BehaviorPanel } from '@/components/admin/BehaviorPanel';
import { FaceCalibration } from '@/components/admin/FaceCalibration';
import { KnowledgePanel } from '@/components/admin/KnowledgePanel';
import { VoicePanel } from '@/components/admin/VoicePanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/**
 * Setup Wizard چهارمرحله‌ای (§۴.۱).
 *
 * هدف G1: مدیر ظرف کمتر از ۱۵ دقیقه از صفر تا آواتار فعال برسد.
 *
 * هر مرحله از همان پنلی استفاده می‌کند که صفحهٔ مستقلش هم استفاده
 * می‌کند — رفتار و اعتبارسنجی دقیقاً یکی است.
 */

const STEPS = [
  { key: 'avatar', title: 'چهرهٔ آواتار', hint: 'عکس و کالیبراسیون لیپ‌سینک' },
  { key: 'voice', title: 'صدای آواتار', hint: 'یک نمونهٔ صوتی' },
  { key: 'knowledge', title: 'پایگاه دانش', hint: 'اسناد کسب‌وکار' },
  { key: 'behavior', title: 'رفتار و محدودیت‌ها', hint: 'لحن و موضوعات ممنوعه' },
] as const;

export function SetupWizard() {
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState({ avatar: false, voice: false, knowledge: false });
  const [finishing, setFinishing] = useState(false);
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

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupCompleted: true }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? 'ثبت پایان راه‌اندازی ممکن نشد.');
        return;
      }

      setDone(true);
    } catch {
      toast.error('ارتباط با سرور برقرار نشد.');
    } finally {
      setFinishing(false);
    }
  };

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-state-listening/15 text-state-listening">
            <CheckIcon className="size-6" />
          </span>
          <div>
            <h2 className="text-base font-semibold">راه‌اندازی کامل شد</h2>
            <p className="mt-1 text-xs text-muted-foreground">آواتار شما آمادهٔ گفتگوست.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/" target="_blank">
                مشاهدهٔ آواتار
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin">رفتن به داشبورد</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="grid gap-2 sm:grid-cols-4">
        {STEPS.map((item, index) => {
          const complete =
            (item.key === 'avatar' && ready.avatar) ||
            (item.key === 'voice' && ready.voice) ||
            (item.key === 'knowledge' && ready.knowledge);
          const current = index === step;

          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => setStep(index)}
                className={cn(
                  'w-full rounded-lg border p-3 text-start transition-colors',
                  current ? 'border-primary/50 bg-accent' : 'hover:border-primary/30',
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium',
                      complete
                        ? 'bg-state-listening/20 text-state-listening'
                        : current
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {complete ? <CheckIcon className="size-3" /> : index + 1}
                  </span>
                  <span
                    className={cn('text-xs font-medium', current && 'text-accent-foreground')}
                  >
                    {item.title}
                  </span>
                </div>
                <p className="mt-1 ps-7 text-[11px] text-muted-foreground">{item.hint}</p>
              </button>
            </li>
          );
        })}
      </ol>

      <Progress value={((step + 1) / STEPS.length) * 100} />

      {step === 0 && (
        <div className="flex flex-col gap-5">
          <AvatarPanel onReady={markAvatar} />
          <FaceCalibration />
        </div>
      )}
      {step === 1 && <VoicePanel onReady={markVoice} />}
      {step === 2 && <KnowledgePanel onReady={markKnowledge} />}
      {step === 3 && <BehaviorPanel />}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0}
        >
          مرحلهٔ قبل
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))}>
            مرحلهٔ بعد
          </Button>
        ) : (
          <Button onClick={() => void finish()} disabled={finishing}>
            {finishing && <Spinner />}
            پایان راه‌اندازی
          </Button>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        هر مرحله را می‌توانید بعداً از منوی کناری تغییر دهید. مراحلی که سرویس‌شان پیکربندی نشده،
        قابل رد کردن هستند.
      </p>
    </div>
  );
}
