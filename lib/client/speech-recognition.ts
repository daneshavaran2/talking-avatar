'use client';

/**
 * تشخیص گفتار در مرورگر (§F5، حالت `browser`).
 *
 * Web Speech API در کروم/اج فارسی (fa-IR) را پشتیبانی می‌کند و
 * الزامات کلیدی سند را برآورده می‌کند:
 *  - F5.2: صدا جریانی پردازش می‌شود؛ هیچ فایل کاملی ساخته نمی‌شود
 *  - F5.3: نتایج جزئی (interim) زنده می‌رسند
 *  - F5.4: پایان جمله را خودش تشخیص می‌دهد و نتیجهٔ نهایی می‌دهد
 *
 * ⚠️ محدودیت واقعی: فایرفاکس و بعضی مرورگرهای موبایل این API را
 * ندارند. در آن حالت `isSupported()` نادرست برمی‌گردد و UI باید
 * ورودی تایپی را پیشنهاد دهد (F5.7) — نه اینکه دکمهٔ بی‌اثر نشان دهد.
 *
 * برای استقلال از مرورگر، پیکربندی `STT_PROVIDER=media-engine` صدا
 * را به Whisper روی سرویس GPU می‌فرستد.
 */

type SpeechRecognitionAlternative = { transcript: string; confidence: number };
type SpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
};
type SpeechRecognitionResultList = {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEventLike = { error: string; message?: string };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getConstructor() !== null;
}

export type SpeechCallbacks = {
  /** متن جزئی، در حال تغییر (F5.3) */
  onPartial: (text: string) => void;
  /** جملهٔ نهایی — آمادهٔ ارسال به /api/chat */
  onFinal: (text: string) => void;
  /** تشخیص شروع صحبت — نقطهٔ شروع Barge-In (F8.4) */
  onSpeechStart: () => void;
  onError: (message: string) => void;
  onEnd: () => void;
};

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'دسترسی میکروفون داده نشد. می‌توانید سؤالتان را تایپ کنید.',
  'service-not-allowed': 'مرورگر اجازهٔ تشخیص گفتار نداد. لطفاً تایپ کنید.',
  'no-speech': '',
  aborted: '',
  'audio-capture': 'میکروفونی پیدا نشد. لطفاً سؤالتان را تایپ کنید.',
  network: 'ارتباط شبکه برای تشخیص گفتار قطع شد.',
};

export class BrowserSpeechRecognizer {
  private recognition: SpeechRecognitionLike | null = null;
  private manuallyStopped = false;
  private running = false;

  constructor(private readonly callbacks: SpeechCallbacks) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): boolean {
    const Ctor = getConstructor();
    if (!Ctor) {
      this.callbacks.onError('مرورگر شما از تشخیص گفتار پشتیبانی نمی‌کند. لطفاً تایپ کنید.');
      return false;
    }

    this.stop();
    this.manuallyStopped = false;

    const recognition = new Ctor();
    recognition.lang = 'fa-IR';
    // پیوسته می‌ماند تا کاربر بتواند چند نوبت حرف بزند و Barge-In
    // حتی وقتی آواتار در حال صحبت است کار کند (F8.4).
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      this.running = true;
    };

    recognition.onspeechstart = () => {
      this.callbacks.onSpeechStart();
    };

    recognition.onresult = (event) => {
      let partial = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const transcript = result[0]?.transcript ?? '';

        if (result.isFinal) {
          const finalText = transcript.trim();
          if (finalText) this.callbacks.onFinal(finalText);
        } else {
          partial += transcript;
        }
      }

      if (partial.trim()) this.callbacks.onPartial(partial.trim());
    };

    recognition.onerror = (event) => {
      const message = ERROR_MESSAGES[event.error];
      // 'no-speech' و 'aborted' رویدادهای عادی‌اند، نه خطا.
      if (message) this.callbacks.onError(message);
    };

    recognition.onend = () => {
      this.running = false;
      if (this.manuallyStopped) {
        this.callbacks.onEnd();
        return;
      }
      // مرورگر گاهی خودش قطع می‌کند؛ دوباره وصل می‌شویم تا میکروفون
      // از دید کاربر روشن بماند.
      try {
        recognition.start();
      } catch {
        this.callbacks.onEnd();
      }
    };

    this.recognition = recognition;

    try {
      recognition.start();
      return true;
    } catch {
      this.callbacks.onError('راه‌اندازی تشخیص گفتار ممکن نشد.');
      return false;
    }
  }

  stop(): void {
    if (!this.recognition) return;
    this.manuallyStopped = true;
    this.running = false;

    try {
      this.recognition.abort();
    } catch {
      /* از قبل متوقف شده */
    }
    this.recognition = null;
  }
}

/**
 * درخواست دسترسی میکروفون با تنظیمات کیفیت صدا (F5.1).
 *
 * Web Speech API خودش میکروفون را می‌گیرد، ولی این فراخوانی صریح
 * دو کار می‌کند: خطای مجوز را زودتر و با پیام فارسی نشان می‌دهد،
 * و تنظیمات حذف اکو / کاهش نویز را اعمال می‌کند.
 */
export async function requestMicrophone(): Promise<
  { ok: true; stream: MediaStream } | { ok: false; message: string }
> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, message: 'مرورگر شما به میکروفون دسترسی ندارد. لطفاً تایپ کنید.' };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    return { ok: true, stream };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return {
        ok: false,
        message: 'برای گفتگوی صوتی، دسترسی میکروفون لازم است. می‌توانید تایپ کنید.',
      };
    }
    if (name === 'NotFoundError') {
      return { ok: false, message: 'میکروفونی پیدا نشد. لطفاً سؤالتان را تایپ کنید.' };
    }
    return { ok: false, message: 'دسترسی به میکروفون ممکن نشد. لطفاً تایپ کنید.' };
  }
}
