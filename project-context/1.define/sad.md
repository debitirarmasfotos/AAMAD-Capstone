# Solution Architecture Document (SAD)

## PMO Program Intelligence Crew

### 1. Overview
A crew of specialist agents turns raw program data into a review-ready executive
readout - per-priority RAG rollup, capacity-vs-demand fit, and a ranked risk list -
with a mandatory human approval gate before any output is treated as final. This SAD
defines the runtime, the agents, how they coordinate, the data interface, and the
shared state. It implements the requirements in `prd.md`.

### 2. Runtime decision
**`AAMAD_TARGET_RUNTIME=crewai`** - selected for the Sprint-3 build track.

Decision: for the Sprint-3 build we target crewai. The orchestrator is a CrewAI Flow that
runs the deterministic ingestion and analysis steps in Python (the Supervisor role), and a
small Crew (a single LLM agent, optionally two) drafts the Narrative readout from the
computed state. This keeps the arithmetic (RAG rollup, capacity fit, risk ranking) in
deterministic code per the Reproducibility NFR (§7, §9) and confines the model to language
generation.

Note (honest record): this REVERSES the earlier `claude-agent-sdk` decision. The §8 API
contract (`/api/runs`, `GET /api/runs/{runId}`, `/api/runs/{runId}/decision`, JSON error
envelope), the §6 shared-state shape, the §7 rules, and the HITL approve/edit/reject
semantics are UNCHANGED - the backend satisfies the same frozen contract regardless of
runtime. This runtime switch should be confirmed with the instructor, who had endorsed
`claude-agent-sdk`.

The five runtime-selection questions, answered for the crewai target:

| Question | Answer |
|---|---|
| Language & deploy shape | Python service; a CrewAI Flow + a small Crew behind a FastAPI app |
| Model strategy | Single LLM for the Narrative only, low/zero temperature (analysis is code, not a model) |
| Orchestration metaphor | Declarative Flow orchestrator over deterministic steps + one Narrative crew |
| Tooling | Deterministic Python tools (`ProgramSource.fetch()`, `compute_program_state`); no MCP required for the MVP |
| Learning vs differentiation | Aligns with the Sprint-3 build track; HITL + auditability preserved in the Flow |

Set explicitly before Build:
```bash
export AAMAD_TARGET_RUNTIME=crewai
```

**Superseded rationale (retained for audit):** the earlier decision was
`AAMAD_TARGET_RUNTIME=claude-agent-sdk`, chosen over the CrewAI default on the grounds that
MCP connectors model the data sources cleanly; hooks and resumable sessions support a real
approval gate; and permissions plus a governed agent loop fit the auditability requirement
better than a purely declarative crew, so the product would behave like a governed Claude
agent (a supervisor over subagents) rather than a YAML role list. This rationale is
superseded by the crewai decision above but retained for the audit trail; the HITL gate is
now the HTTP pause of §8 rather than a runtime permission hook.

### 3. Application Crew (Flow + tools + Narrative crew)

Per the determinism requirement (§7, §9), ingestion and analysis are DETERMINISTIC Python
Flow steps / tools, not LLM agents. Only the Narrative is an LLM agent (risk descriptions
are an optional LLM step; risk RANKING stays in code). Net: a Flow + at most two LLM agents,
not five LLM specialists.

| Element | Kind | Responsibility | Inputs | Output | Prohibited |
|---|---|---|---|---|---|
| Supervisor / Orchestrator | CrewAI Flow | Sequence the steps, hold shared state, enforce the HITL pause | all | final approved readout | fabricating data; publishing; skipping approval |
| Ingestion | Deterministic tool/Flow step | Load and normalize the source | source files (via interface) | normalized program state | rating/interpreting status |
| Status Rollup | Deterministic tool/Flow step | Derive per-priority RAG from child tasks (§7 rules) | normalized state | RAG per priority + citing rows | touching financials |
| Capacity/Burn | Deterministic tool/Flow step | Compute run-rate and fit/no-fit (§7 rules) | burn/capacity data | fit signal per workstream | rewriting task status |
| Risk ranking | Deterministic tool/Flow step | Rank risks by fixed total order (§7) | state + capacity signal | ranked risks (severity, evidence, owner, rank) | inventing risks without source evidence |
| Narrative agent | LLM agent (Crew) | Synthesize the draft readout from computed state | all analysis outputs | DRAFT summary + bullets | introducing facts not in inputs |
| Risk descriptions (optional) | LLM agent (Crew) | Phrase risk DESCRIPTIONS only | ranked risks | descriptive text per risk | changing rank/severity/evidence |

