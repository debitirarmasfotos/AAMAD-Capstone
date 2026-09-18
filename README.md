# PMO Program Intelligence Crew

Capstone for the "Become an Agentic Architect" course (AAMAD framework).

A full-stack multi-agent application that turns program data into a review-ready
executive readout - per-priority RAG rollup, capacity-vs-demand fit, and a ranked
risk list - with a mandatory human approval gate (HITL) before any output is treated
as final. Every figure traces back to a source row.

## At a glance
- **Runtime:** `AAMAD_TARGET_RUNTIME=crewai`
- **Stack:** React + TypeScript (Vite) frontend, FastAPI backend, CrewAI Narrative crew
- **End-user persona:** program manager
- **Data:** synthetic / mock only (see `data/`) - no client or production data
- **Design principle:** deterministic Python does the analysis (RAG rollup, capacity fit,
  risk ranking); the LLM is used only to write the narrative draft

## Architecture

```
React frontend  ──POST /api/runs──▶  FastAPI backend  ──▶  deterministic analysis (Python)
 (poll + HITL)   ◀──GET poll────────  (in-memory RUNS)  ──▶  CrewAI Narrative crew (LLM)
                 ──POST /decision──▶                    ──▶  DRAFT readout -> AWAITING_APPROVAL
```

- **Deterministic analysis** (`backend/src/compute.py`): RAG rollup, capacity fit/gap,
  risk ranking - fixed rules, no LLM, fully reproducible.
- **Narrative crew** (`backend/src/crew.py`): a single CrewAI agent (low temperature,
  `output_pydantic`) that phrases the computed facts. A grounding guardrail rejects any
  draft that cites figures not present in the computed state.
- **HITL gate:** the run pauses at `AWAITING_APPROVAL`; a human approves, edits, or
  rejects via `POST /api/runs/{runId}/decision` before anything is final.
- **Observability:** `GET /metrics`, request logging with `run_id`/`duration_ms`, and an
  optional `CREWAI_TRACING_ENABLED` switch.

## Layout
- `project-context/1.define/` - MRD, PRD, SAD (incl. section 9 eval-criteria table)
- `project-context/2.build/` - backend.md, frontend.md, integration.md, qa.md, security.md, evals.md
- `project-context/3.deliver/` - deploy.md (runbook), user-guide.md, execution-results.md
- `backend/` - FastAPI app + CrewAI crew + deterministic analysis + tests
- `frontend/` - React + TypeScript (Vite) UI for the "Generate Program Readout" workflow
- `frontend-funcional-spec.md` - frontend functional spec (Inputs, Run, Results, Contracts)
- `data/` - synthetic project sheet + burn/capacity fixtures
- `.github/workflows/ci.yml` - CI: backend pytest, frontend Vitest + build, health smoke check
- `Dockerfile` (backend + frontend), `docker-compose.yml` - container scaffolding

## Run locally (full stack)

**Prerequisites:** Python 3.12, Node 20+, and an OpenAI API key (for the live narrative).

**Backend:**
```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate        # Windows Git Bash; use .venv\Scripts\Activate.ps1 in PowerShell
pip install -r requirements.txt
cp .env.example .env                  # set OPENAI_API_KEY
python main.py serve                  # serves http://127.0.0.1:8000
```

**Frontend (second terminal):**
```bash
cd frontend
npm install
npm run dev                           # open http://localhost:5173
```

Then open the frontend, click Run, review the DRAFT readout, and approve / edit / reject.

**One-shot CLI (no frontend):** `cd backend && python main.py run` executes a full run over
the synthetic dataset and saves the readout to `docs/sample-readout.md`.

Without a valid `OPENAI_API_KEY`, the app still boots and `/health` works; `/api/runs`
returns a clear `missing_api_key` error rather than crashing (the deterministic analysis
and all decision transitions are fully testable offline).

## Tests
```bash
cd backend && python -m pytest -q     # 19 tests: deterministic compute, API contract, grounding
cd frontend && npm test               # frontend flow (run -> poll -> approve, HALTED path)
```

**Demo video:** https://www.loom.com/share/c10c38bdd0a647ec992896a39590884e

## Status
**Complete (MVP).** Define -> Build -> Deliver, plus AAMAD 0.8.0 evals and observability:
- Define: MRD, PRD, SAD (with eval-criteria table)
- Build: CrewAI backend, React frontend, integration, QA, security assessment
- Deliver: deploy runbook, user guide, CI, Docker scaffolding
- Evals: golden-dataset checks + grading methods (`project-context/2.build/evals.md`)
- Observability: `/metrics`, request logging, optional CrewAI tracing

Verified offline: backend 19/19 + frontend tests pass, production build succeeds,
`aamad validate` green. The live narrative path is verified with a funded `OPENAI_API_KEY`.
Open items (documented in `evals.md`): a required latency SLA and cost cap are pending
operator decisions.
