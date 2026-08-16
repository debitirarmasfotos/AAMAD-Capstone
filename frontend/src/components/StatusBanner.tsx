// Status banner shown at the top of the page. It reports the single crew
// status ("Crew: idle | running | done | error"), a colored status pill, and a
// "last updated" timestamp so users can see the stubs responding. The status
// wording is shared with the buttons and inline messages via STATUS_LABEL.

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
      {/* aria-live so screen readers announce state changes as the stubs respond. */}
      <span className="status-banner__text" role="status" aria-live="polite">
        Crew: <strong>{label}</strong>
      </span>
      <span className="status-banner__time">last updated {formatTime(lastUpdated)}</span>
    </div>
  );
}