### 4. Coordination pattern
Hybrid:
```
                    ┌─ Status Rollup ─┐
Ingestion ──────────┼─ Capacity/Burn ─┼──► Narrative ──► HITL gate ──► FINAL
 (normalize)        └─ Risk (initial) ┘   (synthesize)   (human)
        ▲                (parallel)          (sequential)
        └──────────── Supervisor holds shared state throughout (hierarchical) ────────────┘
```
- **Parallel:** Rollup, Capacity, and the initial Risk scan run concurrently after Ingestion.
- **Sequential:** Narrative depends on all analysis outputs; final Risk ranking consumes the capacity signal.
- **Hierarchical:** the Supervisor routes work and owns the shared state.
- **HITL:** a hard stop for human approve / edit / reject before output is marked final;
  the DRAFT is presented as a Markdown readout in the MVP chat interface (§8).

**Runtime mapping (crewai):** the Supervisor is a CrewAI Flow that runs DETERMINISTIC
Python steps for ingestion and analysis: `ProgramSource.fetch()` (§5) loads the two CSVs,
then a `compute_program_state` module/tool produces the RAG rollup, capacity fit, and risk
ranking using the fixed rules in §7 (this is CODE, not an LLM). Only the Narrative is an
LLM step: a small Crew with a single agent (`allow_delegation=false`, low/zero temperature)
that drafts the readout from the computed state. Optionally a second agent phrases risk
DESCRIPTIONS only; ranking stays in code. Net: a Flow + one (at most two) LLM agents, not
five LLM specialists. The analysis steps return typed fragments and the Flow merges them
into the single `programState` (§6), so there are no concurrent writers.

HITL is the HTTP pause of §8, not a model permission prompt: the Flow pauses at
`AWAITING_APPROVAL`, the human calls `POST /api/runs/{runId}/decision`, and the run resumes
(approve/edit/reject). A FastAPI app exposes `POST /api/runs` (start),
`GET /api/runs/{runId}` (poll), and `POST /api/runs/{runId}/decision` exactly as in §8.
Run/Flow state is keyed by `runId`.

**Failure handling (decided):** on a failed step the Flow performs exactly one idempotent
retry of that step. If the retry also fails, the run HALTS and the Flow emits a Diagnostic
identifying the failed workstream. The Flow does not synthesize a final DRAFT from partial
data, so reproducibility, HITL integrity, and figure-to-source traceability are preserved
(§9).

### 5. Ingestion interface (source-agnostic)
Downstream agents never read a file format directly. Ingestion exposes a stable
contract so a live connector can replace the MVP files without touching agent logic:

```
ProgramSource.fetch() -> { priorities: [...], workstreams: [...], sourceRefs: [...], diagnostics: [...] }
```
- **MVP implementation:** reads `../../data/mock_project_sheet.csv` and
  `../../data/mock_burn_capacity.csv`.
- **Validation:** missing or malformed rows are not silently dropped. Each is recorded in
  `diagnostics` (row identifier + reason + `sourceRef`) and surfaced in the shared-state
  `ingestion` block (§6), so the Supervisor can report the gap (satisfies PRD AC-1.2).
- **Post-MVP implementations (behind the same contract):** a Slack risk feed via MCP,
  a project-management API. No downstream change required (satisfies PRD AC-1.3).

### 6. Shared state
A single normalized program-state object, read/written by all agents (artifact over
chat memory), so any figure in the readout can be traced back to its `sourceRefs`.

