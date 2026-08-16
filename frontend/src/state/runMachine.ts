// Tiny explicit finite-state machine for the "Generate Program Readout" run.
//
// States:   idle -> running -> done, plus an error state.
// Transitions:
//   RUN            idle | done | error -> running
//   RESOLVE (ok)   running            -> done
//   FAIL           running            -> error
//   RESET          any                -> idle
//
// This is intentionally a small reducer, not scattered booleans, so the
// crew status has one source of truth used by the banner, buttons, and
// inline messages.

import type { ProgramReadout, RunInputs } from "../types";

export type RunState = "idle" | "running" | "done" | "error";

export interface HistoryEntry {
  runId: string;
  timestamp: string;
  outcome: "done" | "error";
}

export interface RunModel {
  state: RunState;
  // The inputs of the current/most recent run, kept so Retry re-runs identically.
  inputs: RunInputs;
  readout: ProgramReadout | null;
  error: string | null;
  // Last time the machine changed state, so users can see the stubs responding.
  lastUpdated: string;
  history: HistoryEntry[];
}

export type RunEvent =
  | { type: "RUN"; inputs: RunInputs }
  | { type: "RESOLVE"; readout: ProgramReadout }
  | { type: "FAIL"; error: string }
  | { type: "RESET" };

export const initialRunModel: RunModel = {
  state: "idle",
  inputs: {},
  readout: null,
  error: null,
  lastUpdated: new Date().toISOString(),
  history: [],
};

// Consistent status wording reused by the banner, buttons, and messages.
export const STATUS_LABEL: Record<RunState, string> = {
  idle: "idle",
  running: "running",
  done: "done",
  error: "error",
};

export function runReducer(model: RunModel, event: RunEvent): RunModel {
  const now = new Date().toISOString();

  switch (event.type) {
    case "RUN": {
      // Allowed from idle, done, or error. Ignored while already running.
      if (model.state === "running") return model;
      return {
        ...model,
        state: "running",
        inputs: event.inputs,
        error: null,
        lastUpdated: now,
      };
    }

    case "RESOLVE": {
      // Only meaningful while running.
      if (model.state !== "running") return model;
      return {
        ...model,
        state: "done",
        readout: event.readout,
        error: null,
        lastUpdated: now,
        history: [
          { runId: event.readout.runId, timestamp: now, outcome: "done" },
          ...model.history,
        ],
      };
    }

    case "FAIL": {
      if (model.state !== "running") return model;
      return {
        ...model,
        state: "error",
        error: event.error,
        lastUpdated: now,
        history: [
          { runId: `error-${Date.now().toString(36)}`, timestamp: now, outcome: "error" },
          ...model.history,
        ],
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
