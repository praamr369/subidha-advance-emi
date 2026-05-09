# Public Brand Content Rules

## Scope
Public brand content includes only approved public business identity and marketing profile fields.

## Allowed Targets
- Public business profile (`PublicBusinessProfile`)
- Social links (`SocialLink`)
- Public media references (`BusinessMediaAsset`)
- Public content blocks (`PublicContentBlock`)

## Disallowed Targets
- Customer master records
- Subscription, EMI, payment, ledger, commission, payout, lucky draw records
- Any accounting journals, reconciliation state, or financial postings

## Governance
- Admin-only preview/review/apply operations.
- Reasoned approval/rejection and audit logs for each transition.
- External data is always staged first and never auto-applied.
- Public pages expose only approved profile outputs; import metadata remains internal.
