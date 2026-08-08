# Solution Architecture Document (SAD)

## PMO Program Intelligence Crew

### 1. Overview
A crew of specialist agents turns raw program data into a review-ready executive
readout - per-priority RAG rollup, capacity-vs-demand fit, and a ranked risk list -
with a mandatory human approval gate before any output is treated as final. This SAD
defines the runtime, the agents, how they coordinate, the data interface, and the
shared state. It implements the requirements in `prd.md`.

### 2. Runtime decision
**`AAMAD_TARGET_RUNTIME=claude-agent-sdk`** - chosen deliberately over the CrewAI default.

Rationale: MCP connectors model the data sources cleanly; hooks and resumable sessions
support a real approval gate; permissions and a governed agent loop fit the auditability
requirement better than a purely declarative crew. The product should behave like a
governed Claude agent (a supervisor over subagents), not a YAML role list.

The five runtime-selection questions, answered on the record:

| Question | Answer |
|---|---|
| Language & deploy shape | Python or TS service; a governed agent worker, not a pure YAML crew |
| Model strategy | Claude-deep (not multi-provider model shopping) |
| Orchestration metaphor | Claude harness + hooks/subagents + a supervisor, not role-in-YAML crews |
| Tooling | Heavy MCP + sessions + permissions, central to the HITL approval gate |
| Learning vs differentiation | Adapter chosen for the architecture (HITL + auditability), not demo alignment |

Set explicitly before Build:
```bash
export AAMAD_TARGET_RUNTIME=claude-agent-sdk
```

### 3. Application Crew (agents)

| Agent | Responsibility | Inputs | Output | Prohibited |
|---|---|---|---|---|
| Supervisor / Orchestrator | Sequence the crew, hold shared state, enforce the HITL gate | all | final approved readout | fabricating data; publishing; skipping approval |
| Ingestion agent | Load and normalize the source | source files (via interface) | normalized program state | rating/interpreting status |
| Status Rollup agent | Derive per-priority RAG from child tasks | normalized state | RAG per priority + citing rows | touching financials |
| Capacity/Burn agent | Compute run-rate and fit/no-fit | burn/capacity data | fit signal per workstream | rewriting task status |
| Risk & Compliance agent | Flag and rank risks with evidence | state + capacity signal | ranked risks (desc, severity, evidence, owner) | inventing risks without source evidence |
| Narrative agent | Synthesize the draft readout | all analysis outputs | DRAFT summary + bullets | introducing facts not in inputs |

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

**Runtime mapping (claude-agent-sdk):** the Supervisor is the coordinator (the main
runtime agent); the five specialists are `AgentDefinition` entries in
`ClaudeAgentOptions.agents`, invoked by the Supervisor via the `Agent` tool. Each
specialist receives a least-privilege `allowed_tools` set: Ingestion gets read-only
file/MCP access, the analysis and narrative agents get no write or publish tools. The
HITL gate (§8) is enforced with a `PreToolUse`/permission hook, and lifecycle events are
logged via `SubagentStart`/`SubagentStop` hooks.

**Failure handling (decided):** on a specialist failure the Supervisor performs exactly one
idempotent retry of that specialist. If the retry also fails, the run HALTS and the
Supervisor emits a Diagnostic identifying the failed workstream. The Supervisor does not
synthesize a final DRAFT from partial data, so reproducibility, HITL integrity, and
figure-to-source traceability are preserved (§9).

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
via a Claude Agent SDK hook / permission stop - the reason the runtime was chosen.
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
- **Session/resume mapping:** the HITL pause maps to a claude-agent-sdk resumable session keyed
  by `runId`; the decision call resumes that session. The decision endpoint is idempotent -
  re-sending the same action returns the current state and does not double-apply.
- **Errors:** JSON error envelope `{ error: { code, message } }`; 4xx for invalid input, 5xx
  for runtime failure.
