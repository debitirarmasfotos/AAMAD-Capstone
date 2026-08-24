# Backend (MVP) - PMO Program Intelligence Crew

Build-phase backend epic (`@backend.eng`, `*develop-be`) for the CrewAI runtime.
Resolved runtime: `AAMAD_TARGET_RUNTIME=crewai`. Code lives under `backend/`
(parallel to `frontend/`).

## 1. Architecture: deterministic Python + one LLM step (Carmelo review #1)

The analysis is CODE, not a model. The only LLM call is the Narrative.

```
POST /api/runs
  -> ProgramSource.fetch()        (source.py)   deterministic ingestion
  -> compute_program_state()      (compute.py)  deterministic RAG / capacity / risk
  -> NarrativeCrew.kickoff()      (crew.py)     LLM ONLY, temperature 0
  -> RunResponse(AWAITING_APPROVAL, draft, stateSummary)
HITL pause -> POST /api/runs/{runId}/decision -> APPROVED / REJECTED
```

- Ingestion, RAG rollup, capacity fit, and risk ranking run as deterministic
  Python (SAD sections 3, 4, 7, 9). Given the same CSVs they always yield the
  same `StateSummary`.
- The Narrative crew is a single YAML-first agent (`allow_delegation=false`,
  `Process.sequential`, `temperature=0`). It only phrases the already-computed
  facts; it never recomputes or alters a RAG value, gap, evidence ref, or rank.
  The computed state is injected into the prompt as authoritative `{facts}`.
- This matches the SAD section 2/4 mapping: a Flow-SHAPED Python coordinator
  (`orchestrator.py`) plus a Narrative crew of one, not five LLM specialists.
  To be precise (per Sprint-3 review): the orchestrator is a plain Python
  coordinator, NOT an instance of CrewAI's `Flow` class, so there is no
  library-provided pause/resume. HITL is the HTTP request boundary plus the
  in-memory `RUNS` store keyed by `runId`. The CrewAI usage that stands is the
  YAML-first Narrative crew (sequential process, `output_pydantic`).

## 2. Deterministic rules (SAD section 7)

- RAG rollup: any child `At Risk` -> Red; else any `In Progress`/`Not Started`
  -> Amber; all `Complete` -> Green. `ragEvidence` cites the driving child rows.
- Capacity: `remaining = capacity - used`; `fit = remaining >= demand`;
  `gap = max(0, demand - remaining)`; `runRate = used / capacity` (2 dp
  utilization; SAD section 7 defers an hours-per-period rate).
- Risks: built from At Risk tasks (severity High) and capacity breaches
  (severity graded by uncovered fraction of demand: >=50% High, >=25% Medium,
  else Low). Total order: severity desc, then `gap` desc, then a stable
  `sourceRef` key. `rank` is 1-based. Each risk carries `evidence` sourceRefs
  and a suggested `owner`.

## 3. Deterministic results from the REAL fixtures

Parsed from `data/mock_project_sheet.csv` and `data/mock_burn_capacity.csv`
(0 ingestion diagnostics; all rows valid).

Per-priority RAG:

| Priority | RAG | ragEvidence |
|---|---|---|
| Customer Data Platform | Amber | sheet:row5, sheet:row6 |
| Campaign Engine | Red | sheet:row10 |
| Analytics & Reporting | Amber | sheet:row14, sheet:row15 |
| Governance & Compliance | Red | sheet:row18 |

Capacity fit:

| Workstream | remaining | fit | gap | runRate | sourceRef |
|---|---|---|---|---|---|
| Customer Data Platform | 1400 | no-fit | 200 | 0.65 | burn:row2 |
| Campaign Engine | 900 | no-fit | 400 | 0.70 | burn:row3 |
| Analytics & Reporting | 1300 | fit | 0 | 0.41 | burn:row4 |
| Governance & Compliance | 300 | no-fit | 600 | 0.83 | burn:row5 |

Risk ranking (total order):