```
programState = {
  priorities: [{ name, tasks:[{name, owner, status, due, sourceRef}], rag, ragEvidence:[sourceRef] }],
  workstreams: [{ name, capacity, used, remaining, demand, runRate, gap, fit, sourceRef }],
  risks: [{ desc, severity, owner, evidence:[sourceRef], rank, gap }],
  draft: { summary, bullets, status: 'DRAFT'|'APPROVED'|'REJECTED', edits, decisionReason },
  ingestion: { rowsRead, rowsRejected, issues:[{ row, reason, sourceRef }] }
}
```

### 7. Rollup and capacity rules (MVP)
- **RAG rollup:** any child `At Risk` -> Red; else any `In Progress`/`Not Started` -> Amber;
  all `Complete` -> Green. Each RAG cites the child rows that drove it.
- **Capacity fit:** `remaining = capacity - used`; `no-fit` when `remaining < demand`.
  Each workstream also reports `runRate = used / capacity` (share of capacity consumed) as
  the MVP run-rate figure; the fixture carries no time dimension, so an hours-per-period rate
  is deferred until a source supplies periods (satisfies PRD AC-3.1). The numeric shortfall is
  `gap = demand - remaining` (positive only when no-fit). No-fit workstreams carry that `gap`
  to the Risk agent (PRD AC-3.2), which ranks capacity-breach risks by `gap` descending,
  largest first (PRD AC-4.2).
- **Determinism:** RAG rollup, capacity fit, and risk ranking are computed by fixed
  rule-based code, not by the model, so the same dataset yields identical results (§9). Risk
  ranking is a total order: severity descending, then capacity `gap` descending, then a stable
  key (`sourceRef`), so equal-severity risks sort identically on every run (satisfies the
  Reproducibility NFR).

### 8. HITL gate
The Supervisor pauses after the Narrative agent and presents the DRAFT for an
approve / edit / reject decision (PRD AC-6.1). On edit, the human's revisions are applied
to the draft and captured in `draft.edits` before approval. On approve, state moves to
APPROVED. On reject, the Supervisor records `draft.decisionReason` and nothing is marked
final (PRD AC-6.2). No output is marked final until a decision is recorded. Implemented
as the CrewAI Flow pausing at `AWAITING_APPROVAL` and resuming on the decision call (§4).
**Presentation surface (decided):** the DRAFT is rendered as a Markdown readout in the
MVP chat interface, and the program manager responds approve / edit / reject inline. This
is the only surface for the MVP; no additional UI is built. JSON or CLI variants are
post-MVP and would sit behind the same decision contract.

**API contract (chat <-> runtime) (decided):** transport is local HTTP + JSON. The chat
page is a thin client over these endpoints; it holds no business logic (rollup, capacity,
and ranking stay in the deterministic backend, §7). The `draft` payload carries the
Narrative agent's `summary` and `bullets` plus a rendered `markdown` readout; it is a view
projection of the shared-state `draft` object (§6), not a new schema.

- `POST /api/runs` - starts a run on the synthetic dataset (§5). At the HITL pause it
  returns `{ runId, status: "AWAITING_APPROVAL", draft: { markdown, summary, bullets }, stateSummary }`.
  If the run halts on a specialist failure (one idempotent retry then HALT, §4/§9) it returns
  `{ runId, status: "HALTED", diagnostic: { failedWorkstream, reason } }`.
- `POST /api/runs/{runId}/decision` - body `{ action: "approve" | "edit" | "reject", edits?, reason? }`.
  Response `{ runId, status: "APPROVED" | "REJECTED", finalReadout?: { markdown } }`. On `edit`
  the `edits` are applied to the draft and captured in `draft.edits` before approval; on
  `reject` the `reason` is stored in `draft.decisionReason` (§6, §8).
- `GET /api/runs/{runId}` - returns the current `{ runId, status, ... }` for polling the async
  pause.
- **Session/resume mapping:** the HITL pause maps to the CrewAI Flow pausing at
  `AWAITING_APPROVAL`, with run/Flow state keyed by `runId` in the MVP in-memory run store;
  the decision call resumes that Flow. The decision endpoint is idempotent - re-sending the
  same action returns the current state and does not double-apply.
