// Inputs and Run control area for the "Generate Program Readout" workflow.
// The MVP always runs over the synthetic dataset (read-only note). The operator
// may type an optional focus hint, which is passed to the stub but does not
// change the fixed results. Run and Reset are the only controls.

import type { RunState } from "../state/runMachine";

interface InputsPanelProps {
  state: RunState;
  focus: string;
  onFocusChange: (value: string) => void;
  forceError: boolean;
  onForceErrorChange: (value: boolean) => void;
  onRun: () => void;
  onReset: () => void;
}

export function InputsPanel({
  state,
  focus,
  onFocusChange,
  forceError,
  onForceErrorChange,
  onRun,
  onReset,
}: InputsPanelProps) {
  // A run is active while running or awaiting the HITL decision.
  const isRunning = state === "running";
  const isActive = state === "running" || state === "awaiting_approval";

  return (
    <section aria-labelledby="inputs-heading" className="panel">
      <h2 id="inputs-heading">Inputs</h2>

      <p className="note">
        MVP runs over the bundled synthetic dataset (mock project sheet and burn/capacity file). No
        live data source is connected.
      </p>

      <div className="field">
        <label htmlFor="focus-input">Optional focus or criteria</label>
        <input
          id="focus-input"
          type="text"
          value={focus}
          placeholder="e.g. emphasize capacity risks"
          onChange={(e) => onFocusChange(e.target.value)}
          disabled={isRunning}
        />
      </div>

      <div className="field field--checkbox">
        <input
          id="force-error-toggle"
          type="checkbox"
          checked={forceError}
          onChange={(e) => onForceErrorChange(e.target.checked)}
          disabled={isRunning}
        />
        <label htmlFor="force-error-toggle">
          Force halted path (dev/testing: demonstrates the HALTED diagnostic)
        </label>
      </div>

      <div className="controls">
        <button type="button" onClick={onRun} disabled={isActive}>
          {isRunning ? "Running..." : "Run"}
        </button>
        <button type="button" className="secondary" onClick={onReset} disabled={isRunning}>
          Reset
        </button>
      </div>
    </section>
  );
}
