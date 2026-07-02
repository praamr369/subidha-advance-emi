from __future__ import annotations

from copy import deepcopy

from subscriptions.services.policy_coverage_catalog import get_gap_policy_templates

DEFAULT_POLICY_STATUS = "DRAFT"

# Phase PG-2A compatibility note:
# The historical template body list remains intentionally compact here. Extra customer-facing and
# internal governance templates are provided by policy_coverage_catalog.get_gap_policy_templates().
DEFAULT_POLICY_TEMPLATES = [
    {"slug": "terms", "title": "Terms and Conditions", "category": "GENERAL", "summary": "General terms for using Subidha Furniture's website, direct sale, Lucky Plan EMI, rent/lease, delivery, payment, and service workflows.", "default_status": DEFAULT_POLICY_STATUS, "content": """# Terms and Conditions

These Terms and Conditions apply to all customer-facing business activities of **Subidha Furniture**, operated by **Pradip Roy** / **Pradip Roy**, Business Code **SUBIDHA-ASN-001**, from **South Dhadka Sukantapally, Near Rupkatha Cinema Hall, Dakhin Dhadka, Asansol, Paschim Barddhaman, West Bengal, 713302, India**.

## 1. Scope

These terms apply when a person uses our website, submits an enquiry, registers as a customer, accepts a quotation, buys a product, joins a Lucky Plan EMI subscription, enters a rent/lease contract, pays an amount, receives delivery, requests service, or communicates with our staff.

## 2. Business records are controlling

Invoices, receipts, contracts, payment records, delivery records, support tickets, audit logs, and approved backend-generated documents are the official business records. Screenshots, verbal promises, informal messages, and handwritten notes are not final unless matched with approved business records.

## 3. Customer responsibility

Customers must provide correct name, phone, address, payment reference, identity/KYC information where required, delivery availability, and product/service details. Incorrect or incomplete information may delay order, delivery, refund, service, warranty, EMI processing, rent/lease possession, or account support.

## 4. Product and price confirmation

Product images, brochures, catalogue descriptions, and website listings are informational. Final product, price, discount, tax, delivery charge, warranty, and terms are confirmed only through approved quotation, invoice, contract, or receipt.

## 5. Direct sale, EMI, rent, and lease separation

Direct sale, Lucky Plan EMI, rent, and lease are separate workflows. A direct sale does not create a Lucky ID. A Lucky Plan subscription does not create a rent/lease contract. Rent/lease possession does not transfer ownership unless a written sale document is issued.

## 6. Legal rights preserved

These terms do not remove statutory consumer rights under applicable Indian law. Where a written contract or policy gives additional business rules, both the contract and policy apply unless prohibited by law.

## 7. Contact and jurisdiction

Support is available at **+91 94764 90946**, **subidhafurnitureofficial@gmail.com**, and **South Dhadka Sukantapally, Near Rupkatha Cinema Hall, Dakhin Dhadka, Asansol, Paschim Barddhaman, West Bengal, 713302, India**. Subject to applicable consumer law, disputes are ordinarily handled under the competent jurisdiction of **Asansol, West Bengal, India**."""},
    {"slug": "privacy", "title": "Privacy Policy", "category": "PRIVACY", "summary": "Explains how Subidha Furniture collects, uses, stores, protects, and handles customer personal data.", "default_status": DEFAULT_POLICY_STATUS, "content": """# Privacy Policy

Subidha Furniture respects customer privacy and processes personal data only for lawful business purposes connected with furniture sales, Lucky Plan EMI, rent/lease, delivery, payment, service, support, compliance, audit, and dispute handling.

## 1. Data we collect

We may collect name, phone, email, address, KYC details, payment references, contract records, product selections, delivery details, service photos, support conversations, invoices, receipts, and account login/security information.

## 2. Why we use data

We use data to create customer accounts, handle enquiries, prepare quotations, generate invoices/receipts, manage EMI schedules, run Lucky Plan records, process rent/lease possession and deposits, schedule delivery, provide warranty/service support, prevent fraud, reconcile payments, comply with tax/accounting/legal duties, and resolve disputes.

## 3. Sharing

We may share limited data with staff, authorised partners, delivery staff, service technicians, payment/accounting processors, legal/compliance advisers, auditors, hosting providers, and government authorities where required. We do not sell customer personal data.

## 4. Retention

Financial, tax, contract, payment, audit, KYC, warranty, delivery, and dispute records may be retained as long as required for business, legal, accounting, compliance, or dispute purposes. Deletion requests are handled under the Data Requests and Data Retention policies.

## 5. Customer rights and contact

Customers may request access, correction, update, or deletion review by contacting **subidhafurnitureofficial@gmail.com** or **+91 94764 90946**. Certain records cannot be deleted immediately where retention is legally or operationally required.

## 6. Security

We use access control, role separation, audit logs, backups, and internal process controls. No system is risk-free; suspected misuse or breach should be reported immediately to **subidhafurnitureofficial@gmail.com**."""},
    {"slug": "refund-cancellation", "title": "Refund and Cancellation Policy", "category": "REFUND", "summary": "Explains cancellation, return, refund, reversal, and adjustment rules.", "default_status": DEFAULT_POLICY_STATUS, "content": """# Refund and Cancellation Policy

Refunds, cancellations, returns, reversals, and adjustments are controlled workflows. They are not automatic and must be reviewed against invoice, receipt, contract, payment, delivery, product condition, and audit records.

## 1. Direct sale cancellation

Before delivery or installation, cancellation may be considered if the product has not been specially ordered, customised, damaged, dispatched, or delivered. Any approved refund may deduct transport, handling, payment charges, packaging, customisation cost, or administrative cost.

## 2. After delivery

After delivery acknowledgement, return/replacement depends on product condition, warranty eligibility, visible damage evidence, manufacturing defect, and timely reporting. Used, damaged, customised, assembled, or customer-misused products may be rejected or charged.

## 3. Lucky Plan EMI cancellation

Lucky Plan cancellation is subject to the approved contract/rulebook. Paid amounts, deductions, outstanding dues, delivery status, winner status, and waiver status must be checked before refund or closure.

## 4. Rent/lease closure and deposit refund

Security deposit refund requires return inspection, dues clearance, asset condition check, missing/damaged part review, and approved deduction/refund workflow.

## 5. Refund method and timing

Approved refunds are processed to the verified customer/payment channel within **7 to 15 working days after approval**, subject to bank/payment delay and completion of internal approval.

## 6. Fraud and duplicate claims

Fraudulent payment proof, duplicate refund claim, chargeback abuse, or false damage claim may lead to rejection, account restriction, recovery, or legal action."""},
    {"slug": "warranty", "title": "Warranty Policy", "category": "WARRANTY", "summary": "Explains product warranty support, exclusions, and service escalation.", "default_status": DEFAULT_POLICY_STATUS, "content": """# Warranty Policy

Warranty support depends on product type, invoice date, manufacturer warranty, shop warranty if any, usage condition, and inspection result.

## 1. Warranty proof

Invoice/receipt and product identity are required for warranty review. Warranty is not transferable unless approved in writing.

## 2. Coverage

Warranty may cover manufacturing defects, eligible hardware failure, or workmanship issues confirmed by inspection. Manufacturer warranty terms apply where the product carries manufacturer coverage.

## 3. Exclusions

Warranty does not cover misuse, water/fire/termite/pest damage, overloading, unauthorised repair, modification, accident, commercial misuse, normal wear and tear, colour/polish variation, fabric fading, mattress comfort preference, or damage after delivery acknowledgement.

## 4. Service path

Warranty claims are handled through service ticket, inspection, photo/evidence review, repair/replacement decision, and closure record.

## 5. Timeline

Resolution depends on inspection, parts availability, supplier/manufacturer response, and workload. Estimated response time: **3 to 10 working days, depending on inspection and parts availability**.

## 6. No automatic refund

Warranty review does not automatically create refund, return, or replacement unless approved under business workflow and applicable law."""},
    {"slug": "delivery-policy", "title": "Delivery Policy", "category": "DELIVERY", "summary": "Explains delivery scheduling, handover, failed delivery, customer acknowledgement, and delivery evidence.", "default_status": DEFAULT_POLICY_STATUS, "content": """# Delivery Policy

Delivery is subject to product availability, payment/contract status, address accuracy, route feasibility, staff availability, and readiness approval in the system.

## 1. Delivery eligibility

Delivery may be blocked if payment is unpaid/unverified, EMI/rent/lease contract is not ready, KYC is pending where required, product is unavailable, stock is on hold, address is incomplete, or customer is unreachable.

## 2. Scheduling

Delivery dates and time slots are estimates unless expressly confirmed. Weather, transport issue, staff shortage, supplier delay, traffic, local restrictions, or force majeure may affect delivery.

## 3. Customer responsibility

The customer must provide correct address, phone, lift/stair/access details, receiver name, and availability. Extra labour, difficult access, rescheduling, or waiting may be chargeable.

## 4. Handover

At handover, the customer/receiver should inspect quantity, visible condition, model, accessories, and packaging. Delivery acknowledgement may be treated as evidence that visible condition was accepted.

## 5. Failed delivery

Wrong address, locked premises, customer absence, refusal, unpaid dues, unsafe access, or no response may be treated as failed delivery and may require rescheduling charges.

## 6. Damage reporting

Visible damage should be reported at delivery. Later claims require evidence and inspection under warranty/service policy."""},
    {"slug": "rental-lease-policy", "title": "Rental and Lease Policy", "category": "RENT_LEASE", "summary": "Explains rent/lease contract onboarding, possession, monthly demand, security deposit, return, and closure rules.", "default_status": DEFAULT_POLICY_STATUS, "content": """# Rental and Lease Policy

Rent and lease workflows allow customer possession/use of selected products under written contract without immediate ownership transfer.

## 1. Onboarding

Customer registration, KYC, address verification, contract approval, security deposit, and payment readiness may be required before possession.

## 2. Security deposit

Security deposit may be collected as **20% to 30%, or as stated in the contract** or as stated in the contract. Deposit is not advance rent unless specifically recorded.

## 3. Monthly dues

Monthly rent/lease dues must be paid by due date. Late payment may lead to reminders, service hold, possession review, deduction, cancellation, recovery, or legal action.

## 4. Customer use

Customer must use the asset carefully, keep it at the approved location, prevent damage, avoid unauthorised transfer/sublease, and report issues promptly.

## 5. Return and closure

Closure requires return inspection, dues clearance, missing/damage review, deposit deduction/refund approval, and contract closeout.

## 6. Ownership

Ownership remains with Subidha Furniture or lawful owner unless a separate sale document transfers title."""},
    {"slug": "lucky-plan-policy", "title": "Lucky Plan Policy", "category": "LUCKY_PLAN", "summary": "Explains Lucky Plan EMI, Lucky IDs, winner waiver, draw rules, and customer responsibilities.", "default_status": DEFAULT_POLICY_STATUS, "content": """# Lucky Plan Policy

Lucky Plan EMI is a product instalment subscription workflow operated by Subidha Furniture. It is linked to product purchase/contract records and is not a cash prize scheme.

## 1. Basic structure

Product base price is treated as total contract price. Default EMI is total contract price divided by **15** months unless contract states otherwise.

## 2. Lucky ID and batch

Each subscription may be linked to a Lucky ID within a batch of **100** IDs. One customer may hold multiple subscriptions/Lucky IDs only where allowed by approved workflow.

## 3. Draw and winner waiver

A draw may be conducted as per approved rulebook. The winning Lucky ID receives waiver of future unpaid EMIs only. Already-paid EMIs are not automatically refunded unless a separate written rule applies.

## 4. Payment duties

Customers must pay each EMI by due date. Late/defaulted EMI may affect draw eligibility, delivery readiness, service support, cancellation review, and settlement.

## 5. Product delivery

Delivery may require minimum paid EMI count, KYC, stock readiness, contract activation, and no unresolved blockers.

## 6. Audit and dispute

Draw records, hash/fairness proof, winner settlement, waivers, EMIs, payments, and delivery records remain auditable and cannot be manually changed for convenience."""},
    {"slug": "direct-sale-policy", "title": "Direct Sale Policy", "category": "DIRECT_SALE", "summary": "Explains direct-sale invoice, receipt, delivery, return, cancellation, and warranty terms.", "default_status": DEFAULT_POLICY_STATUS, "content": """# Direct Sale Policy

Direct Sale means a normal retail sale outside Lucky Plan EMI, rent, or lease.

## 1. Sale confirmation

A sale is confirmed when invoice/receipt/order confirmation is generated or when the shop accepts the order under approved workflow.

## 2. Walk-in customer

Where backend workflow allows, direct sale may be made to a walk-in customer without full EMI/rent KYC. Required billing, delivery, and warranty details must still be accurate.

## 3. Product availability

Stock may be ready, reserved, ordered, or subject to supplier availability. Delivery/fulfilment depends on actual stock and payment status.

## 4. Price and discount

Discounts are valid only when recorded in quotation/invoice. Old quotes, verbal offers, or screenshots do not bind the shop after expiry or stock/price change.

## 5. Return and service

Returns, warranty, and service follow the Refund/Cancellation, Warranty, Delivery, and Service policies.

## 6. Separation from contract plans

Direct sale does not create EMI waiver, Lucky ID, security deposit, monthly rent, or lease possession rights."""},
    {"slug": "payment-policy", "title": "Payment Policy", "category": "PAYMENT", "summary": "Explains accepted payment modes, receipts, failed payments, outstanding dues, reconciliation, and customer payment responsibilities.", "default_status": DEFAULT_POLICY_STATUS, "content": """# Payment Policy

Payments are accepted only through approved modes and are valid only after recorded by Subidha Furniture against the correct customer, sale, invoice, EMI, rent/lease contract, deposit, advance, or service.

## 1. Accepted modes

Approved modes may include cash, UPI, bank transfer, card, or other shop-approved channels. Do not pay to unauthorised personal accounts.

## 2. Receipt requirement

The official receipt or backend payment record is the final proof of business receipt. Screenshots, UPI success screens, or verbal confirmation are not final if the amount is not received or correctly mapped.

## 3. Failed or pending payments

Pending, failed, reversed, duplicate, wrong-reference, wrong-account, or disputed payments may remain under review until reconciliation is complete.

## 4. EMI/rent due handling

Payment must be made by the due date. Late or missed payment may lead to reminder, delivery hold, service hold, default review, cancellation review, or recovery action.

## 5. Correction and reversal

Any correction, reversal, or void must follow approved audit-safe workflow. Customers may be asked for bank/UPI proof and identity confirmation.

## 6. No unauthorised collection

Customers should report unauthorised payment demands immediately at **+91 94764 90946** or **subidhafurnitureofficial@gmail.com**."""},
    {"slug": "service-policy", "title": "Service and Repair Policy", "category": "SERVICE", "summary": "Explains customer support, service tickets, repair inspection, chargeable service, warranty service, and closure.", "default_status": DEFAULT_POLICY_STATUS, "content": """# Service and Repair Policy

Service requests are managed through approved support/service workflow so that inspection, communication, evidence, cost, and closure remain traceable.

## 1. Request intake

Customers should provide invoice/contract reference, product photos, issue description, delivery date, current location, and contact details.

## 2. Inspection

The shop may inspect remotely through photos/video or physically at the customer location/shop/service point. Inspection decides whether the case is warranty, chargeable repair, misuse, transport damage, or non-serviceable.

## 3. Chargeable service

Charges may apply for expired warranty, misuse, damage, customer relocation, spare parts, technician visit, transport, reinstallation, or non-covered repairs.

## 4. Warranty service

Eligible warranty service may include repair, part replacement, supplier escalation, or manufacturer service. Product replacement/refund is not automatic.

## 5. Closure

A service case is closed when resolved, rejected with reason, customer does not respond, customer refuses charges, or issue is outside support scope.

## 6. Abuse prevention

Repeated false claims, abusive communication, unsafe location, or non-cooperation may lead to service refusal subject to legal rights."""},
    {"slug": "grievance", "title": "Grievance Policy", "category": "GRIEVANCE", "summary": "Explains customer grievance submission, escalation, response, and closure process.", "default_status": DEFAULT_POLICY_STATUS, "content": """# Grievance Policy

Customers may raise complaints about billing, payment, product, delivery, EMI, rent/lease, warranty, service, staff conduct, privacy, or website issues.

## 1. How to raise

Submit complaint at **+91 94764 90946**, **subidhafurnitureofficial@gmail.com**, or shop address **South Dhadka Sukantapally, Near Rupkatha Cinema Hall, Dakhin Dhadka, Asansol, Paschim Barddhaman, West Bengal, 713302, India** with invoice/receipt/contract/subscription reference and evidence.

## 2. Required evidence

Relevant evidence may include photos, videos, payment proof, delivery acknowledgement, chat record, product label, service ticket, or written explanation.

## 3. Review

The shop will review records, staff notes, audit trail, product condition, payment status, and policy terms. Response target is **2 to 7 working days, depending on issue type** depending on complexity.

## 4. Escalation

Unresolved complaints may be escalated to owner/management review. Legal remedies available under Indian law remain unaffected.

## 5. Closure

A grievance may be closed after resolution, refund/replacement/service decision, rejection with reason, customer non-response, or handover to legal/dispute process.

## 6. Conduct

Abusive, threatening, fraudulent, or unsafe communication may be restricted while preserving lawful complaint rights."""},
    {"slug": "business-compliance", "title": "Business Compliance Policy", "category": "COMPLIANCE", "summary": "Explains public business compliance identity and registration disclosure rules.", "default_status": DEFAULT_POLICY_STATUS, "content": """# Business Compliance Policy

This policy explains how Subidha Furniture presents business identity, registration, tax, MSME/Udyam, and compliance information to customers.

## 1. Business identity

Trade name, legal name, owner/proprietor, business code, address, phone, and website are shown to help customers identify the business.

## 2. GST and tax status

GST status is shown as: **GST Unregistered (below threshold) -- will be updated upon registration**. GSTIN is disclosed only where legally required or approved by management.

## 3. Udyam/MSME status

Udyam/MSME status is shown as: **[UDYAM_STATUS_PUBLIC_TEXT]**. Private certificates and numbers are not publicly downloadable unless approved.

## 4. Document privacy

PAN, bank proof, ownership proof, shop licence, rental agreement, and other documents may be held internally for audit/compliance and not exposed publicly.

## 5. Updates

Compliance details may change due to registration, renewal, correction, or legal requirement. Public pages will be updated after verification.

## 6. No false representation

Customers may report suspected incorrect compliance information at **subidhafurnitureofficial@gmail.com**."""},
    {"slug": "ownership-business-proof", "title": "Ownership and Business Proof Policy", "category": "COMPLIANCE", "summary": "Explains ownership and business proof disclosure rules.", "default_status": DEFAULT_POLICY_STATUS, "content": """# Ownership and Business Proof Policy

Subidha Furniture may maintain ownership, shop, address, bank, tax, MSME, and business proof records for internal audit, vendor/customer trust, and compliance readiness.

## 1. Public summary only

Public pages may show a summary of verified business identity. Full private documents are not public unless legally required and approved.

## 2. Private records

PAN, bank proof, rental agreement, ownership documents, licences, utility bills, identity proofs, and similar records remain private operational evidence.

## 3. Verification

Verification means the document was reviewed internally for business use. It is not a government guarantee, legal title opinion, or public certification.

## 4. Updates and expiry

Expired, rejected, or superseded documents must not be treated as current. Public summaries should be updated after review.

## 5. Customer reliance

Customers should rely on invoice, receipt, official communication, and verified public summary. They should not demand private documents unless legally entitled."""},
    {"slug": "udyam-msme", "title": "Udyam/MSME Policy", "category": "COMPLIANCE", "summary": "Explains Udyam/MSME status disclosure and verification limits.", "default_status": DEFAULT_POLICY_STATUS, "content": """# Udyam/MSME Policy

Subidha Furniture may disclose Udyam/MSME status to explain small-business identity and available public business information.

## 1. Status wording

Current public status: **[UDYAM_STATUS_PUBLIC_TEXT]**.

## 2. No guarantee of benefit

Udyam/MSME status does not guarantee customer discount, subsidy, government support, financing, refund, or special dispute outcome.

## 3. Privacy

Certificate numbers or documents may be kept private unless disclosure is legally required or approved.

## 4. Updates

If Udyam/MSME status changes, public text will be updated after internal verification.

## 5. Misuse

No customer, vendor, partner, or third party may misuse the business's MSME identity for unauthorised claims."""},
    {"slug": "data-requests", "title": "Data Requests Policy", "category": "PRIVACY", "summary": "Explains customer data access, correction, retention, and deletion request handling.", "default_status": DEFAULT_POLICY_STATUS, "content": """# Data Requests Policy

Customers may request access, correction, update, deletion review, or grievance handling for eligible personal data.

## 1. How to request

Send request to **subidhafurnitureofficial@gmail.com** or **+91 94764 90946** with registered phone/email and supporting identity proof if required.

## 2. Verification

We may verify the requester before sharing or changing data to prevent fraud or unauthorised access.

## 3. Correction

Incorrect phone, address, name, email, KYC, delivery, or account details may be corrected after verification. Financial and audit records may require correction notes instead of deletion.

## 4. Deletion limits

Invoices, receipts, payments, tax records, contracts, audit logs, dispute records, warranty records, and legal/compliance records may be retained even if account deletion is requested.

## 5. Response

Requests are handled within a reasonable period depending on complexity, verification, and legal retention obligations.

## 6. Abuse

Repeated, fraudulent, or unauthorised requests may be refused with reason."""},
    {"slug": "contact-enquiry-policy", "title": "Contact and Enquiry Policy", "category": "CUSTOMER_SUPPORT", "summary": "Explains safe handling of public enquiries and lead/contact submissions.", "default_status": DEFAULT_POLICY_STATUS, "content": """# Contact and Enquiry Policy

This policy applies when a person submits enquiry forms, requests quotations, calls, WhatsApps, emails, or visits the shop for product/business information.

## 1. Information collected

We may collect name, phone, location, product interest, budget, delivery preference, and message details.

## 2. Follow-up

We may contact the person through call, WhatsApp, SMS, email, or in-person shop support for product guidance, quotation, delivery feasibility, EMI/rent/lease eligibility, or service response.

## 3. No contract from enquiry

Submitting an enquiry does not create confirmed order, price lock, Lucky ID, EMI subscription, rent/lease contract, product reservation, or delivery promise.

## 4. Lead closure

Enquiries may be closed if duplicate, spam, unreachable, abusive, irrelevant, or completed.

## 5. Data handling

Enquiry data is handled under the Privacy Policy and Data Requests Policy."""},
]


def get_default_policy_templates() -> list[dict]:
    merged: dict[str, dict] = {}
    for template in [*DEFAULT_POLICY_TEMPLATES, *get_gap_policy_templates()]:
        merged.setdefault(template["slug"], template)
    return deepcopy(list(merged.values()))
