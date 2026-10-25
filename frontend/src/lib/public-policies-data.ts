export type CodifiedPolicy = {
  slug: string;
  title: string;
  category: string;
  version: string;
  effectiveDate: string;
  summary: string;
  content: string;
};

export const CODIFIED_PUBLIC_POLICIES: Record<string, CodifiedPolicy> = {
  terms: {
    slug: "terms",
    title: "Terms and Conditions",
    category: "GENERAL",
    version: "2.4",
    effectiveDate: "2026-08-20",
    summary:
      "Authoritative terms governing all transactions, orders, contracts, payments, deliveries, hire-purchase rights, and service arrangements at Subidha Furniture.",
    content: `# Terms and Conditions

**Subidha Furniture** (Proprietor: Pradip Roy, Business Code: SUBIDHA-ASN-001) operates from South Dhadka Sukantapally, Near Rupkatha Cinema Hall, Dakhin Dhadka, Asansol, Paschim Barddhaman, West Bengal 713302. By engaging with our website, showroom, staff, products, plans, or services, you agree to be bound by these Terms and Conditions.

## 1. Scope and Legal Enforceability

These Terms and Conditions constitute a legally binding agreement between the customer (hereinafter referred to as the "Customer" or "User") and Subidha Furniture. They govern all commercial engagements, including:
1. Direct showroom and online purchases (Direct Sales).
2. Subscription to the Lucky Plan Advance EMI program.
3. Furniture and appliance rental agreements (Rent Contracts).
4. Long-term furniture leasing arrangements (Lease Contracts).
5. Delivery, handover, warranty, after-sales maintenance, and customer service workflows.
6. Partner, agent, and referral collaborations.

## 2. Authoritative Business Records and Financial Invariants

1. **System-Generated Records as Sole Proof**: Only system-generated invoices, printed contracts with unique contract reference numbers, tamper-evident digital receipts, verified Proof of Delivery (POD) notes, and approved credit/debit adjustment notes constitute valid legal proof of transactions.
2. **Exclusion of Informal Commitments**: Verbal statements, informal text messages, unverified WhatsApp chats, handwritten receipts, or unofficial staff assurances are strictly non-binding on Subidha Furniture.
3. **Immutable and Append-Only History**: Financial and ledger records are append-only. No payment, EMI settlement, or accounting journal may be silently edited or deleted. Corrections are strictly executed through auditable reversal and adjustment entries.

## 3. Direct Sales & Ownership Transfer

1. **Invoicing and Ownership Transfer**: Ownership and legal title to products purchased under Direct Sale transfer to the customer only upon:
   - Full settlement of the total invoice value (100% payment receipted); and
   - Execution of the physical delivery and handover note.
2. **Partial Payments and Title Retention**: If a direct sale is provisioned with partial advance payment, Subidha Furniture retains full legal title, lien, and custody control over the goods until the outstanding balance is completely settled.
3. **Price Quotations**: Quotations issued by showroom staff are valid for seven (7) calendar days unless otherwise specified in writing.

## 4. Lucky Plan Advance EMI & Draw Invariants

1. **Subscription Structure**: The Lucky Plan is a structured advance installment plan for furniture acquisition over an approved tenure (e.g., 10 to 15 months). The product base price constitutes the total contract value, and monthly EMI equals the total contract value divided by the tenure months.
2. **Lucky ID Assignment**: Customers are assigned a batch-specific Lucky ID (00 to 99). Assignment of a Lucky ID does not guarantee any prize, winning, or financial return.
3. **Fair Draw Integrity (Commit-then-Reveal)**: Monthly draws are conducted transparently using cryptographic SHA-256 commit-then-reveal procedures. A commitment hash is published prior to the draw, and the revealed winning number must match the hash.
4. **Winner Benefit Scope (Strictly Future EMI Waiver)**:
   - If a customer's Lucky ID is drawn as the winner, remaining unpaid future EMI obligations from the winning month onward are waived 100%.
   - **Zero Cash Refund**: Under no circumstances is any previously settled EMI refunded in cash, bank transfer, or credit. The benefit is strictly future-facing.
5. **Advance Delivery & Hire-Purchase Title Retention**:
   - Customers paying an advance prepayment threshold (60% to 80% upfront) qualify for immediate same-day delivery.
   - Legal title and ownership remain with Subidha Furniture under Hire-Purchase principles until 100% of the contract value is settled (either by completing remaining installments or via an audited draw waiver).
   - In case of payment default exceeding thirty (30) days, Subidha Furniture reserves the enforceable legal right to repossess the goods.
6. **Statutory Non-Gambling Declaration**: Lucky Plan is a purchase plan backed by physical goods. It is strictly compliant with the Prize Chits and Money Circulation Schemes (Banning) Act, 1978, and the Banning of Unregulated Deposit Schemes (BUDS) Act, 2019.

## 5. Rent and Lease Contracts

1. **Custody Transfer Without Ownership**: Rent and Lease contracts grant temporary possessory custody only. Physical products remain the exclusive corporate property of Subidha Furniture at all times.
2. **Mandatory KYC and Tenancy Verification**: Contract activation is strictly conditioned upon verified customer KYC (Masked Aadhaar/PAN/Voter ID/DL) and proof of premises tenancy (Rent Agreement or utility bill).
3. **Security Deposit**: A refundable security deposit of 20% to 30% of asset value is collected into a segregated deposit ledger. Deposits are not operational revenue and are refundable post-tenure subject to condition inspection.
4. **45-Day Arrears Cutoff & Repossession**: Monthly rent demands must be paid by the due date. Staff are legally mandated to initiate repossession pickup if rent arrears exceed 45 days, preventing deposit exhaustion.
5. **Prohibition of Sale or Relocation**: Rented or leased items must not be sub-let, pledged, mortgaged, sold, or relocated without prior written consent from Subidha Furniture.

## 6. Payment Discipline and Receipts

1. **Approved Payment Channels**: Payments must be remitted solely via Cash Counter, authorized UPI QR codes, or designated Company Bank Transfer accounts.
2. **Mandatory Official Receipt**: Every valid payment must generate a system receipt displaying date, amount, payment method, transaction reference, and cashier ID. Unreceipted transactions are not recognized.
3. **Reversal Protocol**: Payment reversals require administrative authorization, formal reason capture, and an append-only reversal journal entry.

## 7. Delivery, Handover & Proof of Delivery (POD)

1. **Stock-on-Hand Prerequisite**: Goods must physically exist in the Stock Ledger before dispatch.
2. **Mandatory Delivery Inspection**: The customer or authorized representative must physically inspect items upon delivery. Signing the Delivery Handover Note and providing photographic POD confirms acceptance in sound, undamaged condition.
3. **Transit Risk**: Risk of loss or external damage transfers to the customer upon co-signing the Delivery Handover Note.

## 8. Warranty, Service & Repairs

1. **Warranty Coverage**: Warranties cover inherent manufacturing, joinery, and structural defects as per brand and manufacturer guidelines.
2. **Exclusions**: Warranty strictly excludes damage caused by transit mishandling post-delivery, customer abuse, overloading, water/liquid exposure, fire, pest or termite infestation, unauthorized repairs, or commercial usage of residential furniture.
3. **Service Ticketing**: Service requests must be logged through official customer desk channels generating an auditable ServiceDesk ticket.

## 9. Customer Grievance and Dispute Resolution

1. **3-Tier Escalation**: Disputes must first be submitted to the Showroom Service Desk, escalating if unresolved to the designated Grievance Officer, and subsequently to Executive Management.
2. **Jurisdiction**: Any legal action, dispute, or proceeding arising under these Terms shall be subject to the exclusive jurisdiction of the competent civil courts at Asansol, Paschim Barddhaman, West Bengal.`,
  },

  "direct-sale-policy": {
    slug: "direct-sale-policy",
    title: "Direct Sale Policy",
    category: "DIRECT_SALE",
    version: "2.1",
    effectiveDate: "2026-08-20",
    summary:
      "Operational and legal guidelines governing retail furniture sales, billing invoices, partial payment terms, pre/post-invoice cancellation, returns, and exchanges.",
    content: `# Direct Sale Policy

This policy governs all retail and direct sales transactions executed at the Subidha Furniture showroom, online portal, or authorized sales desks.

## 1. Commercial Quotations & Sales Orders

1. **Quotation Validity**: Quotations generated by the sales desk reflect current stock valuation and are valid for seven (7) calendar days.
2. **Order Confirmation**: A sales order is confirmed only when registered in the billing system with verified customer identity, product SKU, quantity, pricing, and tax specifications.
3. **Product Inspection Prior to Billing**: Customers visiting the showroom are encouraged to inspect showroom display pieces and material swatches prior to order finalization.

## 2. Invoicing, Payments & Title Retention

1. **Tax Invoice Generation**: Every confirmed sale generates an official tax invoice. Invoices are sequentially numbered and logged in the sales ledger.
2. **Immediate Ownership Transfer**: When 100% of the invoice value is paid via approved payment channels (Cash, UPI, Bank Transfer), ownership title transfers to the customer upon delivery handover.
3. **Partial Advance Payments & Title Retention**:
   - If an order is accepted with partial advance payment (minimum 30% booking deposit), legal title and ownership remain strictly with Subidha Furniture.
   - Physical dispatch is held until 100% of the invoice balance is receipted, unless a specific manager-approved advance delivery contract is executed under hire-purchase terms.
   - If the customer fails to pay the remaining balance within thirty (30) days of notification, Subidha Furniture reserves the right to cancel the order and apply cancellation charges.

## 3. Pre-Invoice and Post-Invoice Cancellation

1. **Pre-Invoice Cancellation**: An order in draft or confirmed state prior to tax invoice generation may be cancelled without penalty. Any advance received is credited to the customer account.
2. **Post-Invoice Pre-Delivery Cancellation**:
   - If the invoice has been posted but products have not been dispatched, cancellation generates an official Credit Note.
   - Stock reservations are released back to Available-to-Promise (ATP) inventory.
   - Customer funds are held as Customer Credit or refunded via approved payout workflow.
3. **Delivered Sale Cancellation**: Once goods are delivered and the handover note is signed, cancellation is treated under the Delivered Return rules below.

## 4. Delivered Returns, Inspections & Restocking

1. **Eligibility Window**: Delivered retail furniture may be considered for return within three (3) calendar days of delivery only under the following conditions:
   - Product exhibits a verifiable manufacturing defect not resolvable by service technicians; or
   - Product delivered does not match the specifications on the invoice.
2. **Non-Returnable Items**: Customized furniture, bespoke upholstery, mattresses with broken hygiene packaging, assembled modular wardrobes, and floor-clearance items are strictly non-returnable.
3. **Stock Destination Routing**:
   - Undamaged returns are returned to sellable warehouse stock via \`SALE_RETURN_IN\` movement.
   - Damaged or defective items are routed strictly to non-sellable inspection locations for vendor return or repair.

## 5. Exchanges and Price Differentials

1. **Exchange Requests**: Exchange requests must be submitted within three (3) days of delivery and require managerial approval.
2. **Higher-Value Replacement**: If the replacement item has a higher invoice value, the customer must pay the price difference prior to delivery dispatch.
3. **Lower-Value Replacement**: If the replacement item has a lower invoice value, the difference is issued as Customer Credit after the returned unit is inspected and checked into stock.

## 6. Credit Notes and Refund Payouts

1. **Credit Note Authority**: Returns, cancellations, and overpayments generate an audited Credit Note.
2. **Refund Payout Controls**: Refunds are never disbursed in cash at the counter without authorization. All refund payouts follow a three-stage audit workflow: Draft Request -> Manager Approval -> Bank/UPI Payout Disbursement.`,
  },

  "vendor-purchase-policy": {
    slug: "vendor-purchase-policy",
    title: "Vendor Purchase and Procurement Policy",
    category: "PURCHASES",
    version: "2.0",
    effectiveDate: "2026-08-20",
    summary:
      "Procurement standards, purchase order controls, goods receipt verification, stock ledger posting, vendor returns, and warranty pass-through rules.",
    content: `# Vendor Purchase and Procurement Policy

This policy governs the acquisition of furniture, raw materials, components, and appliances from manufacturers, wholesalers, and vendors supplying Subidha Furniture.

## 1. Vendor Onboarding and Commercial Eligibility

1. **Vendor Verification**: All suppliers must complete commercial verification, providing valid GSTIN (where applicable), PAN, trade license, MSME certificate, and registered workshop/factory address.
2. **Commercial Contracts**: Purchases are executed solely under approved Purchase Orders (PO) establishing unit pricing, quality standards, transit responsibility, and warranty commitments.
3. **Invoice Separation**: Vendors invoice Subidha Furniture directly. Vendors have no legal privity of contract with Subidha Furniture's retail or subscription customers.

## 2. Purchase Orders & Stock-on-Hand Invariant

1. **Mandatory PO Requirement**: No inventory unit may enter showroom or warehouse premises without an approved, system-generated Purchase Order.
2. **Stock-on-Hand Verification**:
   - All furniture intended for Direct Sale, Lucky Plan delivery, Rent, or Lease must be physically received, inspected, and posted to the Stock Ledger.
   - Fictitious or speculative inventory entries are strictly prohibited.
3. **Goods Receipt Note (GRN)**: Upon arrival at the central warehouse, receiving staff inspect shipments against the PO and generate a Goods Receipt Note verifying SKU, quantity, finish, and packaging condition.

## 3. Stock Ledger Movement & Billing Entry

1. **Inventory Posting**: Verified shipments post an immutable \`PURCHASE_IN\` transaction to the Stock Ledger, incrementing inventory valuation.
2. **Purchase Bill Verification**: Receiving staff match the vendor invoice against the PO and GRN. Valid bills are entered into the purchase ledger with mapped accounting heads.
3. **Quality Hold & Non-Conforming Items**: Units failing visual or structural inspection are flagged with \`QUALITY_HOLD\` status and segregated in quarantine stock.

## 4. Vendor Purchase Returns

1. **Eligibility and Quantity Controls**:
   - A purchase return is strictly linked to an existing posted purchase bill.
   - Return quantity cannot exceed the purchased quantity minus quantities already returned.
2. **Mandatory Return Reason**: Every vendor return must specify an approved reason (e.g., Transit Damage, Structural Joinery Defect, Specification Mismatch, Quality Rejection).
3. **Ledger & Accounting Effects**:
   - The returned items trigger a \`PURCHASE_RETURN_OUT\` movement in the Stock Ledger.
   - An audited Vendor Debit Note is generated, adjusting vendor payables and tax records.
   - The original purchase bill remains immutable for historical audit trails.

## 5. Manufacturer Warranty Pass-Through & Service SLAs

1. **Warranty Pass-Through**: Vendors must honor agreed warranty terms for structural woodwork, hardware, hydraulic mechanisms, and foam density.
2. **Replacement Turnaround**: For non-repairable manufacturing defects reported within thirty (30) days of receipt, the vendor is obligated to provide unit replacement or credit note within fourteen (14) business days.
3. **Spare Parts Availability**: Vendors supplying modular and mechanical furniture must guarantee functional spare parts availability for a minimum of twenty-four (24) months post-procurement.`,
  },

  "refund-cancellation": {
    slug: "refund-cancellation",
    title: "Refund and Cancellation Policy",
    category: "REFUND",
    version: "2.3",
    effectiveDate: "2026-08-20",
    summary:
      "Comprehensive rules governing transaction cancellations, physical return eligibility, deposit deductions, credit note creation, and approved refund payout workflows.",
    content: `# Refund and Cancellation Policy

Subidha Furniture maintains fair, auditable, and transparent standards for order cancellations, returns, and refunds across all business plans.

## 1. Unified Cancellation Governance

1. **Append-Only Accounting**: In accordance with core financial invariants, cancellation does not erase transactional history. System-generated credit notes, return movements, and reversal journals record every cancellation event.
2. **Pre-Dispatch vs Post-Delivery**:
   - Pre-dispatch cancellations are processed with zero or nominal handling charges.
   - Post-delivery cancellations require physical condition inspection and are subject to transport and restocking adjustments.

## 2. Plan-Specific Cancellation Rules

### A. Direct Sale Purchases
1. **Pre-Invoicing**: Full refund/credit of any advance payment.
2. **Post-Invoice Prior to Dispatch**: Invoice cancelled via Credit Note. Full payment refunded via original mode within 5 to 7 business days.
3. **Post-Delivery**: Return accepted only within 3 days for verifiable manufacturing defects. Product must be unused and in original packaging.

### B. Lucky Plan Advance EMI Subscriptions
1. **Prior to Batch Draw Lock**: If a customer requests cancellation while the batch is in \`OPEN\` status, the subscription is marked \`CANCELLED\`.
   - The assigned Lucky ID is returned to \`AVAILABLE\` status.
   - Paid EMIs are credited to customer balance or refunded per contract cancellation clauses.
2. **After Batch Draw Lock**: Once the batch transitions to \`LOCKED\`, \`DRAW_COMMITTED\`, or \`DRAW_COMPLETED\`:
   - The Lucky ID link is permanently frozen to preserve legal draw auditability.
   - The subscription may be cancelled, but the Lucky ID cannot be reassigned.
3. **Zero Cash Refund for Lucky Draw Winners**:
   - Winning a draw waives remaining future EMI obligations 100%.
   - **No cash refund** is ever provided for EMIs or advance down payments settled prior to the winning draw.

### C. Rent and Lease Contracts
1. **Cancellation Prior to Handover**: Security deposit and advance rent refunded in full minus nominal documentation charges.
2. **Early Termination During Tenure**: Customer must provide fifteen (15) days written notice. Monthly rent is prorated to the handover date.
3. **Deposit Refund**: Security deposit is refunded post-inspection, subject to deduction of outstanding rent dues, repair costs, and missing components.

## 3. Physical Inspection & Condition Grading

Returned furniture is subjected to technical inspection and classified into four grades:
- **Grade A (Pristine / Normal Wear)**: No functional or cosmetic damage. 100% eligible refund/deposit release.
- **Grade B (Minor Blemishes / Cleaning Required)**: Superficial scuffs or dust requiring showroom polishing. Nominal cleaning fee deducted.
- **Grade C (Repairable Physical Damage)**: Scratched laminates, broken handles, or soiled fabric. Documented repair cost deducted from refund/deposit.
- **Grade D (Structural Failure / Unrepairable / Missing Parts)**: Broken frames or missing major sections. Assessed at full replacement cost against customer deposit or outstanding credit.

## 4. Refund Payout Workflow

1. **No Cash-at-Counter Refunds**: To maintain cash desk audit integrity, refunds are never disbursed as unrecorded cash.
2. **Three-Stage Audit Workflow**:
   - **Stage 1 (Draft Request)**: Initiated by service desk with attached inspection report and Credit Note.
   - **Stage 2 (Managerial Approval)**: Reviewed and authorized by administrative proprietor.
   - **Stage 3 (Payout Execution)**: Remitted via original payment channel (Bank Transfer or UPI) within seven (7) banking days.
3. **Customer Credit Option**: Customers may opt to retain funds as Customer Credit in their customer account for future furniture purchases or installments.`,
  },

  "delivery-policy": {
    slug: "delivery-policy",
    title: "Delivery and Fulfillment Policy",
    category: "DELIVERY",
    version: "2.3",
    effectiveDate: "2026-08-20",
    summary:
      "Delivery eligibility gates, stock-on-hand requirements, advance delivery prepayment provisions, proof of delivery (POD) standards, and exception protocols.",
    content: `# Delivery and Fulfillment Policy

This policy governs warehousing, transit, delivery dispatch, and physical asset handover for all Subidha Furniture products.

## 1. Stock-on-Hand Prerequisite

1. **Physical Inventory Verification**: No delivery request may be scheduled or dispatched unless the specific inventory items physically exist in the central warehouse or showroom stock ledger.
2. **Strict Prohibition of Speculative Deliveries**: Staff cannot confirm delivery dates based on anticipated vendor shipments that have not cleared warehouse Goods Receipt inspection.

## 2. Lucky Plan EMI Delivery Eligibility Gates

A customer enrolled in the Lucky Plan Advance EMI program becomes eligible for delivery **only** upon satisfying one of the following three objective conditions:

1. **Condition 1 (Draw Winner)**: The customer's subscription achieves \`WON\` status following an audited monthly draw. Delivery eligibility unlocks immediately upon draw result publication.
2. **Condition 2 (Tenure Completion)**: The customer settles 100% of scheduled monthly EMIs, achieving \`COMPLETED\` subscription status.
3. **Condition 3 (Advance Prepayment Threshold - 60% to 80%)**:
   - Customers paying the contractually provisioned advance prepayment threshold (60% to 80% of total contract value upfront at enrollment) qualify for **Same-Day Enrollment & Same-Day Delivery**.
   - This provision provides immediate asset enjoyment while retaining hire-purchase protections.

**Ineligible Subscriptions**: Customers who have not won a draw, not completed their tenure, and not satisfied the 60%–80% prepayment threshold are strictly ineligible for delivery dispatch.

## 3. Admin Override (Force-Release Delivery)

1. **Exceptional Authorization**: Store management may exercise an administrative override to approve delivery for an otherwise ineligible subscription.
2. **Visible Audit Badge**: Any subscription delivered via management discretion must permanently display the **"Admin Override"** badge across all backend records, customer profiles, and printed delivery challans.
3. **Elevated Risk Tracking**: Admin-override deliveries are tracked in high-risk operational queues until contract completion.

## 4. Proof of Delivery (POD) Requirements

Physical handover requires complete execution of the Proof of Delivery protocol:
1. **Recipient Verification**: Handover must be made to the registered customer or an authorized adult representative presenting verified ID.
2. **Joint Condition Inspection**: Recipient and delivery driver jointly inspect woodwork, polish, glass, upholstery, and mechanical joints.
3. **Mandatory Documentation**: The delivery team must capture:
   - Co-signed physical Delivery Handover Note;
   - Clear digital photograph of the delivered item positioned in the premises;
   - Driver name, vehicle number, and timestamped GPS coordinates.

## 5. Delivery Areas, Transit Times & Failed Handover

1. **Primary Operational Area**: Standard delivery covers Asansol, Raniganj, Durgapur, Kulti, Jamuria, Burnpur, Chittaranjan, and contiguous districts of Paschim Barddhaman.
2. **Customer Availability**: Customers are provided a 4-hour delivery window. If the premises are inaccessible or the customer is unavailable after reasonable notice:
   - The shipment returns to the warehouse with \`FAILED_DELIVERY\` status.
   - Re-delivery requires payment of standard secondary transit charges.
3. **Site Access and Stairways**: Customers must verify that building doorways, stairwells, and passages permit passage of assembled furniture. Hoisting through balconies or upper floors is undertaken at customer risk.`,
  },

  "lucky-plan-policy": {
    slug: "lucky-plan-policy",
    title: "Lucky Plan Advance EMI Policy",
    category: "LUCKY_PLAN",
    version: "2.4",
    effectiveDate: "2026-08-20",
    summary:
      "Operational framework, batch structure, Lucky ID rules, commit-then-reveal fair draw mechanisms, advance delivery terms, and future EMI waiver invariants.",
    content: `# Lucky Plan Advance EMI Policy

Subidha Furniture's **Lucky Plan** is an innovative retail installment program enabling households to acquire high-quality furniture through transparent, disciplined monthly advance installments combined with an auditable fair-draw waiver benefit.

## 1. Commercial Foundation & Regulatory Compliance

1. **Product-Backed Purchase**: The Lucky Plan is not a lottery, wager, chit fund, or financial deposit scheme. Every subscription is anchored to a specific, tangible furniture product.
2. **Statutory Alignment**: Operates in full compliance with:
   - Prize Chits and Money Circulation Schemes (Banning) Act, 1978 (participation creates no financial loss; product value matches all payments);
   - Banning of Unregulated Deposit Schemes (BUDS) Act, 2019 (all payments constitute advance consideration for retail goods);
   - Section 15 of the Central Goods and Services Tax (CGST) Act, 2017.
3. **Contract Value Determination**: The product's showroom base price represents the total contract value. Monthly EMI is deterministically computed by dividing the total contract value by the batch tenure (e.g., 10 to 15 months).

## 2. Batch Architecture & Lucky ID Allocation

1. **Managed Batch Cycles**: Subscriptions are organized into structured batches containing a maximum of 100 slots (numbered 00 to 99).
2. **Lucky ID Assignment**:
   - Each enrolled customer is allocated a unique Lucky ID within their chosen batch upon initial installment payment.
   - A customer may enroll in multiple subscriptions across the same or different batches, receiving an independent Lucky ID for each contract.
   - Lucky ID allocation does not guarantee winning.

## 3. Advance Delivery Facility (60% to 80% Prepayment)

1. **Same-Day Delivery Privilege**: Customers opting for the Advance Delivery provision pay between 60% and 80% of the total contract value at enrollment. This unlocks immediate stock allocation and same-day delivery.
2. **Hire-Purchase Title Retention**:
   - Products delivered under advance prepayment remain under Hire-Purchase title retention.
   - Legal ownership remains strictly with Subidha Furniture until 100% of the contract value is settled.
   - The customer maintains possessory custody as a bailee and must care for the asset.
3. **30-Day Default Repossession**: In the event of payment default exceeding thirty (30) days on remaining installments, Subidha Furniture reserves the enforceable right to repossess the goods.

## 4. Cryptographic Fair Draw Procedure (Commit-then-Reveal)

1. **Batch Lock**: Prior to draw execution, batch eligibility is locked. An immutable cryptographic snapshot of all active, eligible Lucky IDs is recorded.
2. **SHA-256 Commitment**:
   - Before the draw, the system generates a random seed and commitment string, computing its SHA-256 cryptographic hash.
   - The commitment hash is publicly published on the website prior to the draw event.
3. **Public Reveal & Verification**:
   - Following the physical or automated draw selection, the secret seed and winning number are revealed.
   - Any customer or auditor can verify that \`SHA256(seed + winning_number) == published_hash\`, proving mathematically that the winning number was not altered retrospectively.
4. **Privacy Protection**: Winner names are masked on public displays (e.g., "Pradip R***, Lucky ID: 42") in accordance with data privacy standards.

## 5. Winner Benefit: Strict Future EMI Waiver Invariant

1. **Future Obligations Waived**: When a Lucky ID is verified as the winning slot for a draw month, all remaining unpaid future EMIs from that month forward are **100% waived**.
2. **Zero Cash Refund Invariant**:
   - Any EMI or advance down payment settled prior to the winning draw is fully earned, posted, and append-only.
   - **Under no circumstances is any cash, bank transfer, or monetary refund issued for settled payments.**
   - The winner receives complete ownership title to the furniture without paying the remaining balance.
3. **Contract Settlement**: The contract status transitions to \`WON\`, remaining receivables are extinguished via audited waiver entries, and an official Certificate of Ownership is issued.`,
  },

  "rental-lease-policy": {
    slug: "rental-lease-policy",
    title: "Rental and Lease Policy",
    category: "RENT_LEASE",
    version: "2.3",
    effectiveDate: "2026-08-20",
    summary:
      "Comprehensive terms for furniture rental and leasing, mandatory KYC gating, security deposit accounting, 45-day arrears cutoff, and return inspection rules.",
    content: `# Rental and Lease Policy

This policy governs the custody, utilization, monthly billing, and return of furniture assets under Subidha Furniture Rental and Lease programs.

## 1. Plan Categorization & Asset Ownership

1. **Rental Plans**: Flexible, short-term furniture access (1 to 6 months) for temporary residential or commercial needs.
2. **Lease Plans**: Structured, long-term furniture arrangements (6 to 24 months) with tenure-based rates and upgrade options.
3. **Absolute Ownership Retention**: Rented and leased assets remain the exclusive corporate property of Subidha Furniture. Custody transfers to the customer purely as a bailee. The customer has no right to sell, mortgage, pledge, alter, or relocate the assets without written consent.

## 2. Mandatory KYC Gating & Contract Activation Invariant

In accordance with strict operational risk controls, a Rent or Lease contract **cannot be activated** until the following verification gates are fully satisfied:
1. **Primary Identity Proof**: Verified, masked Aadhaar, PAN, Voter ID, Passport, or Driving License on file.
2. **Address Proof**: Verified utility bill, municipal tax receipt, or government ID matching the delivery address.
3. **Premises Tenancy Proof**: Valid Rent Agreement or property ownership deed establishing the customer's legal occupancy of the premises where furniture will reside.
4. **Customer Photograph & Signature**: Biometric visual confirmation and signed contract.

*Note: Sales staff may save contracts as \`DRAFT\` while documents are gathered, but physical dispatch is strictly blocked until activation approval.*

## 3. Security Deposit Accounting & Protection

1. **Deposit Range**: A refundable security deposit of 20.00% to 30.00% of the asset's retail value is mandatory prior to dispatch.
2. **Liability Accounting**: Deposits are segregated into an auditable deposit ledger (\`RentLeaseDepositTransaction\`). They are treated as refundable customer liabilities, never as operational revenue.
3. **Monthly Billing Separation**: Monthly rental demands are billed separately from the deposit. Deposits cannot be casually applied toward monthly rent during active tenure.

## 4. Arrears Protection & 45-Day Repossession Cutoff

1. **Finite Deposit Buffer**: The 20%–30% security deposit covers approximately 4 to 6 months of rental liability.
2. **Mandatory 45-Day Cutoff**:
   - If a customer fails to pay monthly rent demands and arrears reach forty-five (45) days (1.5 months), store staff are legally mandated to issue a formal Notice of Default.
   - Staff must initiate physical recovery and repossession pickup before the 60th day.
   - This invariant ensures the furniture is recovered before the security deposit is exhausted, preserving sufficient funds to cover unpaid arrears, transit costs, and refurbishment.

## 5. Return Inspection, Deductions & Deposit Settlement

Upon tenure completion or contract termination, assets undergo technical inspection:
1. **Inspection Criteria**: Assessed for surface scratches, broken joinery, fabric stains, burn marks, water swelling, and missing hardware.
2. **Authorized Deductions**:
   - Outstanding rental or utility demands;
   - Itemized repair and replacement costs supported by technician estimates;
   - Mandatory deep-cleaning fees if fabric/upholstery is heavily soiled.
3. **Refund Timeline**: Remaining deposit funds are refunded via electronic bank transfer within seven (7) banking days following mutual sign-off on the Return Inspection Report.`,
  },

  "payment-policy": {
    slug: "payment-policy",
    title: "Payment, Receipt, and Billing Policy",
    category: "PAYMENT",
    version: "2.2",
    effectiveDate: "2026-08-20",
    summary:
      "Accepted payment modes, mandatory receipt rules, collection controls, customer advance liabilities, reversal mechanics, and cashier day-close standards.",
    content: `# Payment, Receipt, and Billing Policy

Subidha Furniture enforces strict financial and accounting controls to safeguard customer funds and preserve transactional auditability.

## 1. Approved Payment Channels

1. **Authorized Channels**: Payments must be remitted exclusively through:
   - **Cash Counter**: Showroom cash desk with immediate digital receipt issuance;
   - **UPI**: Direct scanning of official Subidha Furniture dynamic/static QR codes;
   - **Bank Transfer**: NEFT / RTGS / IMPS to designated company bank accounts.
2. **Prohibition of Unauthorized Collections**: Customers must never remit funds to personal accounts, personal UPI handles, or unverified field agents. Subidha Furniture bears no responsibility for payments made outside official channels.

## 2. Mandatory System-Generated Receipts

1. **Receipt as Sole Legal Proof**: A payment is recognized by Subidha Furniture **only when backed by an official system-generated receipt**.
2. **Receipt Content**: Every valid receipt must clearly display:
   - Unique Sequential Receipt Number (e.g., \`REC-2026-XXXX\`);
   - Date and precise timestamp of collection;
   - Collected Amount in Indian Rupees;
   - Payment Channel and Transaction Reference (e.g., Bank UTR or UPI Ref);
   - Subscribed Contract / Invoice Reference;
   - Collector Name and Branch ID.
3. **Digital Customer Access**: All receipts are instantly accessible in the customer portal under the customer's authenticated profile.

## 3. Allocation Hierarchy & Customer Advances

1. **Allocation to Oldest Dues**: When an installment payment is collected, the billing engine automatically applies funds to the oldest outstanding demand or EMI installment.
2. **Overpayment & Customer Advances**:
   - Any payment exceeding the immediate outstanding balance is not treated as income; it is credited to \`CustomerAdvance\`.
   - Customer Advances are maintained as a balance sheet liability until applied to future monthly installments or refunded via approved payout.

## 4. Payment Reversal and Void Governance

1. **Append-Only Ledger Reversals**: Because the financial ledger is immutable, an erroneous payment cannot be deleted.
2. **Reversal Invariants**:
   - Payment reversal generates a \`PAYMENT_REVERSAL\` ledger entry.
   - Because the underlying ledger payment field is a OneToOne link, reversal entries use \`payment=None\` and record the reversed payment ID within the \`allocation_context\` audit metadata.
   - Original receipt documents remain preserved with a prominent \`VOID\` watermark.
3. **Managerial Authorization**: Reversals require verified documentary evidence (e.g., bank chargeback advice or duplicate entry proof) and managerial sign-off.

## 5. Cashier Day-Close & Reconciliation

1. **Daily Drawer Settlement**: Every cashier must complete a mandatory Day-Close reconciliation protocol at the end of each shift, reconciling physical cash and digital settlement slips against recorded collections.
2. **Dynamic Chart of Accounts Mapping**: All collections dynamically map to designated settlement accounts (\`FinanceAccountCoaMapping\`) ensuring accurate liquid balance reporting.`,
  },

  "reconciliation-policy": {
    slug: "reconciliation-policy",
    title: "Financial Reconciliation and Settlement Policy",
    category: "RECONCILIATION",
    version: "2.1",
    effectiveDate: "2026-08-20",
    summary:
      "Daily three-way reconciliation between physical collections, finance accounts, and contractual schedules; anomaly reporting and audit preservation.",
    content: `# Financial Reconciliation and Settlement Policy

This policy governs the daily and periodic financial reconciliation procedures enforced across Subidha Furniture's commercial operations.

## 1. Three-Way Reconciliation Architecture

To ensure zero financial leakage and 100% accounting fidelity, the finance desk executes daily three-way reconciliation comparing:
1. **Source Collections**: Physical cash in counter drawers, payment gateway settlement logs, and bank account statement credits.
2. **Finance Accounts**: System balance ledgers representing cash counters, UPI clearing accounts, and bank ledgers.
3. **Contractual Schedules**: Expected EMI schedules, rent demands, direct sale invoice receivables, and security deposit ledgers.

## 2. Dynamic Ledger Mapping & Rollups

1. **Dynamic COA Mapping**: Collections made to specific financial channels (such as \`UPI_COLLECTION\` or \`CASH_COUNTER_1\`) dynamically map through \`FinanceAccountCoaMapping\` into the general ledger.
2. **Liquid Balance Integrity**: Net liquid balances roll up continuously to parent settlement accounts, providing real-time visibility into shop liquidity without manual spreadsheet manipulation.

## 3. Anomaly Handling and Discrepancy Workbenches

1. **Automated Anomaly Detection**: The reconciliation engine flags discrepancies, including:
   - Unmatched bank credits lacking customer subscription references;
   - Timing differences between gateway swipes and bank settlement deposits;
   - Over-collections or under-collections against scheduled installment obligations.
2. **No Silent Auto-Repair**: The system strictly forbids silent algorithmic rewriting of financial entries. Discrepancies are queued into the Admin Reconciliation Workbench for human review and auditable adjustment.

## 4. Reversal and Lifecycle Integrity

1. **Net Reporting Posture**: Day-close summaries, operational KPIs, and executive balance sheets report net valid collections, explicitly excluding cancelled, voided, or reversed transactions.
2. **Permanent Audit Trail**: Every reconciliation adjustment, settlement clearance, and exception resolution generates a permanent audit trail recording the operator, timestamp, and justification.`,
  },

  "accounting-posting-policy": {
    slug: "accounting-posting-policy",
    title: "Accounting and Financial Ledger Policy",
    category: "ACCOUNTING",
    version: "2.1",
    effectiveDate: "2026-08-20",
    summary:
      "Double-entry bookkeeping rules, revenue recognition standards, separation of finance and chart accounts, and prohibition of destructive database mutations.",
    content: `# Accounting and Financial Ledger Policy

This policy defines the core bookkeeping, revenue recognition, and ledger posting principles governing SUBIDHA CORE.

## 1. Fundamental Accounting Postures

1. **Double-Entry General Ledger**: All financial events post balanced debits and credits across the Chart of Accounts (COA).
2. **Append-Only Immutable Records**: Financial tables are strictly append-only. Under no circumstances may \`DELETE\`, \`DROP\`, \`TRUNCATE\`, or raw SQL mutations be executed against financial ledgers.
3. **Finance Account vs Chart Account Separation**:
   - **Finance Accounts** represent real-world physical and digital money locations (Cash Drawer, Bank Account, Gateway Clearing).
   - **Chart Accounts** represent statutory accounting heads (Assets, Liabilities, Equity, Revenues, Expenses).
   - The bridge between channels and general ledgers is governed by \`FinanceAccountCoaMapping\`.

## 2. Revenue Recognition Principles

1. **Direct Sales**: Revenue is recognized upon issuance of the tax invoice and physical delivery of the merchandise.
2. **Rental and Lease Demands**: Revenue is recognized monthly on an accrual basis when periodic rent demands are generated.
3. **Security Deposits**: Deposits are credited to liability accounts (\`Customer Security Deposits Payable\`) and are never recognized as operating revenue.
4. **Lucky Plan EMI Collections**: Installments collected reduce contractual customer receivables. Waiver benefits resulting from lucky draw wins are expensed to audited promotional discount / waiver accounts without altering past cash entries.

## 3. Customer Advances and Liabilities

1. **Liability Recognition**: Any funds received prior to invoice generation or in excess of active installment dues are posted as \`Customer Advance Liability\`.
2. **Application to Invoices**: Advances are cleared against customer receivables only upon formal execution of an installment schedule or invoice allocation.

## 4. Audit Locks and Period Close

1. **Monthly Period Close**: Following monthly reconciliation, accounting periods are locked against back-dated entries.
2. **Prior-Period Adjustments**: Any correction relating to a closed financial period must be executed in the open operating period via explicit adjustment journals.`,
  },

  warranty: {
    slug: "warranty",
    title: "Warranty Policy",
    category: "WARRANTY",
    version: "2.2",
    effectiveDate: "2026-08-20",
    summary:
      "Manufacturer and showroom warranty coverage, eligible components, claims submission, inspection protocols, and explicit coverage exclusions.",
    content: `# Warranty Policy

Subidha Furniture stands behind the craftsmanship, durability, and materials of our products. This Warranty Policy outlines coverage scopes, terms, and claim procedures.

## 1. Warranty Classification & Coverage Tiers

1. **Manufacturer Warranty**: For branded appliances, electronics, foam mattresses, and third-party hardware, warranty terms and durations are established directly by the original equipment manufacturer (OEM). Subidha Furniture facilitates warranty claims with OEM service networks.
2. **Showroom Craftsmanship Warranty**: For furniture manufactured or customized by Subidha Furniture:
   - **Solid Wood & Joinery**: Twelve (12) months structural warranty covering timber joint integrity, frame warping, and structural stability under normal domestic use.
   - **Hardware & Fittings**: Six (6) months replacement warranty on drawer channels, hydraulic bed lifts, hinges, and handles against mechanical failure.
   - **Upholstery & Stitching**: Six (6) months warranty against seam splitting or zipper failure under normal usage.

## 2. Mandatory Warranty Exclusions

The warranty does not apply to and strictly excludes:
1. **Transit Mishandling Post-Handover**: Any damage occurring after the customer signs the Delivery Handover Note.
2. **Customer Misuse & Abuse**: Damage resulting from overloading, standing on furniture, rough handling, or dropping items.
3. **Liquid, Fire & Environmental Exposure**: Damage caused by water pooling, high humidity, outdoor weather exposure, direct heat sources, or fire.
4. **Biological Damage**: Infestation by termites, borers, pests, or fungal mildew arising from local storage conditions post-handover.
5. **Unauthorized Alteration**: Any product repaired, cut, painted, modified, or reupholstered by unauthorized technicians.
6. **Commercial Exploitation**: Domestic furniture deployed in high-traffic commercial environments, hostels, or rental subleases without commercial rating.
7. **Normal Wear and Tear**: Gradual fabric fading, leather creasing, minor surface scuffs, softening of sofa foam cushions within industry tolerances.

## 3. Warranty Claim and Inspection Protocol

1. **Claim Submission**: Warranty claims must be submitted via the customer portal or showroom service desk with proof of purchase (invoice or contract reference) and clear photographs of the defect.
2. **Technical Inspection**: An authorized service technician conducts an on-site inspection within four (4) business days to determine whether the issue constitutes an inherent manufacturing defect or excluded physical abuse.
3. **Remediation Hierarchy**:
   - **Tier 1 (On-Site Repair)**: Rectification of joints, hardware replacement, or surface touch-ups.
   - **Tier 2 (Workshop Refurbishment)**: If on-site repair is infeasible, the item is transported to the central workshop for structural rectification.
   - **Tier 3 (Replacement)**: If the defect is irreparable and verified as a manufacturing failure within thirty (30) days of purchase, a unit replacement is authorized.`,
  },

  "service-policy": {
    slug: "service-policy",
    title: "Service and Repair Policy",
    category: "SERVICE",
    version: "2.1",
    effectiveDate: "2026-08-20",
    summary:
      "Service ticket lifecycle, technical triage, warranty vs chargeable repairs, spare parts sourcing, and post-service customer sign-off.",
    content: `# Service and Repair Policy

This policy governs the after-sales maintenance, repair operations, and service desk workflows managed by Subidha Furniture.

## 1. Service Ticket Lifecycle (\`ServiceDeskCase\`)

Every service or repair request follows an auditable lifecycle tracked in the Service Desk system:
1. **Intake & Logging**: Customer logs ticket via customer portal, phone, or showroom desk. A unique Ticket ID (\`TCK-XXXX\`) is issued.
2. **Triage & Assessment**: Service coordinator evaluates the issue, reviews warranty status, and assigns a technical specialist.
3. **On-Site Inspection**: Technician inspects the furniture on-site, assessing whether the fault is covered under warranty or requires chargeable maintenance.
4. **Estimate & Customer Approval**: If chargeable, an itemized parts and labor estimate is provided. Work proceeds only upon customer authorization.
5. **Execution & Handover**: Repair completed on-site or in the workshop.
6. **Closure Sign-Off**: The customer inspects the completed work and signs the digital service completion certificate.

## 2. Chargeable Non-Warranty Repairs

1. **Scope of Chargeable Services**: Out-of-warranty products, damage resulting from accidents/spills, relocation assembly/disassembly, sofa re-foaming, and bespoke polishing.
2. **Transparent Rates**: Labor charges, transit fees, and hardware replacement parts are billed at published standard workshop rates.
3. **Estimates & Payment**: Detailed estimates must be accepted prior to work initiation. Payment is receipted through standard digital channels.

## 3. Spare Parts and Material Integrity

1. **Genuine Hardware**: All replacement drawer runners, hinges, handles, and hydraulic pumps are sourced from verified brand partners matching original factory specifications.
2. **Parts Warranty**: New replacement hardware components installed during paid repairs carry a ninety (90) day operational warranty.

## 4. Workshop Custody and Safety

1. **Workshop Transfer Receipt**: If an item must be transported to the central workshop for specialized carpentry or re-finishing, a formal Workshop Custody Challan is executed detailing item condition.
2. **Transit Care**: Subidha Furniture handles workshop transit with protective furniture padding and transit insurance coverage.`,
  },

  "commission-partner-payout-policy": {
    slug: "commission-partner-payout-policy",
    title: "Partner Referral and Commission Policy",
    category: "COMMISSION",
    version: "2.2",
    effectiveDate: "2026-08-20",
    summary:
      "Partner onboarding, referral boundaries, internal commission calculation, prohibition of self-approval, clawback mechanics, and payout controls.",
    content: `# Partner Referral and Commission Policy

This policy governs commercial relationships, lead facilitation, referral incentives, and payout workflows for registered Subidha Furniture Partners.

## 1. Partner Role and Commercial Scope

1. **Facilitator Status**: Partners act strictly as lead generators, community liaisons, and customer onboarding facilitators.
2. **No Agency or Employment**: Registration as a partner does not create any employment, partnership, joint venture, or legal agency relationship with Subidha Furniture.
3. **Prohibition of Promises**: Partners have **no legal authority** to:
   - Promise waivers, discounts, or lucky draw wins to customers;
   - Collect cash or unauthorized payments without immediate system receipts;
   - Modify contract tenures, installment amounts, or delivery schedules.

## 2. Commission Accrual and Internal Workflows

1. **Controlled Calculation**: Commission calculations are automated, internal backend workflows based on approved partnership agreements.
2. **Triggering Events**: Commission accrues only upon successful customer enrollment, contract activation, and verified clearance of qualifying installment payments.
3. **Strict Prohibition of Self-Approval**: Partners **cannot self-approve, trigger, or self-post commission payouts**. All payout proposals require verification by finance staff and administrative approval.

## 3. Commission Clawback Invariant

1. **Clawback Conditions**: If a referred subscription or sale is subsequently:
   - Cancelled due to customer default or document fraud;
   - Subject to a full payment reversal; or
   - Determined to be an illegitimate duplicate enrollment;
2. **Reversal Mechanism**: Any commission previously credited or accrued for that transaction is automatically clawed back and debited from the partner's accrued commission ledger.

## 4. Payout Batches and Statutory Deductions

1. **Consolidated Payout Batches**: Approved commissions are disbursed in scheduled monthly payout batches via direct bank transfer (NEFT/IMPS).
2. **Tax Deductions**: Payouts are subject to applicable statutory deductions, including Tax Deducted at Source (TDS) under Section 194H of the Income Tax Act.
3. **Partner Portal Visibility**: Partners have 24/7 access to the partner dashboard displaying introduced leads, active contract statuses, commission accruals, clawbacks, and historical payment advices.`,
  },

  "contract-amendment-policy": {
    slug: "contract-amendment-policy",
    title: "Contract Amendment and Modification Policy",
    category: "CONTRACTS",
    version: "2.0",
    effectiveDate: "2026-08-20",
    summary:
      "Strict controls governing contract alterations, whitelisted non-financial adjustments, same-price product corrections, and audit preservation.",
    content: `# Contract Amendment and Modification Policy

To protect customer rights and financial integrity, Subidha Furniture enforces strict controls over contract amendments.

## 1. Immutable Contract Invariant

Once a contract (Lucky Plan EMI, Rent, or Lease) is activated, its core financial attributes—total contract value, monthly installment amount, tenure, assigned Lucky ID, batch code, and paid history—are legally locked and protected from arbitrary modification.

## 2. Whitelisted Permissible Amendments

Only specific, audited amendments are permitted through hardened service paths:

1. **Non-Financial Contact & Address Amendments (Phase 3)**:
   - Correction of customer phone number, secondary contact, or delivery address.
   - Requires customer identity verification and administrative approval.
2. **Same-Price Product Reference Correction (Phase 4)**:
   - If an administrative clerical error occurred during product SKU selection, and the customer agrees to substitute an identical-priced model:
   - Amendment is permitted **only if the replacement product base price exactly matches the original product price**.
   - Financial totals, monthly EMI, tenure, paid amounts, Lucky ID, batch assignment, and accounting entries remain 100% unchanged.

## 3. Strictly Prohibited Amendments

The following amendments are **strictly blocked by the system** and cannot be executed via the standard workbench:
1. Retroactive modification of past EMI amounts or payment dates;
2. Swapping of assigned Lucky IDs after batch draw locking;
3. Conversion of non-winning subscriptions into winning subscriptions;
4. Alteration of customer identity to a third party without formal contract assignment;
5. Unilateral changes to rent deposit terms or yield percentages.

## 4. Amendment Execution & Audit Log

1. **Two-Stage Execution**: Amendment proposal must be entered with written justification, followed by executive administrative review and approval.
2. **Tamper-Evident History**: Every amendment logs an immutable \`ContractAmendmentAudit\` record storing the prior state, new state, operating user ID, timestamp, and signed customer consent document.`,
  },

  "emi-subscription-default-policy": {
    slug: "emi-subscription-default-policy",
    title: "EMI Subscription Arrears and Default Policy",
    category: "LUCKY_PLAN",
    version: "2.1",
    effectiveDate: "2026-08-20",
    summary:
      "Arrears tracking, reminder schedules, draw eligibility holds, hire-purchase repossession rules, and Lucky ID release governance.",
    content: `# EMI Subscription Arrears and Default Policy

This policy outlines operational procedures, grace periods, reminder protocols, and legal remedies applied when a customer defaults on Lucky Plan advance installment obligations.

## 1. Due Dates and Grace Periods

1. **Scheduled Due Date**: Monthly installments are due on the 5th calendar day of each operating month.
2. **Grace Period**: A grace period of five (5) calendar days is extended to all customers. Installments settled on or before the 10th of the month are treated as fully compliant.

## 2. Reminder Escalation Matrix

When an installment remains unpaid past the grace period, automated and staff reminders follow a structured schedule:
- **Day 11 (Soft Reminder)**: Automated SMS and WhatsApp notice of overdue installment.
- **Day 18 (Operational Call)**: Showroom customer service call to understand payment constraints and offer digital remittance support.
- **Day 25 (Draw Eligibility Hold Notice)**: Formal notification that failure to settle prior to month-end results in suspension of lucky draw participation for the upcoming cycle.
- **Day 31 (Default Notice)**: Formal written Notice of Default issued via registered post / WhatsApp.

## 3. Draw Eligibility Suspension

1. **Current Month Eligibility**: Participation in the monthly fair draw requires the customer's subscription to be in good financial standing, with all accrued EMIs receipted.
2. **Suspension**: A customer with overdue arrears at the time of batch draw locking is excluded from the active draw snapshot.
3. **No Retroactive Wins**: A customer cannot clear arrears retrospectively to claim a draw benefit for a draw conducted while they were in default.

## 4. Hire-Purchase Title Retention & Repossession (Advance Delivery)

For customers who received immediate furniture possession under the Advance Delivery facility (60% to 80% down payment):
1. **Title Retention Clause**: Goods are held under bailment; ownership remains with Subidha Furniture until full settlement.
2. **30-Day Default Repossession**: If payment default exceeds thirty (30) days following formal notice:
   - Subidha Furniture reserves the enforceable legal right to retrieve and repossess the furniture from the customer's premises.
   - The customer is liable for repossession transport, inspection, and refurbishment costs.
   - Repossessed items are inspected and liquidated to offset unpaid contract balances in accordance with hire-purchase legal standards.

## 5. Lucky ID Release Governance Upon Cancellation

1. **Cancellation Prior to Draw Lock**: If a defaulted subscription is cancelled while the batch is \`OPEN\`, the Lucky ID is safely unlinked and returned to \`AVAILABLE\` status for reassignment.
2. **Cancellation After Draw Lock**: If cancelled after batch locking or draw execution, the Lucky ID remains permanently linked to the cancelled subscription record to maintain legal draw auditability.`,
  },

  "lucky-draw-rules-fairness": {
    slug: "lucky-draw-rules-fairness",
    title: "Fair Draw Integrity and Commitment Policy",
    category: "LUCKY_PLAN",
    version: "2.3",
    effectiveDate: "2026-08-20",
    summary:
      "Mathematical and cryptographic verification procedures for monthly fair draws, commitment hashes, public audits, and winner benefit execution.",
    content: `# Fair Draw Integrity and Commitment Policy

Subidha Furniture operates monthly lucky draws under cryptographic and operational safeguards that prevent retrospective tampering, ensuring absolute transparency.

## 1. Commit-then-Reveal Cryptographic Protocol

To mathematically prove that draw outcomes are not manipulated:
1. **The Secret Seed**: Before the draw, an automated system generates a random secret cryptographic seed combined with the draw date and batch identifier.
2. **Pre-Draw Public Commitment Hash**:
   - The system computes the SHA-256 hash: \`Hash = SHA256(secret_seed + batch_code + draw_month)\`.
   - This 64-character hexadecimal hash is published on the public website and social channels **prior to the draw event**.
3. **Physical / Digital Draw Selection**:
   - The winning Lucky ID (00 to 99) is determined through an open, public draw conducted at the showroom in the presence of attending customers.
4. **Post-Draw Secret Reveal**:
   - Immediately following selection, the secret seed is published.
   - Any customer or public auditor can input the revealed seed into standard SHA-256 tools to confirm that the hash matches the pre-published commitment.

## 2. Batch Eligibility Freeze & Immutable Snapshots

1. **Eligibility Lock**: Twenty-four (24) hours prior to the draw, the batch is transitioned to \`LOCKED\` status.
2. **Draw Eligibility Snapshot**:
   - An immutable snapshot (\`DrawEligibilitySnapshot\`) records every eligible customer, Lucky ID, subscription reference, and payment status.
   - New enrollments, cancellations, or payment edits are strictly locked out of the snapshot.
   - The winner selection algorithm evaluates **only** the frozen snapshot, preventing live database manipulation.

## 3. Winner Benefit Execution Invariants

1. **100% Future EMI Waiver**: The verified winner has all future remaining EMI installments from the winning month onward waived 100%.
2. **Zero Cash Refund Invariant**: Past settled EMIs and advance payments are non-refundable. They remain settled retail consideration.
3. **Title Perfection**: Upon execution of the waiver, full title, ownership, and warranty rights transfer unconditionally to the winning customer.

## 4. Public Winner Presentation and Privacy

1. **Public Display**: Winning numbers, batch codes, draw months, and commitment verification details are displayed on the public Winner Showcase.
2. **Data Masking**: To protect customer privacy under the Digital Personal Data Protection Act, 2023, customer names are masked (e.g., "Amit K***, Lucky ID: 88").`,
  },

  "possession-handover-policy": {
    slug: "possession-handover-policy",
    title: "Possession, Handover, and Asset Custody Policy",
    category: "DELIVERY",
    version: "2.1",
    effectiveDate: "2026-08-20",
    summary:
      "Asset custody transfer rules across Direct Sales, Rent, Lease, and Advance Delivery; joint inspection checklists and digital POD standards.",
    content: `# Possession, Handover, and Asset Custody Policy

This policy defines the legal standards, documentation, and condition verification required when physical custody of furniture transfers between Subidha Furniture and customers.

## 1. Legal Nature of Custody Transfer

1. **Direct Sale Handover**: Handover transfers full possessory custody and ownership title (provided 100% payment has cleared).
2. **Rent and Lease Handover**: Handover transfers possessory custody under a contract of bailment. Full legal title and ownership remain strictly with Subidha Furniture.
3. **Advance Delivery (Lucky Plan)**: Handover transfers possessory custody under hire-purchase terms with title retention until full contract settlement.

## 2. Joint Handover Inspection Protocol

At the point of delivery, the delivery crew and recipient must jointly inspect:
1. **Woodwork & Finish**: Absence of transit scuffs, scratches, finish chipping, or peeling laminate.
2. **Structural Stability**: Alignment of dining tables, sofas, beds, and wardrobes without wobbling or racking.
3. **Functional Components**: Smooth sliding of drawer runners, proper closure of wardrobe doors, firm engagement of locks, and operation of bed hydraulics.
4. **Fabric & Upholstery**: Clean, stain-free fabric without tears, loose threads, or sagging cushions.

## 3. Mandatory Proof of Delivery (POD) Documentation

Custody transfer is legally consummated only upon complete execution of the Proof of Delivery protocol:
1. **Physical Handover Note**: Signed by the customer acknowledging receipt of all items in acceptable, undamaged condition.
2. **Photographic Evidence**: Minimum of two (2) digital photographs depicting the installed items in the customer's room.
3. **Delivery Crew Audit**: Record of driver identity, delivery vehicle registration, and mobile GPS coordinates logged into the fulfillment desk.

## 4. Exception Handling at Handover

1. **Transit Damage Reported at Delivery**: If transit damage is noted during handover:
   - Specific defects must be documented on the handover challan prior to signing.
   - The delivery crew reports the exception immediately to the Service Desk.
   - Minor blemishes trigger a priority on-site technician dispatch within 48 hours; major defects trigger immediate return and replacement.
2. **Refusal of Acceptance**: If the customer refuses delivery due to unapproved specification mismatch, items return to the warehouse with \`RETURN_REQUESTED\` status for managerial investigation.`,
  },

  "return-damage-inspection-policy": {
    slug: "return-damage-inspection-policy",
    title: "Return Damage Assessment and Deduction Policy",
    category: "RENT_LEASE",
    version: "2.1",
    effectiveDate: "2026-08-20",
    summary:
      "Technical inspection standards for returned rental, lease, and direct sale items; condition grading, damage evaluation, and itemized deduction schedules.",
    content: `# Return Damage Assessment and Deduction Policy

This policy governs the technical inspection, condition grading, and financial deduction procedures applied to returned furniture assets.

## 1. Return Inspection Workflow

Upon return of rented, leased, or returned retail furniture to the central warehouse:
1. **Intake Logging**: The asset is received into the Return Quarantine Location with an assigned Return Inspection Docket.
2. **Technical Assessment**: A qualified furniture technician examines structural timber, joinery, surface veneers, hardware, foam cushions, and upholstery.
3. **Documentary Evidence**: High-resolution photographs must be captured documenting every identified blemish, fracture, or tear.

## 2. Asset Condition Classification

Furniture condition is objectively classified into four standardized tiers:
- **Tier 1 (Normal Wear and Tear)**: Minor, non-structural surface patina resulting from reasonable domestic usage over time. No deductions applied.
- **Tier 2 (Minor Cosmetic Damage / Cleaning Required)**: Detachable dirt, food stains, pencil marks, or minor scuffs resolvable by standard showroom buffing or fabric shampooing. Standard cleaning fee deducted.
- **Tier 3 (Repairable Physical Damage)**: Broken drawer channels, deep gouges in wood veneers, torn fabric cushions, or loose legs requiring workshop re-gluing. Actual material and workshop labor costs deducted.
- **Tier 4 (Structural Failure / Unrepairable / Missing Modules)**: Smashed glass tops, water-bloated MDF frames, termite-infested woodwork, or unreturned components. Deducted at full replacement cost.

## 3. Security Deposit Deduction Governance

For Rent and Lease contracts:
1. **Deduction Justification**: No deduction may be made from a customer's security deposit without an itemized Return Inspection Report and photographic proof.
2. **Transparent Costing**: Labor charges and replacement parts are billed strictly according to the published Workshop Service Schedule.
3. **Customer Review**: The inspection report is transmitted via the customer portal. Customers have three (3) business days to review deductions before final deposit payout.`,
  },

  "security-deposit-policy": {
    slug: "security-deposit-policy",
    title: "Security Deposit Protection and Refund Policy",
    category: "RENT_LEASE",
    version: "2.2",
    effectiveDate: "2026-08-20",
    summary:
      "Segregated liability accounting for rental/lease deposits, permissible deductions, 45-day arrears cutoff, and electronic refund timelines.",
    content: `# Security Deposit Protection and Refund Policy

Subidha Furniture treats customer security deposits with strict fiduciary care, maintaining segregated accounting and auditable deduction procedures.

## 1. Legal Nature of Security Deposits

1. **Refundable Liability**: Security deposits collected for Rent and Lease contracts represent refundable customer funds held in bailment.
2. **Segregation from Operating Revenue**: Deposit transactions are maintained in a dedicated deposit ledger (\`RentLeaseDepositTransaction\`). They are never commingled with monthly sales revenue.
3. **Mandatory Threshold**: Security deposits are set between 20.00% and 30.00% of the asset's retail value based on risk tier and tenure.

## 2. Permissible Deductions

The security deposit is refundable in full, subject only to the following permissible deductions:
1. **Unpaid Periodic Rent Demands**: Outstanding rent or lease charges accrued up to the physical asset handover date.
2. **Condition Deductions**: Verified repair, re-polishing, or replacement costs established under the Return Damage Assessment Policy.
3. **Missing Hardware / Accessories**: Actual replacement cost of unreturned cushions, keys, remotes, or specialized fittings.
4. **Secondary Transit Fees**: If the customer failed to provide access during a scheduled return pickup.

## 3. Arrears Protection & 45-Day Repossession Rule

1. **Finite Protection Buffer**: The security deposit provides a finite financial buffer covering approximately 4 to 6 months of rent.
2. **Enforcement Cutoff**: If monthly rent arrears exceed forty-five (45) days, store management is required to initiate repossession pickup. Under no circumstances may staff permit arrears to consume 100% of the deposit, ensuring residual funds cover refurbishment and return transit.

## 4. Refund Processing Timeline

1. **Inspection Sign-Off**: The return inspection must be completed within forty-eight (48) hours of asset arrival at the warehouse.
2. **Electronic Remittance**: Following mutual sign-off on the Return Inspection Report, the net refundable deposit balance is remitted directly to the customer's bank account via NEFT/IMPS within seven (7) banking days.
3. **Deposit Certificate**: An official Deposit Refund Settlement Advice detailing gross deposit, itemized deductions, and net paid amount is available for download in the customer portal.`,
  },

  grievance: {
    slug: "grievance",
    title: "Customer Grievance Redressal Policy",
    category: "GRIEVANCE",
    version: "2.1",
    effectiveDate: "2026-08-20",
    summary:
      "Designated Grievance Officer details, three-tier escalation framework, statutory turnaround times, and consumer protection governance.",
    content: `# Customer Grievance Redressal Policy

Subidha Furniture is committed to prompt, respectful, and effective resolution of all customer concerns, complaints, and disputes.

## 1. Grievance Redressal Framework

In compliance with the Consumer Protection Act, 2019, and the Consumer Protection (E-Commerce) Rules, 2020, Subidha Furniture maintains a structured 3-Tier Grievance Redressal Framework:

### Tier 1: Showroom Service Desk & Support Portal
- **Intake**: Service requests and complaints can be lodged via the customer portal, email, or in person at the Asansol showroom service desk.
- **Turnaround Time**: Initial response and ticket issuance within twenty-four (24) hours. Target resolution within three (3) to five (5) business days.

### Tier 2: Designated Grievance Officer
If a grievance is unresolved at Tier 1 or the customer is dissatisfied with the proposed remediation, it escalates to the Grievance Officer:
- **Grievance Officer**: Pradip Roy (Proprietor & Grievance Head)
- **Official Address**: Subidha Furniture, South Dhadka Sukantapally, Near Rupkatha Cinema Hall, Dakhin Dhadka, Asansol, Paschim Barddhaman, West Bengal 713302.
- **Direct Email**: \`grievance@subidha.com\` (or via official contact portal)
- **Phone**: Branch Support Desk / +91-XXXXXXXXXX
- **Turnaround Time**: Formal acknowledgement within forty-eight (48) hours; comprehensive written resolution within seven (7) business days.

### Tier 3: Executive Escalation & Arbitration
If the dispute remains unresolved following Grievance Officer review:
- The customer may request executive management review;
- Alternatively, parties may mutually refer the dispute to mediation or arbitration under the Arbitration and Conciliation Act, 1996, seated in Asansol.

## 2. Customer Rights Under Consumer Protection Law

Customers possess the statutory right to:
1. Receive authentic, unadulterated furniture conforming to specifications on the invoice or contract;
2. Receive transparent, itemized receipts for all monetary payments;
3. Access complete records of their contracts, payment history, and warranty statuses;
4. Fair assessment of warranty claims and return requests without arbitrary dismissal.

## 3. Record Keeping & Auditability

All customer complaints, technician reports, email correspondence, and final resolution letters are archived in the Customer 360 database, maintaining an auditable compliance record for three (3) years.`,
  },

  privacy: {
    slug: "privacy",
    title: "Privacy and Data Protection Policy",
    category: "PRIVACY",
    version: "2.3",
    effectiveDate: "2026-08-20",
    summary:
      "Compliance with Digital Personal Data Protection Act 2023, masked identity documents, secure media vaults, data retention limits, and customer rights.",
    content: `# Privacy and Data Protection Policy

Subidha Furniture is committed to safeguarding customer personal data in strict compliance with the **Digital Personal Data Protection (DPDP) Act, 2023**, and the Information Technology Act, 2000.

## 1. Information We Collect

In executing retail sales, installment subscriptions, rental agreements, and deliveries, we collect:
1. **Identity Data**: Full name, masked Aadhaar (last four digits only), PAN, Voter ID, Driving License, customer photograph, and signature.
2. **Contact Data**: Physical delivery address, permanent residential address, mobile phone number, WhatsApp contact, and email address.
3. **Contractual & Commercial Data**: Subscribed product SKUs, tenure, EMI schedules, lucky IDs, delivery notes, and return inspection reports.
4. **Financial Records**: Payment mode, transaction reference numbers (UTR / UPI Ref), bank account details (solely for deposit refunds and commission payouts), and receipt records.
5. **Technical Data**: IP address, session timestamps, and portal authentication logs.

## 2. Data Protection & Zero-Leakage Architecture

1. **Aadhaar Masking**: In compliance with UIDAI regulations and the DPDP Act, full 12-digit Aadhaar numbers are never stored in plaintext. Only masked versions showing the last 4 digits are retained.
2. **Access-Controlled Media Vault**: Customer KYC documents and ID uploads are stored in isolated, access-controlled media roots with authenticated token requirements.
3. **No Commercial Sale of Data**: Subidha Furniture never sells, rents, monetizes, or trades customer data to third-party telemarketers or external advertising networks.
4. **Role-Based Access Controls (RBAC)**: Internal staff access is strictly segregated. Cashiers view collection queues; delivery drivers view dispatch contacts; only authorized administrators access full KYC documentation.

## 3. Purpose of Data Processing

Customer data is processed exclusively for legitimate business purposes:
1. Execution and administration of Direct Sale, Lucky Plan EMI, Rent, and Lease contracts;
2. Processing payments, issuing tax invoices, and delivering official digital receipts;
3. Verifying premises tenancy and asset custody security for rental/lease arrangements;
4. Scheduling delivery, routing vehicles, and executing physical handover verification;
5. Fulfilling statutory taxation, GST reporting, and financial audit obligations.

## 4. Statutory Data Retention Limits

1. **Financial and Tax Records**: Tax invoices, payment receipts, credit notes, and contract accounting records are retained for a minimum of eight (8) statutory years in compliance with the Income Tax Act, 1961, and CGST Act, 2017.
2. **Transient Operational Data**: Unregistered lead enquiries and website session logs are purged after twelve (12) months.

## 5. Customer Data Rights

Under the DPDP Act, customers enjoy the right to:
1. Review and download a complete transcript of their personal and commercial profile;
2. Request correction of inaccurate or outdated contact information;
3. Withdraw consent for promotional communications (service notices remain mandatory);
4. Request data erasure upon contract completion and satisfaction of statutory retention obligations.`,
  },

  "business-compliance": {
    slug: "business-compliance",
    title: "Business Compliance and Legal Governance Policy",
    category: "COMPLIANCE",
    version: "2.1",
    effectiveDate: "2026-08-20",
    summary:
      "Enterprise ownership details, MSME classification, non-GST stage 1 operating parameters, showroom registration, and trade license disclosures.",
    content: `# Business Compliance and Legal Governance Policy

This policy outlines the official corporate identity, statutory licenses, regulatory declarations, and compliance disclosures governing Subidha Furniture.

## 1. Enterprise Identity & Ownership

- **Enterprise Name**: Subidha Furniture
- **Proprietor**: Pradip Roy
- **Business Identification Code**: \`SUBIDHA-ASN-001\`
- **Principal Place of Business**: South Dhadka Sukantapally, Near Rupkatha Cinema Hall, Dakhin Dhadka, Asansol, Paschim Barddhaman, West Bengal 713302.
- **Nature of Business**: Retail furniture trading, custom manufacturing, household subscription programs, and furniture leasing.

## 2. MSME / Udyam Registration

1. **Enterprise Classification**: Registered under the Ministry of Micro, Small and Medium Enterprises (MSME), Government of India, as a Micro Enterprise.
2. **Statutory Protections**: All commercial transactions with corporate suppliers, partners, and financial vendors are governed under the provisions of the Micro, Small and Medium Enterprises Development (MSMED) Act, 2006.

## 3. Taxation and GST Operating Posture

1. **Current Operating Framework**: Operating in strict accordance with statutory turnover thresholds applicable to local sole proprietorships under the West Bengal Goods and Services Tax framework.
2. **GST Transition Readiness**: The system architecture incorporates GST-compliant invoice templates, HSN categorization, and tax ledger bridges, ready for immediate activation upon turnover migration.
3. **No Fictitious Claims**: Subidha Furniture strictly prohibits displaying fabricated or placeholder GST numbers. All commercial representations reflect factual, verifiable business disclosures.

## 4. Trade and Municipal Licensing

The enterprise operates under valid Trade Licenses issued by the Asansol Municipal Corporation and complies with the West Bengal Shops and Establishments Act, 1963.`,
  },

  "udyam-msme": {
    slug: "udyam-msme",
    title: "MSME and Udyam Registration Disclosure Policy",
    category: "COMPLIANCE",
    version: "2.0",
    effectiveDate: "2026-08-20",
    summary:
      "Statutory MSME / Udyam registration disclosure, classification standards, and false-claim prevention rules.",
    content: `# MSME and Udyam Registration Disclosure Policy

This document provides transparent public disclosure regarding Subidha Furniture's registration under the MSME framework of the Government of India.

## 1. Statutory Registration Status

Subidha Furniture is formally registered on the Government of India Udyam Registration Portal as a Micro Enterprise under the category of retail sale and manufacture of wooden furniture and household fixtures.

## 2. Operational Commitments Under MSME Governance

As a registered MSME entity, Subidha Furniture adheres to:
1. Fair and timely payment settlement standards for vendor procurement;
2. High standards of retail consumer protection;
3. Auditable maintenance of commercial accounts and employment records;
4. Responsible local community retail practices in the Asansol and Paschim Barddhaman industrial belt.

## 3. Prohibition of Misrepresentation

Subidha Furniture maintains zero tolerance for misrepresentation. Registration certificates are held under administrative custody and shared solely with banking institutions, regulatory inspectors, and authorized statutory bodies.`,
  },

  "document-esign-consent": {
    slug: "document-esign-consent",
    title: "Document and E-Sign Consent Policy",
    category: "COMPLIANCE",
    version: "2.0",
    effectiveDate: "2026-08-20",
    summary:
      "Legal validity of electronic records, digital signatures, PDF engine generation, and customer consent under the Information Technology Act 2000.",
    content: `# Document and E-Sign Consent Policy

This policy establishes the legal validity, integrity, and binding nature of electronic documents, digital signatures, and PDF contracts generated by SUBIDHA CORE.

## 1. Legal Recognition of Electronic Records

In accordance with Section 4 and Section 10A of the **Information Technology Act, 2000**, electronic records, digital signatures, click-through acceptances, and system-generated PDF documents issued by Subidha Furniture possess the same legal force, validity, and enforceability as physically executed paper documents.

## 2. Tamper-Evident Document Engine

All official commercial instruments—including:
1. Subscription Contracts and Contract Schedules;
2. Retail Sales Tax Invoices;
3. Payment Receipts;
4. Delivery Challans and Proof of Delivery (POD) Notes;
5. Return Inspection Dockets and Credit Notes;
are generated through the core PDF engine with unique sequential reference codes, unalterable metadata, and system security hashes.

## 3. Customer Electronic Consent

By clicking "Accept", "Confirm", or signing on digital delivery tablets, the customer:
1. Consents to conduct business electronically with Subidha Furniture;
2. Acknowledges receipt and agreement to the contract terms, installment schedules, and policies;
3. Agrees that digital signatures and delivery tablet signatures represent legally valid authorization.`,
  },
};

export function getCodifiedPolicy(slug: string): CodifiedPolicy | null {
  const normalized = slug.trim().toLowerCase();
  return CODIFIED_PUBLIC_POLICIES[normalized] ?? null;
}

export function listCodifiedPolicies(): CodifiedPolicy[] {
  return Object.values(CODIFIED_PUBLIC_POLICIES);
}

