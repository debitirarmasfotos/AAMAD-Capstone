// Status banner shown at the top of the page. This page is a run client (not a
// five-agent chat), so the copy reads "Run status:" rather than "Crew:". It
// shows a colored status pill, the current run phase, and a "last updated"
// timestamp. The status wording is shared with buttons and messages via
// STATUS_LABEL. The pill colors: idle gray, running blue, awaiting amber,
// approved green, rejected neutral, halted red, error red.

import type { RunState } from "../state/runMachine";
import { STATUS_LABEL } from "../state/runMachine";

interface StatusBannerProps {
  state: RunState;
  lastUpdated: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function StatusBanner({ state, lastUpdated }: StatusBannerProps) {
  const label = STATUS_LABEL[state];
  return (
    <div className="status-banner" data-state={state}>
      <span className={`status-pill status-pill--${state}`} aria-hidden="true" />
      {/* aria-live so screen readers announce phase changes as the run responds. */}
      <span className="status-banner__text" role="status" aria-live="polite">
        Run status: <strong>{label}</strong>
      </span>
      <span className="status-banner__time">last updated {formatTime(lastUpdated)}</span>
    </div>
  );
}
