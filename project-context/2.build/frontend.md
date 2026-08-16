# Frontend Implementation (Build Phase)

## PMO Program Intelligence Crew - MVP Chat UI

Canonical Build-phase frontend artifact for the `@frontend.eng` epic. It documents
the implemented React + TypeScript (Vite) app under `frontend/`, which realizes the
single "Generate Program Readout" workflow. The functional contract this build
follows lives in `frontend-funcional-spec.md` at the repo root; this artifact records
what was actually built and verified.

## 1. Overview

- One critical workflow: **Generate Program Readout**. The operator runs the crew
  over the bundled synthetic dataset and gets back a DRAFT executive readout
  (per-priority RAG rollup, capacity-vs-demand fit with numeric gap, ranked risks,
  and a draft narrative).
- This is a minimal, production-minded React + TypeScript app built with Vite. It is
  a thin client and holds no business logic: rollup, capacity, and ranking rules stay
  in the backend (SAD section 7).
- Current status: frontend-only. It runs against stubbed services that return fixed
  mock payloads. There is no backend and no network call yet. The real `/api/runs`
  contract (SAD section 8) is wired in a later Build step.
- Scope discipline: single route, one page, Run and Reset controls only. No auth, no
  multi-session, no persistent history, no extra screens (consistent with PRD section 6
  and SAD section 10).

## 2. Stack and structure

- **Stack:** React 18 + TypeScript 5 + Vite 5. Tests use Vitest + React Testing
  Library + jsdom. No UI framework dependency: styling is a single hand-written CSS
  file with CSS variables and a system light/dark theme (per `aamad.config.yml` ui
  settings), not Tailwind.
- **Folder layout under `frontend/`:**

```
frontend/
  index.html                     Vite entry
  package.json                   scripts: dev, build, preview, test
  tsconfig.json, vite.config.ts  build/test config
  src/
    App.tsx                      single-page composition + run orchestration
    types.ts                     domain types (view projection of SAD section 6)
    index.css                    minimal system-theme styling (CSS variables)
    state/runMachine.ts          explicit finite-state machine (reducer)
    services/mockCrew.ts         stubbed startRun / getRunStatus + fixed payload
    components/
      StatusBanner.tsx           status pill + label + last-updated time
      InputsPanel.tsx            dataset note, focus input, force-error toggle, Run/Reset
      ResultsPanel.tsx           DRAFT readout render + running/error/idle states + Retry
      HistoryList.tsx            session-only run list
    App.test.tsx                 happy-path test
    test/setup.ts                RTL/jest-dom test setup
```

- **What each key file does:**
  - `App.tsx`: composes the page (header + StatusBanner, InputsPanel, ResultsPanel,
    HistoryList) and owns `executeRun()`, which dispatches `RUN`, calls the stubs in
    sequence (`startRun` then `getRunStatus`), and dispatches `RESOLVE` or `FAIL`. It
    also reads a `?forceError=1` query param to force the error path, and wires
    Run, Retry (same inputs), and Reset handlers.
  - `state/runMachine.ts`: the finite-state machine as a `useReducer` reducer. Single
    source of truth for crew status, the current run inputs (kept so Retry re-runs
    identically), the readout, the error, a last-updated timestamp, and the session
    history. Exports `STATUS_LABEL` so banner, buttons, and messages share wording.
  - `services/mockCrew.ts`: stubbed `startRun` and `getRunStatus` with a ~600ms
    simulated delay. `buildReadout()` returns a fixed `ProgramReadout` hand-computed
    from the synthetic fixtures in `data/` per the SAD section 7 rules.
  - `types.ts`: TypeScript domain types (`ProgramReadout`, `Priority`, `Workstream`,
    `Risk`, `Draft`, `RunStatus`, `RunInputs`, `StartRunResult`, `GetRunStatusResult`).
    These are the frontend view projection of the SAD section 6 shared state, not a
    new schema.
  - Components: `StatusBanner` (colored pill + label + last-updated time, aria-live),
    `InputsPanel` (read-only dataset note, optional focus input, force-error toggle,
    Run/Reset), `ResultsPanel` (idle/running/error/done rendering plus the stubbed
    HITL note and Retry), `HistoryList` (session-only list of prior runs).

