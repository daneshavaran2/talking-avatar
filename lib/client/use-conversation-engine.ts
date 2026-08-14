'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { AudioQueue } from '@/lib/client/audio-queue';
import { SseHttpError, streamSse } from '@/lib/client/sse-client';
import { isRetryableStatus } from '@/lib/http/retry';
import {
  BrowserSpeechRecognizer,
  isSpeechRecognitionSupported,
  requestMicrophone,
} from '@/lib/client/speech-recognition';
import { newId, useConversation, type RuntimeConfig } from '@/lib/client/store';

/**
 * موتور مکالمهٔ سمت کلاینت.
 *
 * همهٔ سیم‌کشی اینجاست: SSE، صف صدا، تشخیص گفتار، Barge-In، و
 * بازنشانی کیوسک. کامپوننت‌های UI فقط وضعیت را می‌خوانند و
 * `sendMessage` / `toggleMic` را صدا می‌زنند.
 *
 * زنجیرهٔ لغو Barge-In (§F8) — همه به‌صورت هم‌زمان:
 *   AbortController جریان SSE → لغو LLM سمت سرور
 *   AudioQueue.stopAll()     → پاک‌سازی بافر و توقف گفتار
 *   /api/conversation/interrupt → آزادسازی منابع سرور
 */

/** یک تلاش برای گرفتن پاسخ چطور تمام شد. */
type TurnOutcome =
  /** پایان طبیعی — چه با پاسخ، چه با خطای اعلام‌شدهٔ سرور */
  | 'completed'
  /** Barge-In یا نوبت منسوخ */
  | 'aborted'
  /** اتصال وسط کار قطع شد — تنها حالتی که ارزش تلاش مجدد دارد */
  | 'dropped';

/** تعداد کل تلاش‌ها، شامل تلاش اول (§۱۲.۲). */
const RECONNECT_ATTEMPTS = 3;

/**
 * انتظار پیش از تلاش بعدی.
 *
 * اگر مرورگر بداند شبکه قطع است، انتظار بی‌هدف بی‌فایده است: منتظر
 * رویداد `online` می‌مانیم تا لحظه‌ای که واقعاً برگشت تلاش کنیم.
 */
async function waitBeforeReconnect(attempt: number): Promise<void> {
  const backoffMs = Math.min(4000, 600 * 2 ** attempt);

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await new Promise<void>((resolve) => {
      const done = () => {
        window.removeEventListener('online', done);
        clearTimeout(timer);
        resolve();
      };
      // سقف انتظار تا وضعیت برای همیشه معلق نماند.
      const timer = setTimeout(done, 20_000);
      window.addEventListener('online', done, { once: true });
    });
  }

  await new Promise((resolve) => setTimeout(resolve, backoffMs));
}

