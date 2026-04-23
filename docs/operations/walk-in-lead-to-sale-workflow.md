# Walk-In Lead to Sale Workflow

## Goal

Capture walk-in and online lead intent (quotation/estimate/direct sale/subscription), preserve follow-up context, and convert into real customer/sale records with audit continuity.

## Supported lead sources

- `OFFLINE_WALK_IN`
- `PUBLIC_SITE`
- `ONLINE_LEAD`
- `REFERRAL`
- `PARTNER_REFERRAL`

## Operator workflow

1. Open `Admin > Billing > Direct Sales`.
2. Use `Walk-in lead / quotation desk` to register lead with:
   - name and phone
   - source and intent
   - interested product context
   - lead notes and admin remarks
   - follow-up date and note when required
3. Submit `Register walk-in lead`.
4. Continue direct-sale drafting.
5. Create direct sale.
6. System links the created direct sale back to active lead handoff using lead conversion endpoint.

## Conversion behavior

- Lead remains a CRM/audit object even after conversion.
- Conversion link captures actual created records (customer/subscription/direct sale).
- If linking fails, sale creation still succeeds and operator gets explicit remediation message.

## Follow-up controls

- Follow-up-required leads must include follow-up date.
- Follow-up notes stay attached to lead context.
- Lead intent filtering is available in `Admin > Leads` for quotation/estimate triage.