## 3. Finite-state machine

States and transitions in `src/state/runMachine.ts`:

```
States:  idle -> running -> done, plus error

Events:
  RUN     inputs      idle | done | error -> running   (ignored while running)
  RESOLVE readout     running            -> done       (stub returned a readout)
  FAIL    error       running            -> error      (stub threw / no readout)
  RESET               any                -> idle        (history preserved)
```

- `RUN` clears the previous error, stores the run inputs, and moves to `running`. It is
  a no-op if already `running` (guards against double submits).
- `RESOLVE` and `FAIL` only apply while `running`; both stamp `lastUpdated` and prepend
  a history entry (outcome `done` or `error`).
- `RESET` returns to the initial model but preserves the session `history` list.

## 4. Stubbed service contracts

Signatures (from `src/types.ts` and `src/services/mockCrew.ts`):

```ts
startRun(inputs?: RunInputs): Promise<StartRunResult>
getRunStatus(runId: string): Promise<GetRunStatusResult>

interface RunInputs { focus?: string; forceError?: boolean }
interface StartRunResult { runId: string; status: RunStatus }
interface GetRunStatusResult {
  runId: string;
  status: RunStatus;                                   // "AWAITING_APPROVAL" at the HITL pause
  readout?: ProgramReadout;                            // present on success
  diagnostic?: { failedWorkstream: string; reason: string }; // present on the HALTED path
}
type RunStatus = "AWAITING_APPROVAL" | "APPROVED" | "REJECTED" | "HALTED";
```

- `startRun` stubs `POST /api/runs`. It returns `{ runId, status: "AWAITING_APPROVAL" }`
  after the simulated delay, or throws when `inputs.forceError` is set (the demo error
  path).
- `getRunStatus` stubs `GET /api/runs/{runId}`. It returns the fixed readout paused at
  the HITL gate (`AWAITING_APPROVAL`).

Mock `ProgramReadout` payload shape (view projection of SAD section 6 shared state):

```ts
interface ProgramReadout {
  runId: string;
  timestamp: string;                 // ISO
  status: RunStatus;                 // AWAITING_APPROVAL in the mock
  priorities: {
    name: string;
    tasks: { name; owner; status; due; sourceRef }[];
    rag: "Red" | "Amber" | "Green";
    ragEvidence: string[];           // source rows that drove the RAG
  }[];
  workstreams: {
    name; capacity; used; remaining; demand;
    runRate: number;                 // used / capacity
    gap: number;                     // demand - remaining (positive only on no-fit)
    fit: boolean; sourceRef;
  }[];
  risks: {
    desc; severity: "High" | "Medium" | "Low";
    owner; evidence: string[]; rank: number; gap: number;
  }[];
  draft: { summary: string; bullets: string[]; status: "DRAFT" | "APPROVED" | "REJECTED" };
}
```

- The fixed values are hand-computed from `data/mock_project_sheet.csv` and
  `data/mock_burn_capacity.csv` per SAD section 7: RAG rollup (any At Risk -> Red;
  else any In Progress/Not Started -> Amber; all Complete -> Green), capacity fit
  (`remaining = capacity - used`; no-fit when `remaining < demand`; `gap = demand -
  remaining`; `runRate = used / capacity`), and total-order risk ranking (severity
  descending, then capacity gap descending).
- This mirrors the SAD section 6 shared state and will be replaced by the real
  `/api/runs` contract (SAD section 8) in a later Build step; the types stay the same
  view projection, so the swap is a services-layer change.

## 5. UX and status

