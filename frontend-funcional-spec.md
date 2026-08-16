# Frontend Functional Spec: Generate Program Readout (MVP)

This spec covers the MVP chat UI for the PMO Program Intelligence Crew. It is
framed around the single most valuable path: **Generate Program Readout**. The
operator runs the crew over the synthetic program dataset and gets back a DRAFT
executive readout (per-priority RAG rollup, capacity fit signal, ranked risks,
and a draft narrative). The UI is a thin client with no business logic; all
rollup, capacity, and ranking rules live in the backend (SAD section 7).

Scope note: this build is frontend-only. Services are stubbed with fixed mock
payloads (no backend, no network). The approve/edit/reject HITL logic is not
wired yet; the review surface is shown but stubbed.

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

- Controls are **Run** and **Reset** only. No pause, cancel, or retry-diff.
- Run drives a tiny explicit finite-state machine (see Contracts). On Run the
  app calls `startRun()` then `getRunStatus()`; on success it renders the
  readout, on failure it enters the error state.
- While running, the Run button is disabled and labeled "Running..."; inputs are
  disabled.
- Status banner at the top shows "Crew: idle | running | done | error" with a
  colored pill (gray idle, blue running, green done, red error) and a
  "last updated" timestamp. Status wording is consistent across the banner,
  buttons, and inline messages. The banner uses an aria-live region.

## Results

- On success the Results panel renders the DRAFT executive readout:
  - Draft narrative: `summary` + `bullets`, labeled with `status: DRAFT`.
  - Priority RAG rollup: each priority with its RAG (Red/Amber/Green) and the
    evidence source rows that drove it (SAD section 7 rule).
  - Capacity fit: per workstream fit / no-fit, numeric gap on no-fit, run-rate
    (used/capacity), remaining vs demand.
  - Ranked risks: description, severity, suggested owner, evidence; ordered
    severity descending then capacity gap descending (SAD section 7 total order).
- A clearly stubbed HITL note is shown to stay faithful to the review surface:
  "Awaiting human approval (approve/edit/reject wired in a later module)". No
  approval logic is built now.
- On error the panel shows an inline message plus a **Retry** button that
  re-runs with the SAME inputs.

## History

- A small session-only History list of prior runs (runId, outcome, time).
- In-session only: persistent run history is out of scope for the MVP per PRD
  section 6 and SAD section 10. Reset clears the current run but preserves the
  session history list.

## Contracts

The stub services mirror the SAD section 8 endpoints. TypeScript types live in
`frontend/src/types.ts`; the shapes below are the load-bearing payloads.

`startRun` (stub for `POST /api/runs`):

```ts
interface RunInputs {
  focus?: string;      // optional hint, does not change MVP results
  forceError?: boolean; // dev/testing switch for the error path
}
interface StartRunResult {
  runId: string;
  status: "AWAITING_APPROVAL" | "APPROVED" | "REJECTED" | "HALTED";
}
startRun(inputs?: RunInputs): Promise<StartRunResult>;
```

`getRunStatus` (stub for `GET /api/runs/{runId}`):

```ts
interface GetRunStatusResult {
  runId: string;
  status: RunStatus;             // "AWAITING_APPROVAL" at the HITL pause
  readout?: ProgramReadout;      // present on success
  diagnostic?: { failedWorkstream: string; reason: string }; // present on HALTED
}
getRunStatus(runId: string): Promise<GetRunStatusResult>;
```

`ProgramReadout` (view projection of the SAD section 6 shared state):

```ts
interface ProgramReadout {
  runId: string;
  timestamp: string;             // ISO
  status: RunStatus;
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
  draft: { summary: string; bullets: string[]; status: "DRAFT" | "APPROVED" | "REJECTED" };
}
```

Finite-state machine (`frontend/src/state/runMachine.ts`):

```
States:  idle -> running -> done, plus error
Events:  RUN     (idle | done | error -> running)
         RESOLVE (running -> done)      // stub completes
         FAIL    (running -> error)     // stub fails
         RESET   (any -> idle, history preserved)
```

## Spec Sync

| Item | Status | Note |
|---|---|---|
| App scaffold (Vite + React + TS, single route) | Done | `frontend/`, one page in `App.tsx`. |
| Inputs section | Done | Synthetic-dataset note, optional focus input, force-error toggle. |
| Run control area | Done | Run + Reset only; no pause/cancel/retry-diff. |
| Results panel | Done | Draft narrative, RAG rollup, capacity fit, ranked risks. |
| History list | Done | Session-only; preserved across Reset. |
| Status banner | Done | idle/running/done/error, colored pill, last-updated time, aria-live. |
| FSM (reducer) | Done | idle -> running -> done + error; RUN/RESOLVE/FAIL/RESET. |
| Stub services | Done | `startRun` + `getRunStatus`, fixed payload from synthetic fixtures. |
| Mock payload fidelity | Done | Values hand-computed from data/ CSVs per SAD section 7. |
| HITL note (stubbed) | Done | "Awaiting human approval" note; no approval logic built. |
| Error handling + Retry | Done | Inline error message; Retry re-runs same inputs. |
| Force-error path | Done | Dev checkbox + `?forceError=1` query param. |
| Accessibility basics | Done | Semantic headings, labeled controls, aria-live status. |
| Happy-path test | Done | Vitest + RTL; one seeded example (see verification). |
| gitignore (node_modules, dist) | Done | `frontend/.gitignore`. |

## Traceability notes (runtime constraints)

- Runtime AAMAD_TARGET_RUNTIME=claude-agent-sdk maps the HITL pause to a
  resumable session keyed by `runId` (SAD section 8). The UI reflects this with
  an AWAITING_APPROVAL status at the pause and a stubbed approval surface.
- Streaming is intentionally not implemented in the MVP UI. The stub returns the
  full readout in one response; if the backend later streams tokens, the Results
  panel would need an incremental render path. Recorded here as a future note.
- Tool-call details and costs are out of scope for this UI.
