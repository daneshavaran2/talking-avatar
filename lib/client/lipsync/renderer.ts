'use client';

import {
  DEFAULT_FACE_GEOMETRY,
  type FaceBox,
  type FaceGeometry,
} from '@/lib/lipsync/geometry';
import type { VisemeShape } from '@/lib/lipsync/visemes';

/**
 * رندر آواتار روی Canvas — لایهٔ بصری لیپ‌سینک (§F7).
 *
 * روش کار (تکنیک «عروسک دوبعدی» که در انیمیشن و ریگ‌های VTuber
 * استاندارد است):
 *
 *  ۱. تصویر پایه کشیده می‌شود.
 *  ۲. برای باز شدن دهان، ناحیهٔ زیر لب بالا به‌اندازهٔ باز شدن به
 *     پایین جابه‌جا می‌شود — همان کاری که فک واقعی می‌کند. این تنها
 *     چیزی است که «حرف زدن» را باورپذیر می‌کند؛ صرفاً کشیدن یک بیضی
 *     سیاه روی دهان، شبیه حرف زدن نیست.
 *  ۳. داخل دهان (تاریکی گلو + خط دندان بالا) داخل ناحیهٔ دهان کشیده
 *     می‌شود، با لبهٔ نرم تا با پوست ترکیب شود.
 *  ۴. حالت Idle: پلک زدن، تنفس، و حرکت جزئی سر (§F1.4).
 *
 * این یک مدل تولیدی نیست و ادعای فوتورئال بودن ندارد؛ یک لیپ‌سینک
 * واقعی و هماهنگ با صداست که بدون GPU در هر مرورگری اجرا می‌شود.
 */

export type RenderState = {
  /** شکل دهان از زنجیرهٔ ویزیم */
  shape: VisemeShape;
  /** دامنهٔ لحظه‌ای صدا (۰ تا ۱) — شدت باز شدن را تعدیل می‌کند */
  amplitude: number;
  /** آیا آواتار در حال صحبت است */
  speaking: boolean;
  /** زمان از شروع، برای انیمیشن‌های Idle */
  timeMs: number;
};

export class AvatarRenderer {
  private context: CanvasRenderingContext2D | null = null;
  private image: HTMLImageElement | null = null;
  private geometry: FaceGeometry = DEFAULT_FACE_GEOMETRY;