export function useConversationEngine() {
  const store = useConversation();
  const {
    conversationId,
    config,
    setState,
    setConfig,
    setConversationId,
    startTurn,
    appendToken,
    setMeta,
    setToolActivity,
    markRefused,
    finishTurn,
    abortTurn,
    restartTurn,
    setPartialTranscript,
    setMicEnabled,
    setMicError,
    setError,
    reset,
  } = store;

  const audioRef = useRef<AudioQueue | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const recognizerRef = useRef<BrowserSpeechRecognizer | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const activeTurnRef = useRef<string | null>(null);
  const speakingRef = useRef(false);
  const lastActivityRef = useRef(Date.now());

  // ── راه‌اندازی اولیه ─────────────────────────────────────────
  useEffect(() => {
    setConversationId(newId());

    let cancelled = false;
    void fetch('/api/config')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: RuntimeConfig | null) => {
        if (!cancelled && data) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) setError('ارتباط با سرور برقرار نشد.');
      });

    return () => {
      cancelled = true;
    };
    // فقط یک‌بار در Mount اجرا می‌شود.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const audio = useMemo(() => {
    if (typeof window === 'undefined') return null;
    if (!audioRef.current) {
      audioRef.current = new AudioQueue({
        onFirstAudio: () => {
          // §فاز ۲: وضعیت `speaking` با شروع **صدا** فعال می‌شود، نه متن.
          speakingRef.current = true;
          setState('speaking');
          reportTiming(activeTurnRef.current, { firstAudioAt: Date.now() });
        },
        onPlaybackEnd: () => {
          speakingRef.current = false;
          if (!activeTurnRef.current) setState('idle');
        },
        onDegraded: (message) => {
          // §۱۲.۲ — خرابی TTS نباید مکالمه را به حالت خطا ببرد؛ متن
          // باید ادامه پیدا کند. پس یک اعلان کوتاه، نه `setError`.
          if (message) toast.warning(message, { description: 'پاسخ را به‌صورت متنی می‌بینید.' });
          // بدون صدا، «صحبت کردن» یعنی جاری شدن متن.
          if (activeTurnRef.current) setState('speaking');
        },
      });
    }
    return audioRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      // ترتیب مهم است: اول نوبت فعال باطل می‌شود، بعد جریان لغو.
      // وگرنه حلقهٔ اتصال مجدد پس از Unmount هم درخواست می‌فرستد.
      activeTurnRef.current = null;
      audioRef.current?.dispose();
      recognizerRef.current?.stop();
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      streamAbortRef.current?.abort();
    };
  }, []);

  // ── قطع کردن (Barge-In) ─────────────────────────────────────
  const interrupt = useCallback(
    (options: { notifyServer?: boolean } = {}) => {
      const hadActivity = Boolean(activeTurnRef.current) || speakingRef.current;
      if (!hadActivity) return;

      // ۱) سکوت فوری — پیش از هر کار شبکه‌ای، تا زیر ۳۰۰ms بماند (F8.1)
      audio?.stopAll();
      speakingRef.current = false;

      // ۲) قطع جریان SSE
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      activeTurnRef.current = null;

      abortTurn();

      // ۳) آزادسازی منابع سرور (پاسخش را منتظر نمی‌مانیم)
      if (options.notifyServer !== false && conversationId) {
        void fetch('/api/conversation/interrupt', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ conversationId }),
          keepalive: true,
        }).catch(() => {});
      }
    },
    [audio, abortTurn, conversationId],
  );

  // ── ارسال پیام ───────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string, inputType: 'text' | 'voice' = 'text', vadStartAt?: number) => {
      const message = text.trim();
      if (!message || !conversationId) return;

      lastActivityRef.current = Date.now();

      // ارسال پیام جدید حین پاسخ‌دهی، پاسخ قبلی را لغو می‌کند (F4.5).
      if (activeTurnRef.current || speakingRef.current) {
        interrupt({ notifyServer: false });
      }

      let turnId = newId();
      activeTurnRef.current = turnId;
      startTurn(turnId, message);
      setPartialTranscript('');

      audio?.resetTiming();
      void audio?.unlock();

      const ttsAvailable = config?.speech.ttsAvailable ?? false;

      /**
       * پایان نوبت با خطا.
       *
       * `abortTurn` پیش از `setError` لازم است: بدون آن، حباب خالی
       * «در حال فکر کردن» با `pending: true` در تاریخچه می‌ماند و در
       * نوبت‌های بعدی هم دیده می‌شود. پاسخ نیمه‌کاره اگر متنی داشته
       * باشد حفظ می‌شود.
       */
      const failTurn = (reason: string) => {
        activeTurnRef.current = null;
        abortTurn();
        setError(reason);
      };

      /**
       * یک تلاش کامل برای گرفتن پاسخ.
       *
       * برمی‌گرداند که نوبت چطور تمام شد تا حلقهٔ بیرونی بداند
       * ارزش اتصال مجدد دارد یا نه (§۱۲.۲).
       */
      const attemptTurn = async (
        attemptTurnId: string,
        retryOfTurnId?: string,
      ): Promise<TurnOutcome> => {
      const controller = new AbortController();
      streamAbortRef.current = controller;

      let sawFirstToken = false;

      try {
        for await (const event of streamSse(
          '/api/chat',
          { conversationId, turnId: attemptTurnId, message, inputType, vadStartAt, retryOfTurnId },
          controller.signal,
        )) {
          // رویدادهای نوبت منسوخ Drop می‌شوند (F8.3).
          if (activeTurnRef.current !== attemptTurnId) return 'aborted';

          switch (event.event) {
            case 'token': {
              const data = event.data as { turnId: string; token: string };
              if (!sawFirstToken) {
                sawFirstToken = true;
                // بدون TTS، «صحبت کردن» یعنی نمایش متن.
                if (!ttsAvailable) setState('speaking');
              }
              appendToken(data.turnId, data.token);
              break;
            }

            case 'sentence': {
              const data = event.data as { turnId: string; sentence: string; index: number };
              if (ttsAvailable) audio?.enqueue(data.sentence, data.turnId, data.index);
              break;
            }

            case 'meta': {
              const data = event.data as {
                turnId: string;
                sources?: Array<{ title: string; page: number | null }>;
              };
              setMeta(data.turnId, { sources: data.sources });
              break;
            }

            case 'tool_call': {
              const data = event.data as {
                name: string;
                status: 'started' | 'success' | 'error' | 'timeout';
              };
              setToolActivity(data);
              break;
            }

            case 'refused': {
              const data = event.data as { turnId: string; reason: string };
              markRefused(data.turnId, data.reason);
              break;
            }

            case 'aborted': {
              activeTurnRef.current = null;
              abortTurn();
              return 'aborted';
            }

            case 'error': {
              const data = event.data as { error: string };
              failTurn(data.error);
              return 'completed';
            }

            case 'done': {
              activeTurnRef.current = null;
              finishTurn(attemptTurnId);
              // اگر صدا هنوز در حال پخش است، وضعیت `speaking` می‌ماند
              // تا صف خالی شود.
              if (speakingRef.current) setState('speaking');
              return 'completed';
            }

            default:
              break;
          }
        }

        // جریان بدون هیچ رویداد پایانی تمام شد — یعنی اتصال وسط کار
        // قطع شده. بدون این شاخه، نوبت برای همیشه در حالت «در حال
        // فکر کردن» می‌ماند و کاربر هیچ‌وقت نمی‌فهمد چه شد.
        //
        // `streamSse` هنگام لغو هم عادی تمام می‌شود، پس اول باید
        // مطمئن شویم این پایان از سر لغو نبوده وگرنه پس از Unmount
        // یا Barge-In درخواست تازه می‌فرستیم.
        return controller.signal.aborted ? 'aborted' : 'dropped';
      } catch (error) {
        if (controller.signal.aborted) return 'aborted';

        // خطای سمت سرور پیام روشنی دارد؛ فقط خطای شبکه و ۵xx ارزش
        // تلاش مجدد دارند. ۴۲۹ عمداً مستثناست: پنجرهٔ محدودیت نرخ
        // یک دقیقه است و Backoff چندصد میلی‌ثانیه‌ای فقط سه بار به
        // همان دیوار می‌خورد و پیام دقیق سرور را هم دور می‌ریزد.
        if (error instanceof SseHttpError && !isRetryableStatus(error.status)) {
          failTurn(error.message);
          return 'completed';
        }
        if (error instanceof SseHttpError && error.status === 429) {
          failTurn(error.message);
          return 'completed';
        }
        return 'dropped';
      } finally {
        if (streamAbortRef.current === controller) streamAbortRef.current = null;
      }
      };

      // ── حلقهٔ اتصال مجدد (§۱۲.۲ و فاز ۴) ──────────────────────
      let previousTurnId: string | undefined;

      for (let attempt = 0; ; attempt += 1) {
        const outcome = await attemptTurn(turnId, previousTurnId);
        if (outcome !== 'dropped') return;

        // کاربر در این فاصله سؤال تازه‌ای پرسیده — این نوبت دیگر مال
        // ما نیست و نباید نه خطایی بدهد نه نوبت جدید را خراب کند.
        if (activeTurnRef.current !== turnId) return;

        if (attempt >= RECONNECT_ATTEMPTS - 1) {
          failTurn('ارتباط با سرور قطع شد. لطفاً دوباره بپرسید.');
          return;
        }

        // صدای نیمه‌کاره باید همین‌جا قطع شود، وگرنه بقیه‌اش وسط
        // «در حال اتصال مجدد» پخش می‌شود. `resetTiming` هم لازم است:
        // بدون آن صف هنوز فکر می‌کند صدای این نوبت پخش شده، پس در
        // تلاش دوم نه `onFirstAudio` می‌دهد و نه — اگر TTS در تلاش
        // اول خراب شده بود — اصلاً درخواستی می‌فرستد.
        audio?.stopAll();
        audio?.resetTiming();
        setState('reconnecting');

        await waitBeforeReconnect(attempt);
        if (activeTurnRef.current !== turnId) return; // کاربر ادامه داده

        // نوبت تازه با شناسهٔ تازه: سرور نوبت قطع‌شده را نمی‌تواند
        // از سر بگیرد، پس همان پرسش از نو پرسیده می‌شود و پاسخ
        // نیمه‌کاره پاک می‌شود تا به پاسخ جدید نچسبد.
        const nextTurnId = newId();
        restartTurn(turnId, nextTurnId);
        activeTurnRef.current = nextTurnId;
        previousTurnId = turnId;
        turnId = nextTurnId;
      }
    },
    [
      conversationId,
      config,
      audio,
      interrupt,
      startTurn,
      appendToken,
      setMeta,
      setToolActivity,
      markRefused,
      finishTurn,
      abortTurn,
      restartTurn,
      setError,
      setState,
      setPartialTranscript,
    ],
  );

  // ── میکروفون ─────────────────────────────────────────────────
  const stopMic = useCallback(() => {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    setMicEnabled(false);
    setPartialTranscript('');
    if (!activeTurnRef.current && !speakingRef.current) setState('idle');
  }, [setMicEnabled, setPartialTranscript, setState]);

  const startMic = useCallback(async () => {
    if (config?.speech.sttMode !== 'browser') {
      setMicError('گفتگوی صوتی در این نصب فعال نیست. لطفاً سؤالتان را تایپ کنید.');
      return;
    }
    if (!isSpeechRecognitionSupported()) {
      setMicError('مرورگر شما از تشخیص گفتار پشتیبانی نمی‌کند. لطفاً تایپ کنید.');
      return;
    }

    const permission = await requestMicrophone();
    if (!permission.ok) {
      setMicError(permission.message);
      return;
    }

    micStreamRef.current = permission.stream;
    setMicError(null);
    await audio?.unlock();

    let vadStartAt = Date.now();

    const recognizer = new BrowserSpeechRecognizer({
      onSpeechStart: () => {
        vadStartAt = Date.now();
        lastActivityRef.current = vadStartAt;
        // Barge-In: کاربر وسط حرف آواتار صحبت کرده (§F8).
        if (speakingRef.current || activeTurnRef.current) {
          interrupt();
        }
        setState('listening');
      },
      onPartial: (text) => setPartialTranscript(text),
      onFinal: (text) => {
        setPartialTranscript('');
        void sendMessage(text, 'voice', vadStartAt);
      },
      onError: (message) => {
        setMicError(message);
        stopMic();
      },
      onEnd: () => {
        setMicEnabled(false);
      },
    });

    if (recognizer.start()) {
      recognizerRef.current = recognizer;
      setMicEnabled(true);
      setState('listening');
    }
  }, [
    config,
    audio,
    interrupt,
    sendMessage,
    setMicEnabled,
    setMicError,
    setPartialTranscript,
    setState,
    stopMic,
  ]);

  const toggleMic = useCallback(() => {
    if (recognizerRef.current) stopMic();
    else void startMic();
  }, [startMic, stopMic]);

  // ── بازنشانی مکالمه ──────────────────────────────────────────
  const resetConversation = useCallback(async () => {
    interrupt({ notifyServer: false });

    try {
      const response = await fetch('/api/conversation/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      });
      const data = (await response.json()) as { conversationId?: string };
      reset(data.conversationId ?? newId());
    } catch {
      reset(newId());
    }

    lastActivityRef.current = Date.now();
  }, [conversationId, interrupt, reset]);

  // ── بازنشانی خودکار در حالت کیوسک (§۴.۲) ────────────────────
  useEffect(() => {
    const seconds = config?.kioskResetSeconds ?? 0;
    if (seconds <= 0) return;

    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      const busy = Boolean(activeTurnRef.current) || speakingRef.current;
      if (!busy && idle > seconds * 1000 && useConversation.getState().messages.length > 0) {
        void resetConversation();
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [config?.kioskResetSeconds, resetConversation]);

  return { sendMessage, toggleMic, interrupt, resetConversation, audio };
}

function reportTiming(turnId: string | null, timings: Record<string, number>): void {
  if (!turnId) return;
  void fetch('/api/conversation/timing', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ turnId, ...timings }),
    keepalive: true,
  }).catch(() => {});
}
