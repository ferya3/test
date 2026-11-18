"""Natural-language editing ("make the header exactly like the video",
"فاصله سکشن دوم را ۳۰ پیکسل بیشتر کن").

Online: retrieve the relevant files, let the coding model change them.
Offline: a small rule-based editor for the common requests (font, spacing,
colour, height) that patches the DesignSpec and re-renders."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.ai import prompts
from app.ai.coding.renderer import render_site
from app.ai.providers.base import ChatMessage
from app.ai.retrieval import rank_files
from app.ai.router import ModelRouter, format_files
from app.schemas.spec import DesignSpec


@dataclass
class EditResult:
    files: dict[str, str] = field(default_factory=dict)
    reply: str = ""
    spec: DesignSpec | None = None
    understood: bool = True


_FA_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_ORDINALS = {
    "اول": 1,
    "دوم": 2,
    "سوم": 3,
    "چهارم": 4,
    "پنجم": 5,
    "ششم": 6,
    "هفتم": 7,
    "first": 1,
    "second": 2,
    "third": 3,
    "fourth": 4,
    "fifth": 5,
    "sixth": 6,
    "seventh": 7,
}
_FONTS = {
    "ایران‌سنس": "IRANSans",
    "ایرانسنس": "IRANSans",
    "ایران سنس": "IRANSans",
    "iransans": "IRANSans",
    "وزیر": "Vazirmatn",
    "وزیرمتن": "Vazirmatn",
    "vazir": "Vazirmatn",
    "vazirmatn": "Vazirmatn",
    "یکان": "Yekan Bakh",
    "inter": "Inter",
    "roboto": "Roboto",
    "poppins": "Poppins",
    "montserrat": "Montserrat",
    "manrope": "Manrope",
}
_ALIASES = {
    "header": "header",
    "هدر": "header",
    "سربرگ": "header",
    "footer": "footer",
    "فوتر": "footer",
    "hero": "hero",
}


def _is_fa(text: str) -> bool:
    return bool(re.search(r"[؀-ۿ]", text))


def _target_section(spec: DesignSpec, text: str):
    low = text.lower()
    sections = [s for p in spec.pages for s in p.sections]
    for word, kind in _ALIASES.items():
        if word in low:
            match = next((s for s in sections if s.kind == kind or s.id == kind), None)
            if match:
                return match
    m = re.search(r"(?:section|سکشن|بخش)\s*(\d+)", low)
    if m:
        n = int(m.group(1))
        return sections[n - 1] if 0 < n <= len(sections) else None
    for word, n in _ORDINALS.items():
        if re.search(rf"(?:section|سکشن|بخش)\s*(?:ی\s*)?{word}|{word}\s+section", low):
            # count content sections, not the header
            content = [s for s in sections if s.kind not in ("header", "nav")]
            return content[n - 1] if 0 < n <= len(content) else None
    return None


def offline_edit(spec: DesignSpec, instruction: str) -> EditResult:
    text = instruction.translate(_FA_DIGITS)
    low = text.lower()
    fa = _is_fa(text)
    new = spec.model_copy(deep=True)
    done: list[str] = []

    if "font" in low or "فونت" in low:
        for key, family in _FONTS.items():
            if key in low:
                new.tokens.fonts = {"heading": family, "body": family}
                done.append(f"فونت به {family} تغییر کرد" if fa else f"font changed to {family}")
                break

    hexes = re.findall(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b", text)
    if hexes and ("color" in low or "رنگ" in low or "background" in low or "پس" in low):
        section = _target_section(new, text)
        if section is not None:
            section.background = hexes[0]
            done.append(f"رنگ پس‌زمینه {section.id} = {hexes[0]}" if fa else f"{section.id} background = {hexes[0]}")
        else:
            new.tokens.colors["primary"] = hexes[0]
            done.append(f"رنگ اصلی = {hexes[0]}" if fa else f"primary colour = {hexes[0]}")

    px = re.search(r"(\d+)\s*(?:px|پیکسل|pixel)", low)
    if px and any(w in low for w in ("فاصله", "spacing", "padding", "space", "ارتفاع", "height")):
        amount = int(px.group(1))
        if any(w in low for w in ("کمتر", "less", "reduce", "decrease", "کم کن")):
            amount = -amount
        section = _target_section(new, text)
        if section is not None:
            if "ارتفاع" in low or "height" in low:
                section.height_px = max(40, (section.height_px or 0) + amount)
                done.append(
                    f"ارتفاع {section.id}: {section.height_px}px"
                    if fa
                    else f"{section.id} height: {section.height_px}px"
                )
            else:
                section.padding_y = max(0, section.padding_y + amount // 2)
                if section.height_px:
                    section.height_px = max(40, section.height_px + amount)
                done.append(
                    f"فاصله {section.id} {abs(amount)}px {'بیشتر' if amount > 0 else 'کمتر'} شد"
                    if fa
                    else f"{section.id} spacing {'+' if amount > 0 else ''}{amount}px"
                )

    if not done:
        msg = (
            "این دستور در حالت آفلاین قابل اجرا نیست (فقط فونت، رنگ، فاصله و ارتفاع). برای ویرایش آزاد، "
            "کلید Anthropic را تنظیم کنید."
            if fa
            else "Offline mode understands font, colour, spacing and height edits only. Configure an Anthropic "
            "key for free-form edits."
        )
        return EditResult(reply=msg, understood=False)
    reply = "انجام شد: " + "؛ ".join(done) if fa else "Done: " + "; ".join(done)
    return EditResult(files=render_site(new), spec=new, reply=reply)


class EditAgent:
    def __init__(self, router: ModelRouter):
        self.router = router

    def run(
        self, spec: DesignSpec, files: dict[str, str], instruction: str, history: list[tuple[str, str]]
    ) -> EditResult:
        if self.router.offline("coding"):
            return offline_edit(spec, instruction)
        ranked = [p for p, score in rank_files(instruction, files, k=6) if score > 0]
        for always in ("styles.css", "src/styles.css", "index.html", "src/App.jsx"):
            if always in files and always not in ranked:
                ranked.append(always)
        relevant = {p: files[p] for p in ranked[:8]}
        summary = {
            "framework": spec.framework,
            "direction": spec.direction,
            "tokens": spec.tokens.model_dump(),
            "pages": [
                {
                    "route": p.route,
                    "sections": [{"id": s.id, "kind": s.kind, "height_px": s.height_px} for s in p.sections],
                }
                for p in spec.pages
            ],
            "behaviors": [{"id": b.id, "effect": b.effect, "target": b.target} for b in spec.behaviors],
            "all_files": sorted(files),
        }
        convo = "\n".join(f"{role}: {text}" for role, text in history[-6:])
        parts = [
            f"Recent conversation:\n{convo}\n" if convo else "",
            f"Instruction: {instruction}",
            "DesignSpec summary:\n" + str(summary),
            "Relevant files:\n" + format_files(relevant),
        ]
        result = self.router.complete(
            "coding", prompts.EDIT, [ChatMessage("user", [p for p in parts if p])], agent="edit"
        )
        from app.ai.router import FILE_BLOCK, parse_file_blocks

        changed = parse_file_blocks(result.text)
        reply = re.search(r"<reply>(.*?)</reply>", result.text, re.DOTALL)
        reply_text = reply.group(1).strip() if reply else FILE_BLOCK.sub("", result.text).strip()[:600]
        return EditResult(files=changed, reply=reply_text or "Done.", understood=bool(changed))
