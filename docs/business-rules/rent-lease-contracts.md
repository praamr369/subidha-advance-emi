# Rent/Lease Contracts: Stock-on-Hand, Customer KYC, Supporting Documents, and Contract Activation Gating

This document is the canonical business and operational rulebook for **Furniture Rent and Lease Contracts** in SUBIDHA CORE. It serves as the single source of truth for operators, developers, and AI agents.

---

## 1. Core Business Invariants & Lifecycle Scenario

### 1.1 Product & Stock-on-Hand Prerequisite
- A Rent or Lease contract cannot exist in isolation; it represents the operational custody transfer of real furniture assets.
- **Product Eligibility**:
  - The product must have `is_rent_enabled = True` for Rent contracts.
  - The product must have `is_lease_enabled = True` for Lease contracts.
- **Stock-on-Hand Verification**:
  - Stock must exist in the showroom / warehouse, loaded through verified Purchase Orders (PO) from approved furniture vendors.
  - Units must be received and recorded in the Stock Ledger before physical possession / delivery handover.
  - Active Rent/Lease contracts block direct-sale finalization on the same asset units to prevent selling items currently under rental custody.

### 1.2 Customer KYC & Supporting Document Taxonomy
Rent and lease plans involve ongoing operational risk (the furniture leaves the store without immediate full payment). Therefore, strict identity and premises verification is mandatory:

| Document Key | Category | Requirement Level | Purpose |
| :--- | :--- | :--- | :--- |
| **Masked Aadhaar / PAN / Voter ID / Passport / DL** | `ID_PROOF` | **MANDATORY for Activation** | Primary identity verification. Per DPDP Act, Aadhaar numbers are masked; full numbers are never stored in plaintext. |
| **Address Proof (Aadhaar / Utility Bill / Voter ID)** | `ADDRESS_PROOF` | **MANDATORY for Activation** | Verifies permanent / communication residence of the customer. |
| **Rent Agreement / Tenancy Proof** | `SUPPORTING_DOC` | **MANDATORY for Activation** | Verifies the physical premises (residential or commercial) where the rented/leased furniture will be placed and utilized. |
| **Customer Photo & Signature** | `IDENTITY_PROOF` | **MANDATORY for Onboarding** | Visual biometric & signature confirmation for contract creation. |
| **Security Deposit Receipt** | `DEPOSIT_RECEIPT` | **MANDATORY for Handover** | Confirms 20%–30% security deposit collected into the deposit ledger. |
| **Asset Handover Note / Acknowledgement** | `HANDOVER_PROOF` | **MANDATORY for Delivery** | Delivery staff and customer co-sign condition note upon physical handover. |

### 1.3 Multi-Product Furniture Basket (Rent & Lease Only)
- In real furniture showroom operations, customers frequently rent or lease entire room sets (e.g., Bedroom Package: 1 Double Bed + 2 Mattresses + 1 Wardrobe + 2 Side Tables).
- RENT and LEASE contracts support attaching **multiple furniture products** under a single unified customer agreement.
- Line items are modeled through `ContractItem` records:
  - Each item carries `product`, `quantity`, `unit_base_price`, `total_base_price`, `monthly_yield_percent`, `monthly_amount`, `security_deposit_percent`, and allocated `security_deposit_amount`.
  - Admin can manually configure product-specific monthly yield rate (e.g., 5%, 7.5%) and product-specific security deposit percentage/fixed amount for each item individually on the contract creation page, allowing non-uniform pricing across mixed inventory packages.
  - Overall recurring contract monthly billing demand equals the sum of all line item monthly amounts.
  - Overall security deposit equals the sum of all itemized security deposits (with effective deposit percentage computed dynamically).
  - Legacy or single-product Rent/Lease contracts remain 100% backward compatible, automatically generating an initial `ContractItem` line.
- **Strict Invariant**: Lucky Plan Advance EMI (`PlanType.EMI`) is strictly isolated and single-product (1 contract = 1 product = 1 Lucky ID = 1 batch slot); multi-product basket attachment is exclusively for RENT and LEASE.

---

## 2. Strict State Machine & Activation Gating

