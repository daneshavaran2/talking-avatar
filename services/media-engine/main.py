"""AI Media Engine — تنها سرویسی که به GPU نیاز دارد (§۵.۲).

اپلیکیشن Next.js از طریق این API با مدل‌های بینایی و گفتار حرف
می‌زند و خودش هیچ مدلی بارگذاری نمی‌کند.

قاعدهٔ عملکردی (NFR1/NFR2): مدل‌ها در Startup بارگذاری می‌شوند و
در حافظه می‌مانند. هیچ مسیری در زمان درخواست مدل نمی‌سازد.
"""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

import avatar
import face
import stt
import tts
from config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("media-engine")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.preload_models:
        logger.info("پیش‌بارگذاری مدل‌ها…")
        for name, loader in (("face", face.load_model), ("stt", stt.load_model)):
            try:
                loader()
            except Exception as error:  # noqa: BLE001
                logger.error("بارگذاری مدل %s شکست خورد: %s", name, error)

        avatar.load_model()
        tts.load_model()

    yield
    logger.info("سرویس رسانه خاموش شد.")


app = FastAPI(title="AI Media Engine", version="1.0.0", lifespan=lifespan)


async def require_token(request: Request) -> None:
    """احراز هویت سرویس-به-سرویس.

    اگر MEDIA_ENGINE_TOKEN تنظیم نشده باشد، سرویس باز است — که فقط
    وقتی قابل قبول است که در شبکهٔ داخلی Docker محصور باشد و پورتش
    به بیرون منتشر نشود.
    """
    if not settings.token:
        return

    header = request.headers.get("authorization", "")
    if header != f"Bearer {settings.token}":
        raise HTTPException(status_code=401, detail="توکن سرویس نامعتبر است.")


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse(
        {
            "status": "ok",
            "device": settings.resolved_device(),
            "models": {
                "face": face.is_loaded(),
                "stt": stt.is_loaded(),
                "avatar": avatar.is_loaded(),
                "tts": tts.is_loaded(),
            },
        }
    )


@app.post("/avatar/prepare", dependencies=[Depends(require_token)])
async def avatar_prepare(image: UploadFile = File(...)) -> JSONResponse:
    """تشخیص چهره و استخراج نقاط کلیدی (§F1).

    `face_count` غیر از ۱ باعث می‌شود Next.js پیام راهنمای مناسب را
    به مدیر نشان دهد (F1.2).
    """
    data = await image.read()

    try:
        result = face.analyze(data)
    except Exception as error:  # noqa: BLE001
        logger.exception("تحلیل چهره شکست خورد")
        raise HTTPException(status_code=422, detail=str(error)) from error

    idle_loop_url: str | None = None
    if result.face_count == 1 and result.crop is not None:
        try:
            idle_loop_url = await avatar.build_idle_loop(
                result.crop, f"{settings.storage_dir}/avatars/idle-loop.mp4"
            )
        except avatar.NotImplementedForThisInstall:
            # مدل Lip Sync وصل نشده — حلقهٔ Idle ساخته نمی‌شود و
            # Next.js به تصویر ثابت تنزل می‌کند.
            idle_loop_url = None

    return JSONResponse(
        {
            "face_count": result.face_count,
            "landmarks": result.landmarks or None,
            "embedding": None,
            "idle_loop_url": idle_loop_url,
            "width": result.width,
            "height": result.height,
        }
    )


@app.post("/stt/stream", dependencies=[Depends(require_token)])
async def stt_stream(request: Request) -> StreamingResponse:
    """جریان صدا → NDJSON متن (§F5).

    بدنه هرگز روی دیسک نوشته نمی‌شود (F5.2).
    """

    async def audio_chunks() -> AsyncIterator[bytes]:
        async for chunk in request.stream():
            if await request.is_disconnected():
                return
            if chunk:
                yield chunk

    async def results() -> AsyncIterator[bytes]:
        try:
            async for result in stt.transcribe_stream(audio_chunks()):
                yield (json.dumps(result, ensure_ascii=False) + "\n").encode("utf-8")
        except Exception as error:  # noqa: BLE001
            logger.exception("تشخیص گفتار شکست خورد")
            yield (json.dumps({"error": str(error)}, ensure_ascii=False) + "\n").encode("utf-8")

    return StreamingResponse(
        results(),
        media_type="application/x-ndjson",
        headers={"cache-control": "no-store", "x-accel-buffering": "no"},
    )


@app.post("/avatar/stream", dependencies=[Depends(require_token)])
async def avatar_stream(request: Request) -> StreamingResponse:
    """جریان صدا → جریان فریم آواتار (§F7).

    وقتی مدل Lip Sync وصل نشده باشد ۵۰۱ برمی‌گردد. Next.js این را
    می‌فهمد و به تصویر ثابت تنزل می‌کند — بدون قطع شدن صدا و متن.
    """
    if not avatar.is_loaded():
        raise HTTPException(
            status_code=501,
            detail="موتور Lip Sync در این نصب وصل نشده است.",
        )

    async def audio_chunks() -> AsyncIterator[bytes]:
        async for chunk in request.stream():
            if await request.is_disconnected():
                return
            if chunk:
                yield chunk

    async def frames() -> AsyncIterator[bytes]:
        async for frame in avatar.render_stream(audio_chunks()):
            if await request.is_disconnected():
                return
            yield (json.dumps(frame, ensure_ascii=False) + "\n").encode("utf-8")

    return StreamingResponse(
        frames(),
        media_type="application/x-ndjson",
        headers={"cache-control": "no-store", "x-accel-buffering": "no"},
    )


@app.post("/tts/stream", dependencies=[Depends(require_token)])
async def tts_stream(request: Request) -> StreamingResponse:
    """متن → جریان صدا (§F6)."""
    if not tts.is_loaded():
        raise HTTPException(
            status_code=501,
            detail="TTS محلی در این نصب وصل نشده است؛ از سرویس ابری استفاده کنید.",
        )

    body = await request.json()
    text = str(body.get("text", "")).strip()
    if not text:
        raise HTTPException(status_code=400, detail="متن خالی است.")

    async def audio() -> AsyncIterator[bytes]:
        async for chunk in tts.synthesize_stream(
            text,
            voice_id=body.get("voice_id"),
            speed=float(body.get("speed", 1.0)),
        ):
            if await request.is_disconnected():
                return
            yield chunk

    return StreamingResponse(
        audio(),
        media_type="audio/mpeg",
        headers={"cache-control": "no-store", "x-accel-buffering": "no"},
    )


@app.post("/voice/clone", dependencies=[Depends(require_token)])
async def voice_clone(name: str = Form(...), audio: UploadFile = File(...)) -> JSONResponse:
    """ساخت پروفایل صوتی (§F2). یک‌بار اجرا می‌شود و نتیجه Cache می‌شود."""
    if not tts.is_loaded():
        raise HTTPException(
            status_code=501,
            detail="Voice Clone محلی در این نصب وصل نشده است.",
        )

    data = await audio.read()
    voice_id = await tts.clone_voice(name, data)
    return JSONResponse({"voice_id": voice_id})
