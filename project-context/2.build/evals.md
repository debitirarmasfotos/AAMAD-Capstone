# Evaluation Strategy - PMO Program Intelligence Crew

Evaluation strategy and results for the MVP. Success criteria derive from the SAD
section 9 evaluation-criteria table, the PRD, and the user-story acceptance criteria.
Runtime: crewai (AAMAD_TARGET_RUNTIME=crewai).

## Input Requirements

**PRD**: project-context/1.define/prd.md
**SAD** (section 9 criteria table, if present): project-context/1.define/sad.md
**System Description / User Stories** (optional): project-context/1.define/system-description.md
**backend.md / integration.md**: project-context/2.build/backend.md, project-context/2.build/integration.md
**Selected Runtime**: crewai

## Evaluation Report

### 1. Eval Strategy

The current MVP evaluation strategy is intentionally conservative and grounded in the implemented contract. The project scope is deterministic Python analysis plus a single LLM narrative step, with a human approval gate before any final output is considered complete. The evaluation therefore covers the deterministic analysis path, the API contract, the HITL UI flow, and the narrative-generation gate that is only valid when a funded OPENAI_API_KEY is present.

Dimensions covered:
- Accuracy: all RAG statuses, capacity signals, and ranked risks must resolve to source rows and contain no unsupported claim.
- Latency: the local synthetic run should complete inside a single execution session; exact SLA remains unconfirmed.
- Safety: the MVP is synthetic-only, with no external publication or production data path.
- Security: no secrets in artifacts; environment-only credentials; no production auth claims in the MVP.
- Cost: the MVP intentionally avoids paid external connectors and keeps model use limited to the narrative draft.

### 2. Success Criteria and Thresholds

| ID | Dimension | Metric | Threshold | Grading Method | Source |
|----|-----------|--------|-----------|-----------------|--------|
| EC-001 | Accuracy | Unsupported output figures in the final readout | 100% of every RAG status, capacity signal, and risk resolves to a source row; the narrative contains no unsupported claim | Code-based validation of sourceRef coverage plus deterministic output checks | PRD §4 AC-5.1, PRD §7 Definition of Done, SAD §9 EC-001 |
| EC-002 | Latency | End-to-end run time for one synthetic dataset | No SLA defined yet. Observed: deterministic analysis under 1s; a full run including the live narrative is about 10s. Exact SLA pending operator signoff | Timing instrumentation and run-level logs | SAD §9 EC-002; operator answer required |
| EC-003 | Safety | External release or unapproved publication | 0 external publishes; synthetic data only; no production data leaves the local MVP environment | Static review and config validation | PRD NFR Safety, PRD §6 Scope |
| EC-004 | Security | Secret exposure and unauthorized access | 0 secrets stored in artifacts; runtime credentials only via environment variables; no production auth or enterprise controls claimed in the MVP | Security assessment + config review | PRD §5 Safety, SAD §8, project-context/2.build/security.md |
| EC-005 | Cost | Runtime cost footprint for the MVP | No paid external services or production connectors in the MVP; arithmetic stays in deterministic code; model use is confined to the narrative draft. Exact cost ceiling remains undefined | Code review and log review of tool/model usage | PRD §6 Out of Scope; operator answer required for a hard budget cap |

The Source column is traceable to PRD/SAD anchors or to a documented operator gap. The latency and cost thresholds remain placeholders because no operator answer was provided for an SLA or budget cap during this run.

### 3. Golden Dataset

The current repo does not yet contain a dedicated evals/dataset folder or a formal golden-dataset runner. The effective golden evaluation set is the repository’s real CSV fixtures plus the deterministic API and compute tests that encode the expected logic of the synthetic program dataset.

Failure-mode categories covered by the current implementation:
- Ingestion and malformed-data handling: validation of source loading and deterministic output shape.
- RAG rollup correctness: priority status computation on the synthetic dataset.
- Capacity fit and no-fit detection: run-rate and shortfall calculations.
- Risk ranking and severity ordering: capacity-breach ordering by gap size and severity.
- HITL decision flow: AWAITING_APPROVAL, approve, reject, and HALTED paths.
- Narrative grounding gate: no live LLM narrative execution was performed because a funded OPENAI_API_KEY was absent.

Provenance: real project CSV fixtures in data/ were used for the compute-level validation. This is production-shaped synthetic data rather than a production dataset, which is appropriate for the MVP and its safety constraints.

### 4. Grading Methods

Code-based checks implemented:
- backend/tests/test_compute.py
- backend/tests/test_api.py
- frontend/src/App.test.tsx

