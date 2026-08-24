// FROZEN contract types for the PMO Program Intelligence Crew MVP UI.
//
// These are the authoritative shapes the backend MUST satisfy. They mirror the
// SAD section 8 transport contract (/api/runs, GET poll, /decision) and the SAD
// section 6 shared-state projection. This file is the contract the frontend
// already consumes, frozen before the backend is built, so the backend
// implements an envelope the client can read without change.
//
// Note the split: RunStatus below is the set of SERVER statuses. The client-only
// run phases (idle, running, awaiting_approval, approved, rejected, halted,
// error) live in state/runMachine.ts and are intentionally kept separate.

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

// A typed projection of the SAD section 6 shared state for the PMO panels.
// Field names are preserved exactly so the Results panel renders unchanged.
export interface StateSummary {
  priorities: Priority[];
  workstreams: Workstream[];
  risks: Risk[];
}

// The DRAFT executive narrative. status is DRAFT until the HITL gate records a
// decision. markdown is the rendered readout the SAD section 8 draft payload carries.
export interface Draft {
  markdown: string;
  summary: string;
  bullets: string[];
  status: "DRAFT" | "APPROVED" | "REJECTED";
}

// A halt diagnostic (SAD section 4 / 9 retry-then-halt path).
export interface Diagnostic {
  failedWorkstream: string;
  reason: string;
}

// Server run status (SAD section 8 status mapping). These are the ONLY server
// statuses. AWAITING_APPROVAL maps to draft.status DRAFT; HALTED reports the
// retry-then-halt failure path where no DRAFT is synthesized.
export type RunStatus = "AWAITING_APPROVAL" | "APPROVED" | "REJECTED" | "HALTED";

// RunResponse: the envelope from POST /api/runs and GET /api/runs/{runId}.
// When status is HALTED, diagnostic is present and draft is absent.
export interface RunResponse {
  runId: string;
  status: RunStatus;
  draft?: Draft;
  stateSummary?: StateSummary;
  diagnostic?: Diagnostic;
}

// DecisionRequest: the body of POST /api/runs/{runId}/decision.
export interface DecisionRequest {
  action: "approve" | "edit" | "reject";
  edits?: string;
  reason?: string;
}

// DecisionResponse: the response from POST /api/runs/{runId}/decision.
export interface DecisionResponse {
  runId: string;
  status: "APPROVED" | "REJECTED";
  finalReadout?: { markdown: string };
}

// JSON error envelope (SAD section 8): 4xx invalid input, 5xx runtime failure.
export interface ErrorEnvelope {
  error: { code: string; message: string };
}

// Optional client inputs the operator can pass to a run. The MVP always uses the
// synthetic dataset. focus and top_n are optional client-side hints only; they
// carry no business logic. forceError is a client-only dev switch that drives the
// stub HALTED demo path and is NEVER included in a live request body.
export interface RunInputs {
  focus?: string;
  top_n?: number;
  forceError?: boolean;
}

// Run acknowledgement returned by the stub startRun (models POST /api/runs
// accepting a run before the async HITL pause). status "running" is a
// client-side phase, not a server RunStatus.
export interface RunAck {
  runId: string;
  status: "running";
}

// Poll envelope for the stub getRunStatus. A real GET /api/runs/{runId} returns
// a RunResponse once the run reaches a HITL-relevant status; while the crew is
// still working the stub reports { pending: true } so the client stays in its
// running phase and the running -> awaiting transition is observable.
export type PollResult =
  | { pending: true }
  | { pending: false; response: RunResponse };
