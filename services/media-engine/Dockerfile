# برای اجرای GPU، تصویر پایه را به یکی از تصاویر CUDA عوض کنید:
#   FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04
# و بخش deploy.resources سرویس media-engine در docker-compose.yml را
# از حالت کامنت خارج کنید.
FROM python:3.11-slim

WORKDIR /app

# ffmpeg برای رمزگشایی صدا (av) و libgl برای OpenCV لازم است.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/cache/huggingface \
    STORAGE_DIR=/app/storage

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8001/health')"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
