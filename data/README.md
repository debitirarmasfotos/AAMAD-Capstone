# Synthetic data - PMO Program Intelligence Crew

Fully fictional fixtures for the capstone MVP. No real client, program, or person.
Two source files the Ingestion agent reads:

## mock_project_sheet.csv
A project sheet with parent priorities and child tasks. Parent rows have no Status;
the Status Rollup agent derives each priority's RAG by rolling up its children.
- Status values: Complete, In Progress, At Risk, Not Started.
- Rollup rule for the MVP: any child `At Risk` -> priority is Red/at-risk;
  else any `In Progress`/`Not Started` -> Amber; all `Complete` -> Green.

## mock_burn_capacity.csv
Effort by workstream: Capacity, Used, and Remaining Demand hours. The Capacity/Burn
agent computes remaining capacity (Capacity - Used) and compares to Remaining Demand
to produce a fit / no-fit signal.

## Intentional signals (so the crew has something to find)
These are seeded on purpose so the demo produces a non-trivial readout:
- **At-risk tasks:** Campaign Engine > Suppression rules; Governance & Compliance >
  Consent management -> should surface as Red priorities with cited child rows.
- **Capacity no-fit:** Governance & Compliance (remaining capacity 300 vs demand 900),
  Campaign Engine (900 vs 1300), and Customer Data Platform (1400 vs 1600) -> the
  Capacity agent flags no-fit; the Risk agent should rank Governance highest (largest gap).
- **Clean fit:** Analytics & Reporting (remaining capacity 1300 vs demand 700) -> no flag,
  proving the crew does not over-report.

## To extend
Add rows to either CSV. Because ingestion is behind a source-agnostic interface, a
later live connector (Slack risk feed, PM API) can replace these files without changing
any downstream agent.
