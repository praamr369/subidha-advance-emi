# SUBIDHA CORE — Business Data Fill-Blanks

Fill this file from your real business records before live onboarding.

Do not put customer KYC document images or real passwords here. Those must go into the database/private document storage through the approved app flow.

---

## 1. Business identity

| Field | Fill value |
|---|---|
| Legal entity name | `__FILL__` |
| Trade name | `Subidha Furniture` |
| Owner/proprietor name | `__FILL__` |
| Registered address | `__FILL__` |
| Shop/showroom address | `__FILL__` |
| City | `Asansol` |
| District | `Paschim Bardhaman` |
| State | `West Bengal` |
| PIN | `__FILL__` |
| Business phone | `__FILL__` |
| Business email | `__FILL__` |
| Website | `__FILL__` |
| Udyam number | `__FILL_OR_BLANK__` |
| PAN status | `__FILL_MASKED_ONLY__` |
| GST status | `UNREGISTERED / APPLIED / REGISTERED_REGULAR / REGISTERED_COMPOSITION` |
| GSTIN | `__FILL_ONLY_IF_REGISTERED__` |
| GST effective date | `__FILL_ONLY_IF_REGISTERED__` |

---

## 2. Launch mode

| Field | Fill value |
|---|---|
| Launch mode | `PRE_GST_UNREGISTERED / GST_REGISTERED` |
| Public launch date | `__FILL__` |
| First active modules | `Direct Sale / Lucky Plan / Rent / Lease / Partner / Vendor / Inventory / Billing` |
| Modules blocked until review | `__FILL__` |
| Advocate review status | `PENDING / REVIEWED / APPROVED` |
| CA review status | `PENDING / REVIEWED / APPROVED` |

---

## 3. Billing rule before GST registration

| Field | Fill value |
|---|---|
| Customer document title | `Retail Bill / Sale Bill / Money Receipt` |
| GST tax invoice allowed? | `NO` |
| GST collection allowed? | `NO` |
| ITC wording allowed? | `NO` |
| GST credit note allowed? | `NO` |
| Bill footer text | `Supplier is presently not registered under GST. GST has not been charged separately.` |

---

## 4. Lucky Plan rule

| Field | Fill value |
|---|---|
| Public plan name | `__FILL__` |
| Legal/internal classification | `Product Instalment Sale with Optional Company-Funded Monthly Waiver Benefit` |
| External lottery linked? | `NO` |
| Selection method | `HASH_FAIRNESS` |
| Marketing word allowed | `Winner customer` |
| Backend/legal word | `Waiver recipient` |
| Benefit type | `Future unpaid instalment waiver` |
| Funding source | `Company promotional discount/margin` |
| Customer pool/fund allowed? | `NO` |
| Cancellation refund | `Full refund` |
| Refund SLA | `7 working days` |
| EMI due date rule | `__FILL__` |
| Monthly waiver cutoff rule | `__FILL__` |
| Late-paid customer eligible for that month? | `NO` |
| KYC required before waiver eligibility? | `YES / NO` |
| Contract acceptance required? | `YES` |

---

## 5. Late payment charge rule

Use customer-facing wording: `Late Payment Charge`, not punishment.

| Field | Fill value |
|---|---|
| Late payment charge enabled? | `YES / NO` |
| Grace period days | `__FILL__` |
| Charge type | `FIXED / PER_DAY / PERCENTAGE / MANUAL_APPROVED` |
| Charge amount/rate | `__FILL__` |
| Maximum cap | `__FILL__` |
| GST treatment before registration | `PRE_GST_NO_TAX` |
| GST treatment after registration | `CA_TO_CONFIRM` |
| Admin waiver allowed? | `YES / NO` |
| Waiver authority roles | `OWNER / ADMIN` |

---

## 6. Rent / lease rules

| Field | Fill value |
|---|---|
| Rent active at launch? | `YES / NO` |
| Lease active at launch? | `YES / NO` |
| Security deposit percent/rule | `__FILL__` |
| Deposit refundable? | `YES` |
| Inspection required before refund? | `YES` |
| Normal wear deductible? | `NO` |
| Damage deduction allowed? | `YES, with inspection/evidence` |
| Missing item deduction allowed? | `YES, with inspection/evidence` |
| Unpaid dues deduction allowed? | `YES` |
| Deposit refund SLA | `__FILL__` |
| Monthly due date rule | `__FILL__` |
| Late charge for rent/lease | `__FILL__` |

---

## 7. Partner rules

| Field | Fill value |
|---|---|
| Partner public registration allowed? | `YES / NO` |
| Partner can collect payment? | `NO by default / only approved cases` |
| Partner can create final receipt? | `NO` |
| Partner action | `Create receipt request` |
| Admin action | `Approve only after money received` |
| Commission trigger | `__FILL__` |
| Commission rate/slab | `__FILL__` |
| Commission clawback rule | `__FILL__` |

---

## 8. Vendor model

| Field | Fill value |
|---|---|
| Vendor sells to | `Subidha/company` |
| Customer invoice issued by | `Subidha/company` |
| Vendor warranty support allowed? | `YES` |
| Vendor service terms | `__FILL__` |
| Purchase bill required? | `YES` |
| Vendor direct customer invoice allowed? | `NO for this model` |

---

## 9. KYC/privacy rules

| Field | Fill value |
|---|---|
| Full Aadhaar stored? | `NO` |
| Full PAN exposed in UI/PDF? | `NO` |
| Masked ID only? | `YES` |
| Offline KYC accepted docs | `__FILL__` |
| KYC document access roles | `OWNER / ADMIN / authorized only` |
| Access log required? | `YES` |
| KYC review expiry | `__FILL__` |

---

## 10. First live data to prepare

| Data group | Source from you | Where it should go |
|---|---|---|
| Business profile | Shop/legal records | Admin setup / database |
| Product catalog | Product list + prices | Product import/admin UI |
| HSN/SAC | CA/product records | Product/inventory tax config |
| Customers | Existing customer register | Customer import/admin UI |
| Partners | Partner agreements | Partner module |
| Vendors | Vendor bills/contact data | Vendor module |
| Opening stock | Physical stock count | Inventory opening stock workflow |
| Opening cash/bank | Cash/bank balance | Finance setup |
| Lucky batches | Approved batch rules | Batch module |
| Contracts | Advocate-reviewed templates | Contract template module/docs |
