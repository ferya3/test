"""The Video -> Website pipeline, as a LangGraph state machine.

  ingest -> analyze -> architect -> generate -> secure -> build -> qa
                                                   ^                 |
                                                   +---- fix <-------+  (score < threshold
                                                                         and iterations left)
                                                                  qa -> finalize

Every node persists what it produced (frames, spec, components, versions,
test results) and streams progress, so the workspace updates live and a
failed run still leaves its partial results inspectable."""

from __future__ import annotations

import logging
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from sqlalchemy import delete, select

from app.ai.architect.architect import Architect
from app.ai.coding.agents import AnimationAgent, BackendAgent, FrontendAgent, QAFixAgent, ResponsiveAgent
from app.ai.vision.analyzer import UIAnalyzer
from app.core.db import session_scope
from app.core.events import emit
from app.models import Component, Project, ProjectAsset, TestResult
from app.preview.sandbox import BuildError, BuildUnavailable, DockerSandbox, needs_build
from app.qa.visual import QAOutcome, QAReport, VisualQAEngine
from app.schemas.spec import DesignSpec, UIAnalysis, VideoAnalysis
from app.security.code_scan import scan_files
from app.services import versions
from app.services.context import TaskContext
from app.services.media import ingest_asset

log = logging.getLogger(__name__)


class PipelineState(TypedDict, total=False):
    video: dict[str, Any] | None
    ui: dict[str, Any]
    spec: dict[str, Any]
    spec_id: str
    files: dict[str, str]
    site_files: dict[str, Any]  # what the browser loads (built output for react)
    version_id: str
    iteration: int
    max_iterations: int
    report: dict[str, Any]
    best: dict[str, Any]  # {"version_id", "score"}
    build_error: str | None
    blocked: bool
    fix_skipped: bool


