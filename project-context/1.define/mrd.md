# Market Requirements Document (MRD)

## PMO Program Intelligence Crew

### 1. Opportunity
Large, multi-workstream transformation programs run their weekly executive rhythm on manual labor. A program manager pulls task status from a project sheet, reconciles effort-burn and capacity against demand, scans for governance and delivery risks, and hand-assembles an executive readout. This is repetitive, error-prone, and expensive: a single wrong figure on an executive slide can misdirect a steering decision. The opportunity is to compress that weekly cycle from hours to minutes while making every number auditable and keeping a human in control of what leadership sees.

### 2. Problem statement
The weekly status process spans four distinct domains - progress rollup, financial burn/capacity, delivery/governance risk, and executive narrative. One generalist doing all four produces inconsistent quality and no audit trail. Existing PM tools report tasks but do not synthesize a defensible executive story, flag cross-cutting risks, or check capacity against demand. The gap is synthesis with traceability, not more dashboards.

### 3. Target users
- **Primary:** Program manager (end user) who owns and signs the weekly executive readout.
- **Secondary:** PMO analyst who prepares source data; executive sponsor who consumes the readout and steers on it.

### 4. Market landscape and alternatives
- **Manual assembly (status quo):** flexible but slow, inconsistent, and untraceable.
- **PM/reporting tools (e.g. sheet dashboards, BI):** surface task data but do not reason across domains or produce a narrative with risk ranking.
- **Single-agent AI summarizers:** fast but shallow - they blend domains, hallucinate figures, and offer no per-figure provenance or approval gate.

**Differentiation:** a coordinated crew of domain specialists that produces a review-ready readout where every status and risk traces to a source row, gated by mandatory human approval before anything is treated as final. Auditability plus human control is the wedge.

### 5. Value proposition
- Cut weekly status preparation from hours to minutes.
- Reduce the risk of a wrong figure reaching leadership through per-figure traceability.
- Surface cross-domain risks (governance, capacity, delivery) that manual assembly misses.
- Preserve human authority on the high-stakes step via a hard approval gate.

### 6. Success metrics
- Time-to-draft readout: a single run completes in minutes versus the hours a manual weekly cycle takes (§1); the exact target margin and the manual baseline are set per Open Questions.
- Output figures traceable to a source row: 100% (every RAG status, capacity signal, and risk cites a source row).
- First-run acceptance: the program manager accepts the draft with only minor edits, measured as accepted runs / total runs; the edit-volume threshold that counts as "minor" is set per Open Questions.
- HITL integrity: zero unapproved outputs treated as final, measured as unapproved-final incidents = 0 across all runs (the approval gate is never bypassed).

### 7. Constraints and assumptions
- Course/exploration context: operates on **synthetic program data only** - no client-confidential or production inputs.
- Data sources are read through a stable ingestion interface; the MVP reads a synthetic source file, and live connectors (e.g. a Slack risk feed, a project-management API) are post-MVP integrations behind that same interface.
- Not a commercial launch; MRD scope is opportunity validation for a capstone MVP.

### 8. Risks
- Over-scoping toward live integrations dilutes the MVP; scope held to one dataset and one readout.
- Trust risk if provenance is weak; mitigated by making traceability a hard requirement.

## Sources
- Course lesson material (AAMAD, Multiagent Systems, runtime selection) for framework and pattern context.
- Author's program-management domain experience, used to frame the problem and personas.
- Note: all figures and scenarios are illustrative/synthetic; no client or production data.

## Assumptions
- The program runs a weekly executive cadence with a single owning program manager.
- One primary program in scope for the MVP (no portfolio rollup).
- Source data is available through a stable ingestion interface; the MVP uses a synthetic file.

## Open Questions
- What is the manual-baseline time to beat, and how will time-savings be measured?
- Which live connector (Slack risk feed vs project-management API) is the first post-MVP integration?
- What acceptance threshold counts as "accepted with minor edits" for the success metric?

## Audit
- Created 2026-08-08 by Melanie Arias. Status: DRAFT for course Define phase.
- Product target runtime: AAMAD_TARGET_RUNTIME=claude-agent-sdk (recorded in the SAD Audit).
- Data posture: synthetic only.
- 2026-08-08, @product.mgr, define-phase-quality-pass: made success metrics (§6) measurable and outcome-oriented (time-to-draft, 100% traceability, first-run acceptance rate, HITL integrity = 0 incidents), grounding targets in §1 and deferring exact thresholds to Open Questions. No scope invented.
