"""Telegram delivery.

Messages are HTML-formatted and split at 4096 characters, which is the API's
hard limit. Delivery failures are retried with backoff, and 429s honour the
retry_after the API hands back.
"""

from __future__ import annotations

import logging
import time

import requests

from ..config import Config
from ..models import Alert

log = logging.getLogger(__name__)

TELEGRAM_LIMIT = 4096
MAX_RETRIES = 4


class TelegramSink:
    def __init__(self, config: Config):
        self.config = config
        self.session = requests.Session()

    @property
    def enabled(self) -> bool:
        return bool(self.config.telegram_bot_token and self.config.telegram_chat_id)

    # ------------------------------------------------------------------
    def send_alert(self, alert: Alert) -> bool:
        return self.send_text(alert.text)

    def send_text(self, text: str) -> bool:
        if self.config.dry_run:
            print("\n----- TELEGRAM (dry run) -----")
            print(text)
            print("------------------------------\n")
            return True

        if not self.enabled:
            log.error("telegram: credentials missing, message not sent")
            return False

        ok = True
        for chunk in split_message(text):
            ok = self._post(chunk) and ok
        return ok

    # ------------------------------------------------------------------
    def _post(self, text: str) -> bool:
        url = f"https://api.telegram.org/bot{self.config.telegram_bot_token}/sendMessage"
        payload = {
            "chat_id": self.config.telegram_chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }

        delay = 2.0
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = self.session.post(url, json=payload, timeout=self.config.http_timeout)
                if resp.status_code == 200:
                    return True

                if resp.status_code == 429:
                    wait = float(resp.json().get("parameters", {}).get("retry_after", delay))
                    log.warning("telegram: rate limited, waiting %.0fs", wait)
                    time.sleep(wait)
                    continue

                if resp.status_code == 400:
                    # Almost always malformed HTML; resend as plain text once.
                    log.warning("telegram: 400 from API (%s), retrying without markup",
                                resp.text[:200])
                    payload.pop("parse_mode", None)
                    payload["text"] = strip_html(text)
                    continue

                log.warning("telegram: HTTP %s (%s)", resp.status_code, resp.text[:200])
            except requests.RequestException as exc:
                log.warning("telegram: attempt %d failed: %s", attempt, exc)

            if attempt < MAX_RETRIES:
                time.sleep(delay)
                delay *= 2

        log.error("telegram: giving up after %d attempts", MAX_RETRIES)
        return False


# ----------------------------------------------------------------------
def split_message(text: str, limit: int = TELEGRAM_LIMIT) -> list[str]:
    """Split on paragraph, then line boundaries, so formatting survives."""
    if len(text) <= limit:
        return [text]

    chunks: list[str] = []
    current = ""
    for block in text.split("\n\n"):
        candidate = f"{current}\n\n{block}" if current else block
        if len(candidate) <= limit:
            current = candidate
            continue

        if current:
            chunks.append(current)
        if len(block) <= limit:
            current = block
        else:
            for line in block.split("\n"):
                if len(current) + len(line) + 1 > limit:
                    chunks.append(current)
                    current = line[:limit]
                else:
                    current = f"{current}\n{line}" if current else line
    if current:
        chunks.append(current)
    return chunks


def strip_html(text: str) -> str:
    import re

    return re.sub(r"<[^>]+>", "", text)
