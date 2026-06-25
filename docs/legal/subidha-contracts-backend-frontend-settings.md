# SUBIDHA CORE — Contracts, Legal Classification, CA Treatment, Backend Settings, and Frontend Implementation Pack

**Project:** SUBIDHA CORE — Lucky Plan EMI System  
**Business:** Subidha Furniture — product instalment, direct sale, rent, lease, partner/vendor workflows  
**Recommended repo path:** `docs/legal/subidha-contracts-backend-frontend-settings.md`  
**Status:** Draft for advocate + CA review before public launch  
**Prepared date:** 2026-06-25  

> **Strict warning:** This file is an implementation-ready legal/CA/business-rule draft for software and operational preparation. It is **not** a signed advocate opinion, CA certificate, GST opinion, or court-safe final contract. Do not issue these terms publicly until a local advocate and CA review the final wording, tax treatment, stamp duty, and customer-facing documents.

---

## 0. Executive decision

SUBIDHA CORE must classify the Lucky Plan as:

> **Product Instalment Sale with Optional Company-Funded Monthly Waiver Benefit**

It must **not** be operated or recorded as:

- lottery,
- prize scheme,
- customer money pool,
- prize chit,
- money-circulation scheme,
- gambling scheme,
- lending / BNPL product,
- partner-cash collection scheme without admin approval.

The software must enforce this classification through backend state, accounting treatment, frontend wording, audit logs, and document generation.

---

## 1. Current approved business rules

### 1.1 Lucky Plan waiver selection

- Lucky Plan is **not linked** to Nagaland lottery or any external lottery/public result.
- Waiver selection is based on internal hash/fairness logic.
- Backend/legal language must use **waiver / benefit / eligibility / selection** language.
- Marketing may use friendly “winner customer” wording only in controlled places, but legal documents, invoices, ledgers, admin logs, and backend events should use waiver terminology.

### 1.2 Lucky Plan cancellation/refund

- Customer may cancel Lucky Plan any time before final closure.
- Eligible paid amount is refunded in full within **7 working days** after approval and payment reconciliation.
- No fixed 20% cancellation deduction.
- Cancellation must keep audit trail: reason, request date, approval date, refund due date, refund mode, proof, approver, and customer acknowledgement.

### 1.3 Rent/lease security deposit

- Security deposit is refundable after returned product inspection.
- Deductions are allowed only for evidence-backed items:
  - unpaid rent/lease dues,
  - physical damage beyond normal wear and tear,
  - missing parts/accessories,
  - abnormal wear,
  - transport/recovery charges if agreed,
  - repair/service/replacement cost supported by inspection.
- Normal wear and tear must not be deducted.

### 1.4 GST/HSN/SAC

- There is no one-rate-for-all GST model.
- Product and inventory settings must store HSN/SAC and tax configuration.
- Sale, rent, lease, late payment charge, deposit adjustment, cancellation/refund, and partner/vendor flows must be tax-configurable.
- If the business is not GST registered, the system must block GST collection and tax invoice generation.

### 1.5 Partner receipt workflow

- Partners can create **receipt requests** only.
- Admin must approve only after money is actually received by company/cash counter/bank/UPI.
- Partner cannot directly create final receipt.
- Final receipt must reference admin approval and payment proof.

### 1.6 Vendor direct fulfilment model

- Vendor sells/supplies to Subidha/company.
- Subidha/company invoices the customer.
- Vendor may provide service/warranty support under Subidha customer-facing invoice/contract.
- Maintain vendor purchase report, warranty/service responsibility mapping, serial/product identity, and service history.

### 1.7 KYC/document privacy

- Use accepted offline KYC/document verification.
- Prefer masked Aadhaar and offline Aadhaar e-KYC / QR / XML where legally suitable.
- Store masked identifiers, verification status, and audit logs.
- Do not expose full Aadhaar/PAN/document number in PDFs, tables, APIs, receipts, invoices, or public pages.

### 1.8 Late payment charge and waiver eligibility

- Use **Late Payment Charge**, not “punishment”, “penalty”, or “fine” in customer-facing contract unless advocate approves exact wording.
- Lucky Plan customer must pay before system cutoff to remain eligible for that month’s waiver selection.
- If paid after cutoff, payment may be accepted, but customer is ineligible for that month’s waiver benefit.
- Rent/lease due dates and late charges are admin-configured.
- Late charges must be capped, disclosed, configurable, tax-configurable, and auditable.

### 1.9 Finance / BNPL

- Subidha does not provide its own loan/BNPL product.
- Any finance help is only facilitation under formal agreement with a regulated/approved third party, if ever used.
- Customer finance must not be represented as Subidha lending unless legal/RBI compliance structure is approved.

---

## 2. Legal classification target

### 2.1 Correct classification

| Module | Classification target |
|---|---|
| Direct sale | Sale of goods |
| Lucky Plan | Product instalment sale |
| Monthly waiver | Company-funded contractual promotional waiver |
| Rent | Rental/right-to-use goods service |
| Lease | Lease/rental service |
| Security deposit | Refundable liability until adjusted |
| Late payment charge | Delayed payment charge |
| Partner commission | Commission/business promotion expense |
| Vendor direct fulfilment | Purchase from vendor + customer sale by Subidha |
| Finance help | Finance facilitation only, no Subidha lending |

