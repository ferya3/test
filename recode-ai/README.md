# Recode AI

**مهندسی معکوس وب‌سایت و رابط کاربری از روی ویدئو** — a platform that takes a real
example (a screen recording, a screenshot, a URL or a description), reverse-engineers
it, rebuilds it as code, runs the result in a browser, compares it with the original
and fixes the differences on its own.

It is not a chat box that writes code. It is an automated development environment:
every step produces something you can inspect (frames, a timeline of interactions, a
design spec, versioned files, a live preview, a visual QA report) and edit.

```
Upload ─► Video Intelligence ─► UI Analysis ─► AI Architect ─► Code agents ─► Security scan
              (FFmpeg/OpenCV)    (vision)       (DesignSpec)   (frontend,     │
                                                               animation,     ▼
                                                               responsive, ─► Build sandbox ─► Visual QA ─┐
                                                               backend)       (Docker)        (Playwright │
                                                                  ▲                            + OpenCV)  │
                                                                  └───────── QA fix agent ◄── below target┘
                                                                                     │ meets target / no progress
                                                                                     ▼
                                                                     Versions ─► Preview · ZIP · GitHub
```

## خلاصه به فارسی

- ویدئو (MP4/MOV/WebM)، اسکرین‌شات، آدرس سایت یا توضیح متنی را بدهید.
- موتور ویدئو فریم‌ها را نمونه‌برداری می‌کند، اسکرول (با دقت زیرپیکسل)، تغییر صحنه و
  تعاملات موضعی (باز شدن منو، hover) را **به ترتیب زمانی** و با مدت‌زمان تشخیص می‌دهد،
  کل صفحه را از روی اسکرول به یک تصویر بلند می‌دوزد و هدر چسبان را پیدا می‌کند.
- تحلیل رابط کاربری، بخش‌ها، رنگ‌ها، گرادیان‌ها و ستون‌های کارت‌ها را اندازه می‌گیرد؛ با
  کلید Claude، مدل بینایی متن‌ها، فونت‌ها و رفتارها را هم می‌خواند.
- معمار هوش مصنوعی یک DesignSpec ساختاریافته می‌سازد و Agentها (Frontend، Animation،
  Responsive، Backend) کد را می‌نویسند.
- خروجی در Chromium اجرا و بخش‌به‌بخش با فریم‌های مرجع مقایسه می‌شود (SSIM، اختلاف رنگ،
  ارتفاع، overflow موبایل، آزمون کلیک)؛ Agent کنترل کیفیت تا رسیدن به امتیاز هدف اصلاح می‌کند.
- در محیط کار: پیش‌نمایش زنده، ویرایشگر Monaco، تاریخچه نسخه‌ها، Design Inspector،
  گفت‌وگو با هوش مصنوعی به فارسی یا انگلیسی («فاصله سکشن دوم را ۳۰ پیکسل بیشتر کن»)،
  خروجی ZIP و GitHub.
- بدون کلید API هم کار می‌کند (حالت آفلاین): چیدمان، رنگ‌ها و رفتارها از ویدئو اندازه‌گیری
  می‌شوند و فقط متن‌ها و فونت‌ها جای‌نگهدار هستند.

## The eight engines

| # | Engine | Where | What it does |
|---|--------|-------|--------------|
| 1 | Project Manager | `backend/app/api`, `frontend/` | Projects, media, versions, settings, history, multi-user auth |
| 2 | Video Intelligence | `backend/app/video` | Probe (FFprobe), sampling, sub-pixel scroll detection, scene cuts, localised interactions with timing, keyframes, stitched full pages, sticky headers, palette |
| 3 | UI Analysis | `backend/app/ai/vision`, `app/video/imaging.py` | Bands, exact boundaries, gradients, card columns, text colour; vision model reads texts, fonts and behaviours from ordered keyframes |
| 4 | AI Architect | `backend/app/ai/architect` | UIAnalysis → `DesignSpec` (tokens, pages, sections, components, behaviours, assumptions) |
| 5 | Code Generation | `backend/app/ai/coding` | Frontend, Animation, Responsive, Backend and QA-fix agents; natural-language editor with local retrieval |
| 6 | Preview | `backend/app/preview`, `/api/preview/...` | Static sites served per version in a sandboxed iframe; React projects built in a throw-away Docker container |
| 7 | Visual QA | `backend/app/qa` | Chromium render served from memory, per-section SSIM / ΔE / height, heatmap, console errors, overflow at 390/768/1024, click-behaviour checks |
| 8 | Export & Deployment | `backend/app/export` | ZIP with Dockerfile + nginx config, push to GitHub (one commit via the Git Data API) |

## Run it

### On an Ubuntu server (one line)

```bash
curl -fsSL https://raw.githubusercontent.com/ferya3/test/claude/quirky-bohr-nrggpp/recode-ai/install.sh | sudo bash
```

