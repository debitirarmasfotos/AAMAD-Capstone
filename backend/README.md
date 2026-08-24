# PMO Program Intelligence Crew - Backend

CrewAI backend for the capstone MVP. `AAMAD_TARGET_RUNTIME=crewai`.

Architecture (per SAD sections 2-8 and Carmelo review #1): the analysis is
DETERMINISTIC Python (ingestion, RAG rollup, capacity fit, risk ranking) and the
LLM is used ONLY for the Narrative draft. A FastAPI app exposes the SAD section 8
HTTP+JSON contract with a hard human-in-the-loop (HITL) approval gate.

```
POST /api/runs  ->  fetch (source.py)  ->  compute (compute.py, deterministic)
                 ->  Narrative crew (crew.py, LLM, temp 0)  ->  AWAITING_APPROVAL
                 ->  POST /api/runs/{runId}/decision  ->  APPROVED / REJECTED
```

## Layout

- `src/models.py` - Pydantic models mirroring `frontend/src/types.ts` exactly (camelCase).
- `src/source.py` - `ProgramSource.fetch()` reads the two CSVs in `../data`; records diagnostics.
- `src/compute.py` - `compute_program_state()` deterministic analysis (SAD section 7).
- `src/config/agents.yaml`, `src/config/tasks.yaml` - YAML-first Narrative crew definitions.
- `src/crew.py` - single-agent Narrative crew (the only LLM step, temperature 0).
- `src/orchestrator.py` - `run_readout()` fetch -> compute -> narrative, retry-then-halt, fail-closed on missing key.
- `src/app.py` - FastAPI app and the in-memory run store.
- `tests/` - deterministic compute test + FastAPI contract tests (offline).

## Setup

```bash
cd backend
python -m venv .venv
# Windows (Git Bash):
source .venv/Scripts/activate
# macOS / Linux:
# source .venv/bin/activate

pip install -r requirements.txt

cp .env.example .env
# then edit .env and set a real OPENAI_API_KEY
```

## Run

```bash
# from backend/
uvicorn src.app:app --host 127.0.0.1 --port 8000
# or:
python main.py
```

Without a real `OPENAI_API_KEY`, `POST /api/runs` fails closed with
`503 { "error": { "code": "missing_api_key" } }` - by design, no draft is
fabricated without the model. The deterministic analysis and all decision
transitions are fully testable offline (see Tests).

## Endpoint contract (SAD section 8)

- `POST /api/runs` - optional body `{ focus?, top_n? }` (recorded, MVP-ignored;
  `forceError` is rejected). Returns `200 { runId, status: "AWAITING_APPROVAL",
  draft, stateSummary }` or `200 { runId, status: "HALTED", diagnostic }`.
  `503 missing_api_key` if no key; `500 internal_error` on unexpected failure.
- `GET /api/runs/{runId}` - returns the stored `RunResponse`; `404 run_not_found` if unknown.
- `POST /api/runs/{runId}/decision` - body `{ action: "approve"|"edit"|"reject", edits?, reason? }`.
  Returns `{ runId, status: "APPROVED"|"REJECTED", finalReadout? }`. Idempotent
  (re-sending a decision returns current state). `404` unknown; `409 invalid_state`
  if the run is not AWAITING_APPROVAL; `422` invalid body (native FastAPI `{ detail }`).
- `GET /health` - `{ "status": "ok" }`.

Errors use the JSON envelope `{ error: { code, message } }` except request
validation (422), which keeps FastAPI's native `{ detail }` body that the
frontend already reads.

The run store is IN-MEMORY, keyed by `runId`, and is lost on restart
(SAD section 8 / Assumptions). Durable persistence is post-MVP.

## Tests

```bash
# from backend/ with the venv active
python -m pytest -q
```

- `tests/test_compute.py` - parses the real CSVs and asserts the RAG rollup,
  capacity fit/gap/runRate, and risk ranking (no LLM).
- `tests/test_api.py` - `/health`, missing-key 503, decision transitions on a
  seeded in-memory run, unknown-run 404, invalid-body 422 (no LLM).

A full live run (Narrative draft -> AWAITING_APPROVAL) requires a real
`OPENAI_API_KEY` and is deferred to an operator-run integration step.