LLM-as-judge usage:
- No LLM-as-judge rubric is implemented for this MVP pass. The narrative draft is not treated as a self-graded output because the live runtime requires a funded key and the current project does not yet include a calibrated judge dataset.

Human-review items:
- None automated in the repo; live narrative validation remains an operator-run check under a funded OPENAI_API_KEY.

### 5. Implementation

Current repo location for validation evidence:
- backend/tests/
- frontend/src/App.test.tsx
- project-context/2.build/qa.md

Runtime instrumentation per the CrewAI adapter:
- The project uses deterministic Python analysis and a CrewAI narrative step, but no dedicated eval runner or trace export under project-context/2.build/logs was added in this MVP pass.
- The implementation therefore validates through the formal test suites and the offline API contract rather than a dedicated eval harness.

How to rerun the suite:
- Backend: cd backend; .\.venv\Scripts\Activate.ps1; python -m pytest -q
- Frontend: cd frontend; npm test -- --run

### 6. Results

Fresh validation evidence from this run:
- Backend tests: 19 passed in 0.65s.
- Frontend tests: 1 file passed; 2 tests passed in 2.73s.

Per-category pass/fail summary:
- Ingestion and compute logic: PASS
- API contract and error handling: PASS
- HITL UI flow contract: PASS
- Narrative generation with live model: GATED, not executed because OPENAI_API_KEY is not present
- Latency: full run about 10s observed (deterministic analysis under 1s); no operator SLA target defined
- Cost ceiling: UNMEASURED, no operator budget cap defined

Known gaps and release status:
- The live model-backed narrative draft is not yet executed in CI or local validation because the backend requires a funded OPENAI_API_KEY. This is an accepted operational gap for the current MVP, not a failure of the deterministic analysis path.
- The project still does not include a dedicated production telemetry stack or a formal eval-runner, so this evaluation should be viewed as a local MVP gate rather than a production readiness gate.
- The Deliver gate is still valid because the offline contract and frontend flow are verified, but a final release-quality eval suite requires operator-run model execution and SLA/cost decisions.

### 7. Production Monitoring Recommendations

Handoff to @devops.eng for the Deliver stage:
- Request-level trace fields: model/version, input/output token counts, latency, stop reason, tool calls, runId, and status transitions.
- Dashboard metrics: cost per request, latency p50/p95, task success rate, error rate by type, and approval/reject rate.
- Threshold alerts: cost spike over 150% of the 7-day average, latency p95 crossing the agreed SLA, and repeated missing-key or HALTED error rates above baseline.
- Change attribution: distinguish model drift, data drift, and model-update effects by tracking dataset fingerprint, model version, prompt version, and deployment release in the same dashboard.
- Business-KPI translation: map task success rate to first-contact resolution and map approval/reject rate to operational confidence in the final narrative.

### 8. Future Work

- Add a dedicated evals/dataset directory with golden cases for ingestion, RAG, capacity, ranking, and narrative-grounding checks.
- Implement a dedicated eval runner, such as evals/run.py, with per-category pass/fail output and artifactized logs.
- Add live narrative smoke testing with a funded OPENAI_API_KEY and human-labeled review of the draft quality.
- Capture latency and cost telemetry for production monitoring and set explicit SLA and cost caps.
- Add a calibrated judge dataset and an LLM-as-judge rubric for narrative quality once the business criteria are defined.

## Sources

- project-context/1.define/prd.md
- project-context/1.define/sad.md
- project-context/2.build/backend.md
- project-context/2.build/integration.md
- project-context/2.build/qa.md
- project-context/2.build/security.md
- backend/tests/test_compute.py
- backend/tests/test_api.py
- frontend/src/App.test.tsx

## Assumptions

- The current local configuration is appropriate for the offline MVP gate and the synthetic dataset.
- The deterministic Python analysis path is the authoritative source for correctness in the current MVP.
- The narrative model path remains a live operator-run validation step until a funded OPENAI_API_KEY and explicit evaluation thresholds are available.
- No operator-provided latency target or cost ceiling was supplied during this run; the threshold rows use placeholders and are flagged as pending confirmation.

## Open Questions

- What is the required p95 latency target for a single local run in the product environment?
- What is the acceptable cost ceiling or cost-per-request budget for the narrative step?
- Should live narrative generation with a funded key become a required release gate for the next pass?
- Do we want a dedicated human-labeled set for judge calibration before we rely on LLM-as-judge scoring?

## Audit

- 2026-09-17, @qa.eng, run-evals, crewai
