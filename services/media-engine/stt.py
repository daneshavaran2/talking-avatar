"""تبدیل صدا به متن جریانی با Whisper (§F5).

الزامات سند که اینجا رعایت شده‌اند:
  F5.2 — صدا به‌صورت Chunk پردازش می‌شود؛ هیچ فایل کاملی روی دیسک
         نوشته نمی‌شود.
  F5.3 — نتایج جزئی حین صحبت کاربر برمی‌گردند.
  F5.4 — پایان جمله با VAD تشخیص داده می‌شود.
  F5.5 — مدل یک‌بار بارگذاری می‌شود و در حافظه می‌ماند.
"""

from __future__ import annotations

import asyncio
import io
import logging
from typing import Any, AsyncIterator

import numpy as np

from config import settings

logger = logging.getLogger(__name__)

_model: Any | None = None

SAMPLE_RATE = 16000
# هر ~۷۰۰ میلی‌ثانیه یک بازنویسی جزئی: تعادل بین «زنده بودن» متن و
# هزینهٔ محاسباتی رمزگشایی مکرر.
PARTIAL_INTERVAL_SECONDS = 0.7
# سکوت طولانی‌تر از این یعنی جمله تمام شده.
SILENCE_TO_FINALIZE_SECONDS = 0.6
MAX_UTTERANCE_SECONDS = 30.0


def load_model() -> None:
    global _model
    if _model is not None:
        return

    from faster_whisper import WhisperModel

    device = settings.resolved_device()
    compute_type = settings.resolved_compute_type()

    logger.info("بارگذاری Whisper (%s) روی %s/%s", settings.stt_model, device, compute_type)
    _model = WhisperModel(settings.stt_model, device=device, compute_type=compute_type)
    logger.info("Whisper بارگذاری شد.")


def is_loaded() -> bool:
    return _model is not None


def _decode_to_pcm(raw: bytes) -> np.ndarray:
    """رمزگشایی هر قالب صوتی به PCM تک‌کاناله ۱۶ کیلوهرتز."""
    import av

    container = av.open(io.BytesIO(raw))
    resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)

    chunks: list[np.ndarray] = []
    for frame in container.decode(audio=0):
        for resampled in resampler.resample(frame):
            chunks.append(resampled.to_ndarray().reshape(-1))

    if not chunks:
        return np.zeros(0, dtype=np.float32)

    pcm = np.concatenate(chunks).astype(np.float32) / 32768.0
    return pcm


def _transcribe(pcm: np.ndarray) -> tuple[str, float]:
    assert _model is not None

    segments, _info = _model.transcribe(
        pcm,
        language="fa",
        beam_size=1,
        vad_filter=True,
        condition_on_previous_text=False,
    )

    parts: list[str] = []
    probabilities: list[float] = []
    for segment in segments:
        parts.append(segment.text)
        probabilities.append(float(np.exp(segment.avg_logprob)))

    text = " ".join(part.strip() for part in parts).strip()
    confidence = float(np.mean(probabilities)) if probabilities else 0.0
    return text, confidence


def _is_silent(pcm: np.ndarray, threshold: float = 0.008) -> bool:
    if pcm.size == 0:
        return True
    return float(np.sqrt(np.mean(np.square(pcm)))) < threshold


async def transcribe_stream(chunks: AsyncIterator[bytes]) -> AsyncIterator[dict[str, Any]]:
    """جریان صدا را می‌گیرد و نتایج جزئی و نهایی بیرون می‌دهد.

    نکته: بافر خام نگه داشته می‌شود چون قالب‌های فشرده (WebM/Opus)
    را نمی‌توان وسط جریان تکه‌تکه رمزگشایی کرد — هر بار کل بافر
    جاری رمزگشایی می‌شود و پس از نهایی شدن جمله خالی می‌گردد.
    """
    load_model()

    raw = bytearray()
    last_partial_at = 0.0
    silent_for = 0.0
    emitted_text = ""

    loop = asyncio.get_running_loop()
    started_at = loop.time()

    async for chunk in chunks:
        raw.extend(chunk)
        now = loop.time()

        if now - last_partial_at < PARTIAL_INTERVAL_SECONDS:
            continue
        last_partial_at = now

        try:
            pcm = await asyncio.to_thread(_decode_to_pcm, bytes(raw))
        except Exception:
            # بافر هنوز یک قطعهٔ کامل قابل رمزگشایی نیست.
            continue

        if pcm.size == 0:
            continue

        tail = pcm[-int(SAMPLE_RATE * PARTIAL_INTERVAL_SECONDS) :]
        if _is_silent(tail):
            silent_for += PARTIAL_INTERVAL_SECONDS
        else:
            silent_for = 0.0

        text, confidence = await asyncio.to_thread(_transcribe, pcm)
        duration = pcm.size / SAMPLE_RATE

        should_finalize = (
            (silent_for >= SILENCE_TO_FINALIZE_SECONDS and text)
            or duration >= MAX_UTTERANCE_SECONDS
        )

        if should_finalize:
            if text:
                yield {"text": text, "is_final": True, "confidence": confidence}
            raw = bytearray()
            emitted_text = ""
            silent_for = 0.0
            started_at = loop.time()
            continue

        if text and text != emitted_text:
            emitted_text = text
            yield {"text": text, "is_final": False, "confidence": confidence}

    # پایان جریان: هرچه مانده نهایی می‌شود.
    if raw:
        try:
            pcm = await asyncio.to_thread(_decode_to_pcm, bytes(raw))
            if pcm.size > 0:
                text, confidence = await asyncio.to_thread(_transcribe, pcm)
                if text:
                    yield {"text": text, "is_final": True, "confidence": confidence}
        except Exception:
            logger.warning("رمزگشایی باقی‌ماندهٔ بافر صدا ممکن نشد.")

    _ = started_at
