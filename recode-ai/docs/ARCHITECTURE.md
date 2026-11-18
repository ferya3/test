# معماری / Architecture

## 1. Stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 16 (App Router, client-rendered workspace), TypeScript, Tailwind CSS 4, shadcn-style components, Monaco |
| API | FastAPI (Python 3.13), Pydantic 2, SQLAlchemy 2 |
| Database | PostgreSQL (JSONB columns); SQLite in development and tests |
| Queue / realtime | Celery on Redis; Redis pub/sub → WebSocket |
| Storage | S3 / MinIO; local filesystem in development |
| Video | FFmpeg / FFprobe, OpenCV |
| Browser | Playwright (Chromium) |
| Orchestration | LangGraph state machine |
| AI | Anthropic SDK (Claude) per role, offline computer-vision fallback |
| Build sandbox | Docker, one throw-away container per build |

## 2. Repository layout

```
recode-ai/
├── backend/
│   ├── app/
│   │   ├── api/            HTTP + WebSocket routes (auth, projects, files, chat, realtime, meta)
│   │   ├── core/           config, database, storage, tokens, event bus
│   │   ├── video/          Video Intelligence Engine (probe, motion, imaging, engine)
│   │   ├── ai/
│   │   │   ├── providers/  LLMProvider interface, Anthropic provider, pricing
│   │   │   ├── router.py   role → (provider, model, effort); JSON / file-block parsing
│   │   │   ├── vision/     UI Analysis Engine
│   │   │   ├── architect/  AI Architect
│   │   │   ├── coding/     agents, deterministic renderer, natural-language editor
│   │   │   ├── retrieval.py local BM25 ("embedding" role)
│   │   │   └── prompts.py
│   │   ├── qa/             Chromium renderer + Visual QA Engine
│   │   ├── preview/        Docker build sandbox
│   │   ├── export/         ZIP, GitHub, deploy bundle
│   │   ├── security/       code scan, path normalisation
│   │   ├── services/       pipeline (LangGraph), media, edits, versions, jobs
│   │   └── workers/        Celery app and tasks
│   └── tests/
├── frontend/               Next.js app (dashboard, new project, workspace, settings)
├── infrastructure/         nginx config, sandbox image
├── scripts/demo/           demo site + recorder
└── docker-compose.yml
```

## 3. Data model

| Table | Purpose |
| --- | --- |
| `users` | accounts (PBKDF2 password hashes) |
| `projects` | name, source (video / screenshot / url / prompt), framework, status, per-project settings, current version |
| `project_assets` | uploaded media; `meta.analysis` keeps the full `VideoAnalysis` so regeneration skips re-analysis |
| `video_frames` | keyframes and stitched pages with timestamps and the reason each was captured |
| `design_specs` | every revision of the `DesignSpec` (+ the UI analysis it came from) |
| `components` | components of the latest spec |
| `ai_tasks` | each job: status, progress, step, logs, output, error |
| `code_files` | file contents per version |
| `project_versions` | immutable versions (ai / user / qa-fix / restore), parent, score, build location |
| `test_results` | visual, security and build results per version, with metrics, issues and artifacts |
| `conversations` | workspace chat messages, linked to the task and version they produced |
| `model_usage` | provider, model, role, agent, tokens, cost and latency per call |

Schema creation uses `metadata.create_all` at startup; introduce Alembic before the
first schema change in production.

## 4. From video to code

