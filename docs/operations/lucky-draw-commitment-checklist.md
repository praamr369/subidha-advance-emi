# Lucky Plan - commitment and public trust checklist

Use this checklist when publishing or reviewing a Lucky Draw commitment.

## Before commit

- Confirm the batch is locked through the normal coordination flow.
- Confirm eligibility snapshots exist.
- Confirm Lucky IDs are assigned and batch status is correct.
- Confirm the draw remains admin-controlled.

## Commit step

- Use the existing admin commit flow.
- Confirm the published commitment hash is visible.
- Store the secure reveal seed outside the browser if the workflow returns one.
- Do not change EMI, payment, waiver, or payout behavior.

## Public trust checks

- Open the public fair draw page and verify the commitment hash is visible.
- Confirm the page does not show raw phone numbers, Aadhaar, KYC IDs, or internal customer IDs.
- Confirm the public explanation is present.
- Confirm the commitment published timestamp is visible.
- Confirm eligible snapshot count is visible where the draw supports it.

## Reveal step

- Use the existing admin reveal flow only.
- Confirm the reveal seed is visible only after reveal on public verification endpoints.
- Confirm the verification result shows a hash match when the seed is correct.
- Confirm the winner public view is masked and privacy-safe.

## Post-reveal checks

- Confirm the winner benefit remains future EMI waiver only.
- Confirm paid EMI history is unchanged.
- Confirm audit entries exist for certificate publication, public verification, and winner publication.
- Confirm legacy draw records still render safely.

## If something looks wrong

- Stop and inspect the authoritative backend draw state.
- Do not hand-edit winner, waiver, or ledger records.
- Escalate to engineering if the draw looks inconsistent with the published commitment.