- **Status banner** (`StatusBanner.tsx`): reports the single crew status "Crew:
  idle | running | done | error" with a colored pill (gray idle, blue running, green
  done, red error) and a "last updated" timestamp. Wording is shared with the buttons
  and inline messages via `STATUS_LABEL`. Uses `role="status"` with `aria-live="polite"`.
- **Controls** (`InputsPanel.tsx`): Run and Reset only. While running, the Run button
  reads "Running..." and is disabled, and the focus input and force-error toggle are
  disabled. A read-only note states the MVP uses the bundled synthetic dataset.
- **Inputs:** an optional free-text focus hint (passed to the stub, does not change the
  fixed results) and a "Force stub error" dev/testing checkbox. The error path can also
  be triggered by the `?forceError=1` query param.
- **Results** (`ResultsPanel.tsx`): idle prompt when no run; a running note; on success
  the DRAFT readout (draft status + summary + bullets, priority RAG rollup with
  evidence, capacity fit with gap/run-rate/remaining-vs-demand, ranked risks with
  owner and evidence). On error it shows an inline `role="alert"` message plus a
  **Retry** button that re-runs with the same inputs.
- **Stubbed HITL note:** on success the Results panel shows "Awaiting human approval
  (approve/edit/reject wired in a later module)" to stay faithful to the review
  surface. No approval logic is built yet.
- **History** (`HistoryList.tsx`): a session-only list of prior runs (runId, outcome,
  time). Preserved across Reset; not persisted across sessions.
- **Accessibility basics:** semantic headings (h1 page title, h2 per section via
  `aria-labelledby`), labeled controls (focus input and checkbox both have `<label>`),
  and aria-live regions on the status banner and the running/error messages.

## 6. How to run and verify

From `frontend/`:

```bash
npm install       # install dependencies
npm run dev        # local dev server (Vite)
npm run build      # tsc -b then vite build (production bundle)
npm test           # vitest run (headless)
```

Verified results (confirmed in this build):

- `npm run build` succeeded: TypeScript project build passed and Vite produced the
  production bundle (37 modules transformed, dist assets emitted).
