from __future__ import annotations

from copy import deepcopy

DEFAULT_POLICY_STATUS = "DRAFT"

DEFAULT_POLICY_TEMPLATES = [
    {
        "slug": "terms",
        "title": "Terms and Conditions",
        "category": "GENERAL",
        "summary": "General terms for using Subidha Furniture's website, direct sale, Lucky Plan EMI, rent/lease, delivery, payment, and service workflows.",
        "default_status": DEFAULT_POLICY_STATUS,
        "content": """# Terms and Conditions

## 1. Introduction
Welcome to Subidha Furniture. These Terms and Conditions govern the use of our website, public pages, customer account features, product enquiries, direct sale purchases, Lucky Plan / Advance EMI contracts, rent or lease contracts, delivery services, payment collection, service requests, and related business operations.

By using our website, registering an account, submitting an enquiry, placing an order, joining a Lucky Plan EMI contract, making payment, requesting delivery, raising a service request, or using rent/lease services, you agree to follow these Terms and Conditions.

These terms are intended for retail furniture customers and business users interacting with Subidha Furniture through the website or authorized staff.

## 2. Business identity
Business name: Subidha Furniture
Business location: Asansol, West Bengal, India
Website: [WEBSITE_URL]
Contact: [BUSINESS_PHONE] / [BUSINESS_EMAIL]
GST status: [GST_STATUS_PUBLIC_TEXT]
Udyam/MSME status: [UDYAM_STATUS_PUBLIC_TEXT]

If any registration detail is not currently available, it will be displayed as \"Not provided / will be updated after registration.\" We do not claim any registration, license, GST number, or MSME status unless it is actually issued and verified.

## 3. Website use
Customers may use the website to view product information, Lucky Plan details, winner history, policy pages, contact details, service options, direct sale information, and customer account information where login is provided.

Users must not misuse the website, attempt unauthorized access, submit false details, interfere with system security, copy private content, or impersonate another person.

## 4. Product information
Product images, descriptions, dimensions, features, color tones, material descriptions, and availability shown online are for customer guidance. Actual product appearance may vary slightly due to lighting, photography, fabric shade, material batch, display screen differences, or supplier/manufacturer variation.

The final product, price, EMI, rent, lease amount, warranty, delivery condition, and stock availability must be confirmed through the official invoice, receipt, contract, or staff confirmation.

## 5. Direct sale
Direct sale means normal purchase of product through invoice and receipt. Direct sale may include full payment, partial payment, delivery scheduling, cancellation, return, warranty, or service workflows depending on the transaction status and business approval.

A direct sale invoice or receipt does not automatically mean product delivery is complete. Delivery is separately controlled by stock, address confirmation, payment status, delivery eligibility, and operational workflow.

## 6. Lucky Plan / Advance EMI
Lucky Plan / Advance EMI is a contract-based furniture purchase workflow. The product base price is treated as the total contract price. The default EMI amount is calculated based on the total contract price divided by the selected tenure months, unless a different approved contract structure is recorded.

A customer may have multiple subscriptions and multiple Lucky IDs depending on approved batches and product contracts.

Lucky draw winner benefit is limited to future EMI waiver for the winner's eligible subscription, according to the recorded Lucky Plan rules. Unless separately and explicitly approved in writing, the Lucky Plan winner does not receive a cash prize.

## 7. Rent / lease
Rent or lease contracts are separate from direct sale and Lucky Plan EMI. Rent/lease may include a security deposit, monthly rent/lease billing, asset condition checks, return inspection, damage deductions, and refund processing.

Security deposit is not income. It is held subject to contract terms, return inspection, outstanding dues, damage, missing parts, late charges, or other approved deductions.

## 8. Payment
Payments may be accepted through approved modes such as cash, UPI, bank transfer, payment gateway, or any other mode enabled by Subidha Furniture. A payment is considered valid only after it is received, verified, and recorded in the system.

Customers should collect or download a valid receipt for every payment. Payment disputes must be raised with proof such as receipt number, transaction reference, date, amount, and customer details.

## 9. Delivery
Delivery is subject to product availability, address confirmation, delivery area, staff schedule, payment status, stock readiness, and operational approval. Delivery date or time may be estimated but cannot be guaranteed unless explicitly confirmed by Subidha Furniture.

Customers must inspect the product at the time of delivery and report visible damage, missing parts, or wrong item immediately.

## 10. Cancellation, return, refund
Cancellation, return, refund, and reversal are governed by the Refund / Cancellation Policy and the specific transaction type. Approved refunds may require verification, approval, payment reconciliation, and processing time.

Posted invoices, receipts, and payment records are not deleted. Corrections are handled through cancellation, void, refund, credit note, debit note, reversal, or other auditable workflow.

## 11. Warranty and service
Warranty and service support are governed by the Warranty Policy and Service / Repair Policy. Warranty may differ by product, manufacturer, item category, usage, damage type, and purchase terms.

Misuse, water damage, termite damage, unauthorized repair, physical breakage, transport damage after customer handover, and normal wear and tear may be excluded unless expressly covered.

## 12. Customer responsibility
Customers must provide accurate name, phone number, address, ID/contact information where required, delivery availability, payment reference, and contract details. Customers must keep receipts, invoices, contract copies, and warranty documents safely.

## 13. Account and access
Customers, partners, and staff may receive different role-based access. Admin and cashier roles are internal only. Customers must not attempt to access staff/admin modules.

## 14. Changes to terms
Subidha Furniture may update these terms when business process, law, compliance, product categories, or technology changes. The latest published version on the website applies from the effective date.

## 15. Contact
For questions, contact:
Subidha Furniture
Address: [BUSINESS_ADDRESS]
Phone: [BUSINESS_PHONE]
Email: [BUSINESS_EMAIL]
""",
    },
    {
        "slug": "privacy",
        "title": "Privacy Policy",
        "category": "PRIVACY",
        "summary": "Explains how Subidha Furniture collects, uses, stores, protects, and handles customer personal data.",
        "default_status": DEFAULT_POLICY_STATUS,
        "content": """# Privacy Policy

## 1. Introduction
Subidha Furniture respects customer privacy. This Privacy Policy explains how we collect, use, store, protect, and handle personal information when customers use our website, register an account, submit an enquiry, purchase products, join Lucky Plan EMI, enter rent/lease contracts, make payments, request delivery, or raise service/support requests.

## 2. Information we collect
We may collect:
- name
- phone number
- email address
- residential or delivery address
- customer account details
- product enquiry details
- purchase, invoice, receipt, and payment references
- EMI/subscription details
- rent/lease contract details
- service ticket and warranty request details
- delivery information
- communication records
- uploaded documents only where required for verification or business process
- technical data such as browser/device information, cookies, login/session events, and security logs

We collect only information required for lawful business purposes such as order processing, payment tracking, EMI management, delivery, service support, fraud prevention, legal compliance, and customer communication.

## 3. How we use information
We use customer information to:
- create and manage customer accounts
- process enquiries, orders, invoices, receipts, and payments
- manage Lucky Plan EMI subscriptions and Lucky IDs
- manage rent/lease contracts and security deposits
- schedule delivery and service requests
- send payment reminders, delivery updates, and service updates
- maintain audit logs and financial records
- prevent fraud, misuse, and unauthorized access
- comply with applicable legal, tax, accounting, and business obligations
- improve customer support and internal operations

## 4. Payment information
We do not ask customers to share sensitive card passwords, OTPs, UPI PINs, net-banking passwords, or banking credentials. Customers should never share OTP, PIN, or password with anyone claiming to represent Subidha Furniture.

Payment references may be stored for reconciliation, receipt, refund, audit, and customer support.

## 5. Sharing of information
We may share limited information only where necessary with:
- delivery staff or logistics partners
- payment service providers or banks
- service/warranty support staff
- accounting, audit, legal, or compliance advisors
- government or lawful authorities where required
- technology service providers used to operate the website

We do not sell customer personal data to advertisers or unrelated third parties.

## 6. Data security
We use reasonable security practices such as role-based access, staff permissions, authentication, audit logs, controlled admin access, and secure operational processes. However, no digital system is completely risk-free.

Customers should keep their login details, phone number, email, and receipts secure.

## 7. Data retention
We retain records for as long as required for business operations, customer service, warranty, EMI contracts, rent/lease contracts, financial accounting, audit, legal compliance, tax requirements, dispute handling, and fraud prevention.

Payment, invoice, receipt, EMI, contract, accounting, and audit records may be retained even after account closure where required by law or business recordkeeping.

## 8. Customer rights and requests
Customers may request correction, update, access, or deletion of applicable personal data by contacting Subidha Furniture. Some records cannot be deleted immediately if needed for active contract, invoice, receipt, payment, accounting, audit, legal, tax, warranty, or dispute purposes.

Requests can be submitted through:
Phone: [BUSINESS_PHONE]
Email: [BUSINESS_EMAIL]
Address: [BUSINESS_ADDRESS]

## 9. Cookies and website data
Our website may use cookies or similar technologies for login sessions, security, analytics, preferences, and performance. Customers can manage cookies through browser settings, but disabling cookies may affect login or website functionality.

## 10. Children's data
Our services are intended for customers who can legally enter business transactions. Minors should use the website only under guardian supervision. We do not knowingly create financial contracts with minors.

## 11. Data breach communication
If a data security incident affects customer data, Subidha Furniture will assess the issue and take reasonable steps according to applicable law, business risk, and operational requirements.

## 12. Changes to this policy
This Privacy Policy may be updated from time to time. The latest published version applies from its effective date.

## 13. Contact / grievance
For privacy questions or grievances:
Subidha Furniture
Phone: [BUSINESS_PHONE]
Email: [BUSINESS_EMAIL]
Address: [BUSINESS_ADDRESS]
""",
    },
    {
        "slug": "refund-cancellation",
        "title": "Refund and Cancellation Policy",
        "category": "REFUND",
        "summary": "Explains cancellation, return, refund, reversal, and adjustment rules for direct sale, Lucky Plan EMI, rent/lease, and service transactions.",
        "default_status": DEFAULT_POLICY_STATUS,
        "content": """# Refund and Cancellation Policy

## 1. Introduction
This policy explains how cancellation, return, refund, void, reversal, and adjustment requests are handled by Subidha Furniture.

Refunds and cancellations depend on transaction type, payment status, invoice status, product condition, delivery status, contract terms, service status, and approval by authorized staff.

## 2. General principles
- Posted financial records are not deleted.
- Corrections are handled through auditable workflows such as cancellation, void, refund, credit note, debit note, or reversal.
- Refund approval does not mean immediate payment. Refund processing may require verification, reconciliation, management approval, and payment method confirmation.
- Refunds are normally processed through the original or approved payment method where feasible.
- Any bank/payment gateway charges, delivery charges, service charges, installation charges, handling charges, or usage deductions may be deducted where applicable and lawful.

## 3. Direct sale cancellation
A direct sale may be cancelled before delivery if:
- the product has not been delivered,
- there is no active receipt restriction,
- cancellation is operationally allowed,
- stock/delivery workflow can be reversed,
- authorized staff approves the request.

If payment was already collected, refund may be processed after invoice/receipt verification and reversal workflow.

## 4. Direct sale return after delivery
Return after delivery depends on:
- product condition,
- time since delivery,
- whether the product was used, damaged, assembled, customized, or altered,
- warranty/service eligibility,
- approval by Subidha Furniture.

Products damaged by misuse, water, termite, unauthorized repair, customer transport, or improper handling may not be eligible for full refund.

## 5. Lucky Plan / Advance EMI cancellation
Lucky Plan EMI cancellation is governed by the customer's contract, payment history, batch status, Lucky ID status, product delivery status, waiver status, and business approval.

Cancellation does not automatically erase payment, invoice, EMI, waiver, lucky draw, or audit records. Refund or adjustment, if any, will be processed only through approved financial workflow.

Winner waiver benefits apply only to future eligible EMIs and are not automatically converted to cash.

## 6. Rent / lease cancellation
Rent/lease cancellation depends on contract term, asset condition, outstanding dues, security deposit, return inspection, damage deductions, missing parts, overdue rent/lease amount, and approved closure workflow.

Security deposit refund is processed only after:
- asset return,
- return inspection,
- dues calculation,
- deduction approval,
- financial reconciliation.

## 7. Warranty/service refund or replacement
Service or warranty cases may result in repair, replacement, spare support, partial adjustment, or no charge depending on product warranty terms and inspection result.

Refund is not guaranteed for every service issue.

## 8. Non-refundable or deductible amounts
The following may be non-refundable or deductible where applicable:
- delivery charges
- installation or assembly charges
- payment gateway/bank charges
- used/damaged product value
- missing parts
- rent/lease usage charges
- overdue dues
- repair cost
- contractually agreed charges
- customized/specially ordered item charges

## 9. Refund processing time
Refund processing time depends on verification and payment method. The admin should configure the public text for expected refund time. Suggested default wording:
\"Approved refunds are usually processed within 7 to 15 working days after completion of verification and reconciliation.\"

## 10. Required documents for refund
Customer may be asked to provide:
- invoice number
- receipt number
- payment reference
- customer phone number
- product/order details
- bank/UPI details if refund cannot be made to original mode
- photos/video for damaged product or return case
- ID verification where required

## 11. How to request cancellation/refund
Contact:
Phone: [BUSINESS_PHONE]
Email: [BUSINESS_EMAIL]
Address: [BUSINESS_ADDRESS]
""",
    },
    {
        "slug": "warranty",
        "title": "Warranty Policy",
        "category": "WARRANTY",
        "summary": "Explains manufacturer warranty, shop service support, exclusions, inspection, and claim handling.",
        "default_status": DEFAULT_POLICY_STATUS,
        "content": """# Warranty Policy

## 1. Introduction
This Warranty Policy explains warranty and service support for products purchased, financed, rented, or leased through Subidha Furniture.

Warranty depends on product category, manufacturer terms, invoice, delivery date, usage, installation, condition, and inspection.

## 2. Warranty source
Warranty may be provided by:
- manufacturer or brand,
- supplier,
- Subidha Furniture service support,
- specific written contract terms.

Where a manufacturer warranty applies, manufacturer terms will take priority.

## 3. Warranty coverage
Warranty may cover manufacturing defects, structural defects, or covered service issues depending on product category and warranty period.

Warranty does not automatically cover every damage or complaint.

## 4. Common exclusions
Warranty usually does not cover:
- misuse or rough handling
- water damage
- termite/insect damage unless expressly covered
- fire, flood, accident, or natural damage
- unauthorized repair or modification
- normal wear and tear
- scratches, stains, dents, fabric fading, polish fading, or color variation
- damage caused during customer shifting/transport
- damage caused by improper installation not done by authorized staff
- missing documents or unverified purchase
- commercial use where product was sold for household use only

## 5. Inspection requirement
Warranty claim may require physical inspection, photographs, videos, invoice/receipt verification, and service team assessment.

Subidha Furniture may decide whether the issue qualifies for repair, replacement, paid repair, partial support, or rejection.

## 6. Repair/replacement
If warranty applies, Subidha Furniture may offer repair, part replacement, service visit, manufacturer escalation, or product replacement depending on feasibility.

Replacement is not automatic and depends on product availability and warranty approval.

## 7. Service charges
Service visit, transport, spare parts, labor, or handling charges may apply if the issue is outside warranty.

## 8. Rent/lease items
For rented or leased furniture, damage, misuse, missing parts, or poor return condition may lead to repair charges or deduction from security deposit.

## 9. How to claim warranty
Customer should contact with:
- customer name and phone
- invoice/receipt number
- delivery date
- product details
- issue description
- photos/videos if available

Contact:
Phone: [BUSINESS_PHONE]
Email: [BUSINESS_EMAIL]
""",
    },
    {
        "slug": "delivery-policy",
        "title": "Delivery Policy",
        "category": "DELIVERY",
        "summary": "Explains delivery area, scheduling, address confirmation, failed delivery, inspection, and customer responsibilities.",
        "default_status": DEFAULT_POLICY_STATUS,
        "content": """# Delivery Policy

## 1. Introduction
This Delivery Policy explains how Subidha Furniture handles product delivery for direct sale, Lucky Plan EMI, rent, lease, replacement, and service-related delivery.

## 2. Delivery eligibility
Delivery depends on:
- product availability
- payment or contract status
- delivery address confirmation
- stock readiness
- operational schedule
- route feasibility
- staff availability
- approval by authorized staff

Invoice or receipt creation does not always mean delivery is complete. Delivery is a separate workflow.

## 3. Delivery area
Delivery area may be limited to Asansol and nearby serviceable areas unless separately confirmed. Outstation delivery, long-distance transport, or special handling may require extra charges and approval.

## 4. Delivery time
Delivery date/time is estimated and may change due to traffic, weather, stock readiness, customer availability, route planning, staff availability, or operational issues.

## 5. Customer responsibilities
Customer must:
- provide correct full address
- share reachable phone number
- confirm delivery availability
- ensure entry space, lift/stair access, road access, and safe unloading
- inspect product at delivery
- report visible damage immediately
- sign/confirm delivery where required

## 6. Failed delivery
Delivery may fail or be rescheduled if:
- customer is unavailable
- address is incorrect
- phone is unreachable
- building access is restricted
- payment/contract is incomplete
- delivery route is unsafe or inaccessible
- customer refuses delivery without valid reason

Additional delivery charges may apply for repeated failed delivery attempts.

## 7. Inspection at delivery
Customer should inspect:
- product model
- visible damage
- quantity
- major parts
- basic condition

Visible damage or wrong item should be reported at delivery time.

## 8. Assembly/installation
Assembly or installation may be included or charged separately depending on product and location. Wall drilling, electrical work, civil work, or custom fitting may not be included unless explicitly confirmed.

## 9. Rent/lease delivery
Rent/lease delivery may include asset condition recording. Customer must verify condition at handover. Return inspection will compare asset condition against recorded condition.

## 10. Contact
For delivery support:
Phone: [BUSINESS_PHONE]
Email: [BUSINESS_EMAIL]
""",
    },
    {
        "slug": "rental-lease-policy",
        "title": "Rental and Lease Policy",
        "category": "RENT_LEASE",
        "summary": "Explains rent/lease contracts, deposits, monthly dues, possession, inspection, damage deduction, and closure.",
        "default_status": DEFAULT_POLICY_STATUS,
        "content": """# Rental and Lease Policy

## 1. Introduction
This policy applies to furniture rented or leased from Subidha Furniture. Rent and lease contracts are separate from direct sale and Lucky Plan EMI purchase contracts.

## 2. Contract creation
A rent/lease contract may require:
- customer profile
- product/asset selection
- contract period
- security deposit
- monthly rent or lease amount
- delivery/possession record
- customer address
- identity/contact verification where required
- signed or digitally accepted contract terms

## 3. Security deposit
Security deposit is collected as refundable security subject to contract terms. It is not rent income.

The deposit may be adjusted against:
- unpaid rent/lease dues
- late charges
- repair charges
- damage
- missing parts
- cleaning/restoration cost
- delivery/return charges
- other approved deductions

## 4. Monthly rent/lease dues
Monthly dues must be paid on or before the due date recorded in the contract. Delayed payment may lead to reminders, service restriction, late charges, recovery action, or contract closure as per approved business rules.

## 5. Asset possession
The asset remains owned/controlled by Subidha Furniture unless the contract explicitly states otherwise. Customer receives possession for use during the contract period only.

Customer must not sell, transfer, sublet, mortgage, pledge, modify, or damage the rented/leased asset.

## 6. Customer responsibility
Customer must keep the asset in safe condition, prevent water/termite/fire/physical damage, and allow inspection where required.

## 7. Return inspection
At contract closure or return, Subidha Furniture may inspect:
- structure
- fabric/finish
- parts/accessories
- cleanliness
- damage
- usage condition
- missing parts

Inspection outcome may affect deposit refund.

## 8. Deposit refund
Deposit refund will be processed after:
- asset return
- inspection
- dues clearance
- deduction calculation
- approval
- reconciliation

Suggested default processing window:
\"Approved deposit refunds are usually processed within 7 to 15 working days after inspection and reconciliation.\"

## 9. Early termination
Early termination may require notice, outstanding payment, pickup/return, inspection, and deductions according to the contract.

## 10. Disputes
If customer disagrees with deductions or inspection result, they may raise a grievance with supporting photos, contract details, and payment proof.
""",
    },
    {
        "slug": "lucky-plan-policy",
        "title": "Lucky Plan EMI Policy",
        "category": "LUCKY_PLAN",
        "summary": "Explains Lucky Plan EMI contract rules, Lucky IDs, EMI basis, draw winner benefit, overdue handling, and waiver limits.",
        "default_status": DEFAULT_POLICY_STATUS,
        "content": """# Lucky Plan / Advance EMI Policy

## 1. Introduction
Lucky Plan / Advance EMI is a contract-based furniture purchase plan offered by Subidha Furniture. This policy explains the basic rules for customer participation, EMI, Lucky ID, lucky draw, payment, waiver, and overdue handling.

## 2. Product price and EMI
For Lucky Plan EMI, the product base price is treated as the total contract price. The default EMI is calculated as:

Total contract price / tenure months

Any special discount, advance, revised tenure, or approved adjustment must be recorded in the official contract/system.

## 3. Customer subscriptions
One customer may have multiple subscriptions across products and batches. One customer may hold multiple Lucky IDs depending on approved plan rules and batch allocation.

## 4. Lucky ID and batch
Lucky ID is assigned according to batch availability and approved subscription workflow. Lucky ID does not guarantee winning.

## 5. Lucky draw
Lucky draw is conducted according to recorded batch/draw rules. The system may use auditable draw records, commitment/reveal verification, or other controls approved by Subidha Furniture.

## 6. Winner benefit
Lucky draw winner receives future EMI waiver only for the eligible subscription according to plan rules.

Unless separately approved in writing:
- no cash prize is given,
- waiver is not transferable,
- waiver does not apply to already paid EMIs,
- waiver does not automatically refund past payments,
- waiver does not cancel non-EMI dues such as delivery/service/penalty/other approved charges.

## 7. Payment responsibility
Customer must pay EMIs on or before due date unless waived by approved winner benefit or official adjustment.

Late/overdue EMIs may lead to reminders, collection follow-up, delivery hold, service restriction, cancellation review, or other approved business action.

## 8. Cancellation
Cancellation of Lucky Plan EMI depends on contract status, payment history, delivery status, batch/draw status, waiver status, and management approval.

Records are not deleted; approved changes are handled through auditable workflow.

## 9. Customer records
Customer should keep payment receipts, contract references, Lucky ID details, and communication records safely.

## 10. Contact
For Lucky Plan support:
Phone: [BUSINESS_PHONE]
Email: [BUSINESS_EMAIL]
""",
    },
    {
        "slug": "direct-sale-policy",
        "title": "Direct Sale Policy",
        "category": "DIRECT_SALE",
        "summary": "Explains normal furniture sale, invoice, receipt, delivery, payment, cancellation, return, and service linkage.",
        "default_status": DEFAULT_POLICY_STATUS,
        "content": """# Direct Sale Policy

## 1. Introduction
Direct sale means normal furniture sale through Subidha Furniture where customer purchases product through invoice and payment receipt.

## 2. Invoice and receipt
An invoice records sale details. A receipt records payment received. Invoice or receipt does not automatically mean delivery has been completed.

Posted invoices and receipts are preserved for audit. Corrections are handled through controlled cancellation, void, reversal, refund, credit note, or debit note workflows.

## 3. Payment
Customer may pay full or partial amount according to approved business rules. Outstanding balance remains payable unless cancelled, waived, refunded, reversed, or adjusted through authorized workflow.

## 4. Delivery
Delivery is controlled separately by delivery eligibility, stock readiness, address confirmation, payment status, and operational scheduling.

## 5. Cancellation
Cancellation before delivery may be allowed if invoice/receipt/payment/delivery status permits. Cancellation after delivery is subject to return policy, product condition, and approval.

## 6. Return
Return depends on product condition, delivery status, usage, damage, warranty/service eligibility, and business approval.

## 7. Warranty/service
Direct sale product warranty and service support are governed by Warranty Policy and Service / Repair Policy.

## 8. Disputes
Customer must submit invoice/receipt/payment reference and issue details for any dispute.
""",
    },
    {
        "slug": "payment-policy",
        "title": "Payment Policy",
        "category": "PAYMENT",
        "summary": "Explains accepted payment modes, receipts, failed payments, outstanding dues, reconciliation, and customer payment responsibilities.",
        "default_status": DEFAULT_POLICY_STATUS,
        "content": """# Payment Policy

## 1. Introduction
This Payment Policy applies to direct sale, Lucky Plan EMI, rent/lease, service, delivery, deposit, refund, and other business payments made to Subidha Furniture.

## 2. Accepted payment modes
Accepted modes may include:
- cash
- UPI
- bank transfer
- payment gateway
- approved finance account
- any other mode enabled by Subidha Furniture

Availability of payment modes may change.

## 3. Receipt
Customer should collect/download a receipt after payment is accepted and recorded. Payment without receipt/reference may require verification.

## 4. Failed or pending payment
If a payment is debited but not reflected, customer must provide transaction reference, date, amount, and proof. Payment will be recorded after verification.

## 5. Outstanding dues
Outstanding dues may include:
- direct sale balance
- EMI dues
- rent/lease dues
- service charges
- delivery charges
- damage/repair charges
- late charges
- other approved charges

## 6. Reconciliation
Subidha Furniture may reconcile payment records against bank/UPI/cash/gateway records. Incorrect or duplicate entries are corrected through auditable workflow, not deletion.

## 7. No sharing of OTP/PIN
Customers must never share OTP, UPI PIN, card PIN, passwords, or banking credentials with anyone.

## 8. Refunds
Refunds are handled according to Refund / Cancellation Policy and require approval and reconciliation.
""",
    },
    {
        "slug": "service-policy",
        "title": "Service and Repair Policy",
        "category": "SERVICE",
        "summary": "Explains customer support, service tickets, repair inspection, chargeable service, warranty service, and closure.",
        "default_status": DEFAULT_POLICY_STATUS,
        "content": """# Service and Repair Policy

## 1. Introduction
This policy explains how Subidha Furniture handles service requests, repair complaints, warranty support, product issues, and customer support tickets.

## 2. Service request
Customer may raise service request through website, phone, store visit, or staff support. Customer must provide product details, invoice/receipt if available, issue description, photos/videos, and contact information.

## 3. Inspection
Service team may inspect the product physically or through photos/videos. Final resolution depends on inspection, product age, warranty, usage, damage type, and availability of parts.

## 4. Warranty service
If covered under warranty, service may be free or partially covered depending on warranty terms.

## 5. Paid service
Paid service may apply for:
- out-of-warranty products
- misuse/damage
- water/termite/fire damage
- customer shifting damage
- unauthorized repair
- missing parts
- normal wear and tear
- rent/lease damage

## 6. Service timeline
Service timelines depend on staff availability, spare parts, manufacturer support, location, and issue complexity.

## 7. Closure
A service request may be closed after repair, replacement, customer confirmation, rejection due to exclusion, or inability to contact customer.

## 8. Escalation
Unresolved service issues may be escalated through Customer Grievance Policy.
""",
    },
    {
        "slug": "grievance",
        "title": "Customer Grievance Policy",
        "category": "GRIEVANCE",
        "summary": "Explains how customers can raise complaints, expected handling, escalation, and documentation.",
        "default_status": DEFAULT_POLICY_STATUS,
        "content": """# Customer Grievance Policy

## 1. Introduction
Subidha Furniture aims to resolve customer complaints fairly and transparently. This policy explains how customers may raise grievances.

## 2. What can be raised
Customer may raise grievance related to:
- product issue
- payment issue
- invoice/receipt issue
- EMI/Lucky Plan issue
- delivery issue
- warranty/service issue
- rent/lease issue
- refund/cancellation issue
- privacy/data request
- staff conduct concern

## 3. Required information
Customer should provide:
- name
- phone number
- invoice/receipt/contract reference
- product/order details
- issue description
- date of incident
- photos/videos/documents if relevant

## 4. Grievance handling
Subidha Furniture will review the grievance, verify records, contact involved staff if needed, and provide resolution or next steps.

## 5. Escalation
If not resolved at first level, customer may request escalation to management.

## 6. Contact
Phone: [BUSINESS_PHONE]
Email: [BUSINESS_EMAIL]
Address: [BUSINESS_ADDRESS]
""",
    },
    {
        "slug": "data-requests",
        "title": "Data Correction, Access, and Deletion Request Policy",
        "category": "PRIVACY",
        "summary": "Explains customer data correction, access, deletion, and limitation where financial/audit/legal records must be retained.",
        "default_status": DEFAULT_POLICY_STATUS,
        "content": """# Data Correction, Access, and Deletion Request Policy

## 1. Introduction
Customers may request correction, access, or deletion of applicable personal data held by Subidha Furniture, subject to legal, accounting, contractual, audit, tax, warranty, fraud-prevention, and dispute-handling requirements.

## 2. Correction request
Customer may request correction of name, phone, email, address, or other profile details. Verification may be required.

## 3. Access request
Customer may request information about account, purchase, payment, contract, support, or service details, subject to identity verification and role-based access.

## 4. Deletion request
Deletion may be limited where records are required for:
- active contract
- EMI/payment history
- invoice/receipt/accounting
- warranty/service
- delivery/return/refund
- legal/tax compliance
- audit records
- fraud prevention
- dispute resolution

Where deletion is not possible, Subidha Furniture may restrict or archive data where legally and operationally feasible.

## 5. Request process
Send request to:
Email: [BUSINESS_EMAIL]
Phone: [BUSINESS_PHONE]
Address: [BUSINESS_ADDRESS]

Include:
- name
- phone number
- account/order reference
- requested action
- identity proof if required

## 6. Processing time
Requests will be reviewed within a reasonable period. Complex requests may take longer due to verification or legal/business recordkeeping obligations.
""",
    },
    {
        "slug": "business-compliance",
        "title": "Business Registration and Compliance Information",
        "category": "COMPLIANCE",
        "summary": "Public-safe business compliance summary without exposing private documents or false registration claims.",
        "default_status": DEFAULT_POLICY_STATUS,
        "content": """# Business Registration and Compliance Information

## 1. Introduction
This page provides public-safe business compliance information for Subidha Furniture.

## 2. Business details
Business name: Subidha Furniture
Business location: Asansol, West Bengal, India
Website: [WEBSITE_URL]
Contact: [BUSINESS_PHONE] / [BUSINESS_EMAIL]

## 3. GST status
GST registration status: [GST_STATUS_PUBLIC_TEXT]

If GST registration is not available or not applicable at the current stage, this page must not display a fake GST number. GST details will be updated only after registration is issued and verified.

## 4. Udyam / MSME status
Udyam/MSME registration status: [UDYAM_STATUS_PUBLIC_TEXT]

If Udyam/MSME registration is not available, this page must show that it will be updated after registration. Do not show fake registration details.

## 5. Ownership / shop proof
Private documents such as ownership proof, rent agreement, lease deed, tax documents, bank proof, PAN, Aadhaar, or registration certificate are not publicly displayed by default for security and privacy reasons.

Subidha Furniture may maintain such documents internally for verification, audit, banking, legal, or compliance purposes.

## 6. Public document disclosure
Only public-safe summaries or verified public registration numbers may be displayed on this page.

## 7. Updates
Compliance information may be updated when registration, tax status, license, or business details change.
""",
    },
    {
        "slug": "udyam-msme",
        "title": "Udyam / MSME Information",
        "category": "COMPLIANCE",
        "summary": "Explains Udyam/MSME status disclosure and prevents false registration claims.",
        "default_status": DEFAULT_POLICY_STATUS,
        "content": """# Udyam / MSME Information

## 1. Introduction
This page explains Subidha Furniture's Udyam/MSME status disclosure.

## 2. Current status
Udyam/MSME status: [UDYAM_STATUS_PUBLIC_TEXT]

If registration is not yet completed, this page must clearly show:
\"Udyam/MSME registration details are not currently provided. This page will be updated after registration is completed and verified.\"

## 3. No false claim
Subidha Furniture must not publicly claim MSME/Udyam registration unless the registration is actually issued and verified.

## 4. Certificate handling
Udyam certificate or related documents should be stored admin-only unless management decides to publish a safe summary. Full certificate or sensitive details should not be exposed publicly without review.

## 5. Updates
This page may be updated after registration or verification.
""",
    },
    {
        "slug": "ownership-business-proof",
        "title": "Ownership and Business Proof Disclosure Policy",
        "category": "COMPLIANCE",
        "summary": "Explains what business proof may be public and what must remain private.",
        "default_status": DEFAULT_POLICY_STATUS,
        "content": """# Ownership and Business Proof Disclosure Policy

## 1. Introduction
This policy explains how Subidha Furniture handles business ownership, rental agreement, shop proof, registration, and compliance documents.

## 2. Private documents
The following documents are private by default:
- shop rent agreement
- ownership proof
- lease deed
- PAN/Aadhaar or personal identity proof
- bank account proof
- GST certificate
- Udyam certificate
- tax filings
- utility bills
- internal licenses
- vendor agreements
- staff documents

## 3. Public-safe disclosure
Public pages may show only:
- business name
- business area/city
- public phone/email
- public website
- verified public registration numbers if management approves
- compliance status summary

## 4. No document exposure
Private documents must not be downloadable publicly unless reviewed and explicitly approved.

## 5. Admin storage
If the system stores compliance documents, access must be admin-only and audited.
""",
    },
    {
        "slug": "contact-enquiry-policy",
        "title": "Contact and Enquiry Policy",
        "category": "CUSTOMER_SUPPORT",
        "summary": "Explains safe handling of public enquiries and lead/contact submissions.",
        "default_status": DEFAULT_POLICY_STATUS,
        "content": """# Contact and Enquiry Policy

## 1. Introduction
Customers may submit enquiries through the website, phone, or store visit. This policy explains how enquiry information is handled.

## 2. Enquiry information
We may collect name, phone number, email, location, product interest, budget, message, preferred contact time, and source of enquiry.

## 3. Use of enquiry data
Enquiry data may be used for:
- customer callback
- product guidance
- Lucky Plan information
- direct sale quotation
- delivery feasibility
- service follow-up
- CRM follow-up

## 4. No financial contract from enquiry alone
Submitting an enquiry does not create a sale, EMI contract, rent/lease contract, delivery obligation, or payment obligation.

## 5. Contact consent
By submitting enquiry, customer permits Subidha Furniture to contact them for the enquiry and related business communication.

## 6. Privacy
Enquiry data is handled according to Privacy Policy.
""",
    },
]


def get_default_policy_templates() -> list[dict]:
    return deepcopy(DEFAULT_POLICY_TEMPLATES)
