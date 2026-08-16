// Domain types for the PMO Program Intelligence Crew MVP UI.
// These mirror the SAD shared-state schema (sad.md section 6) and the
// /api/runs transport contract (sad.md section 8). They are the frontend
// view projection of the backend shared state, not a new schema.

// A pointer back to the source row that produced a figure (auditability, SAD section 9).
export type SourceRef = string;

// RAG rollup values (SAD section 7).
export type Rag = "Red" | "Amber" | "Green";

export type TaskStatus =
  | "Complete"
  | "In Progress"
  | "Not Started"
  | "At Risk";

export interface Task {
  name: string;
  owner: string;
  status: TaskStatus;
  due: string;
  sourceRef: SourceRef;
}

// A program priority with its per-priority RAG rollup and the child rows that drove it.
export interface Priority {
  name: string;
  tasks: Task[];
  rag: Rag;
  ragEvidence: SourceRef[];
}

// A workstream capacity-fit signal (SAD section 7).
// remaining = capacity - used; no-fit when remaining < demand; gap = demand - remaining (positive only on no-fit).
// runRate = used / capacity (MVP utilization figure).
export interface Workstream {
  name: string;
  capacity: number;
  used: number;
  remaining: number;
  demand: number;
  runRate: number;
  gap: number;
  fit: boolean;
  sourceRef: SourceRef;
}

// A ranked risk with evidence and suggested owner (SAD section 3 and 6).
export type RiskSeverity = "High" | "Medium" | "Low";

export interface Risk {
  desc: string;
  severity: RiskSeverity;
  owner: string;
  evidence: SourceRef[];
  rank: number;
  gap: number;
}

// The DRAFT executive narrative. status is DRAFT until the HITL gate records a decision.
export interface Draft {
  summary: string;
  bullets: string[];
  status: "DRAFT" | "APPROVED" | "REJECTED";
}

// Transport-level run status (SAD section 8 status mapping).
// AWAITING_APPROVAL maps to draft.status DRAFT.
export type RunStatus = "AWAITING_APPROVAL" | "APPROVED" | "REJECTED" | "HALTED";

// The readout payload returned by the stubbed run. It is a view projection of
// the shared-state programState (SAD section 6): priorities, workstreams, risks, draft.
export interface ProgramReadout {
  runId: string;
  timestamp: string;
  status: RunStatus;
  priorities: Priority[];
  workstreams: Workstream[];
  risks: Risk[];
  draft: Draft;
}

// Optional inputs the operator can pass to a run. The MVP always uses the
// synthetic dataset; focus is a free-text hint only and does not change results.
export interface RunInputs {
  focus?: string;
  // Dev/testing switch used to force the stub error path (see forceError toggle).
  forceError?: boolean;
}

// startRun contract (stub for POST /api/runs).
export interface StartRunResult {
  runId: string;
  status: RunStatus;
}

// getRunStatus contract (stub for GET /api/runs/{runId}).
// On success it returns the full readout; on the halt path it carries a diagnostic.
export interface GetRunStatusResult {
  runId: string;
  status: RunStatus;
  readout?: ProgramReadout;
  diagnostic?: { failedWorkstream: string; reason: string };
}
