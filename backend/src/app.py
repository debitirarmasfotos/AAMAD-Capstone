"""FastAPI app implementing the SAD section 8 HTTP+JSON contract.

Endpoints:
  POST /api/runs                     - start a run (AWAITING_APPROVAL or HALTED)
  GET  /api/runs/{runId}             - poll the stored RunResponse
  POST /api/runs/{runId}/decision    - approve / edit / reject (idempotent)
  GET  /health                       - liveness

The run store is an IN-MEMORY dict keyed by runId and is lost on restart
(SAD section 8 / Assumptions). Errors use the JSON envelope
{ error: { code, message } }; FastAPI's own 422 body ({ detail }) is left as-is
because the frontend already reads it.
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from typing import Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .models import (
    DecisionRequest,
    DecisionResponse,
    FinalReadout,
    RunResponse,
    RunStartRequest,
)
from .orchestrator import MissingApiKeyError, run_readout

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("pmo.api")

app = FastAPI(title="PMO Program Intelligence Crew", version="0.1.0")

# CORS for the Vite dev frontend (wired next sprint).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# In-memory run store (lost on restart). Exposed for tests to seed directly.
RUNS: Dict[str, RunResponse] = {}
# Side channel for decision metadata (reason) kept out of the frozen contract.
RUN_META: Dict[str, dict] = {}


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/runs")
def start_run(payload: Optional[RunStartRequest] = None) -> JSONResponse:
    run_id = f"run-{uuid.uuid4().hex[:12]}"
    started = time.perf_counter()
    # focus / top_n are accepted but the MVP records-and-ignores them.
    inputs = payload.model_dump(exclude_none=True) if payload else {}
    logger.info("run %s start inputs_keys=%s", run_id, sorted(inputs.keys()))

    try:
        result = run_readout(inputs, run_id=run_id)
    except MissingApiKeyError as exc:
        logger.warning("run %s missing_api_key (%.0fms)", run_id, (time.perf_counter() - started) * 1000)
        return _error(503, "missing_api_key", str(exc))
    except Exception as exc:  # noqa: BLE001 - unexpected runtime failure
        logger.exception("run %s unexpected failure", run_id)
        return _error(500, "internal_error", f"Unexpected run failure: {exc}")

    RUNS[run_id] = result
    logger.info(
        "run %s outcome=%s (%.0fms)", run_id, result.status, (time.perf_counter() - started) * 1000
    )
    return JSONResponse(status_code=200, content=result.model_dump(exclude_none=True))


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> JSONResponse:
    result = RUNS.get(run_id)
    if result is None:
        return _error(404, "run_not_found", f"No run with id '{run_id}'.")
    return JSONResponse(status_code=200, content=result.model_dump(exclude_none=True))


@app.post("/api/runs/{run_id}/decision")
def decide(run_id: str, body: DecisionRequest) -> JSONResponse:
    started = time.perf_counter()
    run = RUNS.get(run_id)
    if run is None:
        return _error(404, "run_not_found", f"No run with id '{run_id}'.")

    # Idempotent repeats: a terminal run returns its current state.
    if run.status in ("APPROVED", "REJECTED"):
        logger.info("run %s decision idempotent-repeat status=%s", run_id, run.status)
        return _decision_response(run)

    # A run that is not awaiting approval (e.g. HALTED) cannot be decided.
    if run.status != "AWAITING_APPROVAL":
        return _error(409, "invalid_state", f"Run '{run_id}' is {run.status}, not AWAITING_APPROVAL.")

    if run.draft is None:
        return _error(409, "invalid_state", f"Run '{run_id}' has no draft to decide on.")

    if body.action == "reject":
        run.status = "REJECTED"
        run.draft.status = "REJECTED"
        RUN_META[run_id] = {"decisionReason": body.reason or ""}
    else:
        # approve or edit -> APPROVED. On edit, apply the operator's markdown.
        if body.action == "edit" and body.edits:
            run.draft.markdown = body.edits
            RUN_META[run_id] = {"edits": body.edits}
        run.status = "APPROVED"
        run.draft.status = "APPROVED"

    logger.info(
        "run %s decision=%s outcome=%s (%.0fms)",
        run_id, body.action, run.status, (time.perf_counter() - started) * 1000,
    )
    return _decision_response(run)


def _decision_response(run: RunResponse) -> JSONResponse:
    if run.status == "APPROVED":
        markdown = run.draft.markdown if run.draft else ""
        resp = DecisionResponse(runId=run.runId, status="APPROVED", finalReadout=FinalReadout(markdown=markdown))
    else:
        resp = DecisionResponse(runId=run.runId, status="REJECTED")
    return JSONResponse(status_code=200, content=resp.model_dump(exclude_none=True))
