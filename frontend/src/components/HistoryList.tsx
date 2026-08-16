// Small History list of prior runs in the current session. This is in-session
// only (no persistence): persistent run history is out of scope for the MVP
// per the PRD/SAD. It exists so the demo shows the stubs producing distinct runs.

import type { HistoryEntry } from "../state/runMachine";

interface HistoryListProps {
  history: HistoryEntry[];
}

export function HistoryList({ history }: HistoryListProps) {
  return (
    <section aria-labelledby="history-heading" className="panel">
      <h2 id="history-heading">History</h2>
      {history.length === 0 ? (
        <p className="note">No runs yet this session.</p>
      ) : (
        <ul className="history-list">
          {history.map((h, i) => (
            <li key={`${h.runId}-${i}`}>
              <code>{h.runId}</code> - {h.outcome} -{" "}
              {new Date(h.timestamp).toLocaleTimeString()}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