### 2.2 Dangerous classification to avoid

The system must not look like:

| Dangerous pattern | Why dangerous |
|---|---|
| Customer pays mainly to get chance of waiver | Looks like chance/prize scheme |
| 100 members form Lucky Fund | Looks like pool/contribution scheme |
| One member wins from customer-paid pool | High prize chit risk |
| Non-winners get refund at scheme end | Can resemble prohibited arrangement |
| Backend ledger named Prize Fund/Winner Fund | Creates bad evidence |
| Public wording “lottery/jackpot/prize” | Creates legal classification risk |
| Admin can modify eligible list after hash commit | Breaks fairness and auditability |

### 2.3 Strict legal wording rule

Use:

- Monthly Waiver Benefit
- Eligible Plan ID / Lucky ID
- Waiver Recipient
- Waiver Selection Event
- Fairness Commitment Hash
- Reveal Seed
- Eligibility Snapshot
- Commercial Waiver / Contractual Discount

Avoid:

- lottery
- prize
- jackpot
- lucky draw in legal documents
- gambling
- winning money
- prize pool
- chit fund
- money circulation

---

## 3. Five mandatory fixes for safer classification

### Fix 1 — Product sale first, waiver second

Every customer contract must start with product details and instalment obligation:

- product name,
- SKU/model,
- product base price,
- tenure,
- monthly instalment,
- delivery terms,
- cancellation/refund terms,
- KYC/customer details,
- waiver benefit as a secondary conditional benefit.

### Fix 2 — No customer money pool

Accounting must never create:

- Lucky Pool,
- Winner Fund,
- Prize Reserve,
- Draw Collection,
- Subscriber Pool.

Use:

- Customer Advance / Contract Liability,
- Customer Receivable,
- Sales Revenue,
- GST Payable if registered,
- Promotional Waiver / Sales Discount,
- Refund Payable.

### Fix 3 — Eligibility based on customer conduct

Minimum eligibility for waiver month:

| Rule | Required |
|---|---:|
| Contract active | Yes |
| Customer not cancelled | Yes |
| EMI for month paid before cutoff | Yes |
| KYC verified or allowed pending state | Configurable |
| No fraud/dispute hold | Yes |
| Batch/month active | Yes |
| Product/plan eligible | Yes |
| Eligible snapshot frozen before selection | Yes |

### Fix 4 — Hash fairness is audit method, not marketing identity

Hash fairness should prove that selection was not manipulated.

Backend must store:

- commitment hash,
- reveal seed,
- eligible snapshot hash,
- participant snapshot,
- selected Plan/Lucky ID,
- selection formula/version,
- publish timestamp,
- approving admin,
- immutable audit log.

Customer-facing words:

> “Selected through an audited digital fairness process.”

Not:

> “Crypto lottery / blockchain jackpot.”

### Fix 5 — Contract must pre-agree waiver accounting/tax treatment

The contract must say that waiver may be treated as:

- pre-supply contract adjustment,
- post-supply commercial credit,
- GST credit note if legally/CA allowed,
- promotional waiver expense,
- receivable reduction,
- refund voucher/refund record where applicable.

This protects CA handling when waiver happens after invoice/delivery.

---

## 4. GST status: business starts without GST number

### 4.1 Rule while unregistered

If Subidha is not GST registered:

- do not charge GST,
- do not show CGST/SGST/IGST,
- do not issue “Tax Invoice”,
- do not promise ITC,
- do not generate GST credit note,
- do not generate GSTR reports as official filing records.

Use:

- Retail Bill,
- Sale Bill,
- Money Receipt,
- Plan Receipt,
- Security Deposit Receipt,
- Refund Record,
- Commercial Waiver Note,
- Commercial Credit Note.

Required footer:

> “Supplier is presently not registered under GST. GST has not been charged separately on this bill/receipt.”

### 4.2 Conservative GST trigger

Because the business includes goods + rent/lease/service-like flows, use conservative alert threshold:

| Turnover level | System action |
|---:|---|
| ₹10 lakh | CA review warning |
| ₹15 lakh | Prepare GST data/documents |
| ₹18 lakh | Start GST registration planning |
| ₹20 lakh | Conservative registration trigger for mixed goods/services |
| ₹40 lakh | Goods-exclusive threshold; do not rely on this for full model without CA approval |

### 4.3 GST modes

Add business setting:

```text
GST_STATUS:
  UNREGISTERED
  APPLIED
  REGISTERED_REGULAR
  REGISTERED_COMPOSITION
  CANCELLED
```

Fields:

```text
gstin
legal_name
trade_name
state
principal_place_of_business
gst_registration_date
gst_effective_date
gst_scheme
composition_enabled
is_tax_invoice_enabled
```

### 4.4 GST system switch rule

