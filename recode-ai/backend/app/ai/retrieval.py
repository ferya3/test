"""Local retrieval ("embedding" role): which files does an instruction touch?

BM25 over identifier-aware tokens (class names, ids, CSS properties, words in
the spec). Cheap, deterministic, no vendor endpoint; replaceable by a vector
store later behind the same function."""

from __future__ import annotations

import math
import re
from collections import Counter

from app.core.binary import is_binary

_SPLIT = re.compile(r"[A-Za-z][a-z]+|[A-Z]+(?![a-z])|\d+|[؀-ۿ]+")

# Persian / English synonyms users type when editing a site
_SYNONYMS = {
    "هدر": "header",
    "سربرگ": "header",
    "منو": "menu nav",
    "فوتر": "footer",
    "پاورقی": "footer",
    "فونت": "font family",
    "رنگ": "color",
    "فاصله": "padding margin gap spacing",
    "انیمیشن": "animation transition",
    "موبایل": "mobile media responsive",
    "دکمه": "button btn",
    "کارت": "card",
    "سکشن": "section",
    "بخش": "section",
    "عکس": "image img",
    "تصویر": "image img",
    "اسلایدر": "slider carousel",
    "spacing": "padding margin gap",
    "mobile": "media responsive max-width",
    "animation": "transition keyframes",
    "font": "font-family family",
    "nav": "menu navigation",
    "menu": "nav navigation toggle",
}


def tokenize(text: str) -> list[str]:
    tokens: list[str] = []
    for raw in re.split(r"[^\w؀-ۿ-]+", text):
        if not raw:
            continue
        low = raw.lower()
        tokens.append(low)
        if "-" in low or "_" in low:
            tokens.extend(p for p in re.split(r"[-_]", low) if p)
        tokens.extend(p.lower() for p in _SPLIT.findall(raw) if p.lower() != low)
        if low in _SYNONYMS:
            tokens.extend(_SYNONYMS[low].split())
    return tokens


def rank_files(query: str, files: dict[str, str], k: int = 6) -> list[tuple[str, float]]:
    if not files:
        return []
    files = {p: b for p, b in files.items() if not is_binary(p)}
    if not files:
        return []
    docs = {path: tokenize(path + "\n" + body) for path, body in files.items()}
    q = tokenize(query)
    n = len(docs)
    avg = sum(len(t) for t in docs.values()) / n or 1
    df = Counter(term for toks in docs.values() for term in set(toks))
    scores = []
    for path, toks in docs.items():
        tf = Counter(toks)
        score = 0.0
        for term in q:
            if term not in tf:
                continue
            idf = math.log(1 + (n - df[term] + 0.5) / (df[term] + 0.5))
            f = tf[term]
            score += idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * len(toks) / avg))
        scores.append((path, round(score, 4)))
    scores.sort(key=lambda s: -s[1])
    return scores[:k]
