# Release Candidate Validation Guide

## Focused smoke automation

Run the deterministic release smoke suite from the frontend directory:

```bash
npm ci
npm run test:e2e:install
npm run test:e2e:smoke
```

The smoke harness starts the backend with `core.settings.playwright`, applies migrations, seeds deterministic smoke data with `python manage.py seed_playwright_smoke --settings core.settings.playwright`, and then runs the small release smoke suite.

## Separate real-login smoke slice

Run the narrow real-login form smoke path separately:

```bash
npm run test:e2e:auth-smoke
```

This auth slice keeps the main deterministic smoke suite unchanged while validating:

- login page availability
- failed login error path
- successful admin login redirect
- successful cashier login redirect

The real-login slice is available only under `core.settings.playwright` and does not change production auth behavior.

CI continues to run the deterministic suite in the `frontend-release-smoke` job in `.github/workflows/release-candidate-validation.yml`.