class Pipeline:
    def __init__(self, ctx: TaskContext, reuse_analysis: bool = True, max_iterations: int | None = None):
        self.ctx = ctx
        self.reuse_analysis = reuse_analysis
        ps = ctx.project_settings
        self.max_iterations = (
            max_iterations
            if max_iterations is not None
            else ps.get("max_fix_iterations", ctx.settings.max_fix_iterations)
        )
        self.threshold = ps.get("qa_threshold") or ctx.settings.qa_threshold
        self._last_outcome: QAOutcome | None = None
        self.graph = self._build_graph()

    def _build_graph(self):
        g = StateGraph(PipelineState)
        for name in ("ingest", "analyze", "architect", "generate", "secure", "build", "qa", "fix", "finalize"):
            g.add_node(name, getattr(self, f"node_{name}"))
        g.add_edge(START, "ingest")
        g.add_edge("ingest", "analyze")
        g.add_edge("analyze", "architect")
        g.add_edge("architect", "generate")
        g.add_edge("generate", "secure")
        g.add_conditional_edges(
            "secure", lambda s: "finalize" if s.get("blocked") else "build", {"build": "build", "finalize": "finalize"}
        )
        g.add_edge("build", "qa")
        g.add_conditional_edges("qa", self.route_after_qa, {"fix": "fix", "finalize": "finalize"})
        g.add_conditional_edges(
            "fix",
            lambda s: "finalize" if s.get("fix_skipped") else "secure",
            {"secure": "secure", "finalize": "finalize"},
        )
        g.add_edge("finalize", END)
        return g.compile()

    def run(self) -> dict[str, Any]:
        state = self.graph.invoke(
            {"iteration": 0, "max_iterations": self.max_iterations}, config={"recursion_limit": 60}
        )
        return {
            "version_id": state.get("best", {}).get("version_id"),
            "score": state.get("best", {}).get("score"),
            "iterations": state.get("iteration", 0),
            "spec_id": state.get("spec_id"),
        }

    # ------------------------------------------------------------------ nodes

    def node_ingest(self, state: PipelineState) -> PipelineState:
        ctx = self.ctx
        ctx.set_project_status("analyzing")
        ctx.progress(0.02, "ingest", "Collecting media")
        with session_scope() as db:
            assets = db.scalars(
                select(ProjectAsset).where(ProjectAsset.project_id == ctx.project_id).order_by(ProjectAsset.created_at)
            ).all()
            todo = [
                (a.id, a.meta.get("analysis") if self.reuse_analysis else None) for a in assets if a.status != "failed"
            ]
        analyses: list[VideoAnalysis] = []
        for n, (asset_id, cached) in enumerate(todo):
            if cached:
                analyses.append(VideoAnalysis.model_validate(cached))
                ctx.log(f"Reusing analysis of asset {n + 1}")
            else:
                analyses.append(ingest_asset(ctx, asset_id))
        if not analyses:
            ctx.log("No media: generating from the project description")
            return {"video": None}
        merged = analyses[0].model_copy(deep=True)
        for extra in analyses[1:]:  # several recordings = several pages
            offset = max((p.scene for p in merged.pages), default=-1) + 1
            for page in extra.pages:
                merged.pages.append(page.model_copy(update={"scene": page.scene + offset}))
            merged.events.extend(extra.events)
            merged.keyframes.extend(extra.keyframes)
        ctx.progress(
            0.2,
            "ingest",
            f"{len(merged.pages)} page(s), {len(merged.events)} timeline event(s), {len(merged.keyframes)} keyframe(s)",
        )
        return {"video": merged.model_dump(mode="json")}

    def node_analyze(self, state: PipelineState) -> PipelineState:
        ctx = self.ctx
        if not state.get("video"):
            return {"ui": UIAnalysis().model_dump(mode="json")}
        video = VideoAnalysis.model_validate(state["video"])
        ctx.progress(0.22, "analyze", "Analysing UI structure")
        ui = UIAnalyzer(ctx.router, ctx.storage).analyze(
            video, progress=lambda p, m: ctx.progress(0.22 + p * 0.13, "analyze", m)
        )
        regions = sum(len(p.regions) for p in ui.pages)
        ctx.progress(
            0.35,
            "analyze",
            f"Found {regions} regions and {len(ui.behaviors)} behaviour(s)",
            behaviors=[b.effect for b in ui.behaviors],
        )
        return {"ui": ui.model_dump(mode="json")}

    def node_architect(self, state: PipelineState) -> PipelineState:
        ctx = self.ctx
        ctx.set_project_status("generating")
        ctx.progress(0.37, "architect", "Designing the technical specification")
        with session_scope() as db:
            project = db.get(Project, ctx.project_id)
            name, framework, description = project.name, project.framework, project.description
        video = VideoAnalysis.model_validate(state["video"]) if state.get("video") else None
        viewport = video.viewport if video else {"width": 1280, "height": 800}
        ui = UIAnalysis.model_validate(state["ui"])
        spec = Architect(ctx.router).design(
            ui, viewport, name=name, framework=framework, description=description, overrides=ctx.project_settings
        )
        with session_scope() as db:
            record = versions.save_spec(db, ctx.project_id, spec, state["ui"], "pipeline")
            db.execute(delete(Component).where(Component.project_id == ctx.project_id))
            for comp in spec.components:
                db.add(
                    Component(
                        project_id=ctx.project_id,
                        spec_id=record.id,
                        name=comp.name,
                        kind=comp.kind,
                        props=comp.props,
                        source={"used_in": comp.used_in},
                    )
                )
            spec_id = record.id
        sections = sum(len(p.sections) for p in spec.pages)
        ctx.progress(
            0.45,
            "architect",
            f"Spec: {len(spec.pages)} page(s), {sections} sections, "
            f"{len(spec.components)} components, {len(spec.behaviors)} behaviours",
            spec_id=spec_id,
        )
        return {"spec": spec.model_dump(mode="json"), "spec_id": spec_id}

    def node_generate(self, state: PipelineState) -> PipelineState:
        ctx = self.ctx
        spec = DesignSpec.model_validate(state["spec"])
        r, st = ctx.router, ctx.storage
        ctx.progress(0.47, "frontend", "Frontend agent writing the project")
        result = FrontendAgent(r, st).run(spec)
        files = result.files
        ctx.log(f"frontend: {len(files)} files. {result.notes[:300]}")
        for step, (agent, pct) in {
            "animation": (AnimationAgent(r, st), 0.55),
            "responsive": (ResponsiveAgent(r, st), 0.6),
            "backend": (BackendAgent(r, st), 0.63),
        }.items():
            ctx.progress(pct, step, f"{step} agent")
            out = agent.run(spec, files)
            if out.files:
                files = versions.apply_changes(files, out.files)
            ctx.log(f"{step}: {'skipped - ' if out.skipped else ''}{out.notes[:300]}")
        with session_scope() as db:
            project = db.get(Project, ctx.project_id)
            version = versions.create_version(
                db,
                project,
                files,
                message="Initial generation from recording",
                author="ai",
                meta={"spec_id": state.get("spec_id"), "task_id": ctx.task_id},
            )
            version_id = version.id
        emit(ctx.project_id, "version", version_id=version_id)
        ctx.progress(0.65, "generate", "Version created", version_id=version_id)
        return {"files": files, "version_id": version_id}

    def node_secure(self, state: PipelineState) -> PipelineState:
        result = scan_files(state["files"])
        with session_scope() as db:
            db.add(
                TestResult(
                    project_id=self.ctx.project_id,
                    version_id=state["version_id"],
                    task_id=self.ctx.task_id,
                    kind="security",
                    score=100.0 if result.passed else 0.0,
                    passed=result.passed,
                    issues=result.issues,
                )
            )
        self.ctx.log(f"security scan: {'passed' if result.passed else 'FAILED'} ({len(result.issues)} finding(s))")
        return {"blocked": result.blocked_build}

    def node_build(self, state: PipelineState) -> PipelineState:
        spec = DesignSpec.model_validate(state["spec"])
        if not needs_build(spec.framework):
            return {"site_files": state["files"], "build_error": None}
        self.ctx.progress(0.67, "build", "Building in the sandbox")
        try:
            built, build_log = DockerSandbox(self.ctx.settings).build(state["files"])
        except BuildUnavailable as e:
            self.ctx.log(f"build skipped: {e}")
            return {"site_files": {}, "build_error": str(e)}
        except BuildError as e:
            with session_scope() as db:
                db.add(
                    TestResult(
                        project_id=self.ctx.project_id,
                        version_id=state["version_id"],
                        task_id=self.ctx.task_id,
                        kind="build",
                        score=0,
                        passed=False,
                        issues=[{"severity": "high", "message": str(e)[:4000]}],
                    )
                )
            return {"site_files": {}, "build_error": str(e)}
        prefix = f"projects/{self.ctx.project_id}/builds/{state['version_id']}"
        for path, data in built.items():
            self.ctx.storage.put(f"{prefix}/{path}", data)
        with session_scope() as db:
            from app.models import ProjectVersion

            v = db.get(ProjectVersion, state["version_id"])
            v.meta = {**v.meta, "build_prefix": prefix, "build_files": sorted(built)}
            db.add(
                TestResult(
                    project_id=self.ctx.project_id,
                    version_id=state["version_id"],
                    task_id=self.ctx.task_id,
                    kind="build",
                    score=100,
                    passed=True,
                    metrics={"log": build_log[-3000:]},
                )
            )
        return {"site_files": built, "build_error": None}

    def node_qa(self, state: PipelineState) -> PipelineState:
        ctx = self.ctx
        ctx.set_project_status("testing")
        it = state.get("iteration", 0)
        ctx.progress(
            0.7 + 0.25 * it / max(1, self.max_iterations + 1),
            "qa",
            f"Visual QA (iteration {it + 1}): rendering and comparing with the reference",
        )
        spec = DesignSpec.model_validate(state["spec"])
        if not state.get("site_files"):
            report = QAReport(score=0.0, passed=False, threshold=self.threshold)
            report.issues = []  # nothing rendered
            outcome = QAOutcome(report)
        else:
            outcome = VisualQAEngine(ctx.settings, ctx.storage).run(
                spec, state["site_files"], f"projects/{ctx.project_id}/qa/{state['version_id']}", self.threshold
            )
        self._last_outcome = outcome
        report = outcome.report
        with session_scope() as db:
            db.add(
                TestResult(
                    project_id=ctx.project_id,
                    version_id=state["version_id"],
                    task_id=ctx.task_id,
                    kind="visual",
                    score=report.score,
                    passed=report.passed,
                    metrics={
                        "page_scores": report.page_scores,
                        "overflow": report.overflow,
                        "sections": [s.model_dump() for s in report.sections],
                        "behavior_checks": report.behavior_checks,
                        "iteration": it,
                    },
                    issues=[i.model_dump() for i in report.issues],
                    artifacts=report.artifacts,
                )
            )
            from app.models import ProjectVersion

            db.get(ProjectVersion, state["version_id"]).score = report.score
        best = state.get("best") or {}
        if not best or report.score > best.get("score", -1):
            best = {"version_id": state["version_id"], "score": report.score}
        ctx.progress(
            0.7 + 0.25 * (it + 1) / max(1, self.max_iterations + 1),
            "qa",
            f"Score {report.score} (target {self.threshold}), {len(report.issues)} issue(s)",
            score=report.score,
            version_id=state["version_id"],
        )
        emit(ctx.project_id, "qa", version_id=state["version_id"], score=report.score, passed=report.passed)
        return {"report": report.model_dump(mode="json"), "best": best}

    def route_after_qa(self, state: PipelineState) -> str:
        report = state.get("report") or {}
        if report.get("passed") or state.get("iteration", 0) >= state.get("max_iterations", 0):
            return "finalize"
        if not state.get("site_files"):
            return "finalize"  # nothing rendered: a fix loop cannot measure progress
        return "fix"

    def node_fix(self, state: PipelineState) -> PipelineState:
        ctx = self.ctx
        it = state.get("iteration", 0) + 1
        ctx.progress(0.7 + 0.25 * it / max(1, self.max_iterations + 1), "fix", f"QA agent fixing (round {it})")
        spec = DesignSpec.model_validate(state["spec"])
        outcome = self._last_outcome or QAOutcome(QAReport.model_validate(state["report"]))
        result = QAFixAgent(ctx.router, ctx.storage).run(spec, state["files"], outcome)
        if result.skipped or not result.files:
            ctx.log(f"fix: {result.notes}")
            return {"fix_skipped": True}
        files = versions.apply_changes(state["files"], result.files)
        update: PipelineState = {"iteration": it, "files": files}
        spec_id = state.get("spec_id")
        if result.spec is not None:
            with session_scope() as db:
                spec_id = versions.save_spec(db, ctx.project_id, result.spec, None, "qa-fix").id
            update["spec"] = result.spec.model_dump(mode="json")
            update["spec_id"] = spec_id
        with session_scope() as db:
            project = db.get(Project, ctx.project_id)
            version = versions.create_version(
                db,
                project,
                files,
                message=f"QA fix round {it}: {result.notes[:500]}",
                author="qa-fix",
                parent_id=state["version_id"],
                meta={"spec_id": spec_id, "task_id": ctx.task_id},
            )
            update["version_id"] = version.id
        emit(ctx.project_id, "version", version_id=update["version_id"])
        ctx.log(f"fix round {it}: {result.notes[:400]}")
        return update

    def node_finalize(self, state: PipelineState) -> PipelineState:
        ctx = self.ctx
        best = state.get("best") or {"version_id": state.get("version_id")}
        with session_scope() as db:
            project = db.get(Project, ctx.project_id)
            if best.get("version_id"):
                project.current_version_id = best["version_id"]
            project.status = "ready" if not state.get("blocked") else "failed"
        if state.get("blocked"):
            ctx.log("Security scan blocked the build; see the security test result.")
        ctx.progress(1.0, "done", f"Finished. Best version score: {best.get('score')}")
        emit(ctx.project_id, "project", status="ready", version_id=best.get("version_id"))
        return {"best": best}


def run_pipeline(
    project_id: str, task_id: str, reuse_analysis: bool = True, max_iterations: int | None = None
) -> dict[str, Any]:
    ctx = TaskContext(project_id, task_id)
    ctx.start()
    try:
        out = Pipeline(ctx, reuse_analysis=reuse_analysis, max_iterations=max_iterations).run()
        ctx.succeed(out)
        return out
    except Exception as e:
        ctx.fail(e)
        ctx.set_project_status("failed")
        raise
