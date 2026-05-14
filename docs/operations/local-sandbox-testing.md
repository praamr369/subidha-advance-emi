# Local Sandbox Testing

This workflow is for localhost/dev/test only.

## Safe usage goals
- Never use live customer/payment data for risky testing.
- Keep setup masters reusable across local resets.
- Seed only prefixed demo data (`SANDBOX-`, `DEMO-`, `LOCAL-`).

## Steps
1. Export setup snapshot.
2. Import snapshot into local env (dry-run, then confirm).
3. Seed local sandbox demo data.
4. Run UI/API tests.
5. Reset sandbox data with preserve-admin + preserve-setup.

## Forbidden in production
- Sandbox seed/reset APIs are disabled unless local/dev/test.
- No destructive sandbox operation is available in production-like environments.
