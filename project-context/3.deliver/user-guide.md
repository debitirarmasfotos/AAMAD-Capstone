# User Guide

## 1. Product overview

The PMO Program Intelligence Crew turns a set of program inputs into an executive-style draft readout. It summarizes priority health, capacity fit, and risk status and pauses at a human approval gate before the output is considered final.

This is an MVP for an internal program operations workflow. It is designed for a program manager or operator reviewing a synthetic dataset and deciding whether the narrative draft is acceptable before approval.

Known limits:

- The data set is synthetic and not production data.
- The app is local or private-operator focused.
- Persistence and cloud deployment are deferred beyond the MVP.

## 2. Prerequisites

- Python 3.12 for the backend
- Node.js 20 for the frontend
- A funded `OPENAI_API_KEY` if you want the live narrative generation path to run
- A supported browser for the frontend, such as the latest Chrome, Edge, or Firefox

Environment variable names only:

- Backend: `OPENAI_API_KEY`, `HOST`, `PORT`, `LOG_LEVEL`, `AAMAD_TARGET_RUNTIME`
- Frontend: `VITE_API_BASE_URL`

## 3. Installation

### Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Then update `.env` with a real `OPENAI_API_KEY` value.

### Frontend

```bash
cd frontend
npm install
copy .env.example .env
```

If the backend is running on the default local port, the `.env` value can remain:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### Smoke check

Run the backend:

```bash
cd backend
.\.venv\Scripts\Activate.ps1
python main.py serve
```

Then confirm the health endpoint:

```bash
curl http://127.0.0.1:8000/health
```

Expected result:

```json
{"status":"ok"}
```

## 4. Getting started

1. Start the backend.
2. Start the frontend.
3. Open the frontend in a browser.
4. Click Run to start the readout workflow.
5. Review the DRAFT output and either approve, edit, or reject it.

The app is intentionally a single-screen workflow. It does not include a broad multi-page product experience.

## 5. Everyday use

### Typical flow

- Open the app and provide an optional focus hint.
- Run the crew over the bundled synthetic data.
- Review the priority RAG rollup, capacity-fit summary, and ranked risks.
- Apply a human decision on the draft output.
- Use the final approved output as the review-ready summary for the current program state.

### Common outcomes

- `AWAITING_APPROVAL`: the draft is ready for review.
- `APPROVED`: the readout becomes final.
- `REJECTED`: the draft is not treated as final.
- `HALTED`: the run failed and no final draft was produced.

## 6. Troubleshooting

### Missing API key

If the backend reports a missing or invalid `OPENAI_API_KEY`, set the environment value in `backend/.env` and retry the run.

### Frontend cannot reach backend

Check the `VITE_API_BASE_URL` variable in the frontend environment and confirm the backend is listening on the expected port.

### API returns a HALTED diagnostic

This means the run failed after the configured retry path. Review the diagnostic and rerun once the operator resolves the root cause or configuration issue.

### Build or test issues

Use the project validation commands:

```bash
cd backend
python -m pytest -q
```

```bash
cd frontend
npm test -- --run
npm run build
```

## 7. Deployment notes for operators

This project is packaged as a minimal local deployment with Docker Compose. See [project-context/3.deliver/deploy.md](deploy.md) for the full operator runbook, rollback steps, and environment matrix.

## Sources

- [project-context/1.define/prd.md](../1.define/prd.md)
- [project-context/1.define/sad.md](../1.define/sad.md)
- [project-context/2.build/integration.md](../2.build/integration.md)
- [project-context/2.build/qa.md](../2.build/qa.md)
- [project-context/2.build/security.md](../2.build/security.md)
- [backend/.env.example](../../backend/.env.example)
- [frontend/.env.example](../../frontend/.env.example)

## Assumptions

- The application remains scoped to local operator use and the synthetic dataset.
- The user has access to the required environment variables for local setup.
- The operator is responsible for confirming the backend key and frontend URL for the chosen environment.

## Open Questions

- Is the deployment target a local compose stack or a hosted platform?
- Do we need a persistence layer before broader adoption?
- Should authentication be added before public access or multi-user use?

## Audit

- 2026-08-28, @devops.eng, document-user-guide, resolved `AAMAD_TARGET_RUNTIME=crewai` and wrote the MVP user guide from the verified local setup and integration state.
