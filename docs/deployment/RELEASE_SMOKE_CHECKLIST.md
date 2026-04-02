# Release Smoke Checklist

## Automated smoke suite

Run before release sign-off:

```bash
cd frontend
npm ci
npm run test:e2e:install
npm run test:e2e:smoke
```

This suite covers the release-focused browser and API smoke paths, including ops health checks and the core admin, cashier, partner, and customer flows configured in the Playwright harness.
