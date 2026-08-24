# Frontend Functional Spec: Generate Program Readout (MVP)

This spec covers the MVP chat UI for the PMO Program Intelligence Crew. It is
framed around the single most valuable path: **Generate Program Readout**. The
operator runs the crew over the synthetic program dataset and gets back a DRAFT
executive readout (per-priority RAG rollup, capacity fit signal, ranked risks,
and a draft narrative). The UI is a thin client with no business logic; all
rollup, capacity, and ranking rules live in the backend (SAD section 7).

Scope note: this build is frontend-only. Services are stubbed with fixed mock
payloads (no backend, no network). The human-in-the-loop (HITL) decision
contract is now FROZEN in the UI before the backend is built, so the backend
implements an envelope the client already consumes. The approve / edit / reject
controls are wired against a stubbed decision service (`submitDecision`) that
returns the frozen response shapes; swapping the stub for the real
`/api/runs/{runId}/decision` endpoint is a services-layer change with the SAME
types.

Traceability: PRD US-1 through US-6, SAD section 6 (shared state), SAD section 7
(rollup/capacity/ranking rules), SAD section 8 (/api/runs contract). Runtime:
AAMAD_TARGET_RUNTIME=claude-agent-sdk.

App location: `frontend/` (Vite + React + TypeScript, single route, one page).

## Inputs

- The MVP always runs over the bundled synthetic dataset (mock project sheet and
  burn/capacity file). A read-only note states this; no live source is connected.
- An optional free-text "focus or criteria" input is passed to the stub but does
  not change the fixed results (it is a hint for the future backend).
- A dev/testing "Force stub error" checkbox (and a `?forceError=1` query param)
  forces the error path so it is demonstrable.
- Accessibility: the focus input is labeled; the checkbox is labeled; headings
  are semantic (h1 page title, h2 per section).

## Run

- Controls are **Run** and **Reset** only. No pause, cancel, or retry-diff. The
  HITL decision controls (Approve / Edit / Reject) live on the Results panel and
  appear only at the approval gate.
- Run drives an explicit finite-state machine (see Contracts). On Run the app
  calls `startRun()` for a run acknowledgement, then POLLS `getRunStatus()` on an
  interval until the run reaches `AWAITING_APPROVAL` (renders the DRAFT with
  decision controls) or `HALTED` (renders a diagnostic). Transport/client
  failures enter the error state.
- While running or awaiting approval, the Run button is disabled; the Run button
  reads "Running..." while running.
- Status banner at the top reads "Run status:" (this page is a run client, not a
  five-agent chat) and reflects the client phases idle | running | awaiting
  approval | approved | rejected | halted | error, with a colored pill (gray
  idle, blue running, amber awaiting approval, green approved, neutral gray
  rejected, red halted, red error) and a "last updated" timestamp. The green
  approved state is never shown while the draft is DRAFT / awaiting approval.
  Status wording is consistent across the banner, buttons, and inline messages.
  The banner uses an aria-live region.

## Results

- On success the Results panel renders the DRAFT executive readout:
  - Draft narrative: `summary` + `bullets`, labeled with `status: DRAFT`.
  - Priority RAG rollup: each priority with its RAG (Red/Amber/Green) and the
    evidence source rows that drove it (SAD section 7 rule).
  - Capacity fit: per workstream fit / no-fit, numeric gap on no-fit, run-rate
    (used/capacity), remaining vs demand.
  - Ranked risks: description, severity, suggested owner, evidence; ordered
    severity descending then capacity gap descending (SAD section 7 total order).
- At the approval gate (`AWAITING_APPROVAL`) the panel shows the HITL decision
  controls: **Approve** (submits action `approve`), **Edit** (reveals a textarea
  prefilled with the draft markdown and submits action `edit`, treated as
  approved by the stub), and **Reject** (requires a reason and submits action
  `reject`). On approve/edit the panel shows the approved final readout; on
  reject it shows the reason and no final output. A readout is never shown
  without its decision controls at the gate.