```text
if GST_STATUS = UNREGISTERED:
    block GST tax invoice
    block GST amount collection
    block GST credit note
    block ITC wording
    allow non-GST retail bill / receipt / commercial note only

if GST_STATUS = REGISTERED_REGULAR:
    require HSN/SAC or SAC
    require tax rate
    generate GST invoice/document as per flow
    enable GST credit/debit note only through CA-approved rules
```

---

## 5. CA treatment of Lucky Plan waiver

### 5.1 Scenario A — Product not delivered, tax invoice not issued

**Business state:** customer paid instalments/advance; product not yet delivered; no GST tax invoice/non-GST sale bill finalized.

**Treatment while unregistered:** commercial contract adjustment.  
**Treatment after GST registration:** receipt voucher/advance handling if registered; final invoice at delivery as per CA rule.

Accounting before GST registration:

```text
When EMI/advance received:
Dr Cash/Bank
    Cr Customer Advance / Contract Liability

When waiver granted before delivery:
No GST credit note.
No prize expense.
Reduce future receivable / adjust instalment schedule.

When customer cancels before delivery:
Dr Customer Advance / Contract Liability
    Cr Bank/Cash
```

Software mode:

```text
gst_status = UNREGISTERED or REGISTERED
invoice_status = NOT_ISSUED
delivery_status = NOT_DELIVERED
waiver_mode = PRE_SUPPLY_CONTRACT_ADJUSTMENT
credit_note_required = false
refund_voucher_required = true only if registered and no supply happened after receipt voucher
commercial_waiver_note_required = true
```

### 5.2 Scenario B — Product delivered, invoice/sale bill issued at full value

**Business state:** customer received product; bill/invoice already issued; future EMIs remain due; customer receives monthly waiver later.

If unregistered:

```text
At delivery / non-GST sale bill:
Dr Customer Receivable
    Cr Sales Revenue

When waiver granted:
Dr Promotional Waiver / Sales Discount
    Cr Customer Receivable
```

If GST registered, choose CA-approved mode:

| Mode | Use |
|---|---|
| GST credit note | Only if Section 15/34 treatment is valid and CA allows |
| Commercial credit note | If business wants receivable reduction but GST output is not reduced |
| Promotional expense | If waiver is treated as company-funded benefit without reducing tax value |

Software mode:

```text
invoice_status = ISSUED
delivery_status = DELIVERED
waiver_tax_mode = POST_SUPPLY_REVIEW_REQUIRED
allowed_outputs:
  GST_CREDIT_NOTE
  COMMERCIAL_CREDIT_NOTE
  PROMOTIONAL_EXPENSE_ENTRY
```

### 5.3 Scenario C — Partial/advance documents exist; delivery happens later

**Business state:** customer pays EMIs monthly; receipts exist; product may be delivered after 10 months or after eligibility; invoice status may be pending/partial.

System must reconcile:

- amount paid,
- customer advance,
- amount due,
- delivery status,
- invoice status,
- waiver already granted or not,
- GST status/effective date.

Software mode:

```text
invoice_status = PARTIAL_OR_PENDING
delivery_status = PENDING_OR_PARTIAL
waiver_tax_mode = HYBRID_CA_RULE
system_action:
  reconcile_receipts
  check_delivery_status
  check_invoice_status
  apply pre-agreed waiver rule
  generate final invoice/bill/credit/refund document as CA-approved
```

### 5.4 Waiver document matrix

| Case | GST status | Delivery | Invoice/Bill | Waiver treatment | Document |
|---|---|---|---|---|---|
| A | Unregistered | Not delivered | Not issued | Contract adjustment | Commercial waiver note |
| B | Unregistered | Delivered | Non-GST sale bill | Commercial credit | Commercial credit note |
| C | Registered | Not delivered | Receipt voucher only | Pre-supply adjustment | Receipt/refund voucher if applicable |
| D | Registered | Delivered | Tax invoice issued | CA-approved post-supply treatment | GST credit note or commercial credit note |
| E | Any | Cancelled before delivery | No supply | Full refund | Refund record / refund voucher if registered |
| F | Any | Late-paid for month | Any | No waiver eligibility | Ineligibility log |

---

## 6. Contract template pack

> Replace all `[PLACEHOLDER]` values before advocate/CA review. Keep version numbers. Never use customer-facing copy directly from this draft without review.

---

# Contract 1 — Product Instalment Plan with Monthly Waiver Benefit

**Document type:** Customer Agreement  
**Version:** Draft v0.1  
**Parties:** Subidha Furniture / [LEGAL ENTITY NAME] and Customer

## 1. Parties

This Product Instalment Plan Agreement is entered into between:

**Company:** [LEGAL ENTITY NAME / SUBIDHA FURNITURE], having its place of business at [ADDRESS].  
**Customer:** [CUSTOMER NAME], [PHONE], [ADDRESS], [MASKED KYC ID].

## 2. Product and plan schedule

| Field | Value |
|---|---|
| Product name | [PRODUCT] |
| SKU/model | [SKU] |
| HSN/SAC | [HSN/SAC or N/A if unregistered] |
| Product base price / contract value | ₹[AMOUNT] |
| Tenure | [MONTHS] months |
| Monthly instalment | ₹[AMOUNT] |
| Due date | [DAY / DATE RULE] |
| Plan ID / Lucky ID | [ID] |
| Delivery terms | [TERMS] |
| GST status at contract date | [UNREGISTERED / REGISTERED] |