- **Errors:** JSON error envelope `{ error: { code, message } }`; 4xx for invalid input, 5xx
  for runtime failure.
- **Status mapping:** the API run `status` is a transport-level view over the shared-state
  `draft.status` (§6): `AWAITING_APPROVAL` corresponds to `draft.status = 'DRAFT'`, `APPROVED`
  to `'APPROVED'`, and `REJECTED` to `'REJECTED'`. `HALTED` is not a `draft.status`; it reports
  the retry-then-halt failure path (§4/§9), where no DRAFT is synthesized from partial data.

**Frontend view shape (decided, MVP-lean):** a single-screen web app, system theme, minimal
visual style (per `aamad.config.yml` `ui`). It renders the DRAFT as a readout and exposes
Approve / Edit (inline-editable draft) / Reject (with reason) controls at the HITL gate. It is
a thin client over the `/api/runs` contract above and holds no business logic. Out of scope
for the MVP page: authentication, multi-session, persistent history, and any additional
screens (consistent with §10).

**Frontend stack (decided):** React + TypeScript (Vite), superseding the earlier
"vanilla HTML/JS" note. The MVP scaffold implements the single "Generate Program Readout"
workflow with an explicit idle -> running -> done (+ error) finite-state machine, a status
banner (idle/running/done/error with a colored pill and a last-updated timestamp), Run and
Reset controls, and an inline error state with Retry. It currently runs against stubbed
services (`startRun`, `getRunStatus`) that return a mock readout matching the §6 shared-state
shape; these are replaced by the real `/api/runs` calls in a later Build step. The React app
remains a thin client and holds no business logic. See `frontend-funcional-spec.md` at the
repo root for the component and contract detail.

### 9. Non-functional and observability
- **Auditability:** every readout figure resolves to a `sourceRef`.
- **Reproducibility:** given the same input dataset and fixed configuration, the crew
  produces an identical normalized state (same per-priority RAG, capacity fit signals, and
  risk ranking). The rollup, capacity, and ranking computations are deterministic rule-based
  code (§7), not model-generated; the Narrative agent runs at low/zero temperature so the
  DRAFT is stable. Resolved model, temperature, and token controls are recorded in Audit per
  the crewai adapter.
- **Resilience:** a failing step does not corrupt shared state. The Flow performs one
  idempotent retry of the failed step; if it still fails, the run HALTS and emits a
  Diagnostic naming the failed workstream (§4). No final DRAFT is synthesized from partial
  data, so a partial readout is never emitted as complete.
- **Observability:** log each agent's inputs/outputs and the approval decision (evals hook).

### 10. Out of scope (MVP)
Live production connectors, automatic distribution/publish of the readout, and
multi-program portfolio rollup. All are post-MVP and fit behind the interfaces above.

### 11. MAS design mapping
This is still a multi-agent system - orchestrated specialists - with the arithmetic kept in
code per the determinism requirement (§7). It applies the multiagent-systems method
deliberately: specialization boundaries -> a CrewAI Flow orchestrator (Supervisor) over
deterministic ingestion/analysis tools plus a Narrative crew of one (at most two) LLM agents
(§3, §4); roles with responsibilities, tools/data, and prohibited actions (§3) plus success
metrics (PRD §6); coordination pattern -> a Flow sequencing deterministic steps then the
Narrative crew, with the Flow owning shared state (§4); communication via typed fragments
merged into a single shared-state workspace with no concurrent writers (§4, §6); HITL on the
high-risk final step as an HTTP pause/resume (§8); and resilience via retry-then-halt with no
partial DRAFT (§9). Evals/observability are scoped as production-phase work (§9).

## Sources
- `prd.md` and `mrd.md` in this folder (requirements, user stories, opportunity).
- Course lesson material (runtime selection; MAS coordination patterns).
- `data/README.md` for the synthetic fixtures and the seeded rollup/capacity signals.

