# SUBIDHA CORE — Lucky Plan Waiver Rules Fill-Blanks

## Classification

```text
Plan type: Product Instalment Sale
Benefit: Optional Company-Funded Monthly Waiver Benefit
Selection: Hash fairness method
External lottery link: No
Customer pool/fund: No
```

## Fill rules

| Rule | Fill value |
|---|---|
| Batch size | `100` |
| Lucky ID range | `00-99` |
| Tenure months | `__FILL__` |
| Monthly due date | `__FILL__` |
| Waiver selection date/time | `__FILL__` |
| Cutoff time for eligibility | `__FILL__` |
| Minimum EMI paid to be eligible | `__FILL__` |
| Late payment eligibility | `Not eligible for that waiver month` |
| KYC required | `YES / NO` |
| Contract accepted required | `YES` |
| Cancel anytime? | `YES` |
| Refund rule | `Full refund` |
| Refund SLA | `7 working days` |
| Early delivery rule | `__FILL__` |
| Future EMI after waiver | `Waived only, no cash prize` |
| Public word | `Monthly Waiver Benefit` |
| Backend word | `waiver_recipient` |

## System lock rules

```text
1. Freeze eligible customer snapshot after cutoff.
2. Store snapshot hash.
3. Store commitment hash.
4. Reveal seed after commitment.
5. Select from frozen eligible Lucky IDs only.
6. Publish waiver result.
7. Lock waiver event audit log.
8. Do not edit eligible list after commitment.
```
