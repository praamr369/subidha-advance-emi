# Background jobs (Celery) and environment variables

SUBIDHA CORE uses **Celery** with **Redis** as the default broker for scheduled and asynchronous work. Payment posting, EMI settlement, and other user-facing finance flows **must complete in the request/transaction**; workers only send notifications, build summaries, run checks, and similar follow-up work.

## Required in production

| Variable | Purpose |
|----------|---------|
| `CELERY_BROKER_URL` | Redis URL for the task queue (e.g. `redis://redis.internal:6379/0`). If unset in non-local environments, the broker URL is empty and workers will not start correctly until set. |
| `CELERY_RESULT_BACKEND` | Optional override for the result backend; defaults to the same value as `CELERY_BROKER_URL` when omitted. |

## Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `CELERY_TASK_TIME_LIMIT` | `3600` | Hard time limit per task (seconds). |

## Local development

When `_is_local_dev_mode()` is true (typical developer machine), `CELERY_BROKER_URL` defaults to `redis://127.0.0.1:6379/0` if not set. Run Redis locally or point the variable to a dev instance.

## Tests

`core.settings.test` sets:

- `CELERY_TASK_ALWAYS_EAGER = True`
- `CELERY_TASK_EAGER_PROPAGATES = True`

so the test suite does not require a broker. Tasks still run their bodies synchronously for coverage.

## Processes to run in production

1. **Django / ASGI** — web API as today.
2. **Celery worker** — e.g. `celery -A core worker -l info`.
3. **Celery Beat** — e.g. `celery -A core beat -l info` (loads `CELERY_BEAT_SCHEDULE` from settings when `celery` is installed).

Beat schedules daily EMI due/overdue reminders, rent reminders, accounting health, inventory reorder hints, report snapshot, and a nightly PDF regeneration scan placeholder.

## Observability

- Durable rows: `system_jobs.SystemJobLog` (`idempotency_key`, `status`, `retry_count`, `failure_reason`, `started_at`, `finished_at`).
- In-app: `system_jobs.Notification` (per-recipient rows for admins; cashiers only see rows where they are `recipient`).