## Assumptions
- The MVP reads the two synthetic CSVs in `data/`; a live connector replaces them later behind the same interface.
- A CrewAI Flow can implement the HITL pause/resume as designed in §8 (pause at AWAITING_APPROVAL, resume on the decision call).
- The MVP run store is IN-MEMORY, keyed by `runId`, and is lost on process restart; durable persistence is deferred to post-MVP (§10).
- The rollup and capacity rules in §7 are acceptable defaults, to be confirmed in Build.
- The MVP burn fixture has no time dimension, so the PRD AC-3.1 "run-rate" is expressed as
  utilization (`used / capacity`); a time-based hours-per-period rate is post-MVP.

## Open Questions
- Whether the qualitative "minor edits" acceptance measure (PRD DoD) is tracked
  qualitatively or via an edit-count metric.
- Which observability/eval framework to adopt in the production phase (§9).
- Runtime switch to crewai to be confirmed with the instructor, who had endorsed
  claude-agent-sdk (the §8 contract and HITL semantics are unchanged; §2).

Resolved (retained for audit trail):
- RAG thresholds / mixed-status tie-break: RESOLVED. §7 decides the rollup: any child
  `At Risk` -> Red; else any `In Progress`/`Not Started` -> Amber; all `Complete` -> Green,
  and risk ranking is a fixed total order with a stable tie-break key. The only qualitative
  item still open is the "minor edits" acceptance measure (see Open Questions).
- Supervisor retry-vs-fail: RESOLVED. On a specialist failure the Supervisor performs one
  idempotent retry, then HALTS with a Diagnostic and never synthesizes a DRAFT from partial
  data (§4, §9).
- DRAFT presentation surface: RESOLVED. The DRAFT is a Markdown readout in the MVP chat
  interface with inline approve / edit / reject (§8).
- Config conflict: RESOLVED. A local `aamad.config.yml` at the project root sets
  `runtime.target: claude-agent-sdk` for local runs. That file is gitignored as AAMAD local
  state (`.gitignore`), so it is not tracked; the tracked template `aamad.config.example.yml`
  now also defaults to `claude-agent-sdk`. The runtime remains authoritative via
  `AAMAD_TARGET_RUNTIME` and the PRD/SAD regardless of the local config, so the earlier
  `crewai` mismatch no longer applies.

