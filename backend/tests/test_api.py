"""FastAPI contract tests (offline, no LLM calls).

Covers: /health, POST /api/runs with no key -> 503 missing_api_key, decision
transitions on a seeded in-memory run (APPROVED / REJECTED), unknown runId ->
404, and an invalid decision body -> 422.
"""

import pytest
from fastapi.testclient import TestClient

from src.app import RUNS, app
from src.models import Draft, RunResponse

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clear_store():
    RUNS.clear()
    yield
    RUNS.clear()


def _seed_awaiting(run_id: str = "run-seed") -> None:
    RUNS[run_id] = RunResponse(
        runId=run_id,
        status="AWAITING_APPROVAL",
        draft=Draft(
            markdown="# Program Readout (DRAFT)\n\nSeeded.",
            summary="Seeded summary.",
            bullets=["a", "b", "c"],
            status="DRAFT",
        ),
    )


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_start_run_missing_key_returns_503(monkeypatch):
    # Ensure no usable key is present so the Narrative step fails closed.
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    r = client.post("/api/runs", json={})
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "missing_api_key"


def test_start_run_placeholder_key_returns_503(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-your-key-here")
    r = client.post("/api/runs")
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "missing_api_key"


def test_decision_approve_transitions():
    _seed_awaiting("run-approve")
    r = client.post("/api/runs/run-approve/decision", json={"action": "approve"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "APPROVED"
    assert body["finalReadout"]["markdown"].startswith("# Program Readout")
    assert RUNS["run-approve"].status == "APPROVED"
    assert RUNS["run-approve"].draft.status == "APPROVED"


def test_decision_edit_applies_markdown():
    _seed_awaiting("run-edit")
    r = client.post(
        "/api/runs/run-edit/decision",
        json={"action": "edit", "edits": "# Edited readout\n\nnew body"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "APPROVED"
    assert body["finalReadout"]["markdown"] == "# Edited readout\n\nnew body"


def test_decision_reject_has_no_final_readout():
    _seed_awaiting("run-reject")
    r = client.post(
        "/api/runs/run-reject/decision",
        json={"action": "reject", "reason": "figures need review"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "REJECTED"
    assert "finalReadout" not in body
    assert RUNS["run-reject"].status == "REJECTED"


def test_decision_idempotent_repeat():
    _seed_awaiting("run-idem")
    first = client.post("/api/runs/run-idem/decision", json={"action": "approve"})
    second = client.post("/api/runs/run-idem/decision", json={"action": "approve"})
    assert first.status_code == 200 and second.status_code == 200
    assert first.json() == second.json()


def test_decision_unknown_run_404():
    r = client.post("/api/runs/nope/decision", json={"action": "approve"})
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "run_not_found"


def test_decision_invalid_body_422():
    _seed_awaiting("run-bad")
    r = client.post("/api/runs/run-bad/decision", json={"action": "bogus"})
    assert r.status_code == 422
    # FastAPI's native validation body is left as-is; the frontend reads {detail}.
    assert "detail" in r.json()


def test_get_unknown_run_404():
    r = client.get("/api/runs/missing")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "run_not_found"
