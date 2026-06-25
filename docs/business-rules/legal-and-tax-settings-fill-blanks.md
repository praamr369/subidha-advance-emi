# SUBIDHA CORE — Legal and Tax Settings Fill-Blanks

## GST registration status

```text
GST_STATUS=UNREGISTERED
GSTIN=
GST_EFFECTIVE_DATE=
GST_SCHEME=
```

When GST status is `UNREGISTERED`, backend/frontend must block:

```text
GST tax invoice
GST amount collection
GST credit note
ITC wording
GSTR reports
```

## Turnover warning settings

```text
GST_TURNOVER_WARNING_1=1000000
GST_TURNOVER_WARNING_2=1500000
GST_TURNOVER_PREPARE=1800000
GST_CONSERVATIVE_TRIGGER=2000000
```

## Waiver accounting modes

Allowed CA-approved values:

```text
PRE_GST_CONTRACT_ADJUSTMENT
PRE_GST_COMMERCIAL_CREDIT
PRE_SUPPLY_CONTRACT_ADJUSTMENT
POST_SUPPLY_GST_CREDIT_NOTE
POST_SUPPLY_COMMERCIAL_CREDIT_ONLY
PROMOTIONAL_EXPENSE
REFUND_VOUCHER
HYBRID_CA_RULE
```

Fill decision:

| Situation | Selected mode | CA approved? |
|---|---|---|
| Product not delivered, no invoice | `__FILL__` | `YES / NO` |
| Product delivered, non-GST bill issued | `__FILL__` | `YES / NO` |
| Product delivered, GST invoice issued later | `__FILL__` | `YES / NO` |
| Cancellation before delivery | `__FILL__` | `YES / NO` |
| Cancellation after delivery | `__FILL__` | `YES / NO` |
