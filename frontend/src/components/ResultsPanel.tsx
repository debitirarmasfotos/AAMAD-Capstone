// Results panel. Renders the DRAFT executive readout returned by the stub:
// per-priority RAG rollup, capacity fit signals, ranked risks, and the draft
// narrative. Includes a clearly stubbed HITL note to stay faithful to the
// product's review surface; the approve/edit/reject logic is not built here.
//
// While running it shows a lightweight progress line; on error it shows an
// inline message with a Retry button that re-runs with the SAME inputs.

import type { RunState } from "../state/runMachine";
import type { ProgramReadout } from "../types";

interface ResultsPanelProps {
  state: RunState;
  readout: ProgramReadout | null;
  error: string | null;
  onRetry: () => void;
}

function ragClass(rag: string): string {
  return `rag rag--${rag.toLowerCase()}`;
}

export function ResultsPanel({ state, readout, error, onRetry }: ResultsPanelProps) {
  return (
    <section aria-labelledby="results-heading" className="panel">
      <h2 id="results-heading">Results</h2>

      {state === "idle" && (
        <p className="note">Run the crew to generate a DRAFT program readout.</p>
      )}

      {state === "running" && (
        <p className="note" role="status" aria-live="polite">
          Running the crew over the synthetic dataset...
        </p>
      )}

      {state === "error" && (
        <div className="error-box" role="alert">
          <p>Run failed: {error}</p>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {state === "done" && readout && (
        <div className="readout">
          <p className="meta">
            Run <code>{readout.runId}</code> - status {readout.status} -{" "}
            {new Date(readout.timestamp).toLocaleString()}
          </p>

          <div className="hitl-note" role="note">
            Awaiting human approval (approve/edit/reject wired in a later module).
          </div>

          <h3>Draft executive readout</h3>
          <p className="draft-status">Status: {readout.draft.status}</p>
          <p>{readout.draft.summary}</p>
          <ul>
            {readout.draft.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>

          <h3>Priority RAG rollup</h3>
          <ul className="rag-list">
            {readout.priorities.map((p) => (
              <li key={p.name}>
                <span className={ragClass(p.rag)}>{p.rag}</span> {p.name}
                <span className="evidence"> (evidence: {p.ragEvidence.join(", ")})</span>
              </li>
            ))}
          </ul>

          <h3>Capacity fit</h3>
          <ul className="capacity-list">
            {readout.workstreams.map((w) => (
              <li key={w.name}>
                <strong>{w.name}</strong>: {w.fit ? "fit" : "no-fit"}
                {!w.fit && ` (gap ${w.gap}h)`} - run-rate {Math.round(w.runRate * 100)}% -
                remaining {w.remaining}h vs demand {w.demand}h
              </li>
            ))}
          </ul>

          <h3>Ranked risks</h3>
          <ol className="risk-list">
            {readout.risks.map((r) => (
              <li key={r.rank}>
                <strong>{r.severity}</strong>: {r.desc} - owner {r.owner}
                <span className="evidence"> (evidence: {r.evidence.join(", ")})</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