| rank | severity | gap | source of risk | evidence |
|---|---|---|---|---|
| 1 | High | 600 | Governance & Compliance capacity breach | burn:row5 |
| 2 | High | 0 | Campaign Engine "Suppression rules" At Risk | sheet:row10 |
| 3 | High | 0 | Governance "Consent management" At Risk | sheet:row18 |
| 4 | Medium | 400 | Campaign Engine capacity breach | burn:row3 |
| 5 | Low | 200 | Customer Data Platform capacity breach | burn:row2 |

Governance & Compliance is the top risk (largest gap), matching the seeded
signals in `data/README.md`. Analytics fits and produces no risk (no
over-reporting).

## 4. API (SAD section 8, implemented exactly)

- `POST /api/runs` - optional body `{ focus?, top_n? }` (recorded, MVP-ignores;
  `forceError` is rejected with 422 by `extra=forbid`). Returns `200` with
  `{ runId, status: "AWAITING_APPROVAL", draft, stateSummary }` or
  `{ runId, status: "HALTED", diagnostic }`. `503 missing_api_key` when no
  usable `OPENAI_API_KEY`; `500 internal_error` on unexpected failure.
- `GET /api/runs/{runId}` - returns the stored `RunResponse`; `404 run_not_found`.
- `POST /api/runs/{runId}/decision` - `{ action: "approve"|"edit"|"reject",
  edits?, reason? }`. approve/edit -> `APPROVED` (+ `finalReadout.markdown`; edit
  replaces the markdown first); reject -> `REJECTED` (reason recorded, no
  finalReadout). Idempotent: a terminal run returns its current state. `404`
  unknown; `409 invalid_state` if not AWAITING_APPROVAL; `422` invalid body.
- `GET /health` -> `{ "status": "ok" }`.
- Error envelope `{ error: { code, message } }` on all handled errors. Request
  validation keeps FastAPI's native `{ detail }` (422) that the frontend reads.
- CORS enabled for `http://localhost:5173` and `http://127.0.0.1:5173`.

## 5. In-memory run store (Carmelo review #5)

Runs are held in an in-memory dict keyed by `runId` (`RUNS` in `app.py`) and are
lost on process restart. This is the SAD section 8 / Assumptions decision;
durable persistence is post-MVP. The HITL pause is the HTTP pause of section 8:
`POST /api/runs` stores at `AWAITING_APPROVAL`, the operator polls
`GET /api/runs/{runId}`, and the decision call resumes the run.

## 6. Fail-closed and retry-then-halt (SAD sections 4/9)

- Each step (Ingestion, Analysis, Narrative) gets exactly one idempotent retry.
  On repeated failure the run returns `HALTED` with a `Diagnostic` naming the
  failed step and NO draft - a partial readout is never fabricated.
- If `OPENAI_API_KEY` is missing or a placeholder, the Narrative step raises
  `MissingApiKeyError` and the API returns `503 missing_api_key`. Deterministic
  compute may run, but no draft is fabricated without the model.
- No secrets are committed; only `.env.example` names are provided.

## 7. Frozen frontend contract compliance

`backend/src/models.py` mirrors `frontend/src/types.ts` field-for-field in
camelCase, so emitted JSON needs no client remapping. Verified by dumping the
envelope: top keys `runId, status, draft, stateSummary`; Workstream
`name, capacity, used, remaining, demand, runRate, gap, fit, sourceRef`;
Priority `name, tasks, rag, ragEvidence`; Task `name, owner, status, due,
sourceRef`; Risk `desc, severity, owner, evidence, rank, gap`; Draft
`markdown, summary, bullets, status`. `HALTED` omits `draft` (via
`exclude_none`) so the frontend's `validateEnvelope` guard accepts it, and
`DecisionResponse` omits `finalReadout` on reject.

## 8. Verified vs deferred

Verified offline against the real CSVs in `backend/.venv` (Python 3.12, crewai
0.86.0, fastapi 0.115.6, setuptools 79.0.1). No paid LLM calls:

- Imports clean: `crewai` + `fastapi` + all `src` modules import.
- Deterministic compute test (`tests/test_compute.py`): RAG rollup, capacity
  fit/gap/runRate, risk total-order ranking, and figure-to-source traceability
  all assert correct.
