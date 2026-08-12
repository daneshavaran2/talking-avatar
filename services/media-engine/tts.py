"""TTS محلی و Voice Clone (§F2، §F6) — نقطهٔ اتصال مدل گفتار.

⚠️ این ماژول عمداً پیاده‌سازی نشده است.

توصیهٔ عملی (مطابق ضمیمه ب سند): برای مکالمهٔ بلادرنگ، تأخیر
مهم‌تر از کیفیت مطلق است. سرویس ابری (`TTS_PROVIDER=elevenlabs`)
سریع‌تر راه می‌افتد و تأخیر اولین بایتش قابل اتکاست. مهاجرت به
مدل محلی وقتی ارزش دارد که محدودیت مصرف یا الزام داده‌محلی داشته
باشید.

── راهنمای اتصال مدل ────────────────────────────────────────────

۱. مدل را در `load_model()` بارگذاری کنید — یک‌بار، در Startup.

۲. `synthesize_stream()` باید **جریانی** باشد (F6.1): اولین بایت
   صدا باید زیر ۲۰۰ میلی‌ثانیه بیرون بیاید، نه پس از تولید کل جمله.

۳. `clone_voice()` فقط یک‌بار به‌ازای هر پروفایل صدا صدا زده می‌شود
   و نتیجه‌اش در پایگاه دادهٔ Next.js Cache می‌شود (F2.4/F2.5).
"""

from __future__ import annotations

import logging
from typing import Any, AsyncIterator

logger = logging.getLogger(__name__)

_model: Any | None = None


class NotImplementedForThisInstall(RuntimeError):
    """مدل TTS محلی در این نصب وصل نشده است."""


def load_model() -> None:
    global _model
    _model = None
    logger.info("مدل TTS محلی وصل نشده است — از سرویس ابری استفاده کنید.")


def is_loaded() -> bool:
    return _model is not None


async def synthesize_stream(
    text: str,
    voice_id: str | None = None,
    speed: float = 1.0,
) -> AsyncIterator[bytes]:
    _ = (text, voice_id, speed)
    raise NotImplementedForThisInstall(
        "TTS محلی در این نصب وصل نشده است. "
        "از TTS_PROVIDER=elevenlabs استفاده کنید یا مدلی را در services/media-engine/tts.py وصل کنید."
    )
    yield b""  # pragma: no cover


async def clone_voice(name: str, audio: bytes) -> str:
    _ = (name, audio)
    raise NotImplementedForThisInstall(
        "Voice Clone محلی در این نصب وصل نشده است."
    )