  /** حالت پلک: زمان شروع پلک بعدی و پیشرفت پلک جاری */
  private nextBlinkAt = 1200;
  private blinkStartedAt: number | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d');
  }

  setImage(image: HTMLImageElement): void {
    this.image = image;
    this.resize();
  }

  setGeometry(geometry: FaceGeometry): void {
    this.geometry = geometry;
  }

  /** هماهنگ کردن اندازهٔ بوم با اندازهٔ نمایشی و چگالی پیکسل صفحه. */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  render(state: RenderState): void {
    const ctx = this.context;
    const image = this.image;
    if (!ctx || !image || !image.complete || image.naturalWidth === 0) return;

    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);

    // ── نگاشت تصویر به بوم با منطق object-cover ──────────────
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;

    const toCanvasX = (normalized: number) => offsetX + normalized * drawWidth;
    const toCanvasY = (normalized: number) => offsetY + normalized * drawHeight;

    // ── حالت Idle: تنفس و حرکت جزئی سر (§F1.4) ───────────────
    const idle = this.idleTransform(state.timeMs, state.speaking);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(idle.scale, idle.scale);
    ctx.rotate(idle.rotation);
    ctx.translate(-width / 2 + idle.offsetX, -height / 2 + idle.offsetY);

    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

    // میزان باز شدن دهان: شکل ویزیم، تعدیل‌شده با بلندی واقعی صدا.
    const openness = state.speaking
      ? clamp01(state.shape.open * (0.45 + 0.55 * state.amplitude))
      : 0;

    if (openness > 0.02) {
      this.drawJaw(ctx, image, { offsetX, offsetY, drawWidth, drawHeight }, openness);
    }

    this.drawMouth(ctx, state.shape, openness, toCanvasX, toCanvasY, drawWidth, drawHeight);
    this.drawBlink(ctx, image, state.timeMs, { offsetX, offsetY, drawWidth, drawHeight });

    ctx.restore();
  }

  /**
   * حرکت فک: ناحیهٔ بین لب بالا و زیر چانه به پایین جابه‌جا می‌شود.
   * پایین‌تر از چانه گردن است، پس جابه‌جایی روی گردن می‌افتد — دقیقاً
   * همان چیزی که در باز شدن دهان واقعی دیده می‌شود.
   */
  private drawJaw(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    frame: { offsetX: number; offsetY: number; drawWidth: number; drawHeight: number },
    openness: number,
  ): void {
    const { mouth, chinY } = this.geometry;
    const topNormalized = mouth.y - mouth.height * 0.35;
    const bottomNormalized = Math.min(1, chinY + 0.06);
    if (bottomNormalized <= topNormalized) return;

    const travel = openness * mouth.height * 0.85 * frame.drawHeight;

    const sourceTop = topNormalized * image.naturalHeight;
    const sourceHeight = (bottomNormalized - topNormalized) * image.naturalHeight;
    const destTop = frame.offsetY + topNormalized * frame.drawHeight + travel;
    const destHeight = (bottomNormalized - topNormalized) * frame.drawHeight;

    ctx.save();
    ctx.beginPath();
    ctx.rect(
      frame.offsetX,
      frame.offsetY + topNormalized * frame.drawHeight,
      frame.drawWidth,
      frame.drawHeight,
    );
    ctx.clip();

    ctx.drawImage(
      image,
      0,
      sourceTop,
      image.naturalWidth,
      sourceHeight,
      frame.offsetX,
      destTop,
      frame.drawWidth,
      destHeight,
    );
    ctx.restore();
  }

  /** داخل دهان: تاریکی گلو، خط دندان بالا، و لبهٔ نرم. */
  private drawMouth(
    ctx: CanvasRenderingContext2D,
    shape: VisemeShape,
    openness: number,
    toCanvasX: (n: number) => number,
    toCanvasY: (n: number) => number,
    drawWidth: number,
    drawHeight: number,
  ): void {
    const { mouth } = this.geometry;

    const centerX = toCanvasX(mouth.x);
    const centerY = toCanvasY(mouth.y);

    // پهنا با کشیدگی/گردی ویزیم تغییر می‌کند.
    const widthFactor = 1 + shape.wide * 0.32 - shape.round * 0.34;
    const radiusX = (mouth.width * drawWidth * widthFactor) / 2;
    const radiusY = Math.max(
      0.5,
      (openness * mouth.height * drawHeight * 1.35) / 2,
    );

    if (radiusY < 1.2) {
      // دهان بسته — فقط سایهٔ خیلی ملایم خط لب برای حس فشردگی.
      if (shape.press > 0.5) {
        ctx.save();
        ctx.globalAlpha = 0.1 * shape.press;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = Math.max(1, drawHeight * 0.002);
        ctx.beginPath();
        ctx.moveTo(centerX - radiusX * 0.72, centerY);
        ctx.lineTo(centerX + radiusX * 0.72, centerY);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    ctx.save();

    // لبهٔ نرم تا دهانِ کشیده‌شده با پوست ترکیب شود.
    ctx.filter = `blur(${Math.max(0.6, drawHeight * 0.0022)}px)`;

    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.clip();

    // گلو: تیره‌تر در پایین
    const throat = ctx.createLinearGradient(0, centerY - radiusY, 0, centerY + radiusY);
    throat.addColorStop(0, 'rgba(28, 12, 14, 0.92)');
    throat.addColorStop(0.55, 'rgba(48, 16, 20, 0.95)');
    throat.addColorStop(1, 'rgba(20, 8, 10, 0.98)');
    ctx.fillStyle = throat;
    ctx.fillRect(centerX - radiusX, centerY - radiusY, radiusX * 2, radiusY * 2);

    // دندان بالا — فقط وقتی دهان به‌اندازهٔ کافی باز است.
    if (openness > 0.25) {
      const teethHeight = radiusY * 0.34;
      ctx.fillStyle = `rgba(238, 234, 228, ${Math.min(0.9, (openness - 0.2) * 1.9)})`;
      ctx.beginPath();
      ctx.ellipse(
        centerX,
        centerY - radiusY + teethHeight * 0.55,
        radiusX * 0.88,
        teethHeight,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // زبان — عمق می‌دهد وقتی دهان کاملاً باز است.
    if (openness > 0.55) {
      ctx.fillStyle = `rgba(150, 60, 66, ${Math.min(0.75, (openness - 0.5) * 1.4)})`;
      ctx.beginPath();
      ctx.ellipse(
        centerX,
        centerY + radiusY * 0.55,
        radiusX * 0.7,
        radiusY * 0.45,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    ctx.restore();
  }

  /** پلک زدن: نواری از پوست بالای چشم روی چشم کشیده می‌شود. */
  private drawBlink(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    timeMs: number,
    frame: { offsetX: number; offsetY: number; drawWidth: number; drawHeight: number },
  ): void {
    const BLINK_DURATION = 160;

    if (this.blinkStartedAt === null && timeMs >= this.nextBlinkAt) {
      this.blinkStartedAt = timeMs;
    }

    let closure = 0;
    if (this.blinkStartedAt !== null) {
      const elapsed = timeMs - this.blinkStartedAt;
      if (elapsed >= BLINK_DURATION) {
        this.blinkStartedAt = null;
        // فاصلهٔ طبیعی پلک: ۲ تا ۶ ثانیه
        this.nextBlinkAt = timeMs + 2000 + Math.random() * 4000;
      } else {
        const progress = elapsed / BLINK_DURATION;
        closure = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
      }
    }

    if (closure < 0.05) return;

    for (const eye of [this.geometry.leftEye, this.geometry.rightEye]) {
      this.drawEyelid(ctx, image, frame, eye, closure);
    }
  }

  private drawEyelid(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    frame: { offsetX: number; offsetY: number; drawWidth: number; drawHeight: number },
    eye: FaceBox,
    closure: number,
  ): void {
    const lidSourceTop = Math.max(0, eye.y - eye.height * 1.5);
    const lidSourceHeight = eye.height * 0.9;
    const eyeTop = eye.y - eye.height / 2;

    const destHeight = eye.height * closure * frame.drawHeight;
    if (destHeight <= 0.5) return;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
      frame.offsetX + eye.x * frame.drawWidth,
      frame.offsetY + eye.y * frame.drawHeight,
      (eye.width * frame.drawWidth) / 2,
      (eye.height * frame.drawHeight) / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.clip();

    ctx.filter = 'blur(0.5px)';
    ctx.drawImage(
      image,
      (eye.x - eye.width / 2) * image.naturalWidth,
      lidSourceTop * image.naturalHeight,
      eye.width * image.naturalWidth,
      lidSourceHeight * image.naturalHeight,
      frame.offsetX + (eye.x - eye.width / 2) * frame.drawWidth,
      frame.offsetY + eyeTop * frame.drawHeight,
      eye.width * frame.drawWidth,
      destHeight,
    );
    ctx.restore();
  }

  /**
   * تنفس و حرکت جزئی سر.
   *
   * فرکانس‌های ناهماهنگ (اعداد اول‌گونه) عمدی‌اند: اگر همه هم‌دوره
   * باشند حرکت تکراری و مکانیکی به نظر می‌رسد.
   */
  private idleTransform(timeMs: number, speaking: boolean): {
    scale: number;
    rotation: number;
    offsetX: number;
    offsetY: number;
  } {
    const t = timeMs / 1000;
    // حین صحبت حرکت سر کمی بیشتر است — آدم‌ها وقتی حرف می‌زنند
    // ساکن نمی‌مانند (F7.3).
    const gain = speaking ? 1.6 : 1;

    return {
      scale: 1 + Math.sin(t * 0.72) * 0.004,
      rotation: Math.sin(t * 0.41) * 0.0022 * gain,
      offsetX: Math.sin(t * 0.53) * 2.2 * gain,
      offsetY: Math.sin(t * 0.31) * 1.8 + Math.sin(t * 1.13) * 0.6 * gain,
    };
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