- **Status mapping:** the API run `status` is a transport-level view over the shared-state
  `draft.status` (§6): `AWAITING_APPROVAL` corresponds to `draft.status = 'DRAFT'`, `APPROVED`
  to `'APPROVED'`, and `REJECTED` to `'REJECTED'`. `HALTED` is not a `draft.status`; it reports
  the retry-then-halt failure path (§4/§9), where no DRAFT is synthesized from partial data.

**Frontend view shape (decided, MVP-lean):** a single minimal web chat page (one screen),
system theme, minimal visual style (per `aamad.config.yml` `ui`). It renders the DRAFT as a
Markdown readout and exposes Approve / Edit (inline-editable draft) / Reject (with reason)
controls at the HITL gate. It is a thin client over the `/api/runs` contract above and holds
no business logic. Out of scope for the MVP page: authentication, multi-session, persistent
history, and any additional screens (consistent with §10).

### 9. Non-functional and observability
- **Auditability:** every readout figure resolves to a `sourceRef`.
- **Reproducibility:** given the same input dataset and fixed configuration, the crew
  produces an identical normalized state (same per-priority RAG, capacity fit signals, and
  risk ranking). The rollup, capacity, and ranking computations are deterministic rule-based
  code (§7), not model-generated; the Narrative agent runs at low/zero temperature so the
  DRAFT is stable. Resolved model, temperature, and token controls are recorded in Audit per
  the claude-agent-sdk adapter.
- **Resilience:** a failing specialist does not corrupt shared state. The Supervisor
  performs one idempotent retry of the failed specialist; if it still fails, the run HALTS
  and emits a Diagnostic naming the failed workstream (§4). No final DRAFT is synthesized
  from partial data, so a partial readout is never emitted as complete.
- **Observability:** log each agent's inputs/outputs and the approval decision (evals hook).

### 10. Out of scope (MVP)
Live production connectors, automatic distribution/publish of the readout, and
multi-program portfolio rollup. All are post-MVP and fit behind the interfaces above.

### 11. MAS design mapping
This design applies the multiagent-systems method deliberately: specialization
boundaries -> 6 domain agents (§3); agent roles with responsibilities, tools/data, and
prohibited actions (§3) plus success metrics (PRD §6); coordination pattern -> hybrid,
parallel + sequential + hierarchical (§4); communication via structured messages over a
shared state workspace (§6); supervisor-style architecture for a structured workflow with
clear dependencies (§4); HITL on the high-risk final step (§8); and resilience with no
single point of failure (§9). Evals/observability are scoped as production-phase work (§9).

## Sources
- `prd.md` and `mrd.md` in this folder (requirements, user stories, opportunity).
- Course lesson material (runtime selection; MAS coordination patterns).
- `data/README.md` for the synthetic fixtures and the seeded rollup/capacity signals.

## Assumptions
- The MVP reads the two synthetic CSVs in `data/`; a live connector replaces them later behind the same interface.
- Claude Agent SDK hooks/permissions can implement the HITL stop as designed in §8.
- The rollup and capacity rules in §7 are acceptable defaults, to be confirmed in Build.
- The MVP burn fixture has no time dimension, so the PRD AC-3.1 "run-rate" is expressed as
  utilization (`used / capacity`); a time-based hours-per-period rate is post-MVP.

## Open Questions
- Final RAG thresholds and how ties are broken when a priority has mixed child statuses.
- Which observability/eval framework to adopt in the production phase (§9).

Resolved (retained for audit trail):
- Supervisor retry-vs-fail: RESOLVED. On a specialist failure the Supervisor performs one
  idempotent retry, then HALTS with a Diagnostic and never synthesizes a DRAFT from partial
  data (§4, §9).
- DRAFT presentation surface: RESOLVED. The DRAFT is a Markdown readout in the MVP chat
  interface with inline approve / edit / reject (§8).
