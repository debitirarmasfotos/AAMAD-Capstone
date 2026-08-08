# System Description: PMO Program Intelligence Crew

## Problem
Large, multi-workstream transformation programs run their weekly executive rhythm
on manual labor. A program manager pulls task status from a project sheet,
reconciles effort-burn and capacity against demand, scans for governance and
delivery risks, and hand-assembles an executive readout. The work spans four
distinct domains, and a single wrong figure on an executive slide carries real
cost. A single generalist agent handles this poorly under load.

## Users
- Primary: Program manager (end user) who owns and signs the weekly executive readout.
- Secondary: PMO analyst who prepares source data; executive sponsor who consumes it.

## Goal
Produce a review-ready executive status summary - per-priority RAG status,
capacity-vs-demand fit signal, and a ranked risk/watchlist - from source program
data, with a human approving before anything is treated as final.

## Scope (MVP)
- Operates on SANITIZED / SYNTHETIC program data only (no client-confidential inputs).
- One source dataset (mock project sheet + mock burn/capacity file), read through a
  source-agnostic ingestion interface.
- Output: a structured status summary + draft executive bullets. NO auto-publish.

## Out of scope (MVP)
- Live connection to a production project-management system or Slack.
- Automatic distribution of the readout (email/deck publish).
- Multi-program / portfolio rollup.

## Success criteria
- Crew produces a status summary a program manager would accept with minor edits.
- Every RAG status and risk flag is traceable to a source row (auditable).
- The workflow halts for human approval before marking output final (HITL).
