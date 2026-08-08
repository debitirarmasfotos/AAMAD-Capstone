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
- `project-context/2.build/` - build artifacts: setup, frontend, backend, integration, QA (later)
- `project-context/3.deliver/` - deploy runbook (later)
- `data/` - synthetic project sheet + burn/capacity fixtures

## Status
Define phase complete; SAD drafted. Build phase next.
