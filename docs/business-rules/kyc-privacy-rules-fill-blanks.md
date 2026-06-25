# SUBIDHA CORE — KYC and Privacy Rules Fill-Blanks

## Allowed identity documents

| Document | Accepted? | Store full number? | Store masked value? | Expiry/review needed? |
|---|---:|---:|---:|---:|
| Masked Aadhaar | `YES` | `NO` | `YES` | `YES / NO` |
| PAN | `YES / NO` | `NO in UI/PDF` | `YES` | `YES / NO` |
| Voter ID | `YES / NO` | `NO in UI/PDF` | `YES` | `YES / NO` |
| Driving Licence | `YES / NO` | `NO in UI/PDF` | `YES` | `YES / NO` |
| Passport | `YES / NO` | `NO in UI/PDF` | `YES` | `YES / NO` |
| Utility bill/address proof | `YES / NO` | `N/A` | `N/A` | `YES / NO` |

## Access control

| Access | Roles allowed |
|---|---|
| View masked KYC summary | `__FILL__` |
| View uploaded document | `__FILL__` |
| Download document | `__FILL__` |
| Approve/reject KYC | `__FILL__` |
| Delete/archive document | `__FILL__` |

## Mandatory system rules

```text
KYC_MASKING_REQUIRED=true
KYC_STORE_FULL_AADHAAR=false
KYC_STORE_FULL_PAN=false
KYC_DOCUMENT_ACCESS_AUDIT_REQUIRED=true
```
