"""Code Generation Engine: specialised agents that each own one concern.

Frontend   -> structure, layout, tokens (whole project)
Animation  -> recorded behaviours (transitions, toggles, scroll effects)
Responsive -> breakpoints and mobile navigation
Backend    -> only when the spec needs a server (forms, data)
QA fix     -> closes the gap reported by the Visual QA Engine

Every agent has an offline path so the pipeline always completes."""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from app.ai import prompts
from app.ai.coding.renderer import render_site
from app.ai.providers.base import ChatMessage, ImagePart
from app.ai.router import ModelRouter, format_files
from app.core.storage import Storage
from app.qa.visual import QAOutcome
from app.schemas.spec import DesignSpec
from app.video import imaging


@dataclass
class AgentResult:
    agent: str
    files: dict[str, str] = field(default_factory=dict)  # changed files; "" means delete
    notes: str = ""
    skipped: bool = False
    spec: DesignSpec | None = None  # offline fixes patch the spec and re-render


def spec_json(spec: DesignSpec) -> str:
    return json.dumps(spec.model_dump(exclude_none=True), ensure_ascii=False)


def reference_images(storage: Storage, spec: DesignSpec, max_images: int = 6) -> list[ImagePart]:
    parts: list[ImagePart] = []
    css_w = spec.viewport.get("width", 1280)
    css_h = spec.viewport.get("height", 720)
    for page in spec.pages:
        if not page.reference_key or len(parts) >= max_images:
            continue
        img = imaging.decode_image(storage.get(page.reference_key))
        tile_h = int(css_h * img.shape[1] / css_w)
        tiles = imaging.tiles(img, tile_h, max_tiles=max_images - len(parts))
        for i, tile in enumerate(tiles):
            parts.append(
                ImagePart(
                    imaging.encode_jpeg(imaging.fit_for_vision(tile), 82),
                    "image/jpeg",
                    label=f"Reference for page {page.route} - part {i + 1}/{len(tiles)}",
                )
            )
    return parts


def _relevant(files: dict[str, str], exts: tuple[str, ...]) -> dict[str, str]:
    return {p: c for p, c in files.items() if p.endswith(exts) and not p.startswith("server/")}


class FrontendAgent:
    name = "frontend"

    def __init__(self, router: ModelRouter, storage: Storage):
        self.router, self.storage = router, storage

    def run(self, spec: DesignSpec) -> AgentResult:
        scaffold = render_site(spec)
        if self.router.offline("coding"):
            return AgentResult(self.name, scaffold, "Rendered deterministically from the DesignSpec (offline mode).")
        system = prompts.FRONTEND_REACT if spec.framework == "react-vite" else prompts.FRONTEND_HTML
        parts: list = [*reference_images(self.storage, spec)]
        parts.append("DesignSpec:\n" + spec_json(spec))
        parts.append(
            "Scaffold rendered deterministically from the same spec. Improve it or replace it; "
            "it already passes the structural checks:\n" + format_files(scaffold)
        )
        files, notes = self.router.complete_files("coding", system, [ChatMessage("user", parts)], agent=self.name)
        entry = "package.json" if spec.framework == "react-vite" else "index.html"
        if entry not in files:
            files = {**scaffold, **files}
            notes += f"\n(model output had no {entry}; merged with the scaffold)"
        else:
            # files the model references but did not write come from the scaffold
            written = "\n".join(files.values())
            for path, content in scaffold.items():
                if path not in files and path.rsplit("/", 1)[-1] in written:
                    files[path] = content
        return AgentResult(self.name, files, notes)


class _EditAgent:
    name = "edit"
    system = ""
    exts: tuple[str, ...] = (".html", ".css", ".js", ".jsx", ".json")

    def __init__(self, router: ModelRouter, storage: Storage):
        self.router, self.storage = router, storage

    def _call(self, task: str, files: dict[str, str], images: list[ImagePart] | None = None) -> AgentResult:
        parts: list = [*(images or []), task, "Current files:\n" + format_files(_relevant(files, self.exts))]
        changed, notes = self.router.complete_files(
            "coding", self.system, [ChatMessage("user", parts)], agent=self.name
        )
        return AgentResult(self.name, changed, notes)


class AnimationAgent(_EditAgent):
    name = "animation"
    system = prompts.ANIMATION

    def run(self, spec: DesignSpec, files: dict[str, str]) -> AgentResult:
        if not spec.behaviors:
            return AgentResult(self.name, skipped=True, notes="No behaviours were observed in the recording.")
        if self.router.offline("coding"):
            effects = ", ".join(b.effect for b in spec.behaviors)
            return AgentResult(self.name, skipped=True, notes=f"Behaviours implemented by the renderer: {effects}.")
        behaviors = json.dumps([b.model_dump() for b in spec.behaviors], ensure_ascii=False)
        return self._call(f"Framework: {spec.framework}\nBehaviours to implement:\n{behaviors}", files)


