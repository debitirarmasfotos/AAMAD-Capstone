// Single-route app for the "Generate Program Readout" workflow. One page holds
// the status banner, Inputs + Run controls, the Results panel, and the session
// History list. All state flows through the explicit FSM in state/runMachine.ts,
// and the crew is stubbed by services/mockCrew.ts (no backend, no network).

import { useReducer, useState } from "react";
import { InputsPanel } from "./components/InputsPanel";
import { ResultsPanel } from "./components/ResultsPanel";
import { HistoryList } from "./components/HistoryList";
import { StatusBanner } from "./components/StatusBanner";
import { getRunStatus, startRun } from "./services/mockCrew";
import { initialRunModel, runReducer } from "./state/runMachine";
import type { RunInputs } from "./types";

// A run can also be forced into the error path via a ?forceError=1 query param,
// in addition to the dev checkbox, so the error path is easy to demonstrate.
function errorFromQuery(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("forceError") === "1";
}

export default function App() {
  const [model, dispatch] = useReducer(runReducer, initialRunModel);
  const [focus, setFocus] = useState("");
  const [forceError, setForceError] = useState(errorFromQuery());

  // Drives the FSM: RUN -> call stubs -> RESOLVE or FAIL. Used by both Run and Retry.
  async function executeRun(inputs: RunInputs) {
    dispatch({ type: "RUN", inputs });
    try {
      const started = await startRun(inputs);
      const status = await getRunStatus(started.runId);
      if (!status.readout) {
        throw new Error(
          status.diagnostic
            ? `Run halted on ${status.diagnostic.failedWorkstream}: ${status.diagnostic.reason}`
            : "Run returned no readout.",
        );
      }
      dispatch({ type: "RESOLVE", readout: status.readout });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown stub failure.";
      dispatch({ type: "FAIL", error: message });
    }
  }

  function handleRun() {
    void executeRun({ focus: focus.trim() || undefined, forceError });
  }

  // Retry re-runs with the SAME inputs captured in the FSM model.
  function handleRetry() {
    void executeRun(model.inputs);
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
        readout={model.readout}
        error={model.error}
        onRetry={handleRetry}
      />

      <HistoryList history={model.history} />
    </main>
  );
}
