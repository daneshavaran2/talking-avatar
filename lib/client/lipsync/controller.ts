'use client';

import type { AudioQueue, ScheduledSentence } from '@/lib/client/audio-queue';
import { AvatarRenderer } from '@/lib/client/lipsync/renderer';
import type { FaceGeometry } from '@/lib/lipsync/geometry';
import {
  buildVisemeTimeline,
  sampleViseme,
  VISEME_SHAPES,
  type VisemeFrame,
} from '@/lib/lipsync/visemes';

/**
 * موتور لیپ‌سینک بلادرنگ (§F7).
 *
 * مرجع زمان **ساعت AudioContext** است، نه `Date.now()` و نه شمارندهٔ
 * فریم. دلیلش این است که صدا با ساعت کارت صدا پخش می‌شود و آن ساعت
 * با ساعت سیستم چند ده میلی‌ثانیه اختلاف دارد و به‌مرور دریفت
 * می‌کند. با خواندن همان ساعتی که صدا رویش پخش می‌شود، خطای
 * هماهنگی به فاصلهٔ بین دو فریم محدود می‌شود (~۱۶ میلی‌ثانیه در
 * ۶۰fps) — بسیار زیر بودجهٔ ۸۰ میلی‌ثانیهٔ F7.1.
 *
 * انتقال Idle ↔ Speaking بی‌درز است (F7.2): حلقهٔ رندر هرگز متوقف
 * نمی‌شود؛ فقط ورودی شکل دهان عوض می‌شود.
 */

type ScheduledTimeline = ScheduledSentence & {
  frames: VisemeFrame[];
};

export class LipSyncController {
  private readonly renderer: AvatarRenderer;
  private timelines: ScheduledTimeline[] = [];
  private frameHandle: number | null = null;
  private startedAt = 0;
  private resizeObserver: ResizeObserver | null = null;
  private speakingNow = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly audio: AudioQueue,
    private readonly onSpeakingChange?: (speaking: boolean) => void,
  ) {
    this.renderer = new AvatarRenderer(canvas);
    this.startedAt = performance.now();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.renderer.resize());
      this.resizeObserver.observe(canvas);
    }
  }

  setImage(image: HTMLImageElement): void {
    this.renderer.setImage(image);
  }

  setGeometry(geometry: FaceGeometry): void {
    this.renderer.setGeometry(geometry);
  }

  /**
   * ثبت زمان‌بندی یک جمله. زنجیرهٔ ویزیم از متن ساخته و روی طول
   * واقعی صدا کشیده می‌شود.
   */
  schedule(sentence: ScheduledSentence): void {
    const durationMs = (sentence.endTime - sentence.startTime) * 1000;
    if (durationMs <= 0) return;

    this.timelines.push({
      ...sentence,
      frames: buildVisemeTimeline(sentence.text, durationMs),
    });

    // ترتیب زمانی حفظ می‌شود تا جستجوی هر فریم ارزان بماند.
    this.timelines.sort((a, b) => a.startTime - b.startTime);
  }

  /** Barge-In: زمان‌بندی‌های باقی‌مانده دور ریخته می‌شوند (F8.3). */
  clear(): void {
    this.timelines = [];
    this.setSpeaking(false);
  }

  start(): void {
    if (this.frameHandle !== null) return;
    this.renderer.resize();

    const tick = () => {
      this.frameHandle = requestAnimationFrame(tick);
      this.renderFrame();
    };

    this.frameHandle = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }

  dispose(): void {
    this.stop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.timelines = [];
  }

  private renderFrame(): void {
    const now = this.audio.currentTime;

    // زمان‌بندی‌های تمام‌شده حذف می‌شوند تا آرایه رشد نکند.
    if (this.timelines.length > 0) {
      const firstLive = this.timelines.findIndex((entry) => entry.endTime > now);
      if (firstLive > 0) this.timelines = this.timelines.slice(firstLive);
      else if (firstLive === -1) this.timelines = [];
    }

    const active = this.timelines.find(
      (entry) => now >= entry.startTime && now < entry.endTime,
    );

    const speaking = Boolean(active);
    this.setSpeaking(speaking);

    const shape = active
      ? sampleViseme(active.frames, (now - active.startTime) * 1000)
      : VISEME_SHAPES.sil;

    this.renderer.render({
      shape,
      amplitude: speaking ? this.audio.amplitude : 0,
      speaking,
      timeMs: performance.now() - this.startedAt,
    });
  }

  private setSpeaking(speaking: boolean): void {
    if (this.speakingNow === speaking) return;
    this.speakingNow = speaking;
    this.onSpeakingChange?.(speaking);
  }
}