## 3. Nature of agreement

The Customer agrees to purchase the product under a fixed instalment arrangement. The Customer’s payments are towards the product contract and not towards any lottery, prize pool, investment return, lending product, money-circulation scheme, or customer-funded pooled arrangement.

## 4. Monthly waiver benefit

The Company may provide a monthly waiver benefit to one eligible Plan ID / Lucky ID under the Company’s approved waiver policy. The waiver benefit is a company-funded contractual promotional benefit and may reduce future unpaid instalments as per the approved plan rules.

The waiver benefit is not a cash prize and is not payable as cash unless specifically approved under a lawful refund/settlement process.

## 5. Fairness process

The Company may use an audited digital fairness process for monthly waiver selection. The Company may preserve audit records including eligibility snapshot, commitment hash, reveal seed, selected Plan ID / Lucky ID, publish timestamp, and approving admin.

## 6. Eligibility

For a monthly waiver period, the Customer must satisfy all eligibility conditions:

1. active contract,
2. payment of required instalment before system cutoff,
3. no cancellation request active,
4. no fraud/dispute hold,
5. KYC status as required by Company policy,
6. any other condition disclosed in the Plan Schedule.

If the Customer pays after the system cutoff for that waiver month, the Customer may remain liable for applicable late payment charge and shall not be eligible for that month’s waiver benefit.

## 7. Cancellation and full refund

The Customer may request cancellation at any time before final closure. After verification of payments received and approval, the eligible paid amount shall be refunded within 7 working days to the Customer’s verified bank/payment details.

## 8. Tax/accounting treatment

Any waiver benefit, if granted, may be recorded as a commercial waiver, contractual discount, receivable adjustment, promotional waiver, commercial credit note, GST credit note, refund voucher, or other document depending on delivery status, invoice status, GST status, and CA-approved treatment.

## 9. No GST if unregistered

If the Company is not GST registered at the time of this agreement, GST shall not be charged separately and no GST tax invoice shall be issued. If the Company later becomes GST registered, applicable documents shall be issued from the effective registration date as required by law.

## 10. Customer acknowledgement

The Customer confirms that the plan has been explained, including instalment amount, due date, cancellation/refund rule, waiver eligibility, late payment consequence, and delivery terms.

**Customer signature:** ____________________  
**Company representative:** ____________________  
**Date:** ____________________

---

# Contract 2 — Lucky Plan Cancellation and Full Refund Policy

**Document type:** Customer Policy  
**Version:** Draft v0.1

## 1. Cancellation right

The Customer may request cancellation of the Lucky Plan / Product Instalment Plan at any time before final closure through the approved Company process.

## 2. Refund amount

The Customer shall be eligible for full refund of verified amount paid under the plan, subject to reconciliation of actual payment records and settlement details.

## 3. Refund timeline

Approved refund shall be processed within 7 working days from:

1. cancellation approval,
2. payment reconciliation,
3. receipt of correct refund bank/payment details.

## 4. Refund mode

Refund shall preferably be made by bank transfer/UPI to the verified customer account. Cash refund requires special admin approval and customer acknowledgement.

## 5. Records

The Company shall maintain:

- cancellation reason,
- request date,
- approval/rejection date,
- refund due date,
- refund mode,
- refund proof,
- customer acknowledgement,
- admin approver.

---

# Contract 3 — Rent Agreement with Security Deposit

**Document type:** Rent Agreement  
**Version:** Draft v0.1

## 1. Parties

Company: [LEGAL ENTITY]  
Customer: [CUSTOMER]

## 2. Product rental schedule

| Field | Value |
|---|---|
| Product | [PRODUCT] |
| Product condition at handover | [CONDITION] |
| Monthly rent | ₹[AMOUNT] |
| Security deposit | ₹[AMOUNT] |
| Rent due date | [DATE] |
| Tenure | [PERIOD] |
| Late payment charge | [RULE] |
| GST status | [UNREGISTERED / REGISTERED] |

## 3. Security deposit

The security deposit is refundable and is not rent or sale consideration unless adjusted against unpaid dues, product damage, missing items, abnormal wear, or approved recovery charges.

## 4. Return inspection

At product return, the Company shall inspect the product and create a return inspection report with photos/evidence where required.

## 5. Permitted deductions

Deductions may be made only for:

1. unpaid rent,
2. damage beyond normal wear and tear,
3. missing parts/accessories,
4. abnormal wear,
5. transport/recovery charges if agreed,
6. repair/replacement cost supported by inspection.

## 6. Refund timeline

After inspection, deduction approval, and settlement, refundable balance shall be paid to Customer within [X] working days.

---

# Contract 4 — Lease Agreement with Security Deposit

**Document type:** Lease Agreement  
**Version:** Draft v0.1

## 1. Lease nature

The Company provides the listed product to the Customer under a lease/right-to-use arrangement. Ownership remains with the Company unless a separate written purchase transfer is executed.

## 2. Lease schedule

