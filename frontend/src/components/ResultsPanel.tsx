// Results panel. Renders the DRAFT executive readout (draft narrative, RAG
// rollup, capacity fit, ranked risks) from the frozen stateSummary + draft
// projection, and hosts the HITL decision controls.
//
// The Approve / Edit / Reject controls are shown ONLY while the run is
// awaiting_approval. Approve submits action "approve"; Edit reveals a textarea
// prefilled with the draft markdown and submits action "edit"; Reject requires a
// reason and submits action "reject". All wiring is a thin pass-through to the
// services layer; no business logic lives here.

import { useState } from "react";
import type { RunState } from "../state/runMachine";
import type { Diagnostic, Draft, StateSummary } from "../types";

interface ResultsPanelProps {
  state: RunState;
  draft: Draft | null;
  stateSummary: StateSummary | null;
  finalMarkdown: string | null;
  decisionReason: string | null;
  diagnostic: Diagnostic | null;
  deciding: boolean;
  error: string | null;
  onApprove: () => void;
  onEdit: (edits: string) => void;
  onReject: (reason: string) => void;
  onRetry: () => void;
}

function ragClass(rag: string): string {
  return `rag rag--${rag.toLowerCase()}`;
}

// Renders the readout body shared by the awaiting_approval and approved states.
function ReadoutBody({
  draft,
  stateSummary,
}: {
  draft: Draft;
  stateSummary: StateSummary | null;
}) {
  return (
    <div className="readout">
      <h3>Draft executive readout</h3>
      <p className="draft-status">Status: {draft.status}</p>
      <p>{draft.summary}</p>
      <ul>
        {draft.bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>

      {stateSummary && (
        <>
          <h3>Priority RAG rollup</h3>
          <ul className="rag-list">
            {stateSummary.priorities.map((p) => (
              <li key={p.name}>
                <span className={ragClass(p.rag)}>{p.rag}</span> {p.name}
                <span className="evidence"> (evidence: {p.ragEvidence.join(", ")})</span>
              </li>
            ))}
          </ul>

          <h3>Capacity fit</h3>
          <ul className="capacity-list">
            {stateSummary.workstreams.map((w) => (
              <li key={w.name}>
                <strong>{w.name}</strong>: {w.fit ? "fit" : "no-fit"}
                {!w.fit && ` (gap ${w.gap}h)`} - run-rate {Math.round(w.runRate * 100)}% -
                remaining {w.remaining}h vs demand {w.demand}h
              </li>
            ))}
          </ul>

          <h3>Ranked risks</h3>
          <ol className="risk-list">
            {stateSummary.risks.map((r) => (
              <li key={r.rank}>
                <strong>{r.severity}</strong>: {r.desc} - owner {r.owner}
                <span className="evidence"> (evidence: {r.evidence.join(", ")})</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

// The HITL decision controls, shown only while awaiting_approval.
function DecisionControls({
  draft,
  deciding,
  onApprove,
  onEdit,
  onReject,
}: {
  draft: Draft;
  deciding: boolean;
  onApprove: () => void;
  onEdit: (edits: string) => void;
  onReject: (reason: string) => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState(draft.markdown || draft.summary);
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState("");

  const reasonValid = reason.trim().length > 0;

  return (
    <div className="hitl">
      <div className="hitl-note" role="note">
        Awaiting your approval. Review the DRAFT, then approve, edit, or reject.
      </div>

      <div className="hitl-controls">
        <button type="button" onClick={onApprove} disabled={deciding}>
          Approve
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setRejectMode(false);
            setEditMode((v) => !v);
          }}
          disabled={deciding}
        >
          Edit
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setEditMode(false);
            setRejectMode((v) => !v);
          }}
          disabled={deciding}
        >
          Reject
        </button>
      </div>

      {editMode && (
        <div className="hitl-edit">
          <label htmlFor="edit-draft">Edit the draft readout</label>
          <textarea
            id="edit-draft"
            rows={8}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            disabled={deciding}
          />
          <button type="button" onClick={() => onEdit(editText)} disabled={deciding}>
            Submit edits and approve
          </button>
        </div>
      )}

      {rejectMode && (
        <div className="hitl-reject">
          <label htmlFor="reject-reason">Reason for rejection (required)</label>
          <input
            id="reject-reason"
            type="text"
            value={reason}
            placeholder="e.g. capacity figures need a source check"
            onChange={(e) => setReason(e.target.value)}
            disabled={deciding}
          />
          <button
            type="button"
            onClick={() => onReject(reason.trim())}
            disabled={deciding || !reasonValid}
          >
            Submit rejection
          </button>
        </div>
      )}
    </div>
  );
}

export function ResultsPanel({
  state,
  draft,
  stateSummary,
  finalMarkdown,
  decisionReason,
  diagnostic,
  deciding,
  error,
  onApprove,
  onEdit,
  onReject,
  onRetry,
}: ResultsPanelProps) {
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

      {state === "halted" && diagnostic && (
        <div className="error-box" role="alert">
          <p>
            Run halted on <strong>{diagnostic.failedWorkstream}</strong>: {diagnostic.reason}
          </p>
          <p className="note">
            No DRAFT is synthesized from partial data (SAD section 4 / 9).
          </p>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {state === "awaiting_approval" && draft && (
        <div>
          <ReadoutBody draft={draft} stateSummary={stateSummary} />
          <DecisionControls
            draft={draft}
            deciding={deciding}
            onApprove={onApprove}
            onEdit={onEdit}
            onReject={onReject}
          />
        </div>
      )}

      {state === "approved" && draft && (
        <div>
          <div className="hitl-note hitl-note--approved" role="note">
            Approved. This readout is now final.
          </div>
          <ReadoutBody draft={draft} stateSummary={stateSummary} />
          {finalMarkdown && (
            <details className="final-markdown">
              <summary>Final readout (Markdown)</summary>
              <pre>{finalMarkdown}</pre>
            </details>
          )}
        </div>
      )}

      {state === "rejected" && (
        <div className="error-box" role="alert">
          <p>
            Rejected. No output is marked final.
            {decisionReason ? ` Reason: ${decisionReason}` : ""}
          </p>
        </div>
      )}
    </section>
  );
}
