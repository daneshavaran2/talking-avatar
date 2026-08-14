/**
 * هندسهٔ چهره — مختصات دهان و چشم‌ها روی تصویر آواتار.
 *
 * همهٔ مقادیر نسبی (۰ تا ۱) نسبت به ابعاد تصویرند تا مستقل از
 * رزولوشن باشند.
 *
 * دو منبع دارد:
 *  ۱. نقاط کلیدی MediaPipe از سرویس GPU (دقیق)
 *  ۲. مقادیر پیش‌فرض تن‌سنجی + تنظیم دستی مدیر (وقتی سرویس GPU نیست)
 */

export type FaceBox = {
  /** مرکز افقی */
  x: number;
  /** مرکز عمودی */
  y: number;
  width: number;
  height: number;
};

export type FaceGeometry = {
  mouth: FaceBox;
  leftEye: FaceBox;
  rightEye: FaceBox;
  /** پایین چانه — مرز پایینی ناحیه‌ای که با باز شدن دهان حرکت می‌کند */
  chinY: number;
};

/**
 * پیش‌فرض بر پایهٔ نسبت‌های میانگین چهرهٔ انسان در یک پرترهٔ استاندارد
 * (چهره تقریباً کل کادر را پر کرده، روبه‌رو).
 *
 * این‌ها نقطهٔ شروع‌اند، نه حقیقت مطلق — مدیر در پنل تنظیمشان می‌کند
 * و پیش‌نمایش زنده می‌بیند.
 */
export const DEFAULT_FACE_GEOMETRY: FaceGeometry = {
  mouth: { x: 0.5, y: 0.7, width: 0.2, height: 0.085 },
  leftEye: { x: 0.375, y: 0.44, width: 0.13, height: 0.055 },
  rightEye: { x: 0.625, y: 0.44, width: 0.13, height: 0.055 },
  chinY: 0.88,
};

/** شاخص نقاط کلیدی MediaPipe Face Mesh که به آن‌ها نیاز داریم. */
const MOUTH_LANDMARKS = [61, 291, 13, 14, 78, 308, 0, 17];
const LEFT_EYE_LANDMARKS = [33, 133, 159, 145];
const RIGHT_EYE_LANDMARKS = [362, 263, 386, 374];
const CHIN_LANDMARK = 152;

type Landmark = [number, number, number] | { x: number; y: number; z?: number };

function toPoint(landmark: Landmark): { x: number; y: number } | null {
  if (Array.isArray(landmark)) {
    const [x, y] = landmark;
    return typeof x === 'number' && typeof y === 'number' ? { x, y } : null;
  }
  if (landmark && typeof landmark.x === 'number' && typeof landmark.y === 'number') {
    return { x: landmark.x, y: landmark.y };
  }
  return null;
}

function boxFrom(landmarks: Landmark[], indices: number[], padding: number): FaceBox | null {
  const points = indices
    .map((index) => landmarks[index])
    .filter((entry): entry is Landmark => entry !== undefined)
    .map(toPoint)
    .filter((point): point is { x: number; y: number } => point !== null);

  if (points.length < 2) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const width = (maxX - minX) * (1 + padding);
  const height = (maxY - minY) * (1 + padding);

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: Math.max(0.02, width),
    height: Math.max(0.01, height),
  };
}

/**
 * ساخت هندسه از نقاط کلیدی MediaPipe.
 * اگر نقاط ناقص یا نامعتبر بودند، به پیش‌فرض برمی‌گردد — بهتر از
 * رندر کردن دهان در جای اشتباه.
 */
export function geometryFromLandmarks(raw: unknown): FaceGeometry | null {
  if (!Array.isArray(raw) || raw.length < 400) return null;

  const landmarks = raw as Landmark[];

  const mouth = boxFrom(landmarks, MOUTH_LANDMARKS, 0.25);
  const leftEye = boxFrom(landmarks, LEFT_EYE_LANDMARKS, 0.45);
  const rightEye = boxFrom(landmarks, RIGHT_EYE_LANDMARKS, 0.45);
  const chin = landmarks[CHIN_LANDMARK] ? toPoint(landmarks[CHIN_LANDMARK]!) : null;

  if (!mouth || !leftEye || !rightEye) return null;

  return {
    mouth,
    leftEye,
    rightEye,
    chinY: chin ? Math.min(0.99, chin.y + 0.02) : DEFAULT_FACE_GEOMETRY.chinY,
  };
}

/** اعتبارسنجی هندسهٔ ذخیره‌شده پیش از استفاده. */
export function parseFaceGeometry(raw: unknown): FaceGeometry | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<FaceGeometry>;

  const isBox = (box: unknown): box is FaceBox => {
    if (!box || typeof box !== 'object') return false;
    const candidate = box as Partial<FaceBox>;
    return (
      typeof candidate.x === 'number' &&
      typeof candidate.y === 'number' &&
      typeof candidate.width === 'number' &&
      typeof candidate.height === 'number'
    );
  };

  if (!isBox(value.mouth) || !isBox(value.leftEye) || !isBox(value.rightEye)) return null;

  return {
    mouth: value.mouth,
    leftEye: value.leftEye,
    rightEye: value.rightEye,
    chinY: typeof value.chinY === 'number' ? value.chinY : DEFAULT_FACE_GEOMETRY.chinY,
  };
}
