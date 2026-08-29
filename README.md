# Open Executive

[![CI](https://github.com/SenteLabsAI/OpenExecutive/actions/workflows/ci.yml/badge.svg)](https://github.com/SenteLabsAI/OpenExecutive/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)

An AI system that acts as your company's virtual executive team — a senior advisor with Harvard MBA-level knowledge, customized for your specific business.

## Demo

[![Open Executive demo video](https://img.youtube.com/vi/O_g97xxVTMk/maxresdefault.jpg)](https://youtu.be/O_g97xxVTMk)

A walkthrough of Open Executive in action — [watch on YouTube](https://youtu.be/O_g97xxVTMk).

## What It Does

Developed by [sentelabs.ai](https://sentelabs.ai) Open Executive provides a single coherent executive voice backed by eight specialist AI agents:

- **Chief Strategy Officer** — competitive analysis, M&A, market positioning, OKRs
- **Chief Financial Officer** — financial modeling, fundraising, unit economics, cash flow
- **Chief HR/People Officer** — hiring, compensation, performance, culture
- **General Counsel** — contracts, IP, employment law basics, compliance
- **Chief Operating Officer** — process design, vendor management, operational scaling
- **Chief Marketing Officer** — GTM strategy, brand, communications, PR
- **Chief Product Officer** — roadmap, prioritization, product strategy
- **Board Communications Director** — board decks, investor relations, governance

All responses come from one consistent executive voice. The internal agent architecture is never exposed to the user. Beyond Q&A, the system maintains episodic memory of past decisions and initiatives across sessions, and a built-in scheduler can proactively surface follow-ups and time-sensitive actions.

## Architecture

```
User message
    ↓
Executive Orchestrator (claude-sonnet-4-6)
    ↓ tool use → parallel specialist calls
CSO / CFO / CHRO / GC / COO / CMO / CPO / Board
    ↓ each specialist retrieves relevant context from ChromaDB
Built-in MBA knowledge + Your company documents
    ↓
Synthesized executive response
```

**Knowledge** — Two retrieval layers per specialist call: (1) built-in MBA-level Markdown (`knowledge/builtin/`, git-tracked) seeded into ChromaDB at startup, and (2) your uploaded company documents chunked and stored in a separate `company_docs` collection. RAG context is injected into the user turn, never the cached system prompt.

**Episodic memory** — After every response, a background `claude-haiku-4-5` pass extracts key decisions, initiatives, and advice into SQLite. The next session opens with a `<past_decisions>` block so the Executive remembers what it recommended last month.

**Scheduler** — A built-in job runner claims due actions via `UPDATE … RETURNING` to prevent double-firing. The API must run as a single instance; do not horizontally scale it without gating the scheduler first.

**Prompt caching** — The system prompt is structured so the Executive persona, company profile, and knowledge index are cached separately (up to 85% cache hit rate after the first few turns). No dynamic content ever goes in a cached block.

See [docs/architecture.md](docs/architecture.md) for the full design.

## Tech Stack

| Layer | Choice |
|---|---|
| LLM backbone | Anthropic Claude API |
| Default model | `claude-sonnet-4-6` (Executive + most specialists) |
| Deep reasoning | `claude-opus-4-7` (CSO, CFO, GC, Board — with extended thinking) |
| Backend | Python 3.11 + FastAPI |
| Package manager | `uv` |
| Vector store | ChromaDB (local, embedded) |
| Episodic memory | SQLite |
| Web UI | Next.js 15 (App Router) + Tailwind |
| License | Apache 2.0 |

## Repo Layout

```
openexecutive/
├── packages/
│   ├── core/
│   │   └── openexecutive/
│   │       ├── orchestrator/     # Executive persona + routing loop
│   │       ├── agents/           # 8 specialist agents
│   │       ├── knowledge/        # ChromaDB store + RAG pipeline
│   │       ├── memory/           # Company profile + episodic memory
│   │       ├── onboarding/       # Wizard state machine + profile builder
│   │       ├── prompts/          # Persona + domain prompts + cache manager
│   │       ├── api/              # FastAPI app + routes
│   │       ├── integrations/     # Slack, Email, Telegram, Google Chat, Discord
│   │       ├── scheduler/        # Background job runner (single-instance)
│   │       ├── alerts/           # Proactive alert system
│   │       ├── audit/            # Audit logging
│   │       ├── architecture/     # Internal architecture utilities
│   │       ├── workflows/        # Multi-step workflow definitions
│   │       └── cli.py            # Click CLI
│   └── ui/                       # Next.js 15 web UI
├── evals/                        # Eval scenarios + LLM-as-judge runner
├── fixtures/                     # Demo company fixtures (profiles, docs, rosters)
├── scripts/                      # Operator scripts (Fly secrets, Google auth)
├── docker/                       # Dockerfile(s) + docker-compose.yml
├── fly.api.toml / fly.ui.toml    # Fly.io configs — dev API + UI apps
├── fly.api.qa.toml / fly.ui.qa.toml  # Fly.io configs — QA API + UI apps
├── fly.honcho.toml               # Fly.io config — Honcho memory app (optional)
└── docs/                         # Architecture + deployment docs
```

## Quick Start

```bash
# Clone the repo
git clone https://github.com/SenteLabsAI/OpenExecutive.git
cd OpenExecutive

# Set your Anthropic API key
cp .env.example .env
# Edit .env and add ANTHROPIC_API_KEY=sk-ant-...

# Start everything
make dev
```

Open http://localhost:3000 to start chatting with your executive. The API runs on port 8000 and the UI on 3000.

> **First run:** requires Python 3.11+ and Node 22+. The initial `uv sync` pulls heavy
> ML dependencies (ChromaDB + sentence-transformers/PyTorch), and the first boot
> downloads a small embedding model (~90 MB) to build the local vector index — so the
> first `make dev` takes a few minutes before the app is ready. Subsequent starts are fast.

**For contributors not using `make`:**

```bash
cd packages/core
uv sync
source .venv/bin/activate
uvicorn openexecutive.api.main:app --reload --port 8000

# In a second terminal
cd packages/ui && npm install && npm run dev
```

## Run the Discord Bot

1. Create a Discord application at https://discord.com/developers/applications
2. Enable the **Message Content** privileged intent (Bot → Privileged Gateway Intents)
3. Invite the bot with `bot` + `applications.commands` scopes
4. Set env vars in `.env`: `DISCORD_BOT_TOKEN`, `DISCORD_APP_ID`, `DISCORD_GUILD_IDS`
5. Run the API normally — the bot starts as part of the FastAPI lifespan when `DISCORD_BOT_TOKEN` is set:

```bash
make dev
```

The bot is embedded in the API process (alongside the email poller, scheduler, and resumer) so it shares the same SQLite database and ChromaDB vector store under `/data` in production. Skip the token to disable.

For iterating on bot-only code without restarting the API, `make discord` runs the bot as a standalone process against the same local DB.

Users can DM the bot, `@mention` it in a channel (replies in a thread), or use `/ask` and `/today` slash commands. Slash commands sync to `DISCORD_GUILD_IDS` instantly on startup; leave blank for global registration (up to 1-hour propagation delay).

### Deploying to production

Just set the secrets on the existing API app — no new Fly app required:

```bash
flyctl secrets set -a openexec-api-dev \
  DISCORD_BOT_TOKEN=... \
  DISCORD_APP_ID=... \
  DISCORD_GUILD_IDS=...
```

Discord user access is managed via the /people UI — add a Person row with `discord_user_id` set.

The machine restarts and the bot starts on the next lifespan boot. To disable in prod: `flyctl secrets unset -a openexec-api-dev DISCORD_BOT_TOKEN`.

## Onboarding Your Company

The first time you visit the app, you'll be guided through a wizard to set up your company profile:
- Company basics (name, industry, stage, team size)
- Business model and revenue
- Competitive landscape
- Strategic priorities
- Culture and values
- Optional: financial position, document upload

After onboarding, the Executive will reference your specific company context in every response.

## Using Open Executive Effectively

Open Executive is a senior advisor and chief-of-staff, not an autonomous operator. It works best when it has real context to reason over and a clear picture of who holds which decisions. The following is how to get value out of it day to day.

### Give it real context

The quality of every answer is proportional to what the Executive knows about your company.

- **Complete the onboarding properly.** Vague inputs produce generic advice. Revisit the **Company Profile** page whenever strategy, funding, competitors, or org structure change — it grounds every specialist.
- **Upload the documents that matter** via the **Knowledge Base**: pitch deck, financial model, board decks, strategy memos, the employee handbook, key contracts. The Executive retrieves from these when relevant. Use **Query mode** to check what it would actually pull for a given question.
- **Set up People and Departments.** Add each person with their role, response SLA, preferred channel, and **authority scopes** (e.g. "approve spend under $10k", "sign off on hiring"). Give each department an **authority level** — act automatically, propose for approval, or always escalate. This is how the Executive decides who to ask for any given approval and whether it can act on its own.

### Talk to it like one person

- Ask real business questions in plain language — "should we raise now or wait two quarters?", "draft a comp band for a staff engineer", "what's our exposure if this customer churns?". There is no prompt engineering; the Executive pulls in whichever specialists a question needs.
- Toggle **Committee** on decisions that matter. It's a slower pass where reviewers challenge the draft answer before you see it.
- Any channel works — web UI, Slack, Discord, Telegram, email, CLI. They share one memory and one company context, so start a thread on your phone and finish it on the web.
- Use **Ask OE** (the panel on the right of every page, or Ctrl/Cmd + .) to ask what a screen means or to fill a form in plain language.

### Run your day from the briefing

- **Today / Morning Brief** is the home surface: what needs you right now, split into **Needs you** (waiting on your call) and **Across the team**. It shows department goal health and which people have overdue items.
- Click any briefing item to open a chat thread with the full context already loaded — that's the intended way to act on something rather than re-explaining it.
- **Proposals** route automatically to whoever has authority over them. Approve or dismiss from the card, or discuss first in chat and approve there.

### Artifacts: documents the Executive writes for you

An **artifact** is a finished document the Executive produces for you to read — a memo, a competitor teardown, a board-deck outline, the output of a scheduled job. It is **not** a task waiting for your approval, and **"draft" does not mean unfinished**. In the **Artifacts** section they're grouped into **Drafts** (documents the Executive wrote on its own initiative and flagged for your attention) and **Workflows** (outputs of a job run) — that label is just where the document came from, not a status.

**What you do with an artifact: read it.** That is the whole point. There is no publish, send, sign-off, or edit step.

**Where it shows up:**

- If the Executive wrote it *for your attention*, it appears in **Today → Needs you** as a document card with a short "why this is worth your time" note. From that card you can hit **Discuss** (opens a chat with the full document loaded so you can ask questions about it) or **✓ Mark reviewed** to clear it. Marking it reviewed simply takes it off your list — nothing else happens, and the document is not lost.
- It *also* lives permanently in the **Artifacts** section, whether or not you've reviewed it. There the actions are **Copy**, **Download .md**, **Archive** (hide it from the default list; reversible), and **Delete** (permanent). Archive and Delete are housekeeping — an artifact does not get "finished" by archiving it, you are just tidying up once it has served its purpose.

**If reading an artifact makes you want to act on it** — send it to your board, start a project, dig into one section — that is a new request you make in chat. The artifact itself just stays in the library as the record that the Executive produced it.

**One limitation worth knowing:** the Executive cannot reach into the Artifacts library on its own. In a fresh chat, asking it to "pull up that teardown you wrote last week" will not work. Use the **Discuss** button while the artifact is still in your Today list, or **Copy** it from the Artifacts page and paste it into the conversation.

### Delegate recurring work to Jobs

- **Jobs (Workflows)** are multi-step runs that produce a real deliverable — a board deck, a go-to-market plan, a performance review — not just a chat reply. Start one and watch it stream.
- Put a workflow on a **schedule** (e.g. every Monday 09:00) so it runs unprompted; the output DMs to whoever you nominate and appears in Artifacts.
- Build a **custom workflow** by chaining specialist, synthesis, and approval-gate steps. A workflow that needs your sign-off mid-run pauses and asks — it will not push a consequential action through on its own.

### Tell it what to watch

- Add monitors on the **Watch List** — stock tickers, RSS/Atom feeds, vendor status pages, regulatory filings, web-search queries, or specific web pages. Qualifying signals flow into your briefing on the same path as inbound email.
- Web-search monitors cost per check; prefer slower cadences for those. Ticker, filing, and page monitors are cheap. You can edit the list from chat too.

### Keep its memory honest

- The Executive remembers **decisions**, **initiatives**, and **advice** across every session and channel. Reference them naturally — "what did we decide about the pricing change?" — and it will recall the rationale.
- Review and correct that memory on the **Pulse** page. An out-of-date decision left uncorrected will bias future advice.

### Set expectations

- **Quiet is the default.** No proposals in your briefing means nothing needs you — it is not a sign something is broken.
- **Verify before you act on anything material.** Treat an artifact as a well-researched briefing, not a finished decision. The Executive is strongest as a synthesizer and a forcing function, weakest when you skip the review.
- Consequential actions (offers, broadcasts, spend) go through approval gates and authority scopes by design — keep those configured and they will do their job.

The in-app **User Guide** (pinned in the nav next to Settings) documents every page in this depth, and **Architecture** explains how the system works under the hood.

## Interfaces

| Interface | How to Use |
|-----------|-----------|
| **Web UI** | `http://localhost:3000` |
| **Slack** | Mention `@OpenExecutive` or DM the app |
| **Email** | CC or email the configured address (IMAP/SMTP poller) |
| **Telegram** | Message the configured bot |
| **Google Chat** | Mention the app in a space |
| **Discord** | DM the bot, `@mention` it in a channel, or use `/ask` / `/today` slash commands |
| **CLI** | `openexecutive chat` |

## Document Upload

Upload your pitch deck, financial model, strategy docs, or any company documents via the web UI or API. The Executive will reference them when relevant.

```bash
# Via CLI
openexecutive upload deck.pdf model.xlsx strategy.md

# Via API
curl -X POST http://localhost:8000/documents \
  -F "file=@deck.pdf" \
  -F "domain=strategy"
```

## Deployment (Fly.io)

Two environments, each a separate set of Fly apps, driven by branch:

| Environment | Trigger | Workflow | Apps |
|---|---|---|---|
| **dev** | push/merge to `main` (continuous) | `.github/workflows/deploy.yml` | `openexec-api-dev`, `openexec-ui-dev` |
| **qa** | push/merge to `qa` (deliberate promotion) | `.github/workflows/deploy-qa.yml` | `openexec-api-qa`, `openexec-ui-qa` |

Both workflows use `dorny/paths-filter` to deploy only the changed app (API, UI, or both). QA is a stable twin of dev — same image and runtime, only the app name differs (`fly.api.qa.toml` / `fly.ui.qa.toml`) — so it lags `main` and stays vetted. An optional Honcho memory app (`fly.honcho.toml`) deploys independently.

### Topology

| App | Purpose | State |
|-----|---------|-------|
| `openexec-api-{dev,qa}` | FastAPI + scheduler | Persistent volume `executive_data` at `/data` |
| `openexec-ui-{dev,qa}` | Next.js 15 | Stateless |
| `openexec-honcho-dev` | Honcho per-person memory (optional) | Postgres-backed |

> **⚠️ Single-instance only**: The scheduler claims rows via `UPDATE … RETURNING`. Running two API machines would double-fire scheduled actions. `max_machines_running = 1` is set in `fly.api.toml` / `fly.api.qa.toml` — do not override it.

### Required GitHub Actions secrets

Deploys authenticate with per-app Fly deploy tokens stored as repo (or org) Actions secrets. Generate each with `flyctl tokens create deploy -a <app> -x 999999h`:

| Secret | App | Used by |
|---|---|---|
| `FLY_API_TOKEN_API` | `openexec-api-dev` | dev |
| `FLY_API_TOKEN_UI` | `openexec-ui-dev` | dev |
| `FLY_API_TOKEN_HONCHO` | `openexec-honcho-dev` | dev (honcho job) |
| `FLY_API_TOKEN_API_QA` | `openexec-api-qa` | qa |
| `FLY_API_TOKEN_UI_QA` | `openexec-ui-qa` | qa |

Per-app runtime secrets (`ANTHROPIC_API_KEY`, `BACKEND_SHARED_SECRET`, the `AUTH_*` set, integration tokens) are set directly on each Fly app — see `scripts/fly-secrets.sh.example`.

### One-time bootstrap (dev)

```bash
# 1. Create apps and volume
flyctl apps create openexec-api-dev
flyctl apps create openexec-ui-dev
flyctl volumes create executive_data --region iad --size 1 -a openexec-api-dev

# 2. Set the required secret
flyctl secrets set -a openexec-api-dev ANTHROPIC_API_KEY=sk-ant-...

# 3. Create deploy tokens and add as GitHub secrets FLY_API_TOKEN_API and FLY_API_TOKEN_UI
flyctl tokens create deploy -a openexec-api-dev -x 999999h
flyctl tokens create deploy -a openexec-ui-dev  -x 999999h

# 4. First deploy
gh workflow run "Deploy (dev)" -f target=both
```

QA bootstraps the same way against the `-qa` app names (push to the `qa` branch, or `gh workflow run "Deploy (qa)"`). See [docs/deployment.md](docs/deployment.md) for the full runbook (operations, rollback, common failure modes, why `.flycast` isn't used).

### Access control

The deployed UI is gated behind Google sign-in with an email allow-list, and the public API is protected by a shared-secret header between the UI proxy and the FastAPI backend. See [docs/auth.md](docs/auth.md) for the full setup (Google Cloud Console steps, required Fly secrets, adding/removing users, rotating secrets, and a debugging table).

## Configuration

All settings via environment variables. Minimum required: `ANTHROPIC_API_KEY` —
*unless* you configure a local or OpenRouter backend instead (see [Running on
Local Models](#running-on-local-models)). At least one provider must be set or
the app refuses to start.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes¹ | — | Anthropic API key |
| `DEFAULT_MODEL` | No | `claude-sonnet-4-6` | Executive + most specialists |
| `DEEP_REASONING_MODEL` | No | `claude-opus-4-7` | CSO, CFO, GC, Board |
| `VECTOR_STORE_PATH` | No | `./chroma_db` | ChromaDB directory |
| `EPISODIC_DB_PATH` | No | `./episodic_memory.db` | SQLite for episodic memory |
| `COMPANY_PROFILE_PATH` | No | `./company/profile.yaml` | Company profile |
| `ENABLE_CACHING` | No | `true` | Anthropic prompt caching |
| `ROUTING_MODEL` | No | `claude-haiku-4-5-20251001` | Model for intent routing |
| `SLACK_BOT_TOKEN` | No | — | Slack bot OAuth token |
| `SLACK_APP_TOKEN` | No | — | Slack socket mode token |
| `EXEC_EMAIL_ADDRESS` | No | — | Executive Gmail address (Gmail MCP OAuth) |
| `EMAIL_POLL_INTERVAL_SECONDS` | No | `60` | How often to poll for new email |
| `TELEGRAM_BOT_TOKEN` | No | — | Telegram bot token (from @BotFather) |
| `TELEGRAM_WEBHOOK_SECRET` | No | — | Random string for webhook validation |
| `DISCORD_BOT_TOKEN` | No | — | Discord bot token (Developer Portal → Bot tab) |
| `DISCORD_APP_ID` | No | — | Discord application ID (General Information tab) |
| `DISCORD_GUILD_IDS` | No | — | Comma-separated guild IDs for dev slash-command registration |
| `DISCORD_NOTIFY_CHANNEL_ID` | No | — | Default channel ID for outbound notifications |
| `GOOGLE_CHAT_PROJECT_NUMBER` | No | — | GCP project number for Google Chat |
| `GOOGLE_CHAT_SERVICE_ACCOUNT_FILE` | No | — | Path to service account JSON key |
| `GOOGLE_OAUTH_CLIENT_ID` | No | — | Google OAuth client ID (Gmail MCP) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | No | — | Google OAuth client secret (Gmail MCP) |
| `OPENROUTER_ENABLED` | No | `false` | Route Claude calls through OpenRouter and unlock non-Anthropic models per-agent in the Council UI |
| `OPENROUTER_API_KEY` | No | — | Required when `OPENROUTER_ENABLED=true` |
| `LOCAL_MODELS_ENABLED` | No | `false` | Route selected slugs to a local OpenAI-compatible server (Ollama, LM Studio, vLLM, llama.cpp) |
| `LOCAL_BASE_URL` | No | — | Local server URL incl. version path, e.g. `http://localhost:11434/v1`. Required when `LOCAL_MODELS_ENABLED=true` |
| `LOCAL_API_KEY` | No | — | Optional bearer token (vLLM / gateways); Ollama & LM Studio need none |
| `LOCAL_MODELS` | No | — | Comma-separated local model slugs to surface in the Council UI and route locally, e.g. `llama3.3,qwen2.5` |
| `LOCAL_TIMEOUT_S` | No | `300` | Per-call timeout for local generation, in seconds |
| `HONCHO_ENABLED` | No | `false` | Per-person memory layer ([honcho.dev](https://honcho.dev)) — a peer card shared across all channels |
| `HONCHO_API_KEY` | No | — | Required when `HONCHO_ENABLED=true` |
| `HONCHO_BASE_URL` | No | — | Self-hosted Honcho endpoint |

See [.env.example](.env.example) for the full list.

> ¹ `ANTHROPIC_API_KEY` is required only when you serve Claude models directly.
> It can be omitted entirely if you run on local models (`LOCAL_MODELS_ENABLED`)
> or route through OpenRouter (`OPENROUTER_ENABLED`).

## Running on Local Models

Open Executive can run against any **OpenAI-compatible** local server — Ollama,
LM Studio, vLLM, or llama.cpp — instead of (or alongside) the Anthropic API.
Local model slugs route to your server through the same provider abstraction the
hosted models use; no agent or orchestrator code changes.

```bash
# 1. Pull a capable, tool-use-friendly model (example: Ollama)
ollama pull llama3.3

# 2. In .env — point at the local server and list the slugs to expose
LOCAL_MODELS_ENABLED=true
LOCAL_BASE_URL=http://localhost:11434/v1   # Ollama default
LOCAL_MODELS=llama3.3

# 3. (Optional) run with NO Anthropic key — make local the default everywhere
DEFAULT_MODEL=llama3.3
DEEP_REASONING_MODEL=llama3.3
ROUTING_MODEL=llama3.3
# ...and leave ANTHROPIC_API_KEY unset
```

The listed slugs appear in the **Council UI** model dropdown, so you can also run
a hybrid setup — keep the Executive on Claude while flipping individual
specialists to a local model per-agent.

**Caveats.** Server-side web search (`ENABLE_WEB_SEARCH`) and Anthropic prompt
caching / extended thinking have no local equivalent and are automatically
disabled for local models. Multi-agent routing leans heavily on tool use, so
pick a model that's strong at it (e.g. Llama 3.3 70B, Qwen2.5) — small models
may route poorly. `LOCAL_API_KEY` is only needed if your server (vLLM, or a
gateway) requires a bearer token; Ollama and LM Studio need none.

## Adding a New Specialist Agent

1. Create `packages/core/openexecutive/agents/your_agent.py` extending `BaseAgent`
2. Add a system prompt constant in `packages/core/openexecutive/prompts/domain_prompts.py`
3. Register in `packages/core/openexecutive/orchestrator/router.py` — add to `SPECIALIST_REGISTRY` and the `specialist` enum in `SPECIALIST_TOOLS`
4. Add domain alias to `DOMAIN_ALIASES` in `packages/core/openexecutive/knowledge/retriever.py`
5. Add knowledge docs to `knowledge/builtin/your_domain/`
6. Add at least 2 eval scenarios to `evals/scenarios/`
7. Submit a PR — CI requires all of the above

## Development

```bash
make dev          # Start FastAPI + Next.js
make test         # Run Python tests
make eval         # Run eval suite
make lint         # Run ruff + mypy
make docker       # Build and run Docker stack

# Unit tests only (no API calls required)
pytest packages/core/tests/unit/ -v
```

## Evaluation System

`evals/` contains 29 scenarios covering all 8 domains, scored by `claude-opus-4-7` as an LLM-as-judge. Each scenario defines a query, simulated company context, expected topics, required specialist routing, and a domain-specific rubric. Five scoring dimensions (persona coherence, domain accuracy, company context utilization, routing quality, actionability) are each rated 1–5. The CI gate requires ≥ 3.5/5 average; any dimension dropping > 10% vs `main` fails the PR.

## Privacy

Everything in `company/` is gitignored — the profile YAML, uploaded documents, and the ChromaDB vector store. None of this leaves your local machine (or your own Fly volume in cloud deployments) except as part of prompts sent to the Anthropic API. Anthropic does not train on API data.

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md). All PRs must include:
- Working implementation (no stubs)
- Tests for new behavior
- Eval scenarios for new agents or prompt changes

## License

Apache 2.0 — free to use commercially, requires attribution.
