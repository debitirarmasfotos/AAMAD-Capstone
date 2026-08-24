// Explicit finite-state machine for the "Generate Program Readout" run.
//
// The client PHASES here are deliberately separate from the SERVER RunStatus in
// types.ts. AWAITING_APPROVAL is a first-class state so the HITL gate is a real
// stop, and HALTED is handled as its own terminal state.
//
// States:
//   idle -> running -> awaiting_approval -> (approved | rejected)
//   running -> halted
//   any transport/client failure -> error
//
// Transitions:
//   RUN            idle | approved | rejected | halted | error -> running
//   POLL_AWAITING  running            -> awaiting_approval   (poll returned the DRAFT)
//   POLL_HALTED    running            -> halted              (retry-then-halt path)
//   DECIDE_APPROVE awaiting_approval  -> awaiting_approval    (marks the decision in flight)
//   APPROVED       awaiting_approval  -> approved             (decision recorded)
//   DECIDE_REJECT  awaiting_approval  -> awaiting_approval    (marks the decision in flight)
//   REJECTED       awaiting_approval  -> rejected             (decision recorded, no final output)
//   FAIL           running | awaiting_approval -> error
//   RESET          any                -> idle                 (history preserved)
//
// The green "done"/approved state is NEVER entered while the draft is DRAFT or
// awaiting approval; awaiting_approval is its own amber state.

import type { Diagnostic, Draft, RunInputs, StateSummary } from "../types";

export type RunState =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "halted"
  | "error";

export interface HistoryEntry {
  runId: string;
  timestamp: string;
  outcome: "approved" | "rejected" | "halted" | "error";
}

export interface RunModel {
  state: RunState;
  // The inputs of the current/most recent run, kept so Retry re-runs identically.
  inputs: RunInputs;
  runId: string | null;
  // The DRAFT projection and state summary presented at the HITL gate.
  draft: Draft | null;
  stateSummary: StateSummary | null;
  // The final approved readout markdown (present after APPROVED).
  finalMarkdown: string | null;
  // The reason captured on reject (present after REJECTED).
  decisionReason: string | null;
  // The halt diagnostic (present in the halted state).
  diagnostic: Diagnostic | null;
  // True while a decision call is in flight, so controls can disable.
  deciding: boolean;
  error: string | null;
  // Last time the machine changed state, so users can see the run responding.
  lastUpdated: string;
  history: HistoryEntry[];
}

export type RunEvent =
  | { type: "RUN"; inputs: RunInputs }
  | { type: "POLL_AWAITING"; runId: string; draft: Draft; stateSummary?: StateSummary }
  | { type: "POLL_HALTED"; runId: string; diagnostic: Diagnostic }
  | { type: "DECIDE_APPROVE" }
  | { type: "APPROVED"; finalMarkdown?: string }
  | { type: "DECIDE_REJECT" }
  | { type: "REJECTED"; reason: string }
  | { type: "FAIL"; error: string }
  | { type: "RESET" };

export const initialRunModel: RunModel = {
  state: "idle",
  inputs: {},
  runId: null,
  draft: null,
  stateSummary: null,
  finalMarkdown: null,
  decisionReason: null,
  diagnostic: null,
  deciding: false,
  error: null,
  lastUpdated: new Date().toISOString(),
  history: [],
};

// Consistent status wording reused by the banner, buttons, and messages.
export const STATUS_LABEL: Record<RunState, string> = {
  idle: "idle",
  running: "running",
  awaiting_approval: "Awaiting your approval",
  approved: "approved",
  rejected: "rejected",
  halted: "halted",
  error: "error",
};

function historyEntry(model: RunModel, outcome: HistoryEntry["outcome"], now: string): HistoryEntry {
  return {
    runId: model.runId ?? `run-${Date.now().toString(36)}`,
    timestamp: now,
    outcome,
  };
}

export function runReducer(model: RunModel, event: RunEvent): RunModel {
  const now = new Date().toISOString();

  switch (event.type) {
    case "RUN": {
      // Allowed from any terminal or idle state. Ignored while already active.
      if (model.state === "running" || model.state === "awaiting_approval") return model;
      return {
        ...model,
        state: "running",
        inputs: event.inputs,
        runId: null,
        draft: null,
        stateSummary: null,
        finalMarkdown: null,
        decisionReason: null,
        diagnostic: null,
        deciding: false,
        error: null,
        lastUpdated: now,
      };
    }

    case "POLL_AWAITING": {
      if (model.state !== "running") return model;
      return {
        ...model,
        state: "awaiting_approval",
        runId: event.runId,
        draft: event.draft,
        stateSummary: event.stateSummary ?? null,
        lastUpdated: now,
      };
    }

    case "POLL_HALTED": {
      if (model.state !== "running") return model;
      return {
        ...model,
        state: "halted",
        runId: event.runId,
        diagnostic: event.diagnostic,
        lastUpdated: now,
        history: [historyEntry({ ...model, runId: event.runId }, "halted", now), ...model.history],
      };
    }

    case "DECIDE_APPROVE":
    case "DECIDE_REJECT": {
      // Mark a decision in flight without leaving the gate; controls disable.
      if (model.state !== "awaiting_approval") return model;
      return { ...model, deciding: true, lastUpdated: now };
    }

    case "APPROVED": {
      if (model.state !== "awaiting_approval") return model;
      return {
        ...model,
        state: "approved",
        deciding: false,
        finalMarkdown: event.finalMarkdown ?? (model.draft ? model.draft.markdown : null),
        draft: model.draft ? { ...model.draft, status: "APPROVED" } : null,
        lastUpdated: now,
        history: [historyEntry(model, "approved", now), ...model.history],
      };
    }

    case "REJECTED": {
      if (model.state !== "awaiting_approval") return model;
      return {
        ...model,
        state: "rejected",
        deciding: false,
        decisionReason: event.reason,
        draft: model.draft ? { ...model.draft, status: "REJECTED" } : null,
        lastUpdated: now,
        history: [historyEntry(model, "rejected", now), ...model.history],
      };
    }

    case "FAIL": {
      // Transport/client failure from running or from a decision call in flight.
      if (model.state !== "running" && model.state !== "awaiting_approval") return model;
      return {
        ...model,
        state: "error",
        deciding: false,
        error: event.error,
        lastUpdated: now,
        history: [historyEntry(model, "error", now), ...model.history],
      };
    }

    case "RESET": {
      return {
        ...initialRunModel,
        // Preserve the session history across a reset.
        history: model.history,
        lastUpdated: now,
      };
    }

    default:
      return model;
  }
}
