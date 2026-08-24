# Product Requirements Document (PRD)

## PMO Program Intelligence Crew

### 1. Vision
Turn raw program data into a trustworthy, auditable executive readout through a crew of specialist agents, with a mandatory human approval gate on the high-risk final step.

### 2. Users and primary use case
A program manager loads a mock project sheet and burn/capacity file. The crew ingests and normalizes the data, derives per-priority status, checks capacity against demand, flags and ranks risks, and drafts an executive summary. The program manager reviews, edits, approves or rejects before anything is final.

### 3. Runtime and architecture pointer
- **Application runtime:** `AAMAD_TARGET_RUNTIME=crewai`
- **Rationale:** for the Sprint-3 build we use a CrewAI Flow as the deterministic orchestrator (ingestion and analysis run as Python steps) with a small Crew for the LLM Narrative, keeping the arithmetic in code per the Reproducibility NFR. This REVERSES the earlier `claude-agent-sdk` choice; the API contract and HITL semantics are unchanged, and the switch is to be confirmed with the instructor. Full detail lives in `sad.md` §2.
- **Coordination pattern:** a Flow sequences deterministic ingestion/analysis steps then the Narrative crew, hierarchical supervisor, and a hard HITL stop (HTTP pause/resume) before output is final. Full detail lives in `sad.md`.

### 4. MVP user stories and acceptance criteria

**US-1 Ingest program data** (traces to MRD §7 stable ingestion interface)
As a program manager, I want the crew to load the program-data source so downstream agents share one normalized program state.
- AC-1.1 Ingestion reads the source (a synthetic project sheet + burn file for the MVP) and emits a normalized JSON state whose shape follows the shared-state schema in SAD §6.
- AC-1.2 Missing or malformed rows are reported, not silently dropped.
- AC-1.3 Ingestion is implemented behind a source-agnostic interface so a live connector (e.g. a Slack risk feed) can be added later without changing downstream agents.

**US-2 Derive per-priority status** (traces to MRD §2 progress-rollup domain)
As a program manager, I want each priority's RAG status derived by rolling up its child tasks so status is objective and consistent.
- AC-2.1 A priority with any child task at-risk rolls up to at-risk/Red per the RAG rollup rule in SAD §7 (any At Risk -> Red; else any In Progress/Not Started -> Amber; all Complete -> Green).
- AC-2.2 Each derived status cites the child rows that drove it.

**US-3 Assess capacity vs demand** (traces to MRD §2 financial burn/capacity domain)
As a program manager, I want a fit / no-fit signal from burn and capacity data.
- AC-3.1 Output states, per workstream, the run-rate and whether remaining capacity covers remaining demand (remaining = capacity - used; no-fit when remaining < demand, per SAD §7).
- AC-3.2 A no-fit result is flagged to the risk agent, carrying the numeric capacity-vs-demand gap.

**US-4 Flag governance and delivery risks** (traces to MRD §2 delivery/governance-risk domain and MRD §5 cross-domain risk value)
As a program manager, I want role/ownership conflicts, late intake, and capacity breaches flagged.
- AC-4.1 Each risk includes description, severity, source evidence (one or more source rows), and suggested owner.
- AC-4.2 Risks are ranked most-severe first; capacity-breach risks are ordered by gap size, largest first, per SAD §7.

**US-5 Draft executive narrative** (traces to MRD §2 executive-narrative domain)
As a program manager, I want a draft summary and bullets synthesizing the above.
- AC-5.1 The narrative reflects status, capacity signal, and top risks, and introduces no claim not present in the analysis outputs (every figure it states resolves to a source row).
- AC-5.2 Output is labeled DRAFT until approved (draft.status = 'DRAFT' per SAD §6) and is rendered as a Markdown readout on the single web chat page for presentation at the HITL gate (US-6).

**US-6 Human approval gate (HITL)** (traces to MRD §4 differentiation and MRD §5 human-authority value)
As a program manager, I want to approve, edit, or reject before output is final.
- AC-6.1 The workflow pauses after the narrative and presents the DRAFT to the program manager as a rendered Markdown readout on the MVP frontend, which is a single minimal web chat page (one screen) that shows the run/conversation; no output is marked final until a decision is recorded.
- AC-6.2 On that same single web chat page, the program manager responds with exactly one of three controls: Approve, Edit (inline-editable draft text), or Reject (with a reason field). No UI beyond this single chat page (the Markdown readout plus the Approve / Edit / Reject controls) is in scope for the MVP.
- AC-6.3 On reject, the crew records the reason (draft.decisionReason per SAD §6) and nothing is marked final.
- AC-6.4 The frontend communicates with the backend only over the HTTP+JSON API defined in the SAD (the PRD does not redefine that API). Visual style is minimal with system theme per aamad.config.yml ui settings.

