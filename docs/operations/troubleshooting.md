# Troubleshooting Guide (Production)

## App Not Starting

- Check systemd logs:
  - `journalctl -u subidha-backend -n 200`
  - `journalctl -u subidha-frontend -n 200`
- Validate env vars are loaded and non-placeholder.
- Run `python manage.py check --deploy --settings core.settings.production`.

## `readyz` Failing

Likely causes:
- DB not reachable
- pending migrations

Actions:
1. Verify DB connectivity.
2. Run migrations.
3. Recheck `readyz`.

## 403/401 Access Issues

- Verify role boundary:
  - admin-only endpoints are not accessible by partner/customer/cashier.
- Verify token refresh and expiry behavior.
- Re-login and confirm access token/refresh token lifecycle.

## Missing Dashboard Data

- Confirm source records exist.
- Check applied filters (`date_from`, `date_to`, `contract_type`, etc).
- Check `meta.ignored_filters` in report payload.

## Reconciliation Queue Not Updating

- Use admin reconciliation actions with required reason/reference.
- Ensure action endpoint returns success and event/audit row is created.
- Do not edit payment financial fields manually.

## PDF/Media Download Problems

- Verify `MEDIA_ROOT` path and Nginx alias.
- Confirm object permissions (customer/partner scope).
- Ensure no filesystem path leakage in API response.

## High Latency

- Review query-heavy pages:
  - accounting control center
  - operations command center
  - reports pages
- Inspect DB indexes and slow query logs.
- Confirm gunicorn workers and DB pool sizing.