## Audit
- Created 2026-08-08 by Melanie Arias. Status: DRAFT for course Define phase.
- Resolved runtime: AAMAD_TARGET_RUNTIME=claude-agent-sdk (chosen over the crewai default; rationale in §2).
- SAD relocated to project-context/1.define/ to match AAMAD 0.7.5 Define-phase layout.
- 2026-08-08, @system.arch, sad-review: reviewed against the refined PRD. Resolved runtime: AAMAD_TARGET_RUNTIME=claude-agent-sdk. Added a claude-agent-sdk runtime mapping to §4 (Supervisor as coordinator, specialists as AgentDefinition entries invoked via the Agent tool, least-privilege allowed_tools, HITL as a PreToolUse/permission hook); added ingestion diagnostics to §5/§6 so AC-1.2 resolves; added the numeric capacity `gap` to §6/§7 so AC-3.2/AC-4.2 resolve; added the edit path to §8 for AC-6.1; strengthened the Reproducibility NFR in §9 to state deterministic rule-based computation and low/zero-temperature narrative. No scope invented. No headings changed.
- 2026-08-08, @system.arch, sad-review: second pass against the current refined PRD. Resolved runtime: AAMAD_TARGET_RUNTIME=claude-agent-sdk (confirmed in §2, §4 mapping, and this Audit; adapter and PRD agree). Closed a coverage gap for PRD AC-3.1 by adding `runRate` to the §6 workstream shape and defining it in §7 as `used / capacity` utilization (the fixture has no time dimension for an hours-per-period rate; noted in Assumptions). Closed a determinism gap by specifying a total-order risk ranking with a stable tie-break key in §7, so the Reproducibility NFR holds for the full risk list. Verified all PRD forward references into §6 (state shape, draft.status, decisionReason) and §7 (RAG rollup, capacity fit, gap-based ranking) resolve. No scope invented. No headings changed.
- 2026-08-08, @system.arch, define-api-and-frontend: added two Build-readiness contracts under §8 in place. Resolved runtime: claude-agent-sdk. (1) A concrete chat <-> runtime API contract (local HTTP + JSON): POST /api/runs (AWAITING_APPROVAL with draft, or HALTED with diagnostic on the retry-then-halt path), POST /api/runs/{runId}/decision (approve/edit/reject, idempotent), GET /api/runs/{runId} for polling; runId-keyed claude-agent-sdk resumable session mapping; a JSON error envelope; and a one-line mapping from API run status to shared-state draft.status (§6) with HALTED tied to the §4/§9 failure path. The draft payload is a view projection of the §6 draft object, not a new schema. (2) A frontend view shape: a single MVP-lean web chat page (one screen, system theme, minimal style per aamad.config.yml), a thin client over /api/runs with no business logic, rendering the Markdown readout and Approve/Edit/Reject controls; auth, multi-session, persistent history, and extra screens are out of scope (consistent with §10). No scope invented beyond these two decisions. No headings changed or renumbered.
- 2026-08-08, @system.arch, resolve-open-questions: folded three approved decisions into the SAD in place. Resolved runtime: claude-agent-sdk. (1) HITL DRAFT surface fixed to a Markdown readout in the MVP chat interface with inline approve / edit / reject (§8, §4 flow), MVP-lean with no extra UI. (2) Specialist-failure behavior fixed to one idempotent Supervisor retry then HALT with a Diagnostic naming the failed workstream, never synthesizing a DRAFT from partial data (§4 failure handling, §9 Resilience). (3) Config conflict closed by a local `aamad.config.yml` (runtime.target: claude-agent-sdk). Moved the three corresponding Open Questions to a Resolved list. No scope invented. No headings changed.
- 2026-08-08, @system.arch, record-frontend-stack: recorded the frontend stack decision in §8 as React + TypeScript (Vite), superseding the earlier vanilla HTML/JS note. Operator-approved during the Build-phase frontend module. The React app implements the single "Generate Program Readout" workflow with an idle -> running -> done (+ error) FSM, status banner, and Run/Reset controls over stubbed services, to be wired to the real `/api/runs` contract in a later step. Resolved runtime unchanged: AAMAD_TARGET_RUNTIME=claude-agent-sdk. Wording/decision record only; no other headings changed.
- 2026-08-08, @system.arch, correct-config-record: clarified the config-conflict resolution to reflect that `aamad.config.yml` is gitignored local state (not tracked), and that the tracked `aamad.config.example.yml` template was aligned to `runtime.target: claude-agent-sdk`. Runtime remains authoritative via AAMAD_TARGET_RUNTIME and the PRD/SAD. Wording only; no architecture or headings changed.
- 2026-08-18, @system.arch, runtime-switch-and-review-fixes: resolved AAMAD_TARGET_RUNTIME=crewai for the Sprint-3 build track. Switched §2 from claude-agent-sdk to crewai (CrewAI Flow as the deterministic orchestrator + a small Narrative Crew), noting the switch REVERSES the earlier claude-agent-sdk decision, that the §8 API contract and HITL semantics are unchanged, and that it should be confirmed with the instructor; retained the prior rationale as superseded. Instructor fix #1: reclassified Ingestion, Status Rollup, Capacity/Burn, and risk ranking as DETERMINISTIC Flow steps/tools (ProgramSource.fetch() + compute_program_state per §7), leaving the Narrative as the one LLM agent (risk descriptions optional LLM) - net a Flow + at most two LLM agents, not five specialists; updated §3 table, §4 runtime mapping and failure handling, §9 wording, and §11 MAS mapping accordingly. Reframed the §8 HITL as the HTTP pause/resume on the Flow (endpoints, §6 state shape, and §7 rules kept INTACT). Instructor fix #5: moved the RAG-threshold Open Question to Resolved (decided in §7; only the qualitative "minor edits" measure stays open) and recorded the MVP run store as IN-MEMORY keyed by runId (lost on restart, persistence deferred) in Assumptions and §8. No headings changed; §6/§7/§8 contracts preserved.