class ResponsiveAgent(_EditAgent):
    name = "responsive"
    system = prompts.RESPONSIVE

    def run(self, spec: DesignSpec, files: dict[str, str]) -> AgentResult:
        if self.router.offline("coding"):
            return AgentResult(
                self.name, skipped=True, notes="Renderer breakpoints applied (1024 / 768 px, mobile navigation)."
            )
        return self._call(f"Framework: {spec.framework}. Recorded viewport: {spec.viewport}.", files)


class BackendAgent(_EditAgent):
    name = "backend"
    system = prompts.BACKEND
    exts = (".html", ".js", ".jsx")

    def run(self, spec: DesignSpec, files: dict[str, str]) -> AgentResult:
        if not spec.requires_backend:
            return AgentResult(self.name, skipped=True, notes="No forms or dynamic data: static site.")
        if self.router.offline("coding"):
            return AgentResult(
                self.name,
                {
                    "server/main.py": OFFLINE_SERVER,
                    "server/requirements.txt": "fastapi\nuvicorn\n",
                    "server/README.md": (
                        "# API\n\n```bash\npip install -r requirements.txt\nuvicorn main:app --reload\n```\n"
                    ),
                },
                "Added a minimal FastAPI contact endpoint (offline template).",
            )
        forms = [
            s.model_dump()
            for p in spec.pages
            for s in p.sections
            if s.kind in ("form",) or any(e.kind == "input" for e in s.elements)
        ]
        return self._call("Sections with forms or data:\n" + json.dumps(forms, ensure_ascii=False), files)


class QAFixAgent(_EditAgent):
    name = "qa-fix"
    system = prompts.QA_FIX

    def run(self, spec: DesignSpec, files: dict[str, str], outcome: QAOutcome) -> AgentResult:
        if self.router.offline("qa"):
            return self._offline(spec, outcome)
        images: list[ImagePart] = []
        for section_id, ref_jpeg, out_jpeg in outcome.crops:
            images.append(ImagePart(ref_jpeg, "image/jpeg", label=f"Section '{section_id}' - REFERENCE"))
            images.append(ImagePart(out_jpeg, "image/jpeg", label=f"Section '{section_id}' - CURRENT RENDER"))
        report = outcome.report.model_dump(exclude={"artifacts"})
        task = (
            f"Framework: {spec.framework}. Target score >= {outcome.report.threshold}.\n"
            f"QA report:\n{json.dumps(report, ensure_ascii=False)}"
        )
        result = self._call(task, files, images)
        result.agent = self.name
        return result

    def _offline(self, spec: DesignSpec, outcome: QAOutcome) -> AgentResult:
        """Adjust measured section properties toward the reference, then re-render."""
        fixed = spec.model_copy(deep=True)
        notes = []
        for m in outcome.report.sections:
            section = fixed.section(m.id)
            if section is None or m.out_h is None or not m.ref_h:
                continue
            diff = m.out_h - m.ref_h
            if abs(diff) > max(4, m.ref_h * 0.03):
                if section.kind in ("header", "nav"):
                    section.height_px = m.ref_h
                elif diff > 0:  # content taller than the reference: give back padding
                    section.padding_y = max(8, section.padding_y - (diff // 2 + 1))
                    section.height_px = m.ref_h
                else:
                    section.height_px = m.ref_h
                notes.append(f"{m.id}: height {m.out_h} -> {m.ref_h}px")
            if m.color_delta > 8 and m.ref_bg:
                section.background = m.ref_bg
                section.text_color = imaging.contrast_text(m.ref_bg)
                notes.append(f"{m.id}: background -> {m.ref_bg}")
        if not notes:
            return AgentResult(self.name, skipped=True, notes="Offline fixer found nothing it can adjust.")
        return AgentResult(self.name, render_site(fixed), "; ".join(notes), spec=fixed)


OFFLINE_SERVER = """from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

app = FastAPI(title="Site API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["POST"], allow_headers=["*"])
MESSAGES: list[dict] = []


class Contact(BaseModel):
    name: str
    email: EmailStr
    message: str


@app.post("/api/contact")
def contact(body: Contact) -> dict:
    MESSAGES.append(body.model_dump())
    return {"ok": True}
"""
