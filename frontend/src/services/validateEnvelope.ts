// Lightweight client-side validation of the frozen contract at the services
// boundary. No schema library is pulled in: these are small hand-written type
// guards that enforce the SAD section 8 envelope shape before the client trusts
// a payload. If the backend ever drifts from the frozen types, these throw at
// the boundary instead of letting a malformed shape reach the UI.

import type {
  DecisionResponse,
  Diagnostic,
  Draft,
  RunResponse,
  RunStatus,
} from "../types";

const SERVER_STATUSES: RunStatus[] = [
  "AWAITING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "HALTED",
];

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

function isDraft(x: unknown): x is Draft {
  if (!isRecord(x)) return false;
  return (
    typeof x.markdown === "string" &&
    typeof x.summary === "string" &&
    isStringArray(x.bullets) &&
    (x.status === "DRAFT" || x.status === "APPROVED" || x.status === "REJECTED")
  );
}

function isDiagnostic(x: unknown): x is Diagnostic {
  if (!isRecord(x)) return false;
  return typeof x.failedWorkstream === "string" && typeof x.reason === "string";
}

export function isRunResponse(x: unknown): x is RunResponse {
  if (!isRecord(x)) return false;
  if (typeof x.runId !== "string") return false;
  if (!SERVER_STATUSES.includes(x.status as RunStatus)) return false;

  // HALTED: diagnostic present, draft absent (SAD section 4 / 9).
  if (x.status === "HALTED") {
    return isDiagnostic(x.diagnostic) && x.draft === undefined;
  }

  // AWAITING_APPROVAL / APPROVED / REJECTED: a draft projection must be present.
  return isDraft(x.draft);
}

export function assertRunResponse(x: unknown): RunResponse {
  if (!isRunResponse(x)) {
    throw new Error("Contract violation: malformed RunResponse envelope.");
  }
  return x;
}

export function isDecisionResponse(x: unknown): x is DecisionResponse {
  if (!isRecord(x)) return false;
  if (typeof x.runId !== "string") return false;
  if (x.status !== "APPROVED" && x.status !== "REJECTED") return false;
  if (x.finalReadout === undefined) return true;
  return isRecord(x.finalReadout) && typeof x.finalReadout.markdown === "string";
}

export function assertDecisionResponse(x: unknown): DecisionResponse {
  if (!isDecisionResponse(x)) {
    throw new Error("Contract violation: malformed DecisionResponse envelope.");
  }
  return x;
}
