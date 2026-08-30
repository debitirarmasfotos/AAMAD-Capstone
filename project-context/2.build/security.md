# Security Assessment

## 1. Scope

This assessment covers the MVP implementation for the PMO Program Intelligence Crew in its current build state. It is intentionally scoped to the existing architecture and runtime constraints rather than a full production security review.

## 2. Summary

Current status: no critical findings in the MVP codebase, but the application is not production hardened. The main concerns are absent authentication, in-memory state, and lack of deployment-layer controls.

## 3. Findings

### Medium - no authentication or authorization

- The API exposes run creation and decision endpoints without any user identity or role gating.
- This is acceptable for a local MVP and synthetic dataset, but it is not appropriate for exposure to untrusted users or production data.

### Medium - in-memory state is not durable or isolated

- Run state is kept in memory only and is lost on restart.
- This is a deliberate MVP choice, but it limits reliability and confidentiality boundaries for multi-user or long-lived workloads.

### Low - lack of production-grade rate limiting and abuse controls

- There are no limits on API request volume or decision retries.
- This is acceptable for the current local/dev environment but should be tightened before external exposure.

### Low - dependency and secret hygiene are mostly handled well

- No secrets are committed to the repo.
- `.env.example` is used instead of checked-in secret values.
- The backend uses environment variables for sensitive runtime inputs.

### Info - local-only environment assumptions

- The project currently assumes local development and a synthetic dataset.
- This limits the need for enterprise controls and reduces risk, but it also means the design is intentionally narrow and not production-grade.

## 4. Mitigations for next phase

- Add basic auth or session gating before external access.
- Move state persistence behind a durable storage layer if the app is used beyond local testing.
- Add API rate limiting and basic abuse controls in the deployment architecture.
- Keep the secret model environment-based and document required variables in deployment docs.

## 5. Controls already in place

- Secrets are kept out of the repo.
- The backend rejects forbidden request keys and validates the request contract.
- The API uses a constrained, explicit schema for run creation and decision calls.
- The project uses environment-based runtime config for the backend key and frontend origin.

## Sources

- `aamad.config.yml`
- `backend/src/app.py`
- `backend/src/orchestrator.py`
- `backend/.env.example`
- `project-context/2.build/backend.md`
- `project-context/2.build/integration.md`

## Assumptions

- The current usage remains local and synthetic-only.
- The MVP does not yet expose the app to external users or production data.
- The next release pass can add security controls as part of a pre-production hardening cycle.

## Open Questions

- Should the next milestone include auth and persistent storage before external deployment?
- What is the expected hosting model for the app in the next delivery phase?
- Will the real data and user population need enterprise IAM and tenant separation?

## Audit

- 2026-08-28, @security.eng, assess-security, reviewed the MVP implementation and recorded the current risk posture and the main follow-up controls needed before production exposure.
