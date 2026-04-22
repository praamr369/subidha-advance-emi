# Customer Receivables Workflow

## Goal

Keep customer dues visible in one system without mixing the rules for:

- subscription receivables
- direct-sale receivables

## Receivable rails

### Subscription receivables

- Source of truth remains subscription, EMI, payment, waiver, and reconciliation records.
- Collection continues through the admin and cashier subscription collection paths.
- Overdue EMI review remains separate from direct-sale bill recovery.

### Direct-sale receivables

- Source of truth remains the direct-sale invoice and receipt-safe collection service.
- Partially paid and unpaid direct-sale bills remain collectible later.
- Collection can be initiated from admin collection flow or cashier direct-sale collection flow.

## Unified visibility

- Customer profile shows subscription and direct-sale finance data separately.
- Finance Control Center shows both rails in one review surface.
- Payment register and receipt history remain shared review tools, not merged posting logic.

## Controls

- Do not post direct-sale recovery through EMI collection paths.
- Do not post subscription EMI through direct-sale receipt paths.
- Use finance-account selection only through existing controlled forms.
- Preserve receipt history, ledger visibility, and audit trail for both rails.
