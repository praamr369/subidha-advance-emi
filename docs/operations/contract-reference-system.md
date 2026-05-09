# Contract Reference System

## Goal

Phase 9A adds a universal reference layer for operational search across Advance EMI, rent, lease, and direct sale.

`ContractReference` is index/display truth only. It must not be used to compute dues, post collections, apply waivers, run lucky draws, generate commissions, settle payouts, reconcile payments, or mutate accounting/inventory records.

## Source Of Truth

Financial and operational truth stays in the source domains:

- Advance EMI balances come from EMI/payment allocation and ledger-backed payment services.
- Rent and lease balances come from rent/lease demand records.
- Direct-sale balances come from billing invoice and receipt collection services.
- Reconciliation, waiver, lucky draw, commission, payout, accounting, and inventory records are unchanged.

## Creation

New source records create references through service-layer hooks:

- Advance EMI subscription creation creates `ADVANCE_EMI` references.
- Rent and lease contract creation creates `RENT` and `LEASE` references.
- Direct-sale creation creates `DIRECT_SALE` references after invoice sync.

The reference service creates only `ContractReference` rows and sequence rows. It does not update source financial records.

## Backfill

Use:

```bash
python manage.py backfill_contract_references --dry-run
python manage.py backfill_contract_references
```

Behavior:

- idempotent
- creates missing references only
- does not mutate payments, EMIs, ledgers, invoices, waivers, commissions, payouts, reconciliation, accounting, or inventory
- reports scanned, existing, created, would-create, and skipped counts by contract type
- safely skips unsupported source apps or models

Run dry-run first in production and keep the output with deployment notes.

## Search APIs

Admin:

- `GET /api/v1/admin/contract-references/?q=`
- `GET /api/v1/admin/receivables/search/?q=`

Cashier:

- `GET /api/v1/cashier/receivables/search/?q=`

Search supports phone, contract reference, customer name, customer id, customer code/KYC-safe reference, batch, Lucky ID, direct-sale reference, rent/lease reference, and partner id where role scope permits it.

Cashier search is branch scoped. Cashier responses expose normalized collection fields only and do not expose raw snapshots or admin-only fields.

## Collection Support

Unified receivable search is read-only.

Phase 9A may route only supported actions into existing posting services:

- Advance EMI collection routes to the existing EMI payment service.
- Direct-sale collection routes to the existing direct-sale receipt service when a collectable invoice exists.
- Rent and lease monthly collection is disabled in the unified UX until a production-safe posting service is exposed.

No endpoint should create `Payment` rows directly from `ContractReference`.