- On `HALTED` the panel shows the diagnostic (failed workstream + reason) and a
  **Retry** button. On error the panel shows an inline message plus a **Retry**
  button that re-runs with the SAME inputs.

## History

- A small session-only History list of prior runs (runId, outcome, time).
- In-session only: persistent run history is out of scope for the MVP per PRD
  section 6 and SAD section 10. Reset clears the current run but preserves the
  session history list.

## Contracts

These are the FROZEN contract types the backend MUST satisfy. They live in
`frontend/src/types.ts` and mirror the SAD section 8 transport contract and the
SAD section 6 shared-state projection. The backend contract is three endpoints:
`POST /api/runs`, `GET /api/runs/{runId}` (poll), and
`POST /api/runs/{runId}/decision`. A lightweight type-guard in
`frontend/src/services/validateEnvelope.ts` enforces the envelope shape at the
services boundary (no schema dependency added).

Server statuses are kept distinct from client-only run phases (the FSM below):

```ts
type RunStatus = "AWAITING_APPROVAL" | "APPROVED" | "REJECTED" | "HALTED";
```

`RunResponse` (from `POST /api/runs` and `GET /api/runs/{runId}`). When status is
`HALTED`, `diagnostic` is present and `draft` is absent:

```ts
interface RunResponse {
  runId: string;
  status: RunStatus;
  draft?: {
    markdown: string;
    summary: string;
    bullets: string[];
    status: "DRAFT" | "APPROVED" | "REJECTED";
  };
  stateSummary?: StateSummary;
  diagnostic?: { failedWorkstream: string; reason: string };
}
```

`StateSummary` (typed projection of the SAD section 6 shared state; field names
unchanged from what the Results panel already renders):

```ts
interface StateSummary {
  priorities: {
    name: string;
    tasks: { name; owner; status; due; sourceRef }[];
    rag: "Red" | "Amber" | "Green";
    ragEvidence: string[];       // source rows that drove the RAG
  }[];
  workstreams: {
    name; capacity; used; remaining; demand;
    runRate: number;             // used / capacity
    gap: number;                 // demand - remaining (positive only on no-fit)
    fit: boolean; sourceRef;
  }[];
  risks: {
    desc; severity: "High" | "Medium" | "Low";
    owner; evidence: string[]; rank: number; gap: number;
  }[];
}
```

`DecisionRequest` / `DecisionResponse` (body and response of
`POST /api/runs/{runId}/decision`):

```ts
interface DecisionRequest {
  action: "approve" | "edit" | "reject";
  edits?: string;
  reason?: string;
}
interface DecisionResponse {
  runId: string;
  status: "APPROVED" | "REJECTED";
  finalReadout?: { markdown: string };
}
```

Error envelope (SAD section 8):

```ts
interface ErrorEnvelope { error: { code: string; message: string } }
```

Stub service signatures (`frontend/src/services/mockCrew.ts`, the temporary
services layer to be swapped for `/api/runs` with the SAME types):

```ts
// startRun acknowledges a run (models POST /api/runs before the async pause).
startRun(inputs?: RunInputs): Promise<{ runId: string; status: "running" }>;

// getRunStatus polls GET /api/runs/{runId}. It reports { pending: true } for a
// couple of polls (the running phase), then a validated RunResponse.
getRunStatus(runId: string): Promise<
  | { pending: true }
  | { pending: false; response: RunResponse }
>;

// submitDecision posts a decision (stub for POST /api/runs/{runId}/decision).
submitDecision(runId: string, request: DecisionRequest): Promise<DecisionResponse>;

// focus and top_n are optional client hints only; forceError is a client-only
// dev switch that drives the stub HALTED demo path and is NEVER in a live body.
interface RunInputs { focus?: string; top_n?: number; forceError?: boolean }
```