- Config conflict: RESOLVED. A committed `aamad.config.yml` now exists at the project root
  with `runtime.target: claude-agent-sdk`, matching `AAMAD_TARGET_RUNTIME` and the
  authoritative PRD/SAD runtime; the earlier `crewai` example-config mismatch no longer applies.

## Audit
- Created 2026-08-08 by Melanie Arias. Status: DRAFT for course Define phase.
- Resolved runtime: AAMAD_TARGET_RUNTIME=claude-agent-sdk (chosen over the crewai default; rationale in §2).
- SAD relocated to project-context/1.define/ to match AAMAD 0.7.5 Define-phase layout.
- 2026-08-08, @system.arch, sad-review: reviewed against the refined PRD. Resolved runtime: AAMAD_TARGET_RUNTIME=claude-agent-sdk. Added a claude-agent-sdk runtime mapping to §4 (Supervisor as coordinator, specialists as AgentDefinition entries invoked via the Agent tool, least-privilege allowed_tools, HITL as a PreToolUse/permission hook); added ingestion diagnostics to §5/§6 so AC-1.2 resolves; added the numeric capacity `gap` to §6/§7 so AC-3.2/AC-4.2 resolve; added the edit path to §8 for AC-6.1; strengthened the Reproducibility NFR in §9 to state deterministic rule-based computation and low/zero-temperature narrative. No scope invented. No headings changed.
- 2026-08-08, @system.arch, sad-review: second pass against the current refined PRD. Resolved runtime: AAMAD_TARGET_RUNTIME=claude-agent-sdk (confirmed in §2, §4 mapping, and this Audit; adapter and PRD agree). Closed a coverage gap for PRD AC-3.1 by adding `runRate` to the §6 workstream shape and defining it in §7 as `used / capacity` utilization (the fixture has no time dimension for an hours-per-period rate; noted in Assumptions). Closed a determinism gap by specifying a total-order risk ranking with a stable tie-break key in §7, so the Reproducibility NFR holds for the full risk list. Verified all PRD forward references into §6 (state shape, draft.status, decisionReason) and §7 (RAG rollup, capacity fit, gap-based ranking) resolve. No scope invented. No headings changed.
- 2026-08-08, @system.arch, define-api-and-frontend: added two Build-readiness contracts under §8 in place. Resolved runtime: claude-agent-sdk. (1) A concrete chat <-> runtime API contract (local HTTP + JSON): POST /api/runs (AWAITING_APPROVAL with draft, or HALTED with diagnostic on the retry-then-halt path), POST /api/runs/{runId}/decision (approve/edit/reject, idempotent), GET /api/runs/{runId} for polling; runId-keyed claude-agent-sdk resumable session mapping; a JSON error envelope; and a one-line mapping from API run status to shared-state draft.status (§6) with HALTED tied to the §4/§9 failure path. The draft payload is a view projection of the §6 draft object, not a new schema. (2) A frontend view shape: a single MVP-lean web chat page (one screen, system theme, minimal style per aamad.config.yml), a thin client over /api/runs with no business logic, rendering the Markdown readout and Approve/Edit/Reject controls; auth, multi-session, persistent history, and extra screens are out of scope (consistent with §10). No scope invented beyond these two decisions. No headings changed or renumbered.
- 2026-08-08, @system.arch, resolve-open-questions: folded three approved decisions into the SAD in place. Resolved runtime: claude-agent-sdk. (1) HITL DRAFT surface fixed to a Markdown readout in the MVP chat interface with inline approve / edit / reject (§8, §4 flow), MVP-lean with no extra UI. (2) Specialist-failure behavior fixed to one idempotent Supervisor retry then HALT with a Diagnostic naming the failed workstream, never synthesizing a DRAFT from partial data (§4 failure handling, §9 Resilience). (3) Config conflict closed by the committed `aamad.config.yml` (runtime.target: claude-agent-sdk). Moved the three corresponding Open Questions to a Resolved list. No scope invented. No headings changed.