- FastAPI TestClient (`tests/test_api.py`): `GET /health` 200; `POST /api/runs`
  with no key -> 503 `missing_api_key`; decision transitions on a seeded
  in-memory run -> APPROVED (with finalReadout), edit applies markdown, REJECTED
  (no finalReadout), idempotent repeat; unknown runId -> 404; invalid decision
  body -> 422.
- pytest: 15 passed, 0 failed.

Live-verified (needs a funded key): the full live run producing a Narrative DRAFT
and reaching `AWAITING_APPROVAL` was verified on 2026-08-19 with a real
`OPENAI_API_KEY` (about 10s), including the approve decision to APPROVED with a
`finalReadout`. A saved sample is committed at `docs/sample-readout.md` and
`docs/sample-run.json`; `python main.py run` reproduces it. The offline pytest
suite (no key) remains the CI gate; the live kickoff is an operator step.

## Sources

- `project-context/1.define/sad.md` (sections 2, 4, 5, 6, 7, 8, 9).
- `project-context/1.define/prd.md` (US-1..US-6, NFRs).
- `frontend/src/types.ts` (frozen contract) and `frontend/src/services/*` (stub shapes).
- `data/mock_project_sheet.csv`, `data/mock_burn_capacity.csv`, `data/README.md`.
- `.claude/rules/adapter-crewai.md`, `.claude/rules/adapter-registry.md`.

## Assumptions

- Reads the two synthetic CSVs from the repo `data/` dir behind
  `ProgramSource.fetch()`; a live connector can replace them behind the same
  contract without downstream change.
- `runRate` is `used / capacity` utilization (2 dp); an hours-per-period rate is
  deferred until a source supplies periods (SAD section 7).
- Capacity-breach severity is graded by uncovered fraction of demand
  (>=50% High, >=25% Medium, else Low); At Risk tasks are High. This is the
  deterministic default recorded here for Build; the total-order ranking and
  the "Governance highest" seeded signal hold regardless.
- The run store is in-memory and lost on restart (SAD section 8).

## Open Questions

- Whether an optional second LLM agent should phrase risk DESCRIPTIONS (ranking
  stays in code); MVP uses a single Narrative agent (SAD section 3 optional).
- Confirm the capacity-breach severity thresholds with the PM (defaults above).
- The "minor edits" acceptance measure (PRD DoD / SAD Open Questions) remains
  qualitative for now.

## Audit

- 2026-08-18, @backend.eng, develop-be, resolved AAMAD_TARGET_RUNTIME=crewai.
  Scaffolded the CrewAI backend under `backend/`: deterministic ingestion
  (`source.py`) and analysis (`compute.py`), YAML-first single-agent Narrative
  crew (`config/agents.yaml`, `config/tasks.yaml`, `crew.py`, temperature 0),
  orchestrator with retry-then-halt and fail-closed missing-key handling
  (`orchestrator.py`), and a FastAPI app implementing the SAD section 8 contract
  with an in-memory run store and CORS for the Vite frontend (`app.py`). Models
  mirror the frozen `frontend/src/types.ts` in camelCase. Verified in
  `backend/.venv` (crewai 0.86.0, fastapi 0.115.6, setuptools 79.0.1): clean
  imports, deterministic compute against the real CSVs, and FastAPI TestClient
  contract checks. pytest: 15 passed. No paid LLM calls in the offline suite. No
  secrets committed.
- 2026-08-19, @backend.eng, verify-live: the live Narrative path was subsequently
  verified end to end on 2026-08-19 with a funded `OPENAI_API_KEY`. `POST /api/runs`
  returned `AWAITING_APPROVAL` with a real DRAFT (about 10s), the draft cited the
  same fixture truth as the deterministic state (Amber/Red priorities, gaps
  200/400/600, Governance top risk gap 600h), and `POST /api/runs/{runId}/decision`
  approve transitioned to APPROVED with a `finalReadout`. A saved sample is committed
  at `docs/sample-readout.md` and `docs/sample-run.json`, and `python main.py run`
  reproduces it. The offline pytest suite (no key) remains the CI gate; the live run
  is an operator step, not part of CI.
