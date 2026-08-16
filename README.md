# PMO Program Intelligence Crew

Capstone for the "Become an Agentic Architect" course (AAMAD framework).

A multi-agent application that turns program data into a review-ready executive
readout - per-priority RAG rollup, capacity-vs-demand fit, and a ranked risk list -
with a mandatory human approval gate (HITL) before any output is treated as final.

## At a glance
- **Runtime:** `AAMAD_TARGET_RUNTIME=claude-agent-sdk`
- **End-user persona:** program manager
- **Data:** synthetic / mock only (see `data/`) - no client or production data
- **Coordination:** hybrid - parallel analysis, sequential synthesis, supervisor, HITL gate

## Layout
- `project-context/1.define/` - system-description, MRD, PRD, SAD (per AAMAD 0.7.5 Define layout)
- `project-context/2.build/` - build artifacts: frontend (done), plus setup, backend, integration, QA (later)
- `project-context/3.deliver/` - deploy runbook (later)
- `frontend/` - React + TypeScript (Vite) MVP UI for the "Generate Program Readout" workflow
- `frontend-funcional-spec.md` - frontend functional spec (Inputs, Run, Results, History, Contracts)
- `data/` - synthetic project sheet + burn/capacity fixtures

## Frontend (MVP)

A minimal React + TypeScript (Vite) app for the single "Generate Program Readout"
workflow. It runs on stubbed services today (no backend yet): an `idle -> running -> done`
(plus `error`) state machine, a status banner with a colored pill and last-updated
timestamp, Run and Reset controls, and an inline error state with Retry. The stubbed
readout mirrors the SAD shared-state shape and will be wired to the real `/api/runs`
crew in a later Build step. Implementation notes: `project-context/2.build/frontend.md`.

Run locally:

```bash
cd frontend
npm install      # first time only
npm run dev      # open the localhost URL Vite prints (append ?forceError=1 to demo the error path)
npm run build    # production build
npm test         # happy-path test
```

**Demo video:** _TODO - paste your Loom or uploaded video link here._

## Status
Define phase complete (MRD, PRD, SAD). Build phase in progress: frontend MVP scaffold
done (stubbed); backend crew, integration, and QA next.