### 5. Non-functional requirements
- **Auditability:** every figure in the output traces to a source row.
- **Safety:** synthetic data only; no external publish in the MVP.
- **Reproducibility:** given the same input dataset and configuration, the crew produces an identical normalized structured state (same per-priority RAG, same capacity fit signals, and same risk ranking).
- **Resilience:** one specialist failing does not corrupt the shared state. On a specialist (workstream agent) failure the supervisor retries that specialist once; if it still fails, the run halts and emits a Diagnostic naming the failed workstream. The system does not synthesize a final DRAFT from partial data, so HITL integrity and figure-to-source traceability are preserved. (Supervisor and retry mechanics are specified in SAD §3 and §9.)
- **Extensibility:** the ingestion interface isolates data sources, so live connectors can be added post-MVP without changing agent logic.

### 6. Scope
**In scope (MVP):** one synthetic dataset (mock project sheet + burn/capacity file); the six user stories above; a structured status summary plus draft executive bullets.
**Out of scope (MVP):** live connection to a production PM system or Slack; automatic distribution of the readout; multi-program portfolio rollup; frontend authentication/login; multi-user or multi-session management; persistent run history; and any screen beyond the single web chat page.

### 7. Definition of done
- Crew runs end to end on the synthetic dataset in a single invocation and produces a DRAFT the program manager accepts with only minor edits on first review (acceptance measured per MRD §6; the "minor" edit-volume threshold is set per Open Questions).
- 100% of output figures (every RAG status, capacity signal, and risk) resolve to a source row.
- The workflow halts for human approval before any output is marked final; measured as zero unapproved-final outputs across runs.
- Artifacts (system-description, MRD, PRD, SAD) are published under `project-context/1.define/`.

## Sources
- `system-description.md` and `mrd.md` in this folder (problem frame, users, opportunity).
- Course lesson material (AAMAD phases, MAS coordination patterns, runtime selection).
- Author's program-management domain experience for user stories and acceptance criteria.

## Assumptions
- Ingestion reads a synthetic project sheet + burn/capacity file for the MVP.
- RAG rollup and capacity fit follow the rules defined in `sad.md`.
- The program manager (end user) is available to act as the HITL approver.

## Open Questions
- Exact RAG thresholds (e.g. how many at-risk children force Red) - to finalize with the SAD.
- Whether "minor edits" acceptance is tracked qualitatively or via an edit-count metric.
- Which fields a live connector must supply to preserve per-figure traceability.

## Audit
- Created 2026-08-08 by Melanie Arias. Status: DRAFT for course Define phase.
- Product target runtime: AAMAD_TARGET_RUNTIME=claude-agent-sdk (recorded in the SAD Audit).
- Scope posture: synthetic data only; no live publish in the MVP.
- 2026-08-08, @product.mgr, define-phase-quality-pass: added MRD-section traceability tags to US-1 through US-6; tightened acceptance criteria for specificity (SAD §6 state shape, SAD §7 RAG and capacity rules, per-workstream capacity output with numeric gap, evidence and DRAFT-status wording); made Reproducibility NFR and Definition of Done measurable and outcome-oriented; added two Open Questions (DRAFT presentation format for the HITL step; partial-vs-halt behavior on specialist failure). No product scope invented.
- 2026-08-08, @product.mgr, resolve-open-questions: folded two approved product decisions into requirements. DRAFT presentation surface: set AC-6.1 to a rendered Markdown readout inside the MVP chat interface, added AC-6.2 for the approve/edit/reject response (renumbering the prior reject criterion to AC-6.3), and referenced the Markdown readout in US-5 AC-5.2. Specialist failure: strengthened the Resilience NFR to state retry-once then halt-with-Diagnostic naming the failed workstream and no partial final DRAFT, with a pointer to SAD §3/§9. Removed the two corresponding Open Questions (DRAFT presentation format; partial-vs-halt on specialist failure). No product scope invented.
- 2026-08-08, @product.mgr, define-frontend-surface: folded the approved MVP frontend-surface decision into requirements to close a Build-readiness gap for the Frontend epic. Made US-5 AC-5.2 render the Markdown readout on the single web chat page. Tightened US-6: AC-6.1 now fixes the surface to a single minimal web chat page (one screen) showing the run/conversation; AC-6.2 now names the three controls (Approve, Edit as inline-editable draft text, Reject with a reason field) on that same page; added AC-6.4 stating the frontend talks to the backend only over the HTTP+JSON API defined in the SAD (not redefined here) and uses minimal system-theme visual style per aamad.config.yml. Added frontend out-of-scope items to §6 (authentication/login, multi-user or multi-session management, persistent run history, any screen beyond the single web chat page) without deleting existing scope entries. MVP-lean; no product scope invented beyond the approved decision.
- 2026-08-18, @system.arch, runtime-switch-and-review-fixes: resolved AAMAD_TARGET_RUNTIME=crewai for the Sprint-3 build track. Updated the §3 runtime pointer from claude-agent-sdk to crewai (CrewAI Flow deterministic orchestrator + small Narrative Crew) with a matching rationale; noted this REVERSES the earlier choice, that the API contract and HITL semantics are unchanged, and that it is to be confirmed with the instructor. SAD §2/§3/§4/§9/§11 carry the detailed switch and the instructor fixes; no user stories, acceptance criteria, or scope changed here.
