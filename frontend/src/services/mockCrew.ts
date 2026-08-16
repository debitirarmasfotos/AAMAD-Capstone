// Stub services for the "Generate Program Readout" workflow.
// No real backend and no network calls: startRun and getRunStatus return FIXED
// mock payloads after a short simulated delay. The payload mirrors the SAD
// shared-state schema (sad.md section 6) and the values are computed by hand
// from the synthetic fixtures in ../../data (mock_project_sheet.csv,
// mock_burn_capacity.csv) so the demo stays faithful to the real dataset.
//
// Streaming, tool-call details, and costs are intentionally out of scope.

import type {
  GetRunStatusResult,
  ProgramReadout,
  RunInputs,
  StartRunResult,
} from "../types";

const SIMULATED_DELAY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fixed readout derived from the synthetic dataset.
// Priorities RAG (SAD section 7 rule: any At Risk -> Red; else any In Progress / Not Started -> Amber; all Complete -> Green).
// Workstream fit: remaining = capacity - used; no-fit when remaining < demand; gap = demand - remaining; runRate = used / capacity.
function buildReadout(runId: string, timestamp: string): ProgramReadout {
  return {
    runId,
    timestamp,
    status: "AWAITING_APPROVAL",
    priorities: [
      {
        name: "Customer Data Platform",
        rag: "Amber",
        ragEvidence: ["sheet:row5", "sheet:row6"],
        tasks: [
          { name: "Stand up data lake", owner: "A. Rivera", status: "Complete", due: "2026-06-15", sourceRef: "sheet:row3" },
          { name: "Ingest source systems", owner: "A. Rivera", status: "Complete", due: "2026-06-28", sourceRef: "sheet:row4" },
          { name: "Identity resolution rules", owner: "P. Osei", status: "In Progress", due: "2026-08-20", sourceRef: "sheet:row5" },
          { name: "Data quality monitoring", owner: "P. Osei", status: "Not Started", due: "2026-09-10", sourceRef: "sheet:row6" },
        ],
      },
      {
        name: "Campaign Engine",
        rag: "Red",
        ragEvidence: ["sheet:row10"],
        tasks: [
          { name: "Segment builder config", owner: "L. Tran", status: "Complete", due: "2026-07-05", sourceRef: "sheet:row8" },
          { name: "Journey templates", owner: "L. Tran", status: "In Progress", due: "2026-08-18", sourceRef: "sheet:row9" },
          { name: "Suppression rules", owner: "M. Klein", status: "At Risk", due: "2026-08-14", sourceRef: "sheet:row10" },
          { name: "Deliverability warm-up", owner: "M. Klein", status: "Not Started", due: "2026-09-01", sourceRef: "sheet:row11" },
        ],
      },
      {
        name: "Analytics & Reporting",
        rag: "Amber",
        ragEvidence: ["sheet:row14", "sheet:row15"],
        tasks: [
          { name: "KPI data model", owner: "S. Bauer", status: "Complete", due: "2026-07-12", sourceRef: "sheet:row13" },
          { name: "Executive dashboard", owner: "S. Bauer", status: "In Progress", due: "2026-08-25", sourceRef: "sheet:row14" },
          { name: "Attribution model", owner: "D. Ferro", status: "Not Started", due: "2026-09-20", sourceRef: "sheet:row15" },
        ],
      },
      {
        name: "Governance & Compliance",
        rag: "Red",
        ragEvidence: ["sheet:row18"],
        tasks: [
          { name: "Data access policy", owner: "R. Nunez", status: "Complete", due: "2026-06-30", sourceRef: "sheet:row17" },
          { name: "Consent management", owner: "R. Nunez", status: "At Risk", due: "2026-08-12", sourceRef: "sheet:row18" },
          { name: "Audit logging", owner: "J. Park", status: "In Progress", due: "2026-08-29", sourceRef: "sheet:row19" },
        ],
      },
    ],
    workstreams: [
      // remaining 1400 < demand 1600 -> no-fit, gap 200, runRate 0.65
      { name: "Customer Data Platform", capacity: 4000, used: 2600, remaining: 1400, demand: 1600, runRate: 0.65, gap: 200, fit: false, sourceRef: "burn:row2" },
      // remaining 900 < demand 1300 -> no-fit, gap 400, runRate 0.70
      { name: "Campaign Engine", capacity: 3000, used: 2100, remaining: 900, demand: 1300, runRate: 0.7, gap: 400, fit: false, sourceRef: "burn:row3" },
      // remaining 1300 >= demand 700 -> fit, gap 0, runRate 0.41
      { name: "Analytics & Reporting", capacity: 2200, used: 900, remaining: 1300, demand: 700, runRate: 0.41, gap: 0, fit: true, sourceRef: "burn:row4" },
      // remaining 300 < demand 900 -> no-fit, gap 600, runRate 0.83
      { name: "Governance & Compliance", capacity: 1800, used: 1500, remaining: 300, demand: 900, runRate: 0.83, gap: 600, fit: false, sourceRef: "burn:row5" },
    ],
    // Ranked severity desc, then capacity gap desc (SAD section 7 total order).
    risks: [
      {
        desc: "Governance & Compliance capacity breach: remaining 300h cannot cover 900h demand while Consent management is At Risk.",
        severity: "High",
        owner: "R. Nunez",
        evidence: ["burn:row5", "sheet:row18"],
        rank: 1,
        gap: 600,
      },
      {
        desc: "Campaign Engine capacity breach: remaining 900h short of 1300h demand while Suppression rules is At Risk.",
        severity: "High",
        owner: "M. Klein",
        evidence: ["burn:row3", "sheet:row10"],
        rank: 2,
        gap: 400,
      },
      {
        desc: "Customer Data Platform capacity breach: remaining 1400h short of 1600h demand as data quality work has not started.",
        severity: "Medium",
        owner: "P. Osei",
        evidence: ["burn:row2", "sheet:row6"],
        rank: 3,
        gap: 200,
      },
    ],
    draft: {
      status: "DRAFT",
      summary:
        "Two of four priorities are Red (Campaign Engine, Governance & Compliance) driven by At Risk child tasks, and three of four workstreams are over capacity for remaining demand. Governance carries the largest shortfall and an At Risk consent item, making it the top intervention.",
      bullets: [
        "Priority RAG: Campaign Engine Red and Governance & Compliance Red (At Risk children); Customer Data Platform and Analytics & Reporting Amber.",
        "Capacity: 3 of 4 workstreams no-fit. Governance gap 600h, Campaign gap 400h, Customer Data Platform gap 200h; Analytics fits with 1300h remaining.",
        "Top risk: Governance & Compliance capacity breach (gap 600h) coinciding with an At Risk Consent management task, owner R. Nunez.",
        "Every figure traces to a source row (project sheet and burn/capacity fixtures).",
      ],
    },
  };
}

// startRun stubs POST /api/runs. It returns a runId and the AWAITING_APPROVAL
// status (or throws on the forced error path for demo/testing).
export async function startRun(inputs: RunInputs = {}): Promise<StartRunResult> {
  await delay(SIMULATED_DELAY_MS);
  if (inputs.forceError) {
    throw new Error("Stub failure: the crew run could not be started (forced error path).");
  }
  const runId = `run-${Date.now().toString(36)}`;
  return { runId, status: "AWAITING_APPROVAL" };
}

// getRunStatus stubs GET /api/runs/{runId}. It returns the fixed readout that
// mirrors the SAD shared state, pausing at the HITL gate (AWAITING_APPROVAL).
export async function getRunStatus(runId: string): Promise<GetRunStatusResult> {
  await delay(SIMULATED_DELAY_MS);
  const readout = buildReadout(runId, new Date().toISOString());
  return { runId, status: readout.status, readout };
}
