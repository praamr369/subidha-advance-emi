# Release Candidate Validation Guide

## Focused smoke automation

Run from the frontend directory:

```bash
npm ci
npm run test:e2e:install
npm run test:e2e:smoke
```

The smoke harness starts the backend with `core.settings.playwright`, applies migrations, seeds deterministic smoke data with `python manage.py seed_playwright_smoke --settings core.settings.playwright`, and then runs the small release smoke suite.

CI also runs this suite in the `frontend-release-smoke` job in `.github/workflows/release-candidate-validation.yml`.
