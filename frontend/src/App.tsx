// Single-route app for the "Generate Program Readout" workflow. One page holds
// the status banner, Inputs + Run controls, the Results panel (with the HITL
// decision controls), and the session History list. All state flows through the
// explicit FSM in state/runMachine.ts. The crew is stubbed by
// services/mockCrew.ts (no backend, no network) via a poll loop that mimics the
// real async HITL pause. mockCrew.ts is the temporary services layer, to be
// swapped for the real /api/runs calls using the SAME frozen types.

import { useReducer, useState } from "react";
import { InputsPanel } from "./components/InputsPanel";
import { ResultsPanel } from "./components/ResultsPanel";
import { HistoryList } from "./components/HistoryList";
import { StatusBanner } from "./components/StatusBanner";
import { getRunStatus, startRun, submitDecision } from "./services/mockCrew";
import { initialRunModel, runReducer } from "./state/runMachine";
import type { RunInputs } from "./types";

// Safety bound on the poll loop so a stub that never pauses cannot spin forever.
const MAX_POLLS = 12;

// The HALTED demo path can also be forced via a ?forceError=1 query param, in
// addition to the dev checkbox, so it is easy to demonstrate. It is a client
// switch only and never appears in a live request body.
function errorFromQuery(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("forceError") === "1";
}

export default function App() {
  const [model, dispatch] = useReducer(runReducer, initialRunModel);
  const [focus, setFocus] = useState("");
  const [forceError, setForceError] = useState(errorFromQuery());

  // Drives the FSM: RUN -> ack -> POLL until the HITL pause -> POLL_AWAITING or
  // POLL_HALTED. Transport/client failures go to FAIL. Used by Run and Retry.
  async function executeRun(inputs: RunInputs) {
    dispatch({ type: "RUN", inputs });
    try {
      const ack = await startRun(inputs);

      for (let i = 0; i < MAX_POLLS; i++) {
        const poll = await getRunStatus(ack.runId);
        if (poll.pending) continue;

        const res = poll.response;
        if (res.status === "HALTED" && res.diagnostic) {
          dispatch({ type: "POLL_HALTED", runId: res.runId, diagnostic: res.diagnostic });
          return;
        }
        if (res.status === "AWAITING_APPROVAL" && res.draft) {
          dispatch({
            type: "POLL_AWAITING",
            runId: res.runId,
            draft: res.draft,
            stateSummary: res.stateSummary,
          });
          return;
        }
        // Any other status at the pause is a contract surprise; fail loudly.
        throw new Error(`Unexpected run status at pause: ${res.status}`);
      }
      throw new Error("Run did not reach the HITL pause within the poll budget.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown stub failure.";
      dispatch({ type: "FAIL", error: message });
    }
  }

  function handleRun() {
    // top_n is kept as an optional client hint only; not wired into the stub body.
    void executeRun({ focus: focus.trim() || undefined, forceError });
  }

  // Retry re-runs with the SAME inputs captured in the FSM model.
  function handleRetry() {
    void executeRun(model.inputs);
  }

  async function handleApprove() {
    if (!model.runId) return;
    dispatch({ type: "DECIDE_APPROVE" });
    try {
      const res = await submitDecision(model.runId, { action: "approve" });
      dispatch({ type: "APPROVED", finalMarkdown: res.finalReadout?.markdown });
    } catch (err) {
      dispatch({ type: "FAIL", error: err instanceof Error ? err.message : "Decision failed." });
    }
  }

  async function handleEdit(edits: string) {
    if (!model.runId) return;
    // Edit is submitted as action "edit"; the stub treats it as approved.
    dispatch({ type: "DECIDE_APPROVE" });
    try {
      const res = await submitDecision(model.runId, { action: "edit", edits });
      dispatch({ type: "APPROVED", finalMarkdown: res.finalReadout?.markdown });
    } catch (err) {
      dispatch({ type: "FAIL", error: err instanceof Error ? err.message : "Decision failed." });
    }
  }

  async function handleReject(reason: string) {
    if (!model.runId) return;
    dispatch({ type: "DECIDE_REJECT" });
    try {
      await submitDecision(model.runId, { action: "reject", reason });
      dispatch({ type: "REJECTED", reason });
    } catch (err) {
      dispatch({ type: "FAIL", error: err instanceof Error ? err.message : "Decision failed." });
    }
  }

  function handleReset() {
    dispatch({ type: "RESET" });
    setFocus("");
    setForceError(false);
  }

  return (
    <main className="app">
      <header>
        <h1>PMO Program Intelligence Crew</h1>
        <p className="subtitle">Generate Program Readout (MVP, stubbed)</p>
        <StatusBanner state={model.state} lastUpdated={model.lastUpdated} />
      </header>

      <InputsPanel
        state={model.state}
        focus={focus}
        onFocusChange={setFocus}
        forceError={forceError}
        onForceErrorChange={setForceError}
        onRun={handleRun}
        onReset={handleReset}
      />

      <ResultsPanel
        state={model.state}
        draft={model.draft}
        stateSummary={model.stateSummary}
        finalMarkdown={model.finalMarkdown}
        decisionReason={model.decisionReason}
        diagnostic={model.diagnostic}
        deciding={model.deciding}
        error={model.error}
        onApprove={handleApprove}
        onEdit={handleEdit}
        onReject={handleReject}
        onRetry={handleRetry}
      />

      <HistoryList history={model.history} />
    </main>
  );
}
