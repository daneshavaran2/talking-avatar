"""رندر آواتار بلادرنگ (§F7) — نقطهٔ اتصال مدل Lip Sync.

⚠️ این ماژول عمداً پیاده‌سازی نشده است.

ساختن یک موتور Lip Sync واقعی یعنی یکپارچه‌سازی یک مدل تولیدی
(LivePortrait، MuseTalk، SadTalker یا معادلش) به‌همراه وزن‌های آن.
به‌جای ساختن یک شبیه‌سازی که «شبیه» آواتار زنده باشد و در واقع
نباشد، این ماژول ۵۰۱ برمی‌گرداند و اپلیکیشن Next.js صادقانه به
تصویر ثابت تنزل می‌کند (§۱۲.۲).

الزام F7.5 سند: الگوی «تولید فایل MP4 → انتظار → پخش» ممنوع است.
هر پیاده‌سازی‌ای که اینجا اضافه شود باید جریانی باشد:

    قطعهٔ صدا → فریم → جریان → WebRTC

── راهنمای اتصال مدل ────────────────────────────────────────────

۱. مدل و وزن‌ها را در `load_model()` بارگذاری کنید. یک‌بار، در
   Startup — نه در زمان درخواست (NFR2).

۲. در `render_stream()` صدای ورودی را قطعه‌قطعه بگیرید و به ازای
   هر پنجرهٔ صوتی، فریم تولید و بلافاصله yield کنید. هرگز کل صدا
   را بافر نکنید.

۳. `AbortSignal` سمت Next.js با بسته شدن اتصال HTTP به اینجا
   می‌رسد؛ حلقهٔ تولید باید با قطع اتصال فوراً بشکند (F8.1: زیر
   ۳۰۰ میلی‌ثانیه).

۴. `build_idle_loop()` یک ویدئوی بی‌درز ۸ ثانیه‌ای می‌سازد: پلک،
   تنفس، حرکت جزئی سر و چشم (F1.4). این یک‌بار هنگام آپلود عکس
   تولید و Cache می‌شود.
"""

from __future__ import annotations

import logging
from typing import Any, AsyncIterator

import numpy as np

logger = logging.getLogger(__name__)

_model: Any | None = None


class NotImplementedForThisInstall(RuntimeError):
    """مدل Lip Sync در این نصب وصل نشده است."""


def load_model() -> None:
    """بارگذاری مدل Lip Sync در Startup.

    TODO: مدل انتخابی را اینجا بارگذاری کنید و در `_model` نگه دارید.
    """
    global _model
    _model = None
    logger.warning(
        "مدل Lip Sync وصل نشده است — مسیرهای آواتار ۵۰۱ برمی‌گردانند "
        "و اپلیکیشن به تصویر ثابت تنزل می‌کند."
    )


def is_loaded() -> bool:
    return _model is not None


async def render_stream(
    audio_chunks: AsyncIterator[bytes],
    face_crop: np.ndarray | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """جریان صدا → جریان فریم.

    خروجی مورد انتظار (هر خط یک فریم، NDJSON):
        {"data": "<base64 jpeg>", "encoding": "jpeg",
         "index": 0, "timestamp_ms": 0}
    """
    _ = (audio_chunks, face_crop)
    raise NotImplementedForThisInstall(
        "موتور Lip Sync در این نصب وصل نشده است. "
        "برای فعال‌سازی، یک مدل تولید ویدئو را در services/media-engine/avatar.py وصل کنید."
    )
    # مسیر غیرقابل‌دسترس؛ فقط برای اینکه امضای تابع AsyncIterator بماند.
    yield {}  # pragma: no cover


async def build_idle_loop(face_crop: np.ndarray, output_path: str) -> str:
    """ساخت حلقهٔ Idle بی‌درز ۸ ثانیه‌ای (F1.4)."""
    _ = (face_crop, output_path)
    raise NotImplementedForThisInstall(
        "ساخت حلقهٔ Idle نیازمند همان مدل Lip Sync است که هنوز وصل نشده."
    )
