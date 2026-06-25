# Codex Prompt — Create Secret Templates and Business Data Fill-Blanks

Run from repo root.

```text
Create the production secret templates and business data fill-blank onboarding pack for SUBIDHA CORE.

Context:
- Do not put real secrets or real customer data into Git.
- Backend secrets must live outside Git, recommended: /etc/subidha-core/backend.env
- Frontend public env values must contain no private secrets.
- Current launch can be GST-unregistered, so GST tax invoice, GST collection, ITC wording, and GST credit note must be blocked until GST registration is active.
- Lucky Plan classification: Product Instalment Sale with Optional Company-Funded Monthly Waiver Benefit.
- No external lottery link.
- No customer-funded pool.
- Cancellation: full refund within 7 working days.
- Partner: receipt request only; admin approves only after money received.
- Vendor: vendor sells to company; company invoices customer.
- KYC: masked/offline KYC only; document access audited.

Create/update only templates/docs, additive and non-breaking:
- backend/.env.production.template
- frontend/.env.production.template
- admin-vite/.env.production.template if admin-vite exists
- docs/operations/business-data-fill-blanks.md
- docs/business-rules/legal-and-tax-settings-fill-blanks.md
- docs/business-rules/lucky-plan-waiver-rules-fill-blanks.md
- docs/business-rules/rent-lease-rules-fill-blanks.md
- docs/business-rules/partner-vendor-rules-fill-blanks.md
- docs/business-rules/kyc-privacy-rules-fill-blanks.md
- docs/operations/document-numbering-fill-blanks.md
- docs/operations/finance-accounts-fill-blanks.md
- docs/operations/payment-methods-fill-blanks.md
- docs/contracts/contract-placeholders-fill-blanks.md
- docs/imports/*.csv templates based on actual models/import endpoints if available.

Do not change financial logic, EMI logic, payment posting, receipt generation, invoice generation, stock ledger, waiver logic, refund logic, accounting bridge, commission, payout, or reconciliation.

Required output:
1. Files created/changed
2. Which files are safe for Git
3. Which files must stay outside Git
4. What data the owner must fill before launch
5. Any fields you could not verify from current code
```
