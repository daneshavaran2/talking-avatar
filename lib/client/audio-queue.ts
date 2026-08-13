'use client';

/**
 * صف پخش صدا با Web Audio API (§فاز ۲) و منبع زمان لیپ‌سینک (§F7).
 *
 * سه الزام هم‌زمان:
 *  ۱. هر جمله به‌محض آماده شدن پخش شود (تأخیر پایین، F6.4)
 *  ۲. جمله‌ها پشت‌سرهم و بدون همپوشانی شنیده شوند
 *  ۳. لیپ‌سینک دقیقاً با همان صدایی که شنیده می‌شود هماهنگ باشد
 *
 * راه‌حل ۳: هر جمله وقتی زمان‌بندی می‌شود، بازهٔ دقیقش روی ساعت
 * AudioContext گزارش می‌شود. موتور لیپ‌سینک همان ساعت را می‌خواند،
 * نه `Date.now()`. این تنها راه رسیدن به خطای زیر ۸۰ میلی‌ثانیه
 * (F7.1) است — ساعت سیستم با ساعت کارت صدا هم‌گام نیست.
 *
 * Barge-In (§F8): `stopAll()` باید در کمتر از ۳۰۰ میلی‌ثانیه صدا را
 * قطع کند — همهٔ Sourceهای فعال متوقف، صف خالی، و درخواست‌های
 * در پرواز Abort می‌شوند.
 */

type QueueItem = {
  index: number;
  text: string;
  promise: Promise<AudioBuffer | null>;
};

/** بازهٔ پخش یک جمله روی ساعت AudioContext (ثانیه). */
export type ScheduledSentence = {
  text: string;
  startTime: number;
  endTime: number;
};

export type AudioQueueCallbacks = {
  /** اولین باری که صدا واقعاً شروع به پخش می‌کند (برای §۱۰.۱) */
  onFirstAudio?: () => void;
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  /** زمان‌بندی یک جمله — ورودی موتور لیپ‌سینک */
  onSentenceScheduled?: (sentence: ScheduledSentence) => void;
  onError?: (message: string) => void;
};

export class AudioQueue {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private amplitudeBuffer: Uint8Array<ArrayBuffer> | null = null;

  private pending: QueueItem[] = [];
  private activeSources = new Set<AudioBufferSourceNode>();
  private controllers = new Set<AbortController>();
  private nextStartTime = 0;
  private draining = false;
  private playedAny = false;
  private generation = 0;

  /**
   * قلاب‌های موتور لیپ‌سینک.
   *
   * جدا از `callbacks` سازنده‌اند چون مصرف‌کننده‌شان (کامپوننت آواتار)
   * پس از ساخت صف وصل می‌شود و ممکن است چند بار عوض شود.
   */
  onSentenceScheduled?: (sentence: ScheduledSentence) => void;
  onCleared?: () => void;

  constructor(private readonly callbacks: AudioQueueCallbacks = {}) {}