1. **Probe** — resolution, FPS, duration (FFprobe, OpenCV fallback); device pixel ratio guessed from the resolution.
2. **Sample** at 5 fps on a 320 px grey thumbnail. Frames between samples are kept until the next sample: if two samples look like a cut, the in-between frames are inserted so a scroll that moved further than a viewport is still followed.
3. **Pairs** — for consecutive samples: pixel change ratio; phase correlation for the translation; the first frame warped by that (sub-pixel) translation and compared with the second, ignoring the worst 20 % of rows (sticky headers, chat bubbles). Result: `still`, `scroll`, `cut` or `interaction` (with changed-region boxes).
4. **Timeline** — runs of the same kind become events with start / end time; scrolls carry distance and direction, interactions carry a normalised bounding box, a hint (dropdown, drawer, modal, hover, header change, slider) and the keyframes that document them. Blank and sub-half-second scenes are dropped.
5. **Keyframes** — first frame, scene starts, before / during / after each interaction, scroll ends, last frame; visually identical neighbours removed.
6. **Stitching** — per scene, every frame is pasted at its accumulated scroll offset, adding only rows not yet covered, so a sticky header appears once. Sticky header height = rows that stay identical while the page scrolls.
7. **Measurements** (`imaging.py`) — horizontal bands of uniform background (compared with the rows just above, so gradients stay one band), boundaries refined at full resolution, gradients as `linear-gradient()`, card columns from repeated surface extents, text colour, palette (k-means).
8. **UI analysis** — measured regions; with a vision model, the page tiles + measurements are read into regions with real texts, fonts and type scale, and the ordered keyframes + timeline into behaviours (trigger, target, effect, duration, easing, evidence, confidence).
9. **Architect** — `DesignSpec`: tokens, pages, sections (height in CSS px, background, layout, columns, elements, items, `source` pixels in the reference), components, behaviours, assumptions.
10. **Agents** — Frontend writes the project (a deterministic rendering of the spec is given as scaffold); Animation, Responsive and Backend edit it; files are scanned, versioned, built if needed.
11. **Visual QA** — render each page at the recorded viewport with reduced motion (settled state), match sections through `data-section` ids to their reference pixels, score structure (SSIM on blurred crops), colour (ΔE) and height; plus console errors, overflow at 390 / 768 / 1024 and click-behaviour checks.
12. **Fix loop** — below the target score, the QA agent gets the report and side-by-side crops of the worst sections and edits the files. The loop stops at the target, at the iteration limit or when a round does not improve the score; the best version becomes current.

## 5. Realtime

Jobs publish `progress`, `task`, `project`, `version`, `qa`, `asset`, `message` and
`usage` events to `recode:project:<id>` (Redis pub/sub, or an in-process bus in inline
mode). `/api/ws/projects/<id>?token=…` relays them; the workspace refetches what changed
and falls back to polling while the socket is down.

## 6. Security

- **Generated code never runs in the API process.** Static sites are served per version
  from `/api/preview/<signed token>/…` with a strict CSP (`connect-src 'none'`,
  `form-action 'none'`, `frame-ancestors` = the app) and shown in an iframe with
  `sandbox="allow-scripts"` only (opaque origin, no access to the app or its token).
- **Builds** run in a new container per build: CPU / memory / PID limits, wall-clock
  timeout, `--cap-drop ALL`, `no-new-privileges`, non-root user, no bind mounts (files go
  in and out with `docker cp`), `npm install --ignore-scripts`. The output is served
  statically; no user server is exposed. Network is only needed for the registry: put
  the build containers on a network whose egress is limited to it. The workers reach
  Docker through the host socket, which is root-equivalent — run them on a dedicated
  build host or against a rootless / gVisor daemon.
- **Visual QA** loads files from memory through request interception; only fonts and a
  few CDNs are reachable, everything else is aborted.
- **Code scan** before storing / building: path traversal, install scripts, non-registry
  dependencies, dependency allow-list, child processes, eval, miners, hard-coded
  secrets, trackers.
- **Uploads**: extension allow-list, size limit, streamed to disk; decoded only by
  FFmpeg / OpenCV in the video worker.
- **URL capture** resolves the host and refuses private, loopback, link-local and
  reserved addresses, also for every sub-request.
- **Tenancy**: every project route checks ownership and answers 404 for others'
  projects; media and preview links are signed and expire.
- **Secrets**: the GitHub token is used for one request and never stored; model keys
  stay on the server.
- **Licensing**: the product rebuilds visible design and behaviour from media the user
  is allowed to reproduce; agents are told never to hotlink the original assets.

## 7. Configuration

All settings are environment variables with the `RECODE_` prefix (see
`backend/app/core/config.py` and `backend/.env.example`). The most relevant:

| Variable | Default | Meaning |
| --- | --- | --- |
| `RECODE_AI_PROVIDER` | `anthropic` | `heuristic` forces the offline path |
| `RECODE_MODEL_<ROLE>` / `RECODE_EFFORT_<ROLE>` | `claude-opus-5-5` / high (qa: medium) | per-role model and effort |
| `RECODE_TASK_MODE` | `inline` | `celery` in production |
| `RECODE_QA_THRESHOLD` | `88` | target visual score |
| `RECODE_MAX_FIX_ITERATIONS` | `3` | auto-fix rounds |
| `RECODE_ANALYSIS_FPS` | `5` | sampling rate of the video engine |
| `RECODE_SANDBOX_MODE` | `none` | `docker` to build React projects |
| `RECODE_STORAGE_BACKEND` | `local` | `s3` for S3 / MinIO |
