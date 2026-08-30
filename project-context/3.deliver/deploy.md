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

## 5. Access control and operating model

- Secrets remain environment variables only.
- The backend should not be exposed publicly without authentication and a review of user access boundaries.
- The current MVP is intended for local or private operator use with the synthetic dataset only.
- Enterprise SSO, IAM, and network segmentation are deferred to a future hardening phase.

## 6. Rollback procedure

1. Stop the running compose stack.
2. Revert to the previous Docker image or Git revision.
3. Restore the prior environment variable values from the last known-good config.
4. Re-run the smoke checks:
   - backend health endpoint
   - frontend app loads
   - one run reaches the `AWAITING_APPROVAL` state

## 7. User guide

The operator-facing user guide is in [project-context/3.deliver/user-guide.md](user-guide.md).

## Sources

- [project-context/1.define/prd.md](../1.define/prd.md)
- [project-context/1.define/sad.md](../1.define/sad.md)
- [project-context/2.build/backend.md](../2.build/backend.md)
- [project-context/2.build/integration.md](../2.build/integration.md)
- [project-context/2.build/qa.md](../2.build/qa.md)
- [project-context/2.build/security.md](../2.build/security.md)
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
