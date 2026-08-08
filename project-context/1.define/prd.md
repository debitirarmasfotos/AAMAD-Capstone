# Product Requirements Document (PRD)

## PMO Program Intelligence Crew

### 1. Vision
Turn raw program data into a trustworthy, auditable executive readout through a crew of specialist agents, with a mandatory human approval gate on the high-risk final step.

### 2. Users and primary use case
A program manager loads a mock project sheet and burn/capacity file. The crew ingests and normalizes the data, derives per-priority status, checks capacity against demand, flags and ranks risks, and drafts an executive summary. The program manager reviews, edits, approves or rejects before anything is final.

### 3. Runtime and architecture pointer
- **Application runtime:** `AAMAD_TARGET_RUNTIME=claude-agent-sdk`
- **Rationale:** MCP connectors model the data sources cleanly; hooks and resumable sessions support a real approval gate; a governed agent loop fits the auditability requirement better than a purely declarative crew.
- **Coordination pattern:** hybrid - parallel analysis (rollup, capacity, risk) after ingestion, sequential synthesis (narrative), hierarchical supervisor, and a hard HITL stop before output is final. Full detail lives in `2.build/sad.md`.

### 4. MVP user stories and acceptance criteria

**US-1 Ingest program data**
As a program manager, I want the crew to load the program-data source so downstream agents share one normalized program state.
- AC-1.1 Ingestion reads the source (a synthetic project sheet + burn file for the MVP) and emits a normalized JSON state.
- AC-1.2 Missing or malformed rows are reported, not silently dropped.
- AC-1.3 Ingestion is implemented behind a source-agnostic interface so a live connector (e.g. a Slack risk feed) can be added later without changing downstream agents.

**US-2 Derive per-priority status**
As a program manager, I want each priority's RAG status derived by rolling up its child tasks so status is objective and consistent.
- AC-2.1 A priority with any child task at-risk rolls up to at-risk/red per the defined rule.
- AC-2.2 Each derived status cites the child rows that drove it.

**US-3 Assess capacity vs demand**
As a program manager, I want a fit / no-fit signal from burn and capacity data.
- AC-3.1 Output states the run-rate and whether remaining capacity covers remaining demand.
- AC-3.2 A no-fit result is flagged to the risk agent.

**US-4 Flag governance and delivery risks**
As a program manager, I want role/ownership conflicts, late intake, and capacity breaches flagged.
- AC-4.1 Each risk includes description, severity, source evidence, and suggested owner.
- AC-4.2 Risks are ranked most-severe first.

**US-5 Draft executive narrative**
As a program manager, I want a draft summary and bullets synthesizing the above.
- AC-5.1 The narrative reflects status, capacity signal, and top risks, and introduces no new claims.
- AC-5.2 Output is labeled DRAFT until approved.

**US-6 Human approval gate (HITL)**
As a program manager, I want to approve, edit, or reject before output is final.
- AC-6.1 The workflow pauses and presents the draft for a decision.
- AC-6.2 On reject, the crew records the reason and nothing is marked final.

### 5. Non-functional requirements
- **Auditability:** every figure in the output traces to a source row.
- **Safety:** synthetic data only; no external publish in the MVP.
- **Reproducibility:** given the same input dataset, the crew produces a consistent structured state.
- **Resilience:** one specialist failing does not corrupt the shared state; the supervisor reports the gap.
- **Extensibility:** the ingestion interface isolates data sources, so live connectors can be added post-MVP without changing agent logic.

### 6. Scope
**In scope (MVP):** one synthetic dataset (mock project sheet + burn/capacity file); the six user stories above; a structured status summary plus draft executive bullets.
**Out of scope (MVP):** live connection to a production PM system or Slack; automatic distribution of the readout; multi-program portfolio rollup.

### 7. Definition of done
- Crew runs end to end on the synthetic dataset and produces a draft a program manager would accept with minor edits.
- 100% of figures are traceable to source rows.
- The workflow halts for human approval before marking output final.
- Artifacts (system-description, MRD, PRD) are published under `project-context/1.define/`.
