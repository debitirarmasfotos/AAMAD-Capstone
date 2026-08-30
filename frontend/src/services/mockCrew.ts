import type {
  DecisionRequest,
  DecisionResponse,
  PollResult,
  RunAck,
  RunInputs,
  RunResponse,
} from "../types";
import { assertDecisionResponse, assertRunResponse } from "./validateEnvelope";

const API_BASE_URL = (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error?: { message?: string } }).error?.message ?? "Request failed.")
      : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export async function startRun(inputs: RunInputs = {}): Promise<RunAck> {
  const payload: Record<string, unknown> = {};
  if (typeof inputs.focus === "string" && inputs.focus.trim()) {
    payload.focus = inputs.focus.trim();
  }
  if (typeof inputs.top_n === "number") {
    payload.top_n = inputs.top_n;
  }

  const response = await apiFetch<RunResponse>("/api/runs", {
    method: "POST",
    body: Object.keys(payload).length === 0 ? undefined : JSON.stringify(payload),
  });

  return { runId: response.runId, status: "running" };
}

export async function getRunStatus(runId: string): Promise<PollResult> {
  const response = await apiFetch<RunResponse>(`/api/runs/${encodeURIComponent(runId)}`);
  const validated = assertRunResponse(response);

  if (validated.status === "AWAITING_APPROVAL" || validated.status === "HALTED") {
    return { pending: false, response: validated };
  }

  return { pending: true };
}

export async function submitDecision(
  runId: string,
  request: DecisionRequest,
): Promise<DecisionResponse> {
  const payload: Record<string, unknown> = { action: request.action };
  if (typeof request.edits === "string" && request.edits.trim()) {
    payload.edits = request.edits;
  }
  if (typeof request.reason === "string" && request.reason.trim()) {
    payload.reason = request.reason.trim();
  }

  const response = await apiFetch<DecisionResponse>(`/api/runs/${encodeURIComponent(runId)}/decision`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return assertDecisionResponse(response);
}
