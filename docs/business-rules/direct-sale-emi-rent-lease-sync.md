# Direct Sale / EMI / Rent / Lease Sync Rules

## Confirmed current rules from implementation direction
- Existing Lucky Plan EMI math and payment history remain unchanged.
- Winner waiver affects future obligations only; no retroactive mutation of settled records.
- Direct sale billing and accounting posting are distinct but linked via bridge posting.
- Finance setup readiness gates posting safety.

## Sync rules to preserve
1. No UI can mutate accounting truth directly; posting happens through backend service-layer controls.
2. Any cancel/void/refund/reversal must create traceable records and preserve prior history.
3. Reconciliation must be possible from persisted documents + bridge postings + journals.
4. Settlement accounts (cash/bank/UPI) remain separate from system-only posting profiles.

## Additive extension rules for rent/lease
- Use dedicated rent/lease posting profile mappings (already represented in accounting mapping purposes).
- Introduce rent/lease document flows additively; do not repurpose existing EMI document semantics.
- Keep deposit liability and rent/lease income mappings explicit and auditable.