- `npm test` passed: the happy-path test ("accepts input, calls the stubs, and renders
  the mock DRAFT readout") passed, 1 test file / 1 test green.

The happy-path test seeds a focus hint, clicks Run, waits for the stubbed readout, and
asserts the DRAFT narrative heading, the priority RAG section, a priority present in the
readout, the stubbed HITL note, and the History section.

## 7. Traceability

- **PRD user stories:** the app renders the DRAFT executive readout for **US-5**
  (draft summary + bullets labeled DRAFT, every figure traced to a source row via
  `sourceRef`/evidence) and presents it as the single-screen readout referenced by
  **US-6** (AC-6.1 presentation surface). The run flow surfaces the outputs of US-2
  (per-priority RAG), US-3 (capacity fit with numeric gap), and US-4 (ranked risks
  with evidence and owner) as computed upstream. The synthetic-dataset input note
  reflects US-1 scope.
- **SAD:** implements the frontend view shape and frontend stack decisions in SAD
  section 8 (React + TypeScript (Vite), thin client, idle -> running -> done (+ error)
  FSM, status banner, Run/Reset, inline error + Retry). Types are the view projection
  of the SAD section 6 shared state; mock values follow SAD section 7 rules; the run
  status vocabulary follows the SAD section 8 status mapping.
- **Stubbed vs real:** stubbed now are `startRun`/`getRunStatus` (fixed payload, no
  network) and the HITL review surface (note only, no approve/edit/reject logic).
  Real now are the FSM, the component tree, the status/error/Retry UX, the session
  history, and the accessibility basics.
- **Next Build step wires:** the real `/api/runs` contract (`POST /api/runs`,
  `GET /api/runs/{runId}`, `POST /api/runs/{runId}/decision`) in place of the stubs,
  and the HITL approve/edit/reject controls with the decision call.

## 8. Known gaps / next steps

- **Real backend integration:** replace the stub services with the SAD section 8
  `/api/runs` HTTP+JSON calls, including polling `GET /api/runs/{runId}` for the async
  pause and handling the `HALTED` diagnostic path in the UI.
- **HITL approval logic:** build the Approve / Edit (inline-editable draft) / Reject
  (with reason) controls and the idempotent decision call (PRD US-6, SAD section 8).
- **Streaming / progress detail:** the stub returns the full readout in one response.
  If the backend later streams tokens, the Results panel needs an incremental render
  path. Recorded as a traceability note below.
- **Richer error taxonomy:** current handling is a single inline message + Retry.
  Map the SAD JSON error envelope (`{ error: { code, message } }`) and distinguish 4xx
  vs 5xx and the `HALTED` diagnostic.
- **Advanced accessibility:** beyond the current semantic headings, labeled controls,
  and aria-live, add focus management on state transitions and a full keyboard/screen
  reader audit.

### Traceability notes (runtime constraints)

- Runtime `AAMAD_TARGET_RUNTIME=claude-agent-sdk` maps the HITL pause to a resumable
  session keyed by `runId` (SAD section 8). The UI reflects this with an
  `AWAITING_APPROVAL` status at the pause and a stubbed approval surface.
- Streaming is intentionally not implemented in the MVP UI. The stub returns the full
  readout in one response; a future streaming backend would require an incremental
  render path in the Results panel. Recorded here as a future note.
- Tool-call details and costs are out of scope for this UI.

## Sources

- `frontend-funcional-spec.md` (repo root): the functional contract this build follows.
- `frontend/` source: `package.json`, `src/App.tsx`, `src/state/runMachine.ts`,
  `src/services/mockCrew.ts`, `src/types.ts`, `src/components/*`, `src/index.css`,
  `src/App.test.tsx`.
- `project-context/1.define/prd.md`: US-1 through US-6, section 6 scope.
- `project-context/1.define/sad.md`: section 6 shared state, section 7 rules,
  section 8 API contract and frontend stack decision.
- Verified locally: `npm run build` and `npm test` output in this build.

## Assumptions

- The MVP always runs over the two synthetic CSV fixtures in `data/`; no live source is
  connected, consistent with PRD section 6 and SAD Assumptions.
- The stub payload values remain faithful to SAD section 7 rules; when the real backend
  replaces the stubs, the same `types.ts` view projection holds so only the services
  layer changes.
- The optional focus input is a forward-looking hint for the future backend and does not
  change the fixed MVP results.
- Styling uses a hand-written system-theme CSS file (per `aamad.config.yml` ui settings)
  rather than a CSS framework; this matches the "minimal visual style" decision in SAD
  section 8.

## Open Questions

- Final polling/streaming behavior for the async HITL pause once the real backend is
  wired (single response vs poll vs stream) - to confirm with `@integration.eng`.
- Exact error envelope surfacing in the UI (which codes map to which inline messages)
  once the SAD section 8 error contract is implemented.
- Whether edit-volume acceptance for the DRAFT (PRD Definition of Done) surfaces any UI
  affordance beyond the inline-editable draft in the HITL step.

## Audit

- 2026-08-08, frontend.eng, develop-fe, resolved AAMAD_TARGET_RUNTIME=claude-agent-sdk.
  Documented the implemented React + TypeScript (Vite) MVP UI for the single
  "Generate Program Readout" workflow: FSM (idle -> running -> done + error), stubbed
  `startRun`/`getRunStatus` services with a fixed SAD section 6 readout projection,
  status banner, Run/Reset controls, inline error + Retry, stubbed HITL note, session
  history, and accessibility basics. Verified `npm run build` succeeded and the
  happy-path Vitest test passed. Stubs and HITL approval logic remain to be wired to the
  real `/api/runs` contract (SAD section 8) in a later Build step. No features documented
  that are not present in the code.