```
[ DRAFT ]  --( Upload KYC & Supporting Docs + Collect Deposit )-->  [ APPROVED / ACTIVE ]  --( Delivery & Handover )-->  [ HANDED OVER ]
    |
    +--> Staff can register customer & pricing as DRAFT even if documents are pending.
    |
    X--> CANNOT transition to ACTIVE without Verified KYC + Supporting Documents.
    X--> CANNOT transition to HANDED OVER without Deposit Receipt + Handover Proof.
```

### 2.1 The `DRAFT` State Rule
- Store operators **can always create and save a contract as `DRAFT`** (`status = DRAFT`).
- Draft creation does **not** hard-block on missing KYC or missing rent agreements.
- This allows sales staff to capture customer intent, lock tenure (e.g., 12 months) and yield rates (e.g., 5.00%), and issue draft quotes while the customer gathers their documents.

### 2.2 The `ACTIVE` State Gate (Hard-Block Invariant)
A contract **CANNOT be Activated** (`status = ACTIVE`) unless all of the following conditions are met:
1. Customer `kyc_status` is `VERIFIED`, `APPROVED`, or `EXCEPTION_APPROVED`.
2. A verified primary ID proof (`AADHAAR`, `PAN`, `VOTER_ID`, `PASSPORT`, or `DRIVING_LICENSE`) is on file.
3. Customer address proof and supporting Rent Agreement / premises usage proof are uploaded to the customer profile or contract vault.
4. Security deposit is computed within the mandatory 20.00% to 30.00% range.
5. In the backend, `enforce_contract_kyc_gate(plan_type=RENT|LEASE, stage="activate")` and `assert_contract_activation_ready(subscription)` strictly reject activation with a controlled `HTTP 400 (KYC_REQUIRED / CONTRACT_ACTIVATION_NOT_READY)` if any requirement is unfulfilled.

### 2.3 The `DELIVERY / HANDOVER` Gate
- Physical dispatch from the warehouse/showroom is strictly blocked until:
  - Contract is in `ACTIVE` status.
  - Security deposit payment is confirmed in the deposit ledger (`RentLeaseDepositTransaction`).
  - Signed Asset Handover Acknowledgement is generated and uploaded.

---

## 3. Data Privacy, In-House Security & Future Paid API Architecture

### 3.1 Privacy-First & Zero-Data-Leakage Design (Current System)
- SUBIDHA CORE operates an **in-house, secure verification vault**:
  - Customer PII and identity documents are stored in secure, access-controlled media roots.
  - All document views, downloads, approvals, and rejections are strictly recorded in the tamper-evident `AuditLog`.
  - Operator UI masks identity documents to comply with the Digital Personal Data Protection (DPDP) Act 2023.

### 3.2 Future Paid KYC API Integration (Roadmap)
- In the future, SUBIDHA CORE will support automated verification via paid identity APIs (e.g., Digilocker, Karza, Cashfree, Surepass, IDfy):
  - **Bridge Pattern**: The automated API will fetch customer-authorized Aadhaar/PAN records via OTP and deposit the verified payload directly into `CustomerKycDocument`.
  - **No Bypass of Core Rules**: Whether verified manually by store admin or automatically via paid API, the contract activation gate remains identical—`kyc_status` must transition to `VERIFIED` and the supporting premises proof must be present.
  - **Data Sovereignty**: Third-party API credentials and response tokens are ephemeral; customer documents remain securely encapsulated within SUBIDHA CORE's PostgreSQL and media storage.

---

## 4. Frontend Creation Workflow & Workfield Integration

- The Admin Contract Creation workspace (`/admin/subscriptions/advance-emi/create`) includes a dedicated **Rent & Lease Document Verification Workfield**:
  - Real-time badge display of customer's current KYC status (`VERIFIED` vs `ACTION REQUIRED`).
  - Integrated ID Document uploader (Aadhaar, PAN, Voter ID, Passport, Driving License) that directly updates the customer profile upon contract submission.
  - Integrated Supporting Document uploader for Rent Agreement / Tenancy Deed.
  - Dual action buttons:
    - **"Activate Contract"**: Enabled only when KYC and all required documents are satisfied.
    - **"Save as Draft"**: Always accessible to save progress without blocking sales operations.
