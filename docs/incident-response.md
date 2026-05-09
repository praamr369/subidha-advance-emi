# Incident Response Guide

## Severity Levels
- **SEV1:** Production outage or financial integrity risk.
- **SEV2:** Major degradation with available workaround.
- **SEV3:** Minor service degradation.

## First 15 Minutes
1. Acknowledge incident and assign incident commander.
2. Capture current health:
   - `/api/v1/health/`
   - `/api/v1/health/deep/`
3. Freeze destructive/admin mutation operations only if required by risk.
4. Preserve logs and relevant audit records.

## Financial Safety Rules
- Do not mutate historical payment records destructively.
- Use reversal/compensation patterns already supported by the system.
- Keep reconciliation computations unchanged during incident mitigation.

## Communication
- Update stakeholders every 30 minutes for SEV1/SEV2.
- Record timeline of key actions and decisions.

## Recovery and Follow-up
1. Confirm service recovery and integrity checks.
2. Execute post-incident validation checklist.
3. Publish RCA with corrective and preventive actions.
