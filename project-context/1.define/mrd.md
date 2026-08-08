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
- Time-to-draft readout reduced by a target margin versus the manual baseline.
- Percentage of output figures traceable to a source row: 100%.
- Human acceptance rate of the draft with only minor edits.
- Zero unapproved outputs treated as final (the HITL gate never bypassed).

### 7. Constraints and assumptions
- Course/exploration context: operates on **synthetic program data only** - no client-confidential or production inputs.
- Data sources are read through a stable ingestion interface; the MVP reads a synthetic source file, and live connectors (e.g. a Slack risk feed, a project-management API) are post-MVP integrations behind that same interface.
- Not a commercial launch; MRD scope is opportunity validation for a capstone MVP.

### 8. Risks
- Over-scoping toward live integrations dilutes the MVP; scope held to one dataset and one readout.
- Trust risk if provenance is weak; mitigated by making traceability a hard requirement.
