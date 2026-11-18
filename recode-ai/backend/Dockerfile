# API + workers share one image; the command decides the role.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libglib2.0-0 curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt \
 && python -m playwright install --with-deps chromium \
 && chmod -R o+rx /opt/playwright

COPY app ./app

RUN useradd --create-home --uid 10001 recode && mkdir -p /data && chown recode /data
USER recode

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
