'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AudioQueue } from '@/lib/client/audio-queue';
import { streamSse } from '@/lib/client/sse-client';
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
        onError: (message) => setError(message),
      });
    }
    return audioRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
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

      const turnId = newId();
      activeTurnRef.current = turnId;
      startTurn(turnId, message);
      setPartialTranscript('');

      audio?.resetTiming();
      void audio?.unlock();

      const controller = new AbortController();
      streamAbortRef.current = controller;

      const ttsAvailable = config?.speech.ttsAvailable ?? false;
      let sawFirstToken = false;

      try {
        for await (const event of streamSse(
          '/api/chat',
          { conversationId, turnId, message, inputType, vadStartAt },
          controller.signal,
        )) {
          // رویدادهای نوبت منسوخ Drop می‌شوند (F8.3).
          if (activeTurnRef.current !== turnId) break;

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
              return;
            }

            case 'error': {
              const data = event.data as { error: string };
              activeTurnRef.current = null;
              setError(data.error);
              return;
            }

            case 'done': {
              activeTurnRef.current = null;
              finishTurn(turnId);
              // اگر صدا هنوز در حال پخش است، وضعیت `speaking` می‌ماند
              // تا صف خالی شود.
              if (speakingRef.current) setState('speaking');
              return;
            }

            default:
              break;
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        activeTurnRef.current = null;
        setError(error instanceof Error ? error.message : 'ارتباط با سرور قطع شد.');
      } finally {
        if (streamAbortRef.current === controller) streamAbortRef.current = null;
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

  return { sendMessage, toggleMic, interrupt, resetConversation };
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