Finite-state machine (`frontend/src/state/runMachine.ts`). `AWAITING_APPROVAL` is
a first-class state and `HALTED` is handled; the approved (green) state is never
entered while the draft is DRAFT / awaiting approval:

```
States:  idle -> running -> awaiting_approval -> (approved | rejected)
         running -> halted
         any transport/client failure -> error
Events:  RUN            (idle | approved | rejected | halted | error -> running)
         POLL_AWAITING  (running -> awaiting_approval)   // poll returned the DRAFT
         POLL_HALTED    (running -> halted)              // retry-then-halt path
         DECIDE_APPROVE (marks the decision in flight)
         APPROVED       (awaiting_approval -> approved)
         DECIDE_REJECT  (marks the decision in flight)
         REJECTED       (awaiting_approval -> rejected)
         FAIL           (running | awaiting_approval -> error)
         RESET          (any -> idle, history preserved)
```

## Spec Sync

| Item | Status | Note |
|---|---|---|
| App scaffold (Vite + React + TS, single route) | Done | `frontend/`, one page in `App.tsx`. |
| Frozen contract types | Done | `types.ts`: `RunResponse`, `StateSummary`, `DecisionRequest/Response`, `Diagnostic`, `ErrorEnvelope`; matches SAD section 8. |
| Envelope validation | Done | `services/validateEnvelope.ts` type-guards enforce shape at the boundary; no schema dep. |
| Inputs section | Done | Synthetic-dataset note, optional focus + top_n hints, force-halted dev toggle. |
| Run control area | Done | Run + Reset only; HITL controls live on Results. |
| Results panel | Done | Draft narrative, RAG rollup, capacity fit, ranked risks from `stateSummary` + `draft`. |
| HITL decision controls | Done | Approve / Edit (textarea) / Reject (required reason), shown only at `AWAITING_APPROVAL`. |
| History list | Done | Session-only; preserved across Reset; records approved/rejected/halted/error. |
| Status banner | Done | "Run status:" idle/running/awaiting approval/approved/rejected/halted/error, colored pill, last-updated time, aria-live. |
| FSM (reducer) | Done | `AWAITING_APPROVAL` first-class, `HALTED` handled; RUN/POLL_AWAITING/POLL_HALTED/DECIDE_*/APPROVED/REJECTED/FAIL/RESET. |
| Poll loop | Done | `startRun` ack then poll `getRunStatus` until `AWAITING_APPROVAL` or `HALTED`; a couple of running polls first. |
| Stub services | Done | `startRun` + `getRunStatus` + `submitDecision`; validated payloads from synthetic fixtures. |
| Mock payload fidelity | Done | Values hand-computed from data/ CSVs per SAD section 7. |
| HALTED diagnostic path | Done | Rendered as a diagnostic (failed workstream + reason) with Retry. |
| Error handling + Retry | Done | Inline error message; Retry re-runs same inputs. |
| Force-halted path | Done | Dev checkbox + `?forceError=1` query param; stub-only, never in a live body. |
| Accessibility basics | Done | Semantic headings, labeled controls (incl. edit textarea + reason input), aria-live status. |
| Tests | Done | Vitest + RTL: happy path (run -> poll -> awaiting -> approve -> approved) and HALTED path. |
| gitignore (node_modules, dist) | Done | `frontend/.gitignore`. |

## Traceability notes (runtime constraints)

- Runtime AAMAD_TARGET_RUNTIME=claude-agent-sdk maps the HITL pause to a
  resumable session keyed by `runId` (SAD section 8). The UI reflects this with
  an AWAITING_APPROVAL status at the pause and a stubbed approval surface.
- Streaming is intentionally not implemented in the MVP UI. The stub returns the
  full readout in one response; if the backend later streams tokens, the Results
  panel would need an incremental render path. Recorded here as a future note.
- Tool-call details and costs are out of scope for this UI.
