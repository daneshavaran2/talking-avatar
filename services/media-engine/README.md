# AI Media Engine

سرویس GPU — تنها بخشی از سیستم که به CUDA نیاز دارد (§۵.۲ سند محصول).

اپلیکیشن Next.js از طریق HTTP با این سرویس حرف می‌زند و هرگز مستقیماً
مدل بینایی/گفتار بارگذاری نمی‌کند.

---

## وضعیت پیاده‌سازی — صادقانه بخوانید

| قابلیت | وضعیت | توضیح |
|---|---|---|
| `GET /health` | ✅ پیاده‌سازی شده | شامل گزارش اینکه کدام مدل واقعاً بارگذاری شده |
| `POST /avatar/prepare` | ✅ پیاده‌سازی شده | تشخیص چهره، شمارش چهره‌ها، نقاط کلیدی و برش با MediaPipe |
| `POST /stt/stream` | ✅ پیاده‌سازی شده | Whisper با `faster-whisper`، جریانی با VAD |
| `POST /avatar/stream` | ⛔ **۵۰۱** | نقطهٔ اتصال مدل Lip Sync — پیاده‌سازی نشده |
| `POST /tts/stream` | ⛔ **۵۰۱** | نقطهٔ اتصال TTS محلی — پیاده‌سازی نشده |
| `POST /voice/clone` | ⛔ **۵۰۱** | نقطهٔ اتصال Voice Clone محلی — پیاده‌سازی نشده |
| حلقهٔ Idle (F1.4) | ⛔ پیاده‌سازی نشده | نیازمند همان مدل Lip Sync است |

مسیرهایی که ۵۰۱ برمی‌گردانند **عمداً** چیزی را جعل نمی‌کنند. اپلیکیشن
Next.js این پاسخ را می‌فهمد و به‌صورت تنزل تدریجی رفتار می‌کند
(§۱۲.۲): تصویر ثابت به‌جای آواتار زنده، و متن به‌جای صدا.

برای فعال کردن آواتار بلادرنگ، یک مدل Lip Sync (مثل LivePortrait،
MuseTalk یا SadTalker) را در `avatar.py` وصل کنید — جای دقیقش با
`TODO` مشخص شده و قرارداد ورودی/خروجی همان‌جا مستند است.

برای TTS، توصیه می‌شود ابتدا از سرویس ابری استفاده کنید
(`TTS_PROVIDER=elevenlabs`) و بعداً اگر لازم شد به مدل محلی مهاجرت کنید.

---

## راه‌اندازی

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

با Docker:

```bash
docker compose up media-engine
```

برای GPU، بخش `deploy.resources` سرویس `media-engine` در
`docker-compose.yml` را از حالت کامنت خارج کنید.

## متغیرهای محیطی

| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `MEDIA_ENGINE_TOKEN` | خالی | اگر تنظیم شود، همهٔ مسیرها هدر `Authorization: Bearer …` می‌خواهند |
| `STT_MODEL` | `large-v3` | نام مدل Whisper |
| `STT_DEVICE` | `auto` | `cuda` \| `cpu` \| `auto` |
| `STT_COMPUTE_TYPE` | `float16` روی GPU، `int8` روی CPU | دقت محاسبات |
| `PRELOAD_MODELS` | `true` | بارگذاری مدل‌ها در Startup (NFR1) |
| `STORAGE_DIR` | `/app/storage` | محل نوشتن حلقهٔ Idle و خروجی‌ها |

## نکتهٔ عملکردی

مدل‌ها **یک‌بار در Startup** بارگذاری می‌شوند و در حافظه می‌مانند
(NFR1/NFR2 و F5.5). هیچ مسیری نباید در زمان درخواست مدل را دوباره
بسازد — این تنها راه رسیدن به بودجهٔ تأخیر §۱۰.۱ است.

## قرارداد HTTP

### `POST /avatar/prepare`
`multipart/form-data` با فیلد `image`.

```json
{
  "face_count": 1,
  "landmarks": [[x, y, z], "..."],
  "embedding": null,
  "idle_loop_url": null,
  "width": 1024,
  "height": 1024
}
```

`face_count` غیر از ۱ یعنی خطای راهنما به مدیر نمایش داده می‌شود (F1.2).

### `POST /stt/stream`
بدنه: جریان دودویی صدا (WebM/Opus یا PCM). پاسخ: NDJSON.

```
{"text": "سلام من می‌خوا", "is_final": false}
{"text": "سلام من می‌خواستم بپرسم", "is_final": true, "confidence": 0.94}
```

### `POST /avatar/stream`
بدنه: جریان دودویی صدا. پاسخ: NDJSON، هر خط یک فریم.

```
{"data": "<base64>", "encoding": "jpeg", "index": 0, "timestamp_ms": 0}
```

### `POST /tts/stream`
`{"text": "...", "voice_id": "...", "format": "mp3", "speed": 1}` →
جریان بایت صدا.

### `POST /voice/clone`
`multipart/form-data` با `name` و `audio` → `{"voice_id": "..."}`.
