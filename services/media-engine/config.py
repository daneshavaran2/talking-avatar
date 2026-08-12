"""پیکربندی سرویس رسانه."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _bool(name: str, default: bool) -> bool:
    raw = _env(name)
    if not raw:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    token: str = _env("MEDIA_ENGINE_TOKEN")
    stt_model: str = _env("STT_MODEL", "large-v3")
    stt_device: str = _env("STT_DEVICE", "auto")
    stt_compute_type: str = _env("STT_COMPUTE_TYPE")
    preload_models: bool = _bool("PRELOAD_MODELS", True)
    storage_dir: str = _env("STORAGE_DIR", "/app/storage")

    def resolved_device(self) -> str:
        if self.stt_device != "auto":
            return self.stt_device
        try:
            import torch  # type: ignore[import-not-found]

            return "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            return "cpu"

    def resolved_compute_type(self) -> str:
        if self.stt_compute_type:
            return self.stt_compute_type
        return "float16" if self.resolved_device() == "cuda" else "int8"


settings = Settings()
