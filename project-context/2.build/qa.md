# Quality Assurance

## 1. Summary

Current status: pass for the implemented MVP contract and frontend service wiring, with known gaps explicitly recorded. The project has working deterministic backend tests, a working frontend test suite, and a live API contract that the UI consumes without the mock layer.

## 2. Unit tests

### Backend

Verified by running the backend test suite:

```bash
cd backend
.\.venv\Scripts\Activate.ps1
python -m pytest -q
```

Result: 19 passed in 0.62s.

### Frontend

Verified by running the frontend test suite:

```bash
cd frontend
npm test -- --run
```

Result: 1 test file passed, 2 tests passed.

## 3. Integration tests

The integration flow between the React UI and the FastAPI backend contract is validated by the frontend test harness (Vitest) with the network layer mocked. The tests assert the run -> poll -> `AWAITING_APPROVAL` -> approve path and the `HALTED` path against the frozen contract shapes, not a live backend.

Operator end-to-end procedure (manual, not yet executed):

- Start the backend locally.
- Run the frontend UI.
- Trigger a run.
- Confirm the UI reaches the `AWAITING_APPROVAL` state.
- Submit an approval and confirm the final state transition.

A live UI-to-backend end-to-end run (backend serving plus a funded `OPENAI_API_KEY`) is an operator step and has not yet been executed; the offline suites above remain the CI gate.

## 4. Smoke checks

Confirmed checks:

- Health endpoint responds successfully.
- Frontend build compiles successfully.
- API contract matches the frontend expectations for run start, poll, and decision flow.
- `HALTED` diagnostic handling is covered by the frontend tests.

## 5. Known gaps

- Live narrative generation still requires a funded `OPENAI_API_KEY` in the backend environment.
- No auth or session protection is implemented yet.
- The run store is in-memory only and not persisted.
- Security assessment is present but intentionally scoped to MVP implementation, not production hardening.

## 6. Deferred work

- Production security review and hardened deployment design.
- Persistent storage and durable job state.
- Multi-user/session separation.
- Full live end-to-end operator-run verification against a funded LLM key.

## Sources

- `backend/tests/test_api.py`
- `backend/tests/test_compute.py`
- `frontend/src/App.test.tsx`
- `backend/src/app.py`
- `project-context/2.build/backend.md`
- `project-context/2.build/integration.md`

## Assumptions

- The current local configuration remains suitable for the read-only synthetic dataset and operator-run checks.
- The tests are valid for the current MVP scope and not a complete production QA gate.

## Open Questions

- Do we want to add CI automation for the frontend + backend together?
- Should the next pass add auth and persistent storage before broader release testing?
- Do we want to include a live LLM smoke test as a required operator step in the release process?

## Audit

- 2026-08-28, @qa.eng, qa, validated frontend tests and backend API tests and recorded the current known gaps for the MVP implementation.