| Field | Value |
|---|---|
| Product | [PRODUCT] |
| Lease charge | ₹[AMOUNT] |
| Security deposit | ₹[AMOUNT] |
| Due date | [DATE] |
| Tenure | [PERIOD] |
| Return condition | [CONDITION] |
| Maintenance responsibility | [RULE] |

## 3. Deposit and inspection

The security deposit shall be refundable after return inspection, subject to approved deductions for unpaid dues, product damage, missing accessories, abnormal wear, and agreed recovery charges.

## 4. Customer obligations

The Customer shall use the product carefully, not transfer/sublet/sell it, and return it in acceptable condition subject to normal wear and tear.

---

# Contract 5 — Product Return Inspection and Deposit Settlement Form

**Document type:** Operational settlement form  
**Version:** Draft v0.1

## 1. Return details

| Field | Value |
|---|---|
| Customer | [NAME] |
| Contract ID | [ID] |
| Product | [PRODUCT] |
| Return date | [DATE] |
| Inspected by | [STAFF] |

## 2. Inspection checklist

| Item | Status | Notes |
|---|---|---|
| Main product body | OK / Damaged | [NOTES] |
| Accessories | Complete / Missing | [NOTES] |
| Functional condition | Working / Issue | [NOTES] |
| Normal wear | Yes / No | [NOTES] |
| Abnormal damage | Yes / No | [NOTES] |
| Photos uploaded | Yes / No | [REFERENCE] |

## 3. Deduction breakup

| Deduction head | Amount | Evidence/reference |
|---|---:|---|
| Unpaid dues | ₹[AMOUNT] | [REF] |
| Damage repair | ₹[AMOUNT] | [REF] |
| Missing item | ₹[AMOUNT] | [REF] |
| Recovery/transport | ₹[AMOUNT] | [REF] |
| Other approved | ₹[AMOUNT] | [REF] |

Security deposit received: ₹[AMOUNT]  
Total deductions: ₹[AMOUNT]  
Refundable balance: ₹[AMOUNT]

Customer acknowledgement: ____________________  
Admin approval: ____________________

---

# Contract 6 — Partner Receipt Request and Commission Agreement

**Document type:** Partner Agreement  
**Version:** Draft v0.1

## 1. Partner role

The Partner acts only as approved lead generator / customer support / collection facilitator. The Partner has no authority to change Company prices, waiver rules, refund rules, delivery commitments, KYC rules, contract terms, or tax treatment.

## 2. Receipt request only

The Partner may create receipt requests through the Partner Portal. A receipt request is not a final Company receipt.

## 3. Admin approval

Final Company receipt shall be generated only after Company admin verifies that money has been received by Company cash counter, bank, UPI, or other approved account.

## 4. Misrepresentation

The Partner shall not promise waiver, refund, finance approval, discount, delivery date, or special benefit unless it appears as approved in Company system.

## 5. Commission

Commission is payable only after the approved trigger event stated in the Commission Schedule, such as verified payment, approved sale, or completed delivery.

## 6. Clawback

Commission may be reversed or withheld if payment fails, transaction is cancelled, fraud/misrepresentation is found, or customer dispute arises due to Partner conduct.

---

# Contract 7 — Vendor Supply, Direct Fulfilment, Warranty and Service Support Agreement

**Document type:** Vendor Agreement  
**Version:** Draft v0.1

## 1. Commercial model

The Vendor supplies/sells products to Subidha/company. Subidha/company invoices the end customer.

## 2. Customer-facing invoice

The Vendor shall not issue the customer-facing invoice for the same Subidha customer sale unless a separate approved model is documented.

## 3. Warranty/service support

The Vendor shall provide service/warranty support according to the Vendor Warranty Schedule. Customer-facing service may be coordinated through Subidha.

## 4. Vendor documents

Vendor must provide:

- purchase bill,
- product/serial details,
- warranty terms,
- service contact/process,
- replacement/defect policy,
- delivery proof if vendor directly ships.

## 5. Service responsibility

Vendor service obligations shall be linked to Subidha customer invoice/contract and internal purchase report.

---

# Contract 8 — KYC and Privacy Consent

**Document type:** Customer/Partner/Vendor KYC Consent  
**Version:** Draft v0.1

## 1. Purpose

The Company collects identity/address documents for contract verification, delivery, payment tracking, fraud prevention, legal/business record keeping, and customer service.

## 2. Masked/offline KYC

The Company prefers masked/offline KYC documents wherever possible. Full Aadhaar number shall not be displayed in Company PDFs, invoices, receipts, public pages, or normal admin tables.

## 3. Data stored

The Company may store:

- document type,
- masked identifier,
- last four digits/reference where required,
- verification status,
- expiry/review date,
- uploaded document file if required,
- verification notes,
- access logs.

## 4. Access control

KYC documents shall be accessible only to authorised users. View/download shall be audit logged.

## 5. Consent

The Customer/Partner/Vendor confirms voluntary submission of documents for verification and business record purposes.

---

# Contract 9 — Late Payment Charge and Waiver Eligibility Policy

**Document type:** Customer Policy  
**Version:** Draft v0.1

## 1. Due date

