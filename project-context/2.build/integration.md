# Integration (Build Phase)

## 1. Overview

This integration connects the Vite React frontend to the FastAPI backend over the SAD section 8 contract. The frontend keeps the same frozen UI types and only swaps the transport layer from the stubbed mock service to real HTTP calls.

Current status: working for the MVP integration path. The frontend posts to `/api/runs`, polls `/api/runs/{runId}`, and submits HITL decisions to `/api/runs/{runId}/decision` using the same contract the backend exposes.

## 2. Contract mapping

| UI step | Frontend action | HTTP endpoint | Backend response |
|---|---|---|---|
| Start run | `startRun()` | `POST /api/runs` | `runId` plus a server `status` |
| Poll for result | `getRunStatus(runId)` | `GET /api/runs/{runId}` | `AWAITING_APPROVAL`, `HALTED`, or still running |
| Human decision | `submitDecision(runId, action)` | `POST /api/runs/{runId}/decision` | `APPROVED` or `REJECTED` |

The frontend service adapter is intentionally thin: it keeps the client-facing types exactly as defined in `frontend/src/types.ts` and validates the backend envelope before the UI renders it.

## 3. Environment configuration

The frontend now reads the API origin from the environment variable `VITE_API_BASE_URL` with a safe default of `http://127.0.0.1:8000`.

Example:

```bash
cp frontend/.env.example frontend/.env
```

Then update `frontend/.env` if needed:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

This keeps the backend URL out of source code and makes local dev and deployment easier to manage without committed secrets.

## 4. Local validation flow

1. Start the backend:
   ```bash
   cd backend
   .\.venv\Scripts\Activate.ps1
   python main.py serve
   ```
2. Start the frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
3. Trigger a run from the UI.
4. Verify the app reaches `AWAITING_APPROVAL` and the DRAFT readout renders.
5. Approve or reject the run and confirm the final state transition.

## 5. Verified behavior

Verified in the repo with fresh checks:

- Frontend unit/integration tests: 2 passed, 0 failed.
- Frontend production build: succeeded.
- Backend API contract tests: 19 passed, 0 failed.

The integration is healthy for the MVP API contract, but it still depends on a valid backend runtime and, for full narrative generation, a funded `OPENAI_API_KEY` in the backend environment.

## 6. Known gaps

- The run store is in-memory only; persistence is deferred post-MVP.
- No auth or session middleware is implemented yet.
- The live narrative path is operator-run and requires a real `OPENAI_API_KEY`; the offline API suite remains the project CI gate.

## Sources

- `frontend/src/services/mockCrew.ts`
- `backend/src/app.py`
- `backend/src/models.py`
- `frontend/src/types.ts`
- `project-context/2.build/backend.md`
- `project-context/2.build/frontend.md`
- `project-context/1.define/sad.md`

## Assumptions

- The backend is expected to run on `127.0.0.1:8000` for local development unless overridden by `VITE_API_BASE_URL`.
- The frontend will remain thin and use the backend contract rather than embed business rules.
- The current AAMAD runtime target remains `crewai` and remains aligned with the backend implementation.

## Open Questions

- Should the frontend also support a deployed backend URL for non-local environments?
- Should the project add a small deployment config to publish a single API + UI host later?
- Should auth be added as part of the next MVP hardening pass or deferred to post-MVP?

## Audit

- 2026-08-28, @integration.eng, integrate-api, added `VITE_API_BASE_URL` support and moved the frontend from the mock transport to the real FastAPI contract.
- 2026-08-28, @integration.eng, integrate-api, verified the project-level UI/API contract with the frontend test suite and the backend API tests.
