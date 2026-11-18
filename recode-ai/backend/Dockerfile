# API + workers share one image; the command decides the role.
FROM docker:27-cli AS docker-cli

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libglib2.0-0 curl ca-certificates \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-fas \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt \
 && python -m playwright install --with-deps chromium \
 && chmod -R o+rx /opt/playwright

COPY app ./app
# docker CLI for sandboxed builds of generated React projects (workers only use it
# when RECODE_SANDBOX_MODE=docker and the host socket is mounted)
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker

RUN useradd --create-home --uid 10001 recode && mkdir -p /data && chown recode /data
USER recode

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
