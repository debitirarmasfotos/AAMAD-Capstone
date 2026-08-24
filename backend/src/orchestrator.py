"""Run orchestration (the CrewAI-Flow role, expressed as a Python coordinator).

run_readout wires the deterministic steps then the Narrative crew:

    fetch (ingestion) -> compute (analysis) -> Narrative (LLM) -> RunResponse

Failure policy (SAD section 4 / 9): each step gets exactly ONE idempotent retry.
If it still fails, the run HALTS with a Diagnostic naming the failed step and NO
draft is returned (never fabricate a partial readout). If OPENAI_API_KEY is
missing or a placeholder, the Narrative step raises MissingApiKeyError so the
API can return 503 - the deterministic compute may run, but no draft is
fabricated without the model.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Any, Callable, Dict, Optional, TypeVar

from .compute import compute_program_state
from .models import Draft, Diagnostic, RunResponse, StateSummary
from .source import ProgramSource

logger = logging.getLogger("pmo.orchestrator")

T = TypeVar("T")

# Placeholder values that must be treated as "no key" (fail closed).
_PLACEHOLDER_KEYS = {"", "sk-your-key-here", "changeme", "your-key-here"}


class MissingApiKeyError(RuntimeError):
    """Raised when no usable OPENAI_API_KEY is configured for the Narrative step."""


class StepFailure(RuntimeError):
    """Raised after a step fails its one idempotent retry; carries the step name."""

    def __init__(self, step: str, reason: str) -> None:
        super().__init__(reason)
        self.step = step
        self.reason = reason


def _with_retry(step: str, fn: Callable[[], T]) -> T:
    """Run a step with exactly one idempotent retry, then HALT via StepFailure."""
    try:
        return fn()
    except Exception as first:  # noqa: BLE001 - retry once, then convert
        logger.warning("step '%s' failed once, retrying: %s", step, first)
        try:
            return fn()
        except Exception as second:  # noqa: BLE001
            logger.error("step '%s' failed after retry: %s", step, second)
            raise StepFailure(step, str(second)) from second


def _require_api_key() -> None:
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if key in _PLACEHOLDER_KEYS:
        raise MissingApiKeyError(
            "OPENAI_API_KEY is missing or a placeholder; the Narrative step "
            "cannot run. Deterministic analysis is available but no DRAFT is "
            "synthesized without the model."
        )


def _facts_text(state: StateSummary) -> str:
    """Serialize the computed state as authoritative facts for the LLM prompt."""
    return json.dumps(state.model_dump(), indent=2)


def _run_narrative(state: StateSummary, inputs: Dict[str, Any]) -> Draft:
    # Imported lazily so the deterministic path and tests do not require crewai
    # to be importable in every context.
    from .crew import NarrativeCrew

    focus = str(inputs.get("focus") or "").strip()
    result = NarrativeCrew().crew().kickoff(
        inputs={"facts": _facts_text(state), "focus": focus}
    )

    draft: Optional[Draft] = getattr(result, "pydantic", None)
    if draft is None:
        # Fall back to parsing the raw JSON payload into a Draft.
        raw = getattr(result, "raw", None) or str(result)
        draft = Draft.model_validate_json(raw)

    # The status is a backend invariant, not the model's decision.
    draft.status = "DRAFT"
    return draft


def run_readout(inputs: Optional[Dict[str, Any]] = None, run_id: Optional[str] = None) -> RunResponse:
    """Execute a full run and return the RunResponse envelope.

    Returns AWAITING_APPROVAL with a draft + stateSummary on success, or HALTED
    with a diagnostic (no draft) on repeated step failure. Raises
    MissingApiKeyError if no usable key is configured (API maps that to 503).
    """
    inputs = inputs or {}
    run_id = run_id or f"run-{uuid.uuid4().hex[:12]}"

    try:
        source = _with_retry("Ingestion", lambda: ProgramSource().fetch())
        state = _with_retry("Analysis", lambda: compute_program_state(source))
    except StepFailure as sf:
        logger.error("run %s HALTED at %s", run_id, sf.step)
        return RunResponse(
            runId=run_id,
            status="HALTED",
            diagnostic=Diagnostic(failedWorkstream=sf.step, reason=sf.reason),
        )

    # Fail closed BEFORE the LLM step: no key -> 503, no fabricated draft.
    _require_api_key()

    try:
        draft = _with_retry("Narrative", lambda: _run_narrative(state, inputs))
    except StepFailure as sf:
        logger.error("run %s HALTED at %s", run_id, sf.step)
        return RunResponse(
            runId=run_id,
            status="HALTED",
            diagnostic=Diagnostic(failedWorkstream=sf.step, reason=sf.reason),
        )

    return RunResponse(
        runId=run_id,
        status="AWAITING_APPROVAL",
        draft=draft,
        stateSummary=state,
    )