Installs Docker, fetches the code into `/opt/recode-ai`, writes `.env` with random
secrets, builds and starts the stack, and prints the address. Run it again to update.
Add the Claude key afterwards in `/opt/recode-ai/recode-ai/.env` (`ANTHROPIC_API_KEY=`)
and run `docker compose up -d` there; `HTTP_PORT`, `SANDBOX_MODE` and `INSTALL_DIR` can
be set in front of `bash`.

### Development (no Docker)

Requirements: Python 3.12+, Node 22, FFmpeg.

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m playwright install chromium
cp .env.example .env            # add ANTHROPIC_API_KEY for Claude, or leave it for offline mode
uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev                     # http://localhost:3000
```

In development jobs run in a background thread of the API (`RECODE_TASK_MODE=inline`),
data lives in SQLite and files in `backend/data/`.

### Full stack (Docker Compose)

```bash
cp .env.example .env            # set RECODE_SECRET_KEY, optionally ANTHROPIC_API_KEY
docker compose build
docker compose up -d            # http://localhost
```

PostgreSQL, Redis, the API, one Celery worker per queue (`video`, `ai`, `code`,
`test`), the Next.js app and nginx. React (Vite) projects are built through the host's
Docker socket — read [Security](docs/ARCHITECTURE.md#security) before exposing it.

### Try it with the demo recording

`scripts/demo/site.html` is a small landing page; `scripts/demo/record.mjs` records a
screen video of it with Playwright (scroll, hover a card, open and close the menu,
scroll to the end):

```bash
node scripts/demo/record.mjs ./out      # writes out/northwind.webm
```

Upload `northwind.webm` as a new project and press **Generate**.

## Models

**Every user brings their own key.** In *Settings → Your API keys* a user adds:

- an **Anthropic** key (optionally through an Anthropic-compatible relay), and/or
- any **OpenAI-compatible** service — OpenRouter, OpenAI, Google Gemini, a local Ollama,
  or a relay service — with its base URL and model (the model must accept images).

Keys are encrypted at rest (Fernet, derived from `RECODE_SECRET_KEY`), shown only masked,
checked with a test call, and used only for that user's projects; usage is billed by the
provider to the user. Without a key of their own, users fall back to the server's
`ANTHROPIC_API_KEY` if the operator allows it (`RECODE_ALLOW_SERVER_KEY`), otherwise to
offline mode. User-supplied endpoints may not point at private addresses unless
`RECODE_ALLOW_PRIVATE_LLM_URLS=true` (needed for Ollama on the same machine).

Each role has its own provider, model and effort, set on the server
(`RECODE_MODEL_VISION`, `RECODE_EFFORT_CODING`, …) and overridable per project in the
workspace's Settings tab:

| Role | Used by | Default |
|------|---------|---------|
| vision | UI Analysis (pages, timeline) | `claude-opus-5-5`, effort high |
| reasoning | AI Architect | `claude-opus-5-5`, effort high |
| coding | Frontend / Animation / Responsive / Backend agents, edits | `claude-opus-5-5`, effort high |
| qa | QA fix agent | `claude-opus-5-5`, effort medium |
| embedding | finding the files an edit touches | local BM25 (no model call) |

Calls use the official Anthropic SDK with adaptive thinking, streaming, prompt caching
of the system prompts and the server-side refusal fallback. Token use and cost are
recorded per call (`model_usage`) and shown in the workspace. Adding another provider
means implementing `LLMProvider` (`backend/app/ai/providers/base.py`) and registering it
in the router; the engines only talk to roles.

Without credentials every role falls back to the offline computer-vision path
(`RECODE_AI_PROVIDER=heuristic` forces it). Offline, the platform still:

- trims browser chrome (window frame, scrollbars) from screenshots and recordings,
- reads the copy with Tesseract OCR (English and Persian, dark and light backgrounds),
- cuts the pictures out of the reference (products, photos — not flat UI or text) and
  places them where they are, scaled with the page width (`canvas` sections),
- measures sections, colours, gradients, card columns and recorded behaviours.

What it cannot do without a vision model: rebuild interactive widgets it only sees as
pictures, name fonts, or understand what a section means.

## Tests

```bash
cd backend && pytest            # video engine, renderers, router, security, offline editor,
                                # LLM code paths with a scripted model, full HTTP flow
ruff check app tests
cd ../frontend && npm run lint && npm run typecheck && npm run build
```

The video tests use a synthetic recording (`tests/synthetic.py`) — including a blank
first paint and a scroll that jumps more than a viewport between samples — and a page
stitched from a real Chromium recording (`tests/fixtures/northwind-page.png`).

## Roadmap

| Phase | Scope | State |
|-------|-------|-------|
| 1 | Upload, video analysis, AI generation | done |
| 2 | Live preview, code editing, auto-fix | done |
| 3 | Visual comparison, behaviour reconstruction | done for click / scroll / sticky / hover; finer animation curve matching next |
| 4 | Users, GitHub, deployment | users and GitHub export done; billing and one-click hosting next |

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Use media you are allowed to reproduce. Recode AI rebuilds visible design and behaviour;
it never fetches private code and does not hotlink the original site's assets.
