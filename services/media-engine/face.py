"""تشخیص و پیش‌پردازش چهره (§F1).

خروجی این ماژول یک‌بار محاسبه و در پایگاه دادهٔ Next.js Cache می‌شود
(F1.5)؛ در زمان مکالمه هرگز دوباره اجرا نمی‌شود.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)

_face_mesh: Any | None = None


@dataclass
class FaceResult:
    face_count: int
    width: int
    height: int
    landmarks: list[list[float]] = field(default_factory=list)
    crop: np.ndarray | None = None


def load_model() -> None:
    """بارگذاری مدل در Startup تا در زمان درخواست تأخیر ایجاد نشود (NFR1)."""
    global _face_mesh
    if _face_mesh is not None:
        return

    import mediapipe as mp

    _face_mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=True,
        # بیش از یک، تا بتوانیم «چند چهره» را تشخیص دهیم و خطا بدهیم (F1.2).
        max_num_faces=5,
        refine_landmarks=True,
        min_detection_confidence=0.5,
    )
    logger.info("مدل تشخیص چهره بارگذاری شد.")


def is_loaded() -> bool:
    return _face_mesh is not None


def analyze(image_bytes: bytes) -> FaceResult:
    """تشخیص چهره، استخراج نقاط کلیدی و برش کادر چهره."""
    load_model()
    assert _face_mesh is not None

    buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("فایل تصویر قابل خواندن نیست.")

    height, width = image.shape[:2]
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    result = _face_mesh.process(rgb)

    faces = result.multi_face_landmarks or []
    if len(faces) != 1:
        return FaceResult(face_count=len(faces), width=width, height=height)

    landmarks = [[float(point.x), float(point.y), float(point.z)] for point in faces[0].landmark]

    return FaceResult(
        face_count=1,
        width=width,
        height=height,
        landmarks=landmarks,
        crop=_crop_face(image, landmarks),
    )


def _crop_face(image: np.ndarray, landmarks: list[list[float]], margin: float = 0.35) -> np.ndarray:
    """برش کادر چهره با حاشیه — ورودی استاندارد مدل‌های Lip Sync."""
    height, width = image.shape[:2]

    xs = [point[0] * width for point in landmarks]
    ys = [point[1] * height for point in landmarks]

    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    box_width = max_x - min_x
    box_height = max_y - min_y
    pad_x = box_width * margin
    pad_y = box_height * margin

    left = int(max(0, min_x - pad_x))
    top = int(max(0, min_y - pad_y))
    right = int(min(width, max_x + pad_x))
    bottom = int(min(height, max_y + pad_y))

    return image[top:bottom, left:right]