Each customer contract has a monthly due date or system-defined cutoff date.

## 2. Late payment charge

Payment received after due date may attract late payment charge as per approved schedule.

## 3. Waiver ineligibility

For Lucky Plan / Product Instalment Plan customers, payment after the monthly waiver cutoff shall make the Customer ineligible for that month’s waiver benefit even if payment is later accepted.

## 4. Admin waiver of late charge

Late payment charge may be waived only by authorised admin action with reason and audit log.

## 5. Tax treatment

Late payment charge tax treatment shall follow Company GST status and CA-approved configuration.

---

# Contract 10 — Finance Facilitation Disclaimer

**Document type:** Customer Disclaimer  
**Version:** Draft v0.1

## 1. No Subidha loan

Subidha does not provide loans, BNPL, credit limits, regulated lending products, or finance approval in its own name.

## 2. Third-party finance

If a customer requests finance help, Subidha may only facilitate communication or documentation with an approved third party under a separate arrangement.

## 3. Independent responsibility

Any loan approval, interest, processing charge, repayment, recovery, or credit decision shall be between the Customer and the finance provider.

## 4. No guarantee

Subidha does not guarantee finance approval.

---

## 7. Backend settings and models

> Additive-first. Do not break existing EMI/payment/waiver/audit data. If existing models already have equivalent fields, reuse and extend instead of creating duplicates.

### 7.1 Business profile settings

Recommended DB-backed settings, not hardcoded environment variables:

```text
BusinessProfile / BusinessSetup:
  legal_entity_name
  trade_name
  gst_status
  gstin
  gst_registration_date
  gst_effective_date
  gst_scheme
  pan_masked
  business_address
  state_code
  invoice_mode
  non_gst_bill_footer
  tax_invoice_enabled
  receipt_voucher_enabled
  refund_voucher_enabled
```

### 7.2 Legal classification settings

Create/reuse a model like `PlanLegalClassification` or `BusinessRulePolicy`:

```text
plan_type:
  PRODUCT_INSTALLMENT
  DIRECT_SALE
  RENTAL
  LEASE

benefit_type:
  NONE
  CONTRACTUAL_WAIVER
  TRADE_DISCOUNT
  PROMOTIONAL_CREDIT

selection_method:
  NONE
  HASH_FAIRNESS
  ADMIN_APPROVED
  PERFORMANCE_BASED

funding_source:
  COMPANY_MARGIN
  CUSTOMER_POOL_BLOCKED

risk_status:
  DRAFT
  CA_REVIEW_REQUIRED
  ADVOCATE_REVIEW_REQUIRED
  APPROVED_FOR_INTERNAL_TEST
  APPROVED_FOR_PUBLIC_LAUNCH
  BLOCKED
```

Backend must block public waiver workflows if:

```text
risk_status != APPROVED_FOR_PUBLIC_LAUNCH
```

or expose only internal/testing state if advocate approval is pending.

### 7.3 Waiver classification engine

Create/reuse service:

```text
WaiverClassificationEngine
```

Inputs:

```text
contract_id
customer_id
plan_type
product_id
gst_status
gst_effective_date
delivery_status
invoice_status
bill_status
total_contract_value
amount_paid
amount_invoiced
amount_due
waiver_month
eligibility_snapshot_id
ca_tax_rule_id
```

Outputs:

```text
waiver_allowed: boolean
waiver_accounting_mode:
  PRE_SUPPLY_CONTRACT_ADJUSTMENT
  PRE_GST_COMMERCIAL_CREDIT
  POST_SUPPLY_GST_CREDIT_NOTE
  POST_SUPPLY_COMMERCIAL_CREDIT_ONLY
  PROMOTIONAL_EXPENSE
  REFUND_VOUCHER

document_to_generate:
  NONE
  COMMERCIAL_WAIVER_NOTE
  COMMERCIAL_CREDIT_NOTE
  RECEIPT_VOUCHER
  REFUND_VOUCHER
  TAX_INVOICE
  GST_CREDIT_NOTE

gst_reduction_allowed: boolean
ledger_posting_template
audit_reason
blockers[]
warnings[]
```

### 7.4 Hash waiver service

Service must enforce:

```text
1. close payment cutoff
2. freeze eligible customer/Lucky ID snapshot
3. hash snapshot
4. commit fairness seed hash
5. reveal seed
6. select eligible Lucky ID
7. publish waiver record
8. generate waiver accounting classification
9. lock event/audit logs
```

No admin edit after snapshot commitment.

### 7.5 Cancellation/refund service

Fields:

```text
cancellation_request_date
requested_by
cancellation_reason
approved_by
approved_at
refund_due_date
refund_amount
refund_status:
  REQUESTED
  APPROVED
  REJECTED
  PROCESSING
  PAID
  FAILED
  CANCELLED
refund_mode
refund_reference
customer_acknowledged_at
audit_log_id
```

Rules:

- refund amount must be payment-reconciled,
- refund due date = approval date + 7 working days,
- no fixed deduction for Lucky Plan cancellation,
- financial posting through controlled service only.

### 7.6 Deposit inspection/refund service

Required entities/fields:

