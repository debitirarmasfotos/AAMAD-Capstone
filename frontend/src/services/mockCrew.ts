// Temporary stub services for the "Generate Program Readout" workflow.
// No real backend and no network calls. This module is the ONLY services layer
// for the MVP and is designed to be swapped for the real /api/runs HTTP+JSON
// calls (SAD section 8) with the SAME frozen types in types.ts.
//
// It mimics the real async HITL pause: startRun acknowledges a run, then the
// client POLLS getRunStatus on an interval. The stub reports { pending: true }
// for a couple of polls (the running phase) before it returns AWAITING_APPROVAL
// (or HALTED). The payload mirrors the SAD section 6 shared state; the values
// are hand-computed from the synthetic fixtures in ../../data
// (mock_project_sheet.csv, mock_burn_capacity.csv).
//
// forceError is a CLIENT-ONLY dev switch that drives the HALTED demo path here
// in the stub. It is never placed in a live request body.
//
// Streaming, tool-call details, and costs are intentionally out of scope.

import type {
  DecisionRequest,
  DecisionResponse,
  Draft,
  PollResult,
  RunAck,
  RunInputs,
  RunResponse,
  StateSummary,
} from "../types";
import { assertDecisionResponse, assertRunResponse } from "./validateEnvelope";

const SIMULATED_DELAY_MS = 250;
// Number of "running" polls returned before the run reaches its HITL pause,
// so the running -> awaiting_approval (or running -> halted) transition is visible.
const POLLS_BEFORE_PAUSE = 2;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Per-run stub bookkeeping: how many times the client has polled and whether
// this run is on the forced HALTED demo path.
interface StubRunState {
  polls: number;
  halt: boolean;
}
const runs = new Map<string, StubRunState>();

// Fixed state summary derived from the synthetic dataset (SAD section 6 / 7).
// Priorities RAG: any At Risk -> Red; else any In Progress / Not Started -> Amber; all Complete -> Green.
// Workstream fit: remaining = capacity - used; no-fit when remaining < demand; gap = demand - remaining; runRate = used / capacity.
function buildStateSummary(): StateSummary {
  return {
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
  };
}

const DRAFT_SUMMARY =
  "Two of four priorities are Red (Campaign Engine, Governance & Compliance) driven by At Risk child tasks, and three of four workstreams are over capacity for remaining demand. Governance carries the largest shortfall and an At Risk consent item, making it the top intervention.";

const DRAFT_BULLETS = [
  "Priority RAG: Campaign Engine Red and Governance & Compliance Red (At Risk children); Customer Data Platform and Analytics & Reporting Amber.",
  "Capacity: 3 of 4 workstreams no-fit. Governance gap 600h, Campaign gap 400h, Customer Data Platform gap 200h; Analytics fits with 1300h remaining.",
  "Top risk: Governance & Compliance capacity breach (gap 600h) coinciding with an At Risk Consent management task, owner R. Nunez.",
  "Every figure traces to a source row (project sheet and burn/capacity fixtures).",
];

// Rendered Markdown readout the SAD section 8 draft payload carries.
function buildMarkdown(summary: string, bullets: string[]): string {
  const lines = ["# Program Readout (DRAFT)", "", summary, ""];
  for (const b of bullets) lines.push(`- ${b}`);
  return lines.join("\n");
}

function buildDraft(): Draft {
  return {
    status: "DRAFT",
    summary: DRAFT_SUMMARY,
    bullets: DRAFT_BULLETS,
    markdown: buildMarkdown(DRAFT_SUMMARY, DRAFT_BULLETS),
  };
}

// startRun stubs POST /api/runs. It acknowledges the run and returns immediately;
// the client then polls getRunStatus until the HITL pause.
export async function startRun(inputs: RunInputs = {}): Promise<RunAck> {
  await delay(SIMULATED_DELAY_MS);
  const runId = `run-${Date.now().toString(36)}`;
  // forceError is a client-only dev switch: it selects the HALTED demo path in
  // the stub. It is never forwarded to a live request body.
  runs.set(runId, { polls: 0, halt: Boolean(inputs.forceError) });
  return { runId, status: "running" };
}

// getRunStatus stubs GET /api/runs/{runId}. It reports pending for the first
// couple of polls (the running phase), then returns the frozen RunResponse
// envelope: AWAITING_APPROVAL with a draft + stateSummary, or HALTED with a
// diagnostic on the forced demo path. The envelope is validated at this
// boundary before it is trusted.
export async function getRunStatus(runId: string): Promise<PollResult> {
  await delay(SIMULATED_DELAY_MS);
  const st = runs.get(runId) ?? { polls: 0, halt: false };
  st.polls += 1;
  runs.set(runId, st);

  if (st.polls <= POLLS_BEFORE_PAUSE) {
    return { pending: true };
  }

  if (st.halt) {
    const response = assertRunResponse({
      runId,
      status: "HALTED",
      diagnostic: {
        failedWorkstream: "Capacity/Burn",
        reason: "Specialist failed after one idempotent retry; no DRAFT synthesized from partial data.",
      },
    });
    return { pending: false, response };
  }

  const response: RunResponse = assertRunResponse({
    runId,
    status: "AWAITING_APPROVAL",
    draft: buildDraft(),
    stateSummary: buildStateSummary(),
  });
  return { pending: false, response };
}

// submitDecision stubs POST /api/runs/{runId}/decision. approve and edit resolve
// to APPROVED with a final readout; reject resolves to REJECTED with no final
// output. The response is validated at this boundary.
export async function submitDecision(
  runId: string,
  request: DecisionRequest,
): Promise<DecisionResponse> {
  await delay(SIMULATED_DELAY_MS);

  if (request.action === "reject") {
    return assertDecisionResponse({ runId, status: "REJECTED" });
  }

  // approve or edit. On edit the operator's text is applied to the draft before
  // approval; the stub echoes it into the final markdown.
  const summary = DRAFT_SUMMARY;
  const bullets = DRAFT_BULLETS;
  const baseMarkdown = buildMarkdown(summary, bullets).replace(
    "# Program Readout (DRAFT)",
    "# Program Readout (APPROVED)",
  );
  const markdown =
    request.action === "edit" && request.edits
      ? request.edits
      : baseMarkdown;

  return assertDecisionResponse({
    runId,
    status: "APPROVED",
    finalReadout: { markdown },
  });
}
