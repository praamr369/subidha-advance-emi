# Daily Operations Checklist

## Opening Checks
- Verify `/api/v1/health/deep/` is healthy.
- Review failed background jobs from `system_job_logs`.
- Verify previous backup completion.

## Operational Monitoring
- Review payment posting and reversal logs.
- Review draw and waiver events when batches are in draw windows.
- Review permission denial spikes for possible abuse/misconfiguration.

## Security and Access
- Confirm admin users are active and expected.
- Review password reset request trends and anomalies.

## End-of-Day
- Trigger/verify backup completion.
- Confirm no pending critical incidents.
- Document exceptions for next shift handover.
