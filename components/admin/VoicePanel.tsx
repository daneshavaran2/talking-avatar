'use client';

import { PlayIcon, TriangleAlertIcon, UploadIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { SectionCard, StatusBadge } from '@/components/admin/ui';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

/**
 * مدیریت صدای آواتار (§F2).
 *
 * چک‌باکس رضایت اجباری است (§۱۱.۳): بدون آن دکمهٔ آپلود غیرفعال
 * می‌ماند و سرور هم درخواست را رد می‌کند.
 */

type VoiceProfile = {
  id: string;
  status: string;
  errorMessage?: string | null;
  providerName: string;
  consentConfirmed: boolean;
  consentAt: string | null;
};

const AUDIO_GUIDE = [
  'محیط ساکت، بدون اکو',
  'صحبت طبیعی و پیوسته (نه خواندن مصنوعی)',
  'بدون موسیقی پس‌زمینه',
  'ترجیحاً یک فایل پیوسته، نه چند تکهٔ به‌هم چسبیده',
];

const CONSENT_TEXT =
  'تأیید می‌کنم که صاحب این صدا هستم یا رضایت کتبی صاحب صدا را برای استفاده در این سیستم دریافت کرده‌ام.';

export function VoicePanel({ onReady }: { onReady?: (ready: boolean) => void } = {}) {
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [ttsConfigured, setTtsConfigured] = useState(true);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testText, setTestText] = useState(
    'سلام، من دستیار دیجیتال شما هستم. چطور می‌توانم کمکتان کنم؟',
  );
  const [testing, setTesting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/voice');
      if (!response.ok) return;
      const body = (await response.json()) as {
        profile: VoiceProfile | null;
        ttsConfigured: boolean;
      };
      setProfile(body.profile);
      setTtsConfigured(body.ttsConfigured);
      onReady?.(body.profile?.status === 'ready');
    } catch {
      toast.error('خواندن وضعیت صدا ممکن نشد.');
    }
  }, [onReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (file: File) => {
    setBusy(true);

    try {
      const form = new FormData();
      form.append('audio', file);
      form.append('consent', 'true');

      const response = await fetch('/api/admin/voice', { method: 'POST', body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? 'ساخت صدای اختصاصی ممکن نشد.');
        return;
      }

      toast.success('صدای اختصاصی ساخته شد.');
      await load();
    } catch {
      toast.error('آپلود نمونهٔ صدا ممکن نشد.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const runTest = async () => {
    setTesting(true);

    try {
      const response = await fetch('/api/admin/voice/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: testText }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? 'پخش صدای تستی ممکن نشد.');
        return;
      }

      const blob = await response.blob();
      audioRef.current?.pause();
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      await audio.play();
    } catch {
      toast.error('پخش صدای تستی ممکن نشد.');
    } finally {
      setTesting(false);
    }
  };

  const canUpload = consent && ttsConfigured && !busy;

  return (
    <SectionCard
      title="صدای آواتار"
      description="یک نمونهٔ صوتی آپلود کنید تا صدای اختصاصی ساخته شود. این کار فقط یک‌بار انجام می‌شود و نتیجه Cache می‌شود."
    >
      <div className="flex flex-col gap-4">
        {!ttsConfigured && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>
              سرویس تبدیل متن به صدا پیکربندی نشده است. تا آن زمان پاسخ‌ها فقط متنی‌اند و
              لیپ‌سینک هم اجرا نمی‌شود (چون صدایی برای هماهنگی وجود ندارد).
            </AlertDescription>
          </Alert>
        )}

        {profile && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <StatusBadge status={profile.status} />
            <span className="text-muted-foreground latn">{profile.providerName}</span>
            {profile.consentAt && (
              <span className="text-muted-foreground">
                رضایت ثبت‌شده در {new Date(profile.consentAt).toLocaleDateString('fa-IR')}
              </span>
            )}
          </div>
        )}

        {profile?.errorMessage && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertDescription>{profile.errorMessage}</AlertDescription>
          </Alert>
        )}

        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>
            کلون کردن صدای دیگری بدون اجازهٔ او در بسیاری از کشورها غیرقانونی است و مسئولیت
            حقوقی ایجاد می‌کند. تأیید شما با زمان، شناسهٔ کاربری و آدرس IP ثبت می‌شود.
          </AlertDescription>
        </Alert>

        <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed">
          <Checkbox
            checked={consent}
            onCheckedChange={(checked) => setConsent(checked === true)}
            className="mt-0.5"
          />
          {CONSENT_TEXT}
        </label>

        <div>
          <input
            ref={inputRef}
            type="file"
            accept="audio/wav,audio/mpeg,audio/mp4,audio/x-m4a"
            disabled={!canUpload}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
            className="hidden"
            id="voice-file"
          />
          <Button asChild disabled={!canUpload}>
            <label htmlFor="voice-file" className={canUpload ? 'cursor-pointer' : 'pointer-events-none opacity-50'}>
              {busy ? <Spinner /> : <UploadIcon />}
              {profile ? 'آپلود نمونهٔ بهتر' : 'آپلود نمونهٔ صدا'}
            </label>
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            WAV، MP3 یا M4A تا ۲۵ مگابایت — حداقل ۳۰ ثانیه (توصیه: ۶۰ تا ۱۲۰ ثانیه)
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">راهنمای نمونهٔ مناسب</p>
          <ul className="flex flex-col gap-1">
            {AUDIO_GUIDE.map((line) => (
              <li key={line} className="flex gap-1.5 text-xs text-muted-foreground">
                <span className="text-primary">•</span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        {profile?.status === 'ready' && (
          <div className="rounded-xl border bg-muted/40 p-3">
            <Field>
              <FieldLabel htmlFor="voice-test">تست صدا</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="voice-test"
                  value={testText}
                  onChange={(event) => setTestText(event.target.value)}
                  maxLength={300}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void runTest()}
                  disabled={testing || !testText.trim()}
                >
                  {testing ? <Spinner /> : <PlayIcon />}
                  پخش
                </Button>
              </div>
            </Field>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