```text
ReturnInspection:
  contract_id
  product_id
  returned_at
  inspected_by
  condition_summary
  normal_wear_flag
  damage_flag
  photos[]
  notes
  status: DRAFT / SUBMITTED / APPROVED / REJECTED

DepositDeductionLine:
  inspection_id
  deduction_type
  amount
  evidence_reference
  approved_by

DepositSettlement:
  deposit_received
  total_deductions
  refundable_balance
  refund_status
  refund_reference
```

### 7.7 Partner receipt request lifecycle

```text
PartnerReceiptRequest:
  partner_id
  customer_id
  contract_id/subscription_id optional
  amount
  payment_mode
  partner_reference
  proof_attachment
  status:
    REQUESTED
    ADMIN_REVIEW
    APPROVED
    REJECTED
    RECEIPT_GENERATED
  admin_approved_by
  admin_approved_at
  rejection_reason
  final_receipt_id
```

Backend rule:

```text
PartnerReceiptRequest cannot create Payment/Receipt until admin approval confirms money received.
```

### 7.8 KYC privacy service

Fields:

```text
KycDocument:
  owner_type
  owner_id
  document_type
  masked_identifier
  identifier_last4
  verification_method
  verification_status
  expires_at / review_at
  encrypted_file_reference
  uploaded_by
  verified_by
  verified_at
```

Access log:

```text
KycAccessLog:
  document_id
  user_id
  action: VIEW / DOWNLOAD / VERIFY / REJECT
  timestamp
  ip_address
  reason
```

Backend must never return full document number in list/detail APIs unless a special secure endpoint exists and logs access.

### 7.9 Tax configuration

Product/inventory must support:

```text
hsn_code
sac_code
tax_category
sale_tax_rate
rent_tax_rate
lease_tax_rate
late_fee_tax_mode
deposit_adjustment_tax_mode
is_taxable
is_exempt
```

If `gst_status = UNREGISTERED`, frontend may show HSN/SAC as internal readiness only, not as tax charged.

---

## 8. Frontend settings and UX requirements

### 8.1 Global legal/GST banner

Admin dashboard should show:

```text
GST status: UNREGISTERED / APPLIED / REGISTERED
Invoice mode: NON_GST_BILL / GST_TAX_INVOICE
Lucky Plan waiver launch status: DRAFT / REVIEW / APPROVED
Refund SLA: 7 working days
Partner receipts: Admin approval required
```

### 8.2 Blocked actions

Frontend must block or disable:

| Condition | UI behavior |
|---|---|
| GST unregistered | Hide/block GST tax invoice and GST credit note |
| Waiver not approved for public launch | Show internal/testing warning |
| Partner receipt not admin-approved | Disable final receipt generation |
| Deposit return not inspected | Disable deposit refund closure |
| KYC full ID present in response | Redact and show privacy warning |
| Late fee rule missing | Disable late charge application |
| HSN/SAC missing after GST registration | Block GST invoice |

### 8.3 Customer-facing wording

Use:

- “Monthly waiver benefit”
- “eligible this month”
- “not eligible due to late payment”
- “audited fairness proof”
- “commercial waiver note”

Avoid:

- “lottery”
- “jackpot”
- “prize pool”
- “punishment”
- “guaranteed winner”

### 8.4 Admin workbench tabs

Add/confirm tabs:

**Revenue Workbench**

- Lucky Plan Waiver Events
- Eligibility Snapshot
- Ineligible Due to Late Payment
- Waiver Accounting Review
- Refund SLA Register
- Partner Receipt Requests

**Finance Control**

- GST Status
- Non-GST Bills
- GST Readiness
- Commercial Waivers
- Credit Notes
- Refund Payables
- Deposit Liabilities
- Late Payment Charges

**Customer 360**

- KYC masked docs
- Contract status
- EMI schedule
- Waiver eligibility
- Refund/cancellation status
- Rent/lease deposit status

### 8.5 Document labels

If unregistered:

```text
Retail Bill
Sale Bill
Money Receipt
Plan Receipt
Security Deposit Receipt
Commercial Waiver Note
Commercial Credit Note
Refund Record
```

If registered:

```text
Tax Invoice
Receipt Voucher
Refund Voucher
GST Credit Note
GST Debit Note
Bill of Supply where applicable
```

---

## 9. Environment and repo safety settings

### 9.1 Real secrets

Do not put real secrets in Git.

Use server/ops locations:

```text
/etc/subidha-core/backend.env
frontend/.env.production on server only
hosting/CI secret manager
```

Templates only in repo:

```text
backend/.env.production.template
frontend/.env.production.template
.env.example
```

### 9.2 Business rules belong in DB, not env

Do not use environment variables for changing customer financial behavior in production. Use DB-backed settings with audit logs.

Allowed env use:

```text
DJANGO_SECRET_KEY
DATABASE_URL
REDIS_URL
EMAIL_HOST
EMAIL_HOST_USER
EMAIL_HOST_PASSWORD
JWT_SECRET
CORS_ALLOWED_ORIGINS
SENTRY_DSN
```

Not env-only:

```text
refund percentage
waiver eligibility
late fee amount
GST status
deposit deduction types
partner approval rule
KYC retention rule
```

