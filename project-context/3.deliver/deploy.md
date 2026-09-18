# Deployment Runbook

## 1. Release readiness

The MVP is validated for the implemented contract in the local project state. QA is documented in [project-context/2.build/qa.md](../2.build/qa.md), and the security assessment is in [project-context/2.build/security.md](../2.build/security.md). This runbook assumes no live deployment is triggered by the project without explicit operator approval.

Current status: validated for local development and operator-run use, not yet hardened for production exposure.

## 2. Hosting target

The smallest viable MVP hosting target is a simple compose stack with two services:

- Backend: Python FastAPI application
- Frontend: static Vite build served via Nginx

This matches the current architecture and the `crewai` runtime target.

## 3. Deployment definition

### Local compose deployment

Use the project root `docker-compose.yml` to run both services in one stack.

```bash
docker compose up --build
```

- Backend: http://127.0.0.1:8000
- Frontend: http://127.0.0.1:5173

### Environment variables

The project expects the following environment names only. No secret values are committed to source control.

| Service | Variable | Purpose |
|---|---|---|
| Backend | `OPENAI_API_KEY` | Required for the Narrative generation step |
| Backend | `HOST` | Bind host for the FastAPI app |
| Backend | `PORT` | Bind port for the FastAPI app |
| Backend | `AAMAD_TARGET_RUNTIME` | Resolved runtime target |
| Backend | `LOG_LEVEL` | Logging level |
| Backend | `CREWAI_TRACING_ENABLED` | Optional CrewAI tracing switch for token/cost visibility in MVP diagnostics |
| Frontend | `VITE_API_BASE_URL` | Base URL for backend API calls |

The backend example file is [backend/.env.example](../../backend/.env.example) and the frontend example is [frontend/.env.example](../../frontend/.env.example).

## 4. CI scaffolding

A minimal GitHub Actions workflow is included at [.github/workflows/ci.yml](../../.github/workflows/ci.yml). It performs:

- backend dependency install
- backend pytest
- frontend dependency install
- frontend Vitest run
- frontend production build

This is a validation workflow only and does not perform a live deployment.

## 5. Monitoring & Observability

The MVP uses a lightweight, in-memory observability approach that is intentionally simple and does not change the frozen `/api/runs` contract or application behavior.

### /metrics endpoint

The backend exposes `GET /metrics` at [backend/src/app.py](../../backend/src/app.py). It returns a shallow snapshot of the current in-memory counters and the active run count:

```json
{
  "metrics": {
    "total_requests": 0,
    "total_runs_started": 0,
    "run_status_counts": {
      "AWAITING_APPROVAL": 0,
      "APPROVED": 0,
      "REJECTED": 0,
      "HALTED": 0
    }
  },
  "runs": 0
}
```

This is suitable for local validation and smoke checks only. Values reset on backend restart because the metrics are in memory and not persisted.

### Request logging fields

HTTP request logging is added in the FastAPI middleware. Each request emits a log entry with the following fields:

- `method`: HTTP verb such as `GET` or `POST`
- `path`: request path such as `/api/runs` or `/metrics`
- `status_code`: HTTP response status
- `duration_ms`: elapsed request time in milliseconds

The middleware also increments `total_requests` for each completed request and logs failures with the same request context when an exception escapes the handler.

### CI smoke check

The GitHub Actions workflow at [.github/workflows/ci.yml](../../.github/workflows/ci.yml) includes a backend smoke-check step that starts the API and validates the liveness endpoint:

- start the backend with `uvicorn src.app:app --host 127.0.0.1 --port 8000`
- wait for the service to become available
- call `curl -fsS http://127.0.0.1:8000/health`

This provides a minimal operational sanity check for the backend process and confirms the API remains reachable before a merge or release candidate is accepted.

### What to monitor in MVP

For the first release, monitor the following signals at a low operational cost:

- `run_id`: correlate request logs and run lifecycle records for a single execution
- `duration_ms`: detect slow or stalled runs and latency regressions
- run-status counts: `AWAITING_APPROVAL`, `APPROVED`, `REJECTED`, and `HALTED` totals from the in-memory counter
- error rate: exceptions and failed HTTP responses captured by request logging
- token and cost data: optional CrewAI tracing, when `CREWAI_TRACING_ENABLED=true`, for token usage and cost visibility

The optional CrewAI tracing switch should be treated as a diagnostic visibility aid rather than a required production control for the MVP. If enabled, it should be paired with the existing request log and `/metrics` output to correlate runtime behavior and LLM consumption without altering the request contract.

### Production monitoring recommendations (from evals)

The eval report ([project-context/2.build/evals.md](../2.build/evals.md) section 7) is the source for the production monitoring handoff. Beyond the MVP signals above, it recommends: request-level trace fields (model/version, input/output token counts, latency, stop reason, tool calls, `runId`, status transitions); dashboard metrics (cost per request, latency p50/p95, task success rate, error rate by type, approval/reject rate); and threshold alerts (cost spike over 150% of the 7-day average, latency p95 crossing the agreed SLA, and elevated missing-key or HALTED rates). The SLA and cost-cap thresholds are pending operator signoff (see evals EC-002 / EC-005).

## 6. Access control and operating model

- Secrets remain environment variables only.
- The backend should not be exposed publicly without authentication and a review of user access boundaries.
- The current MVP is intended for local or private operator use with the synthetic dataset only.
- Enterprise SSO, IAM, and network segmentation are deferred to a future hardening phase.

## 7. Rollback procedure

1. Stop the running compose stack.
2. Revert to the previous Docker image or Git revision.
3. Restore the prior environment variable values from the last known-good config.
4. Re-run the smoke checks:
   - backend health endpoint
   - frontend app loads
   - one run reaches the `AWAITING_APPROVAL` state

## 8. User guide

The operator-facing user guide is in [project-context/3.deliver/user-guide.md](user-guide.md).

## Sources

- [project-context/1.define/prd.md](../1.define/prd.md)
- [project-context/1.define/sad.md](../1.define/sad.md)
- [project-context/2.build/backend.md](../2.build/backend.md)
- [project-context/2.build/integration.md](../2.build/integration.md)
- [project-context/2.build/qa.md](../2.build/qa.md)
- [project-context/2.build/security.md](../2.build/security.md)
- [backend/src/app.py](../../backend/src/app.py)
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- [backend/.env.example](../../backend/.env.example)
- [frontend/.env.example](../../frontend/.env.example)

## Assumptions

- The project remains a local or private operator deployment rather than a public SaaS deployment.
- The app still uses the synthetic dataset and not production program data.
- The backend API remains on port 8000 unless an operator overrides the runtime environment.
- No live production deployment is being triggered automatically by CI.

## Open Questions

- Should this be deployed to a managed platform or kept as a local compose stack only?
- Do we need a managed persistence layer before the next release milestone?
- Is there an internal hosting target for the operator environment?

## Audit

- 2026-08-28, @devops.eng, prepare-release, resolved `AAMAD_TARGET_RUNTIME=crewai` and created the minimal delivery config, CI workflow, and runbook for the validated local MVP.
- 2026-09-13, @devops.eng, document-observability, documented the in-memory `/metrics` endpoint, request logging fields, optional `CREWAI_TRACING_ENABLED` switch, CI smoke check, and the MVP monitoring priorities without altering the frozen `/api/runs` contract or app logic.
