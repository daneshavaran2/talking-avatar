'use client';

import { PlayIcon, RotateCcwIcon, SaveIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { AvatarRenderer } from '@/lib/client/lipsync/renderer';
import { DEFAULT_FACE_GEOMETRY, type FaceGeometry } from '@/lib/lipsync/geometry';
import { buildVisemeTimeline, sampleViseme, VISEME_SHAPES } from '@/lib/lipsync/visemes';

/**
 * کالیبراسیون چهره برای لیپ‌سینک (§F7).
 *
 * چرا لازم است: موتور لیپ‌سینک باید بداند دهان و چشم‌ها کجای عکس‌اند.
 * اگر سرویس GPU فعال باشد این مقادیر خودکار از نقاط کلیدی MediaPipe
 * می‌آیند؛ وگرنه مدیر با چند لغزنده در کمتر از یک دقیقه تنظیمشان
 * می‌کند و نتیجه را زنده می‌بیند.
 *
 * دکمهٔ «آزمایش» یک جملهٔ نمونه را با همان موتور رندر اجرا می‌کند
 * — بدون صدا، صرفاً برای دیدن اینکه دهان درست نشسته است.
 */

const SAMPLE_SENTENCE = 'سلام، من دستیار دیجیتال شما هستم و می‌توانم به سؤالاتتان پاسخ بدهم.';
const SAMPLE_DURATION_MS = 4200;

type GeometryResponse = {
  imageUrl: string;
  geometry: FaceGeometry;
  source: 'manual' | 'landmarks' | 'default';
};

const SOURCE_LABEL: Record<GeometryResponse['source'], string> = {
  manual: 'تنظیم دستی',
  landmarks: 'تشخیص خودکار چهره',
  default: 'مقدار پیش‌فرض',
};

export function FaceCalibration() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<AvatarRenderer | null>(null);
  const frameRef = useRef<number | null>(null);
  const previewStartedAt = useRef<number | null>(null);
  const startedAt = useRef(performance.now());

  const [data, setData] = useState<GeometryResponse | null>(null);
  const [geometry, setGeometry] = useState<FaceGeometry>(DEFAULT_FACE_GEOMETRY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/avatar/geometry');
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'خواندن هندسهٔ چهره ممکن نشد.');
        return;
      }

      const body = (await response.json()) as GeometryResponse;
      setData(body);
      setGeometry(body.geometry);
      setError(null);
    } catch {
      setError('ارتباط با سرور برقرار نشد.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── حلقهٔ رندر پیش‌نمایش ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data?.imageUrl) return;

    const renderer = new AvatarRenderer(canvas);
    rendererRef.current = renderer;

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => renderer.setImage(image);
    image.src = data.imageUrl;

    const timeline = buildVisemeTimeline(SAMPLE_SENTENCE, SAMPLE_DURATION_MS);

    const tick = () => {
      frameRef.current = requestAnimationFrame(tick);

      const now = performance.now();
      const previewStart = previewStartedAt.current;
      const elapsed = previewStart === null ? null : now - previewStart;

      if (elapsed !== null && elapsed > SAMPLE_DURATION_MS) {
        previewStartedAt.current = null;
      }

      const speaking = elapsed !== null && elapsed <= SAMPLE_DURATION_MS;

      renderer.render({
        shape: speaking ? sampleViseme(timeline, elapsed!) : VISEME_SHAPES.sil,
        // بدون صدا دامنهٔ واقعی نداریم؛ یک نوسان ملایم می‌گذاریم تا
        // پیش‌نمایش مرده به نظر نرسد. این فقط پیش‌نمایش است.
        amplitude: speaking ? 0.6 + Math.sin(now / 90) * 0.25 : 0,
        speaking,
        timeMs: now - startedAt.current,
      });
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      rendererRef.current = null;
    };
  }, [data?.imageUrl]);

  // هر تغییر لغزنده بلافاصله در پیش‌نمایش دیده می‌شود.
  useEffect(() => {
    rendererRef.current?.setGeometry(geometry);
  }, [geometry]);

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/avatar/geometry', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(geometry),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? 'ذخیرهٔ کالیبراسیون ممکن نشد.');
        return;
      }

      toast.success('کالیبراسیون ذخیره شد.');
      await load();
    } catch {
      toast.error('ارتباط با سرور برقرار نشد.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    await fetch('/api/admin/avatar/geometry', { method: 'DELETE' }).catch(() => {});
    await load();
    toast.success('به تشخیص خودکار بازگشت.');
  };

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="flex justify-center py-10 pt-10 text-muted-foreground">
          <Spinner className="size-5" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-5">
          <Alert variant="info">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>کالیبراسیون لیپ‌سینک</CardTitle>
        <CardDescription>
          موتور لیپ‌سینک باید بداند دهان و چشم‌ها کجای عکس‌اند. لغزنده‌ها را تنظیم کنید تا
          کادرها روی چهره بنشینند و نتیجه را زنده ببینید.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <div className="relative aspect-[3/4] overflow-hidden rounded-xl border bg-muted">
              <canvas ref={canvasRef} className="size-full" />
              <GuideOverlay geometry={geometry} />
            </div>

            <div className="flex items-center justify-between gap-2">
              {data && <Badge variant="secondary">{SOURCE_LABEL[data.source]}</Badge>}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  previewStartedAt.current = performance.now();
                }}
              >
                <PlayIcon />
                آزمایش
              </Button>
            </div>
          </div>

          <FieldGroup>
            <GeometrySlider
              label="جای افقی دهان"
              value={geometry.mouth.x}
              min={0.2}
              max={0.8}
              onChange={(x) => setGeometry((g) => ({ ...g, mouth: { ...g.mouth, x } }))}
            />
            <GeometrySlider
              label="جای عمودی دهان"
              value={geometry.mouth.y}
              min={0.4}
              max={0.92}
              onChange={(y) => setGeometry((g) => ({ ...g, mouth: { ...g.mouth, y } }))}
            />
            <GeometrySlider
              label="پهنای دهان"
              value={geometry.mouth.width}
              min={0.06}
              max={0.45}
              onChange={(width) => setGeometry((g) => ({ ...g, mouth: { ...g.mouth, width } }))}
            />
            <GeometrySlider
              label="ارتفاع دهان"
              value={geometry.mouth.height}
              min={0.02}
              max={0.25}
              onChange={(height) => setGeometry((g) => ({ ...g, mouth: { ...g.mouth, height } }))}
            />
            <GeometrySlider
              label="خط چانه"
              value={geometry.chinY}
              min={0.5}
              max={0.99}
              onChange={(chinY) => setGeometry((g) => ({ ...g, chinY }))}
            />
            <GeometrySlider
              label="ارتفاع چشم‌ها"
              value={geometry.leftEye.y}
              min={0.2}
              max={0.7}
              onChange={(y) =>
                setGeometry((g) => ({
                  ...g,
                  leftEye: { ...g.leftEye, y },
                  rightEye: { ...g.rightEye, y },
                }))
              }
            />
            <GeometrySlider
              label="فاصلهٔ چشم‌ها"
              value={(geometry.rightEye.x - geometry.leftEye.x) / 2}
              min={0.06}
              max={0.28}
              onChange={(half) =>
                setGeometry((g) => ({
                  ...g,
                  leftEye: { ...g.leftEye, x: 0.5 - half },
                  rightEye: { ...g.rightEye, x: 0.5 + half },
                }))
              }
            />
          </FieldGroup>
        </div>

        <Alert variant="info">
          <AlertDescription>
            این لیپ‌سینک از روی صدا و واج‌های متن فارسی اجرا می‌شود و به GPU نیاز ندارد. برای
            چهرهٔ تولیدی فوتورئال باید یک مدل Lip Sync در سرویس media-engine وصل شود.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? <Spinner /> : <SaveIcon />}
            ذخیرهٔ کالیبراسیون
          </Button>
          <Button type="button" variant="outline" onClick={() => void reset()}>
            <RotateCcwIcon />
            بازگشت به خودکار
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function GeometrySlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field>
      <FieldLabel className="flex items-center justify-between">
        <span>{label}</span>
        <span className="latn text-xs text-muted-foreground">{value.toFixed(3)}</span>
      </FieldLabel>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={0.005}
        onValueChange={([next]) => {
          if (typeof next === 'number') onChange(next);
        }}
      />
    </Field>
  );
}

/** کادرهای راهنما روی پیش‌نمایش تا مدیر ببیند چه چیزی را تنظیم می‌کند. */
function GuideOverlay({ geometry }: { geometry: FaceGeometry }) {
  const boxStyle = (box: FaceGeometry['mouth']) => ({
    insetInlineStart: `${(box.x - box.width / 2) * 100}%`,
    top: `${(box.y - box.height / 2) * 100}%`,
    width: `${box.width * 100}%`,
    height: `${box.height * 100}%`,
  });

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div
        className="absolute rounded-md border border-primary/70"
        style={boxStyle(geometry.mouth)}
      />
      <div
        className="absolute rounded-md border border-state-listening/60"
        style={boxStyle(geometry.leftEye)}
      />
      <div
        className="absolute rounded-md border border-state-listening/60"
        style={boxStyle(geometry.rightEye)}
      />
      <div
        className="absolute inset-x-0 border-t border-dashed border-state-thinking/60"
        style={{ top: `${geometry.chinY * 100}%` }}
      />
    </div>
  );
}