  /** باید از دل یک رویداد کاربر صدا زده شود تا مرورگر اجازهٔ صدا بدهد. */
  async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (context.state === 'suspended') {
      await context.resume().catch(() => {});
    }
  }

  get isPlaying(): boolean {
    return this.activeSources.size > 0;
  }

  /** ساعت صوتی — مرجع زمانی لیپ‌سینک. */
  get currentTime(): number {
    return this.context?.currentTime ?? 0;
  }

  /**
   * بلندی لحظه‌ای صدا (۰ تا ۱).
   * دهان را متناسب با شدت واقعی صدا باز می‌کند؛ بدون این، همهٔ
   * هجاها یک‌اندازه باز می‌شوند و حرکت مکانیکی به نظر می‌رسد.
   */
  get amplitude(): number {
    const analyser = this.analyser;
    const buffer = this.amplitudeBuffer;
    if (!analyser || !buffer || this.activeSources.size === 0) return 0;

    analyser.getByteTimeDomainData(buffer);

    let sumOfSquares = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const centered = (buffer[i]! - 128) / 128;
      sumOfSquares += centered * centered;
    }

    const rms = Math.sqrt(sumOfSquares / buffer.length);
    // بهرهٔ تجربی: گفتار معمولی حدود ۰٫۰۵ تا ۰٫۲۵ RMS دارد.
    return Math.min(1, rms * 4.5);
  }

  /**
   * یک جمله را به صف اضافه می‌کند. دریافت و رمزگشایی بلافاصله
   * شروع می‌شود؛ پخش به‌ترتیب انجام می‌گیرد.
   */
  enqueue(sentence: string, turnId: string, index: number): void {
    const generation = this.generation;
    const controller = new AbortController();
    this.controllers.add(controller);

    const promise = this.fetchAndDecode(sentence, turnId, controller)
      .catch(() => null)
      .finally(() => {
        this.controllers.delete(controller);
      });

    // اگر در این فاصله Barge-In رخ داده باشد، نتیجه دور ریخته می‌شود.
    if (generation !== this.generation) return;

    this.pending.push({ index, text: sentence, promise });
    this.pending.sort((a, b) => a.index - b.index);
    void this.drain(generation);
  }

  /** قطع فوری همه‌چیز — زنجیرهٔ لغو Barge-In (§F8). */
  stopAll(): void {
    this.generation += 1;
    this.pending = [];

    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();

    for (const source of this.activeSources) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        /* از قبل متوقف شده */
      }
    }
    this.activeSources.clear();

    this.nextStartTime = 0;
    this.draining = false;
    // زمان‌بندی‌های لیپ‌سینک هم باید دور ریخته شوند وگرنه دهان
    // پس از سکوت شدن صدا به حرکتش ادامه می‌دهد (F8.3).
    this.onCleared?.();
    this.callbacks.onPlaybackEnd?.();
  }

  /** پایان نوبت — آماده‌سازی برای نوبت بعدی بدون قطع صدای فعلی. */
  resetTiming(): void {
    this.playedAny = false;
  }

  dispose(): void {
    this.stopAll();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.analyser = null;
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('مرورگر از Web Audio پشتیبانی نمی‌کند.');

      this.context = new Ctor();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.65;
      this.analyser.connect(this.context.destination);
      this.amplitudeBuffer = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    }
    return this.context;
  }

  private async fetchAndDecode(
    sentence: string,
    turnId: string,
    controller: AbortController,
  ): Promise<AudioBuffer | null> {
    const response = await fetch('/api/speech/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: sentence, turnId }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // ۵۰۱ یعنی TTS پیکربندی نشده — تنزل به «فقط متن» (§۱۲.۲).
      if (response.status !== 501) {
        this.callbacks.onError?.('صدا موقتاً در دسترس نیست.');
      }
      return null;
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0) return null;

    return this.ensureContext().decodeAudioData(bytes);
  }

  private async drain(generation: number): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    try {
      while (this.pending.length > 0) {
        if (generation !== this.generation) return;

        const item = this.pending.shift()!;
        const buffer = await item.promise;

        if (generation !== this.generation) return;
        if (!buffer) continue;

        this.schedule(buffer, item.text, generation);
      }
    } finally {
      this.draining = false;
    }
  }

  private schedule(buffer: AudioBuffer, text: string, generation: number): void {
    const context = this.ensureContext();
    const analyser = this.analyser;
    if (!analyser) return;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);

    const startAt = Math.max(context.currentTime, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;

    this.activeSources.add(source);

    // ورودی موتور لیپ‌سینک: بازهٔ دقیق این جمله روی ساعت صوتی.
    const scheduled: ScheduledSentence = {
      text,
      startTime: startAt,
      endTime: startAt + buffer.duration,
    };
    this.callbacks.onSentenceScheduled?.(scheduled);
    this.onSentenceScheduled?.(scheduled);

    if (!this.playedAny) {
      this.playedAny = true;
      this.callbacks.onFirstAudio?.();
      this.callbacks.onPlaybackStart?.();
    }

    source.onended = () => {
      this.activeSources.delete(source);
      if (generation !== this.generation) return;
      if (this.activeSources.size === 0 && this.pending.length === 0) {
        this.nextStartTime = 0;
        this.callbacks.onPlaybackEnd?.();
      }
    };
  }
}