These must be admin-configured and audited.

---

## 10. Required tests

### Backend tests

- Unregistered business cannot generate GST tax invoice.
- Unregistered business cannot collect GST amount.
- GST registered business requires HSN/SAC/tax rate for tax invoice.
- Lucky Plan cancellation generates full refund due within 7 working days.
- Deposit refund blocked until inspection approved.
- Deposit deduction requires itemized evidence.
- Partner receipt request cannot generate final receipt before admin approval.
- Late-paid customer excluded from that month’s waiver snapshot.
- Eligibility snapshot cannot be edited after hash commitment.
- Waiver classification changes by delivery/invoice/GST status.
- KYC API never exposes full identifier.
- KYC view/download writes access log.

### Frontend tests

- GST unregistered mode shows non-GST document labels.
- GST invoice buttons are hidden/disabled in unregistered mode.
- Waiver event page shows eligibility/ineligibility reasons.
- Partner receipt approval queue requires admin approval.
- Refund SLA register shows due and overdue refunds.
- Deposit settlement form requires inspection and deduction breakup.
- KYC table shows masked ID only.
- Late payment charge cannot apply without configured policy.

### E2E smoke tests

- Direct sale non-GST bill flow.
- Lucky Plan subscription + receipt + eligibility snapshot.
- Late payment creates monthly ineligibility.
- Cancellation creates refund due date.
- Rent/lease return inspection + deposit settlement.
- Partner receipt request -> admin approval -> final receipt.

---

## 11. Codex implementation prompt

Paste this from repo root when ready:

```text
Create a production-ready legal/CA/business-rule implementation pass for SUBIDHA CORE.

Context:
- Do not restart architecture.
- Keep all changes additive and backward-compatible.
- Do not change EMI calculation, payment posting, receipt generation, invoice generation, stock ledger, reconciliation, commission, payout, or existing audit behavior.
- Current business starts without GST number, so support UNREGISTERED mode.
- Lucky Plan is not linked to Nagaland lottery or any external lottery.
- Lucky Plan must be treated as Product Instalment Sale with Company-Funded Monthly Waiver Benefit.

Goals:
1. Add docs/legal/subidha-contracts-backend-frontend-settings.md using this handoff as source.
2. Inspect current models/settings before coding.
3. Add or reuse DB-backed business settings for GST status, invoice mode, waiver legal status, refund SLA, late-fee policy, KYC masking, partner receipt approval, and deposit deduction rules.
4. Do not put business rules only in env variables.
5. Block GST tax invoice / GST collection / GST credit note when GST_STATUS=UNREGISTERED.
6. Ensure non-GST documents use Retail Bill, Sale Bill, Money Receipt, Plan Receipt, Commercial Waiver Note, Commercial Credit Note, Refund Record.
7. Add waiver classification service that chooses treatment from delivery_status + invoice_status + gst_status.
8. Add monthly waiver eligibility snapshot that excludes late-paid customers.
9. Ensure cancellation refund policy supports full refund within 7 working days.
10. Enforce partner receipt request -> admin approval -> final receipt lifecycle.
11. Enforce deposit inspection before deposit refund/deduction closure.
12. Ensure KYC APIs return masked identifiers only and log document access.
13. Add frontend admin settings/readiness UI for GST status, waiver launch status, refund SLA, partner receipt controls, KYC privacy, and late-fee rules.
14. Add tests for all new behavior.

Required output:
- Summary
- Files changed
- Migrations required
- API contract changes
- Frontend changes
- Tests added/run
- Risks/assumptions
- What still requires advocate/CA review
```

---

## 12. Official reference checklist for advocate/CA

Advocate/CA should verify latest applicability before launch:

1. Prize Chits and Money Circulation Schemes (Banning) Act, 1978 — classification risk around money collected in instalments/subscriptions and benefits awarded periodically.
2. CGST Act Section 22 — registration threshold and aggregate turnover.
3. CGST Act Section 25 — registration application timeline and voluntary registration.
4. CGST Act Section 31 — tax invoice, receipt voucher, refund voucher.
5. CGST Act Section 32 — unregistered person cannot collect tax.
6. CGST Act Section 15 — value of supply, late fee, discount treatment.
7. CGST Act Section 34 — credit/debit note treatment.
8. UIDAI masked Aadhaar and Aadhaar Paperless Offline e-KYC guidance.
9. DPDP/privacy compliance for customer documents.
10. West Bengal stamp duty and local contract enforceability.

---

## 13. Final launch gate

Do not public-launch Lucky Plan waiver until these are true:

```text
[ ] Advocate approves Lucky Plan classification and contract wording.
[ ] CA approves pre-GST and post-GST document/accounting treatment.
[ ] GST status mode is implemented and tested.
[ ] Waiver classification engine is implemented and tested.
[ ] No customer money pool ledger exists.
[ ] Partner receipt direct finalization is blocked.
[ ] Refund SLA register works.
[ ] Deposit inspection/deduction workflow works.
[ ] KYC masking and access logging work.
[ ] Frontend wording is waiver-based, not lottery/prize-based.
```

