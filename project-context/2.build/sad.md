# Solution Architecture Document (SAD)

## PMO Program Intelligence Crew

### 1. Overview
A crew of specialist agents turns raw program data into a review-ready executive
readout - per-priority RAG rollup, capacity-vs-demand fit, and a ranked risk list -
with a mandatory human approval gate before any output is treated as final. This SAD
defines the runtime, the agents, how they coordinate, the data interface, and the
shared state. It implements the requirements in `../1.define/prd.md`.

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
- **HITL:** a hard stop for human approve / edit / reject before output is marked final.

### 5. Ingestion interface (source-agnostic)
Downstream agents never read a file format directly. Ingestion exposes a stable
contract so a live connector can replace the MVP files without touching agent logic:

```
ProgramSource.fetch() -> { priorities: [...], workstreams: [...], sourceRefs: [...] }
```
- **MVP implementation:** reads `../../data/mock_project_sheet.csv` and
  `../../data/mock_burn_capacity.csv`.
- **Post-MVP implementations (behind the same contract):** a Slack risk feed via MCP,
  a project-management API. No downstream change required (satisfies PRD AC-1.3).

### 6. Shared state
A single normalized program-state object, read/written by all agents (artifact over
chat memory), so any figure in the readout can be traced back to its `sourceRefs`.

```
programState = {
  priorities: [{ name, tasks:[{name, owner, status, due, sourceRef}], rag, ragEvidence:[sourceRef] }],
  workstreams: [{ name, capacity, used, remaining, demand, fit, sourceRef }],
  risks: [{ desc, severity, owner, evidence:[sourceRef], rank }],
  draft: { summary, bullets, status: 'DRAFT'|'APPROVED'|'REJECTED', decisionReason }
}
```

### 7. Rollup and capacity rules (MVP)
- **RAG rollup:** any child `At Risk` -> Red; else any `In Progress`/`Not Started` -> Amber;
  all `Complete` -> Green. Each RAG cites the child rows that drove it.
- **Capacity fit:** `remaining = capacity - used`; `no-fit` when `remaining < demand`.
  No-fit workstreams are passed to the Risk agent and ranked by gap size (largest first).

### 8. HITL gate
The Supervisor pauses after the Narrative agent and presents the DRAFT for a decision.
On approve, state moves to APPROVED. On reject, the Supervisor records `decisionReason`
and nothing is marked final. Implemented via a Claude Agent SDK hook / permission stop -
the reason the runtime was chosen.

### 9. Non-functional and observability
- **Auditability:** every readout figure resolves to a `sourceRef`.
- **Reproducibility:** same input dataset -> consistent normalized state.
- **Resilience:** a failing specialist does not corrupt shared state; the Supervisor
  reports the gap rather than emitting a partial readout as complete.
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
