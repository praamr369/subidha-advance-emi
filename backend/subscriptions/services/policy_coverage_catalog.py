from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

PUBLIC = "PUBLIC"
INTERNAL = "INTERNAL"


@dataclass(frozen=True)
class RequiredPolicySpec:
    slug: str
    label: str
    group: str
    category: str
    compatible_category: str
    visibility: str
    summary: str
    purpose: str
    requires_legal_review: bool = True
    requires_admin_acceptance: bool = False
    content: str | None = None

    def as_seed_template(self) -> dict[str, str]:
        return {
            "slug": self.slug,
            "title": self.label,
            "category": self.compatible_category,
            "summary": self.summary,
            "default_status": "DRAFT",
            "visibility": self.visibility,
            "governance_category": self.category,
            "coverage_group": self.group,
            "content": self.content if self.content else _template_content(self),
        }


def _template_content(spec: RequiredPolicySpec) -> str:
    visibility_note = (
        "This is a customer-facing public policy draft. It is not public until an admin publishes it after review."
        if spec.visibility == PUBLIC
        else "This is an internal governance policy draft. It is never served on public policy pages."
    )
    return f"""# {spec.label}

## 1. Purpose
{spec.purpose}

## 2. Scope
This policy applies to Subidha Furniture operations, website workflows, staff actions, customer records, contracts, documents, and audit controls where relevant.

## 3. Governance status
{visibility_note}

Seeded policies remain DRAFT. Draft text must be reviewed by management/legal/admin control before it is relied upon operationally.

## 4. Operational rule
No payment, receipt, subscription, accounting, reconciliation, inventory, delivery, rent/lease, deposit, commission, payout, amendment, Lucky ID, or batch record is changed by this policy template.

## 5. Review
The policy owner must review this template, adapt it to the approved business process, and publish or approve it only through the Policy Governance workflow.
"""


EXISTING_BASE_POLICY_SPECS: tuple[RequiredPolicySpec, ...] = (
    RequiredPolicySpec("terms", "Terms and Conditions", "Public Legal", "GENERAL", "GENERAL", PUBLIC, "General customer-facing website and business terms.", "Defines customer website, direct sale, EMI, rent/lease, payment, delivery, service, and account responsibilities.", content="""# Terms and Conditions

These Terms and Conditions govern your use of [BUSINESS_NAME]'s website, showroom, and all business transactions including direct sale, Lucky Plan EMI subscription, rent/lease, and service arrangements.

## 1. Who we are

[BUSINESS_NAME] is a registered furniture retail and subscription business operating from [CITY], [STATE], India. By transacting with us — online, in-showroom, or through any channel — you agree to these terms.

## 2. Products and services

We offer:
- **Direct sale** of furniture products with immediate ownership transfer
- **Lucky Plan EMI subscription** — a monthly instalment plan with an embedded Lucky Draw for EMI waiver
- **Rent/lease** of furniture assets on monthly terms with security deposit
- **Service and repair** for products sold or rented through us

Product availability, pricing, and terms may change without notice. Published prices are inclusive of GST unless stated otherwise.

## 3. Orders and contracts

An order or contract is confirmed only when the shop issues a written/digital order confirmation, subscription contract, or receipt. Verbal commitments are not binding.

Customers are responsible for providing accurate name, address, phone, identity proof, and other details required for KYC, delivery, contract, and invoice purposes.

## 4. Payment

All payments must be made through approved modes (cash, UPI, bank transfer, or approved card). Payment is confirmed only when funds are received and a receipt is issued. Partial payment does not transfer ownership unless the contract states otherwise.

Late or missed EMI payments may result in reminders, delivery/service holds, draw eligibility review, or cancellation as described in the EMI Subscription Default Policy.

## 5. Delivery and possession

Delivery is subject to address verification, payment completion, product availability, and schedule. Risk of loss or damage passes to the customer upon confirmed handover. Customers must inspect products at delivery and report visible damage immediately.

## 6. Returns and refunds

Returns and refunds are governed by the Refund and Cancellation Policy published on this platform. The 7-day return window is Subidha's own business policy. Consumer Protection Act 2019 statutory rights apply independently.

## 7. Warranty and service

Manufacturer or shop warranty applies to eligible products as described in the Warranty Policy. Service requests must be raised through approved channels as described in the Service and Repair Policy.

## 8. Customer responsibilities

Customers must:
- Keep contact details updated
- Make payments on schedule
- Use rented/leased assets with reasonable care at the approved location
- Report problems promptly
- Not misrepresent facts, forge documents, or submit false proof

## 9. Intellectual property and website use

Website content, branding, product images, and software are owned or licensed by [BUSINESS_NAME]. Customers may not copy, reproduce, or distribute content for commercial use without written permission.

## 10. Limitation of liability

Our liability is limited to the value of the relevant transaction. We are not liable for indirect, consequential, or speculative losses except as required by applicable Indian law.

## 11. Governing law and disputes

These terms are governed by the laws of India. Disputes will first be addressed through the Grievance Policy. Unresolved disputes are subject to the jurisdiction of courts in [CITY], [STATE].

## 12. Changes to terms

We may update these terms. Updated terms take effect upon publication. Continued use of our services after an update constitutes acceptance."""),
    RequiredPolicySpec("privacy", "Privacy Policy", "Privacy / Data", "PRIVACY", "PRIVACY", PUBLIC, "Customer privacy and personal data handling.", "Explains personal data collection, use, retention, sharing, and customer privacy rights.", content="""# Privacy Policy

[BUSINESS_NAME] is committed to protecting your personal data in accordance with the Digital Personal Data Protection Act 2023 (DPDP 2023) and applicable Indian law.

## 1. What personal data we collect

We may collect:
- **Identity data**: name, photograph, signature
- **Contact data**: phone number, email address, residential and business address
- **Identity proof documents**: Aadhaar card number, PAN, Voter ID, passport, or other accepted proof
- **Financial data**: payment mode, UPI reference, bank details (for refund/payout where applicable)
- **Transaction data**: purchases, subscriptions, EMI records, invoices, receipts, delivery acknowledgements
- **KYC documents**: required for EMI, rent/lease, high-value transactions
- **Communication records**: enquiry, quotation, support, WhatsApp, SMS, and email interactions
- **Technical data**: website session, device type, browser, IP address, and security logs

## 2. Why we collect personal data

We process personal data for:
- Completing purchases, contracts, and deliveries
- Lucky Plan EMI subscription management and draw administration
- Rent/lease onboarding, asset tracking, and closure
- Payment processing and receipt generation
- KYC verification and fraud prevention
- Customer support, grievance redressal, and communication
- Accounting, audit, tax compliance, and legal obligations
- Website operation and security

## 3. Legal basis for processing

Processing is based on:
- **Contractual necessity**: to perform the transaction or service you request
- **Consent**: where you provide explicit consent for specific processing (e.g., marketing messages)
- **Legal obligation**: compliance with Indian tax, accounting, company, or data protection law
- **Legitimate interest**: fraud prevention, security, and audit integrity

## 4. Who we share data with

We do not sell personal data. We may share it with:
- Payment processors and banks (for payment settlement)
- Logistics and delivery partners (for delivery and return)
- SMS/WhatsApp/email service providers (for operational communication)
- Legal, tax, and compliance advisors (under confidentiality)
- Government or regulatory authorities (if legally required)

## 5. Your rights under DPDP 2023

As a Data Principal under the Digital Personal Data Protection Act 2023, you have:
- **Right to Information and Access (Section 11)**: Request a summary of what personal data we hold about you and how it is processed
- **Right to Correction and Erasure (Section 12)**: Request correction of inaccurate data or erasure of data that is no longer necessary, subject to legal retention requirements
- **Right to Grievance Redressal (Section 13)**: Raise a complaint with our Data Protection Officer (DPO) within 30 days of a data concern
- **Right to Nominate (Section 14)**: Nominate a person to exercise your data rights on your behalf

To exercise any right, contact us at **[BUSINESS_EMAIL]** with identity verification.

## 6. Data retention

We retain personal data for as long as necessary for the purpose it was collected, or as required by law. Financial, payment, contract, audit, and tax records may be retained for up to 7 years per Income Tax Act 1961. KYC documents are retained for the duration of the contract and thereafter as required by applicable law.

## 7. Security

We use reasonable technical and operational safeguards to protect your personal data from unauthorised access, disclosure, loss, or destruction. This includes encrypted storage, access controls, and secure communication channels.

## 8. Cookies and tracking

See our Cookie and Tracking Consent Policy for details on website cookies, analytics, and consent controls.

## 9. Data breach

In the event of a personal data breach affecting your data, we will notify you as soon as possible after detection, as required under DPDP 2023 Section 8.

## 10. Contact and grievance

For any privacy concerns or data requests:

**Data Protection Officer (DPO)**
Email: **[BUSINESS_EMAIL]**
Phone: **[BUSINESS_PHONE]**
Address: [BUSINESS_NAME], [CITY], [STATE]

We will respond to data requests within 30 days. Unresolved complaints may be escalated to the Data Protection Board of India as established under DPDP 2023."""),
    RequiredPolicySpec("refund-cancellation", "Refund and Cancellation Policy", "Customer Operations", "REFUND", "REFUND", PUBLIC, "Refund, return, cancellation, and reversal policy.", "Explains cancellation, refund, return, and reversal rules for direct sale, EMI, rent/lease, and service transactions.", content="""# Refund and Cancellation Policy

This policy explains your rights and our procedures for returns, refunds, and cancellations for direct sale, Lucky Plan EMI subscriptions, rent/lease, and service transactions.

## 1. Direct sale — return window

- **Days 1–7 from delivery**: Full refund, no questions asked (Subidha's own return policy). Product must be returned in original condition with all accessories, packaging, and invoice.
- **Days 8–30 from delivery**: Refund minus 10% restocking fee, subject to product condition inspection.
- **After 30 days**: Refund or replacement only for manufacturing defects covered under warranty. Subject to inspection and assessment.

## 2. Direct sale — non-refundable situations

No refund is issued for:
- Products damaged by the customer after delivery
- Customised, made-to-order, or specially ordered items (unless defective)
- Products with missing parts, altered serial numbers, or evidence of misuse
- Change of mind after 7 days from delivery

## 3. Lucky Plan EMI subscription — cancellation

- Customers may request cancellation in writing before delivery/possession.
- After delivery/possession: cancellation is subject to review of payments made, asset condition, and contract terms.
- Future EMI waiver from a lucky draw is forfeited on cancellation.
- Advance payments or deposits may be refunded after deductions per the contract and Security Deposit Policy.

## 4. Rent/lease — closure and deposit refund

- Rent/lease closure requires notice as per contract terms (typically 30 days).
- Security deposit refund is processed after asset return, condition inspection, dues clearance, and deduction approval.
- Approved refunds are processed within 7–15 working days after closure approval.
- Damage, missing parts, unpaid dues, cleaning, or transport costs may be deducted from the deposit.

## 5. Service transactions

- Service charges for completed, chargeable service work are not refundable.
- If service work is incomplete, unsuccessful, or disputed, the matter is raised through the Grievance Policy.

## 6. How to request a return or refund

Submit a request through:
- Portal: **Customer → Returns & Refunds → New Request**
- Email: **[BUSINESS_EMAIL]**
- Phone/WhatsApp: **[BUSINESS_PHONE]**

Include your subscription/order number, reason, and any supporting evidence.

## 7. Refund processing timeline

- **Cash refund**: 2–3 working days after approval
- **UPI/bank refund**: 5–7 working days after approval (subject to bank processing)
- **Deposit refund**: 7–15 working days after closure approval

## 8. Consumer rights

Nothing in this policy limits your statutory rights under the Consumer Protection Act 2019. If you believe your statutory rights have been violated, you may raise a complaint with the District Consumer Disputes Redressal Commission."""),
    RequiredPolicySpec("delivery-policy", "Delivery Policy", "Service / Delivery / Warranty", "DELIVERY", "DELIVERY", PUBLIC, "Delivery eligibility, scheduling, handover, and failure handling.", "Defines delivery scheduling, product handover, customer acknowledgement, and delivery exception handling.", content="""# Delivery Policy

This policy governs the delivery of furniture products purchased through direct sale, Lucky Plan EMI subscriptions, or rent/lease arrangements.

## 1. Delivery eligibility

Delivery is scheduled only when:
- Payment or advance is confirmed and receipted
- KYC and address verification are complete (where required)
- The product is available and ready
- The delivery address is within our service area

## 2. Service area

We currently deliver within our designated service areas. Delivery to remote or restricted locations may require additional time or charges. Contact us to confirm availability for your address.

## 3. Scheduling

Delivery is scheduled by our team after order/contract confirmation. We will notify you of the proposed delivery date and time window through phone, SMS, or WhatsApp. Customers must confirm availability or request rescheduling at least 24 hours before the scheduled time.

## 4. Customer responsibilities at delivery

You must:
- Be present (or arrange an authorised representative) at the delivery location
- Inspect the product thoroughly at the time of delivery
- Report visible damage, missing parts, or wrong items immediately to the delivery team
- Sign the delivery acknowledgement only after inspection

Signing the delivery acknowledgement indicates that the product was received in the described condition. Claims for damage or missing parts reported after acknowledgement may require supporting evidence.

## 5. Handover evidence

Our delivery team may record:
- Product condition photos before and at delivery
- Serial/asset number verification
- Customer/representative signature or digital acknowledgement
- Delivery location and timestamp

## 6. Failed or refused delivery

If delivery fails because:
- Customer/representative is not present after confirmed scheduling
- Access to the delivery address is denied
- The address is incorrect or inaccessible

A rescheduling fee may apply. Repeated failed delivery may result in order cancellation with deduction of transportation and handling charges from any advance paid.

## 7. Delivery damage claims

If a product arrives damaged:
- Note the damage on the delivery acknowledgement before signing
- Photograph the damage immediately
- Report to us within 24 hours at **[BUSINESS_PHONE]** or **[BUSINESS_EMAIL]**

Claims reported after 24 hours or after the acknowledgement is signed without noting damage may be assessed under the Warranty Policy.

## 8. Assembly and placement

Where assembly or placement service is offered, it will be confirmed separately. Customers must ensure clear access to the delivery location and removal of obstacles before arrival.

## 9. Delays

We will inform you of any expected delay as early as possible. We are not liable for delays caused by circumstances beyond our control including road conditions, weather, supplier delays, or force majeure events."""),
    RequiredPolicySpec("warranty", "Warranty Policy", "Service / Delivery / Warranty", "WARRANTY", "WARRANTY", PUBLIC, "Warranty eligibility and exclusions.", "Defines manufacturer/shop warranty treatment, inspection, exclusions, and service escalation.", content="""# Warranty Policy

This policy explains the warranty coverage applicable to furniture products purchased or rented through [BUSINESS_NAME].

## 1. Warranty coverage

Products sold or delivered by Subidha Furniture may carry:
- **Manufacturer's warranty**: as specified by the manufacturer. Coverage, duration, and terms are set by the manufacturer. [BUSINESS_NAME] facilitates but does not independently underwrite manufacturer warranties.
- **Shop warranty**: where specifically offered in writing at the time of sale. Terms, duration, and coverage are as stated in the offer.

Warranty start date is the date of confirmed delivery/possession unless the warranty document states otherwise.

## 2. What is covered

Standard warranty typically covers:
- Manufacturing defects in materials or workmanship
- Structural failures under normal and intended use
- Functional failures not caused by customer misuse

Specific coverage depends on the product and the warranty offered. Warranty documents will specify the scope.

## 3. What is not covered (exclusions)

Warranty does not cover:
- Damage caused by misuse, accident, neglect, or improper care
- Normal wear and tear (surface scratches, fading, fabric wear)
- Water damage, termite/pest damage, or environmental damage
- Damage from modification, alteration, or unauthorised repair
- Consumable parts (fabric, foam, glass) unless defective at delivery
- Products used outside their intended purpose or load limits
- Damage occurring after the product leaves the approved delivery/possession address without permission

## 4. How to make a warranty claim

To raise a warranty claim:
1. Contact us at **[BUSINESS_PHONE]** or **[BUSINESS_EMAIL]**
2. Provide your order/subscription number, delivery date, and a description and photographs of the defect
3. Our team will schedule an inspection

## 5. Inspection

A warranty claim requires physical inspection of the product. We may send a service technician or require you to bring the product (for small items) to the service point.

Based on inspection, we will determine:
- Whether the defect is covered under warranty
- Whether repair, replacement, or another resolution is appropriate

## 6. Warranty resolution

Where a valid warranty claim is confirmed:
- **Repair**: the product is repaired at no charge
- **Replacement**: a replacement product of the same or equivalent specification is provided if repair is not feasible
- **Partial remedy**: for partial defects, affected components may be replaced

We do not offer cash refunds for warranty claims unless the product cannot be repaired or replaced within a reasonable time.

## 7. Warranty for rent/lease assets

Products on rent/lease are maintained by Subidha Furniture under the Service and Repair Policy. Customers must report defects promptly and must not attempt self-repair or authorise third-party repair without written permission."""),
    RequiredPolicySpec("service-policy", "Service and Repair Policy", "Service / Delivery / Warranty", "SERVICE", "SERVICE", PUBLIC, "Service request and repair policy.", "Defines service tickets, repair inspection, chargeable service, warranty service, and closure evidence.", content="""# Service and Repair Policy

This policy governs service and repair requests for furniture products purchased from or rented through [BUSINESS_NAME].

## 1. Service eligibility

Service requests may be raised for:
- Products under active manufacturer or shop warranty
- Products purchased from [BUSINESS_NAME] (chargeable service after warranty period)
- Assets currently on rent/lease through Subidha Furniture
- Products where a service contract has been agreed separately

## 2. How to raise a service request

Raise a service request through:
- **Portal**: Customer → Service → New Service Request
- **Phone/WhatsApp**: **[BUSINESS_PHONE]**
- **Email**: **[BUSINESS_EMAIL]**

Provide your subscription/order number, product description, nature of the problem, and photographs if available.

## 3. Service ticket

Every service request receives a service ticket number. Use this number to track the status of your request. We will acknowledge your request within 1 business day.

## 4. Inspection

Our team will assess whether:
- The issue is covered under active warranty (no charge to customer)
- The issue is chargeable (service and parts cost to be quoted before work begins)
- The product is beyond economic repair

## 5. Warranty service

If the issue is covered under warranty:
- Service is performed at no charge
- Parts required for warranty repair are supplied by us
- Timeline depends on part availability and service schedule

## 6. Chargeable service

If the issue is not covered under warranty or the warranty period has expired:
- We will provide a written cost estimate before starting work
- Work begins only after the customer approves the estimate in writing
- Payment for chargeable service is due on or before collection/delivery of the repaired product

## 7. Rent/lease asset service

For assets on rent/lease:
- Customers must report issues promptly and not attempt self-repair
- We arrange service at our cost for fair wear and defects not caused by customer misuse
- Damage caused by customer misuse, neglect, or unauthorised modification is assessed and charged to the customer

## 8. Service timeline

We target the following service timelines (subject to part availability and volume):
- **Minor in-home service**: 3–5 working days
- **Major workshop repair**: 7–14 working days
- **Complex or part-dependent repair**: will be communicated on assessment

## 9. Collection and delivery of service items

Where products need to be taken to our workshop:
- We will arrange collection and re-delivery
- Collection/delivery charges may apply for non-warranty service
- Customers must provide access and assistance for large furniture items

## 10. Service closure evidence

On completion, our team will document:
- Work performed
- Parts replaced
- Before/after photographs
- Customer acknowledgement of receipt in satisfactory condition

Disputes about completed service quality must be raised within 48 hours of collection or return delivery."""),
    RequiredPolicySpec("payment-policy", "Payment Policy", "Customer Operations", "PAYMENT", "PAYMENT", PUBLIC, "Customer payment modes, receipts, failed payments, and disputes.", "Defines approved payment modes, payment proof, receipt requirement, failed payment handling, and dispute responsibilities.", content="""# Payment Policy

This policy explains accepted payment methods, receipt obligations, failed payment handling, and dispute responsibilities for all Subidha Furniture transactions.

## 1. Accepted payment modes

We accept:
- **Cash**: at showroom or at delivery (amount limit may apply per transaction)
- **UPI**: any UPI app to our registered merchant UPI ID
- **Bank transfer / NEFT / RTGS / IMPS**: to our registered business bank account
- **Approved card payments**: where card terminal is available at showroom

Online or portal payments are processed through approved payment gateway integration where available.

## 2. Payment confirmation

Payment is confirmed only when:
- Cash is physically received and counted by staff
- UPI/bank transfer is verified against our account records
- A payment receipt is issued by our system

Sending a screenshot or photo of a payment request does not constitute payment. Our team must verify receipt before confirming payment.

## 3. Receipts

A digital or printed receipt must be issued for every confirmed payment. Receipts include:
- Receipt number and date
- Customer name and subscription/order reference
- Amount, payment mode, and reference ID
- Issuing staff/cashier

Keep all receipts. Receipts are required for refund, dispute, warranty, and service claims.

## 4. EMI payment schedule

For Lucky Plan EMI subscriptions:
- EMI is due on the date specified in your subscription schedule
- Reminders may be sent by SMS, WhatsApp, or phone before the due date
- Failure to receive a reminder does not remove your payment obligation
- Late payment may affect draw eligibility and trigger action under the EMI Subscription Default Policy

## 5. Failed or unverified payments

If a payment fails (UPI error, bank rejection, card decline):
- The transaction is not confirmed until re-verified
- Do not assume payment is complete based on a pending bank message — check with our team
- Retry only after confirming that the first attempt was not processed

If funds are debited but we have not received them, report immediately to **[BUSINESS_PHONE]** with transaction details. We will investigate and resolve within a reasonable time.

## 6. Advance and deposits

Advances and security deposits are:
- Receipted separately from product/service payments
- Non-transferable between different customers, orders, or contracts without written approval
- Subject to deduction per the Refund and Cancellation Policy and Security Deposit Policy

## 7. Payment disputes

If you believe a payment record is wrong:
- Raise a dispute by providing your receipt number, payment reference, amount, date, and mode
- Contact: **[BUSINESS_EMAIL]** or **[BUSINESS_PHONE]**
- We will review and respond within 5 business days
- Do not withhold future EMI payments during dispute review unless instructed by us in writing

## 8. Prohibited conduct

The following are prohibited and may lead to cancellation, recovery action, or legal referral:
- Submitting false payment proof or edited screenshots
- Claiming payment made without verifiable receipt
- Reversing genuine payments through bank/UPI dispute without our knowledge
- Withholding payment to leverage a complaint (complaints must go through the Grievance Policy)"""),
    RequiredPolicySpec("direct-sale-policy", "Direct Sale Policy", "Customer Operations", "DIRECT_SALE", "DIRECT_SALE", PUBLIC, "Direct sale invoice, receipt, delivery, and return terms.", "Defines normal retail/direct-sale purchase terms and customer responsibilities.", content="""# Direct Sale Policy

This policy applies to retail and direct-sale purchases of furniture products from [BUSINESS_NAME] — in-showroom or through our website enquiry and order channel.

## 1. What is a direct sale

A direct sale is a purchase where full payment (or approved advance plus balance on delivery) transfers ownership of the product to the customer immediately or on confirmed delivery. It is distinct from Lucky Plan EMI subscription or rent/lease arrangements.

## 2. Quotation and pricing

- Prices are quoted inclusive of GST unless stated otherwise
- Quotations are valid for the period stated. If no period is stated, a quotation is valid for 7 days
- Prices may change for goods not yet invoiced. Once an invoice is issued, the price is fixed

## 3. Order confirmation

An order is confirmed when:
- A formal order or booking is placed with advance payment (if required)
- Inventory is checked and the product is reserved
- A written order confirmation or invoice is issued

Verbal or informal agreements do not constitute confirmed orders.

## 4. Invoicing

A GST invoice is issued for all direct sale transactions. The invoice includes:
- Product name, HSN/SAC code, quantity
- Unit price, GST rate, total amount
- Customer name, address, GSTIN (where applicable)
- Invoice date and number

Customers requiring a GST invoice must provide their GSTIN before the invoice is generated. We cannot modify or reissue invoices for retrospective GSTIN addition without proper correction procedure.

## 5. Payment

Full payment or agreed advance is required before delivery dispatch. See the Payment Policy for accepted modes. Cash on delivery (COD) may be available for selected products subject to advance deposit.

## 6. Delivery

Delivery is governed by the Delivery Policy. Customers must inspect the product at delivery and note any damage before signing the acknowledgement.

## 7. Ownership and risk

Ownership of the product passes to the customer on:
- Full payment received, AND
- Delivery acknowledgement signed

Risk of accidental damage passes to the customer upon delivery acknowledgement. We are not responsible for damage occurring after confirmed handover.

## 8. Returns and refunds

Governed by the Refund and Cancellation Policy:
- **Days 1–7**: Full refund, no questions asked, product must be in original condition
- **Days 8–30**: Subject to 10% restocking fee and condition inspection
- **After 30 days**: Warranty/defect claims only

Customised, made-to-order, or specially sourced products are generally non-returnable unless defective.

## 9. Customer responsibilities

Customers are responsible for:
- Providing accurate delivery address and being present at delivery
- Arranging safe storage and care of the product after delivery
- Making prompt payment of any outstanding balance
- Raising issues within the stated timeframes

## 10. Limitation

We are a small business. We do our best to resolve customer concerns promptly and fairly. For any concern, contact our support team before escalating externally."""),
    RequiredPolicySpec("lucky-plan-policy", "Lucky Plan Policy", "Lucky Plan / EMI", "LUCKY_PLAN", "LUCKY_PLAN", PUBLIC, "Lucky Plan EMI customer terms.", "Defines Lucky Plan EMI enrollment, Lucky IDs, winner waiver, payment duties, and customer terms.", content="""# Lucky Plan Policy

The Lucky Plan is [BUSINESS_NAME]'s EMI subscription scheme where customers pay monthly instalments and participate in a monthly lucky draw for an EMI waiver benefit.

## 1. What is the Lucky Plan

The Lucky Plan allows you to:
- Take furniture on a monthly instalment (EMI) plan
- Receive a unique Lucky ID for each EMI batch
- Participate in a monthly draw where the winner's remaining future EMIs are waived

The Lucky Plan is a subscription product offered by [BUSINESS_NAME]. It is not a lottery, gambling scheme, or prize draw under the Prize Chits and Money Circulation Schemes (Banning) Act 1978. The Lucky Plan is structured as a lawful EMI subscription with an embedded waiver incentive, reviewed under applicable Indian commercial law.

## 2. Enrollment

Enrollment in the Lucky Plan requires:
- Completion of customer registration and KYC
- Execution of a Lucky Plan subscription contract specifying the product, tenure, EMI amount, and batch
- Payment of the first EMI (and any advance/security, if applicable)
- Delivery or possession of the subscribed product

You are not enrolled until the contract is executed, first payment is confirmed, and the subscription is activated in our system.

## 3. Lucky IDs

- You receive one Lucky ID per batch on enrollment
- Lucky IDs are unique, assigned by our system, and cannot be transferred
- Your Lucky ID is displayed in your customer portal account

## 4. Monthly EMI obligation

- EMI is due each month on the date stated in your subscription schedule
- Timely payment maintains your draw eligibility and subscription status
- Late or missed EMI may result in reminders, draw eligibility review, or action under the EMI Subscription Default Policy

## 5. The Lucky Draw

- One Lucky ID per batch is drawn each month (one winner per batch)
- The draw uses a cryptographic or audited random method as specified in the draw rulebook
- Draw results are recorded and published through the policy governance system
- The winner's remaining, unpaid future EMIs are waived — this is the EMI Waiver benefit
- **No cash prize is paid**. The waiver is a credit against future EMI obligations only

## 6. Draw odds

Draw odds are determined by the number of eligible participants at the time of draw. Odds do not change as the draw date approaches. One winner is drawn per batch regardless of batch size.

## 7. Winner benefit and settlement

- The winning customer is notified through registered contact details
- The future EMI waiver is applied within 7 working days of draw confirmation
- The winner must sign/confirm waiver settlement documents as required
- The waiver applies only to future unpaid EMIs in the current subscription batch

## 8. Eligibility conditions

Your Lucky ID is eligible for a draw if:
- Your subscription is active
- All due EMIs up to the draw date are paid and confirmed
- No cancellation, suspension, or default is in effect at draw time

Late or disputed payments may render your Lucky ID ineligible for that month's draw.

## 9. Cancellation and early closure

- Cancellation before possession: advances may be refunded per the Refund and Cancellation Policy
- Cancellation after possession: subject to review of payments made, asset condition, and contract settlement
- On cancellation, any future draw eligibility and waiver entitlement is forfeited
- Winner status from a previous draw is not affected by later cancellation

## 10. Transparency

We publish draw results including Lucky ID, batch, date, and draw method record. Customer name and personal details are not published without consent. Audit records of draws, waivers, and settlements are maintained.

## 11. Disputes

Draw disputes must be raised within 7 days of the draw result publication with your Lucky ID, subscription number, payment proof, and reason. We will review audit records and provide a written response."""),
    RequiredPolicySpec("rental-lease-policy", "Rental and Lease Policy", "Rent / Lease / Deposit", "RENT_LEASE", "RENT_LEASE", PUBLIC, "Rent/lease contract and asset use terms.", "Defines rent/lease onboarding, monthly demand, possession, use, return, and closure duties.", content="""# Rental and Lease Policy

This policy governs the rent/lease of furniture products through [BUSINESS_NAME]. Under a rent/lease arrangement, you have use of the product for the agreed period; ownership remains with [BUSINESS_NAME].

## 1. Eligibility

Rent/lease is available to individual customers and businesses subject to:
- Completed KYC and address verification
- Execution of the rent/lease contract
- Payment of the security deposit and first month's rent
- Delivery/possession confirmation

## 2. Contract

A rent/lease contract specifies:
- Products and asset details (model, serial/asset number, condition at handover)
- Monthly rent and payment due date
- Security deposit amount
- Minimum tenure (if any) and notice period for closure
- Approved address of use

The contract is binding from the date of execution. Verbal or informal changes to the contract are not valid.

## 3. Possession

Possession is provided after:
- Contract execution
- Security deposit payment confirmed
- First month rent confirmed
- KYC and address verified
- Delivery readiness confirmed

See the Possession and Handover Policy for handover evidence and condition documentation.

## 4. Monthly rent and payment

- Rent is due on the date stated in the contract each month
- You will receive a payment demand/reminder before the due date
- Failure to receive a reminder does not remove your payment obligation
- Late payment may attract a late charge as specified in the contract and may result in service/support holds

## 5. Your obligations as a lessee

You must:
- Pay rent on time
- Use the asset only at the approved address stated in the contract
- Use the asset with reasonable care and for its intended purpose
- Report any damage, defect, or required maintenance promptly
- Not sublet, lend, pledge, or otherwise transfer the asset to any third party
- Not modify, disassemble, or attempt self-repair of the asset without written permission
- Return the asset in the condition received (subject to fair wear and tear) at contract closure

## 6. Maintenance and repairs

We are responsible for maintenance and repair of defects that arise from normal use or manufacturing issues, provided:
- You report the defect promptly
- The defect is not caused by misuse, negligence, or unauthorised modification

Damage caused by the customer is assessed and charged under the Return Damage Inspection Policy.

## 7. Closure and return

To close a rent/lease:
- Give written notice as stated in the contract (typically 30 days)
- Ensure all dues are cleared
- Schedule a return inspection and handover

After return:
- Our team inspects the asset against handover evidence
- Any deductions for damage, dues, cleaning, or transport are assessed
- The security deposit balance (after deductions) is refunded within 7–15 working days of closure approval

## 8. Security deposit

See the Security Deposit Policy for full details on deposit collection, use, deduction, and refund.

## 9. Contract renewal

At the end of the minimum tenure, the contract may be renewed by mutual agreement on updated terms. We will notify you before the expiry date.

## 10. Repossession

We reserve the right to repossess the asset if:
- Rent remains unpaid beyond the period stated in the contract
- The asset is found at an unauthorised address
- The contract is materially breached
- KYC or address verification is found to be false

Repossession will be conducted with reasonable notice except where urgency requires otherwise."""),
    RequiredPolicySpec("grievance", "Grievance Policy", "Customer Operations", "GRIEVANCE", "GRIEVANCE", PUBLIC, "Customer complaint and escalation process.", "Defines customer grievance intake, response, escalation, and closure responsibilities.", content="""# Grievance Policy

[BUSINESS_NAME] is committed to resolving customer complaints fairly and promptly. This policy explains how to raise a complaint and what to expect.

## 1. Who can raise a grievance

Any current or former customer, prospect, vendor, or partner who has a legitimate complaint about a transaction, service, communication, data handling, or policy matter may raise a grievance.

## 2. How to raise a grievance

**Step 1 — Direct contact**

Contact us first:
- **Phone/WhatsApp**: **[BUSINESS_PHONE]** (9 AM–6 PM, Monday–Saturday)
- **Email**: **[BUSINESS_EMAIL]**
- **Portal**: Customer → Support → New Complaint
- **In person**: Visit our showroom at [CITY], [STATE]

Provide:
- Your name, phone number, and subscription/order number
- A clear description of the complaint and what outcome you expect
- Relevant evidence (receipts, photos, messages, etc.)

**Step 2 — Escalation to Grievance Officer**

If your issue is not resolved within 5 business days, you may escalate:

**Grievance Officer**: Owner/Management
**Contact**: **[BUSINESS_EMAIL]** (Subject: Grievance Escalation)

## 3. Our response commitment

| Stage | Target response time |
|-------|---------------------|
| Acknowledgement | Within 1 business day |
| Initial response | Within 3 business days |
| Resolution / Decision | Within 15 business days |
| Complex cases | Within 30 business days (with progress update) |

Response times are targets. We will keep you informed if a matter requires more time.

## 4. Privacy-related grievances

For complaints about personal data handling, contact our **Data Protection Officer (DPO)**:
- **Email**: **[BUSINESS_EMAIL]**
- DPO responds within 30 days (DPDP 2023 Section 13)

Unresolved data privacy complaints may be escalated to the **Data Protection Board of India** under DPDP 2023.

## 5. What we will do

On receiving your complaint:
- Acknowledge receipt and assign a reference number
- Investigate the matter with relevant records, staff, and evidence
- Communicate our findings and proposed resolution
- Implement the agreed resolution
- Close the grievance record with outcome documented

## 6. Escalation beyond [BUSINESS_NAME]

If your complaint is not resolved to your satisfaction, you may approach:
- **District Consumer Disputes Redressal Commission (DCDRC)** under Consumer Protection Act 2019
- **Data Protection Board of India** (for data privacy matters under DPDP 2023)
- Any other forum of competent jurisdiction

We encourage internal resolution before external escalation.

## 7. Fair process

We commit to:
- Treating complaints without bias or retaliation
- Investigating matters based on facts and records
- Communicating decisions clearly with reasons
- Correcting genuine errors promptly"""),
    RequiredPolicySpec("business-compliance", "Business Compliance Policy", "Public Legal", "COMPLIANCE", "COMPLIANCE", PUBLIC, "Public business compliance information policy.", "Explains business identity and public compliance representation.", content="""# Business Compliance Policy

This document provides a public summary of [BUSINESS_NAME]'s legal identity, business registration, and compliance status as a trading and subscription furniture business operating in India.

## 1. Business identity

[BUSINESS_NAME] is a furniture retail and subscription business operating from [CITY], [STATE], India.

Contact:
- **Phone/WhatsApp**: [BUSINESS_PHONE]
- **Email**: [BUSINESS_EMAIL]
- **Website**: [WEBSITE_URL]

## 2. Business registration and licensing

[BUSINESS_NAME] operates with relevant business registration, trade licence, and statutory registrations required for retail and subscription commerce in [STATE]. Details are available for verification through official government portals using our registration credentials.

We comply with:
- **GST**: Goods and Services Tax registration and return filing as applicable
- **Income Tax Act 1961**: Tax deduction, return, and reporting obligations
- **Shops and Establishments Act (West Bengal)**: Labour and workplace compliance
- **Consumer Protection Act 2019**: Customer rights and grievance redressal
- **Digital Personal Data Protection Act 2023**: Customer data handling and privacy

## 3. GST compliance

We are registered under the Goods and Services Tax (GST) framework. GST is charged on applicable transactions at the prescribed rate. Customers may request GST invoices by providing their GSTIN before invoice generation.

## 4. Consumer compliance

We operate in accordance with the Consumer Protection Act 2019. Customers have rights including:
- Right to accurate product information
- Right to be protected from unfair trade practices
- Right to seek redressal through our Grievance Policy or the District Consumer Disputes Redressal Commission

## 5. Data privacy compliance

We process customer personal data in accordance with the Digital Personal Data Protection Act 2023 (DPDP 2023). See our Privacy Policy for full details.

## 6. Anti-fraud and KYC

For higher-value transactions, EMI subscriptions, and rent/lease, we collect KYC (Know Your Customer) information to verify customer identity and prevent fraud. KYC is handled per our KYC and Identity Verification Policy.

## 7. Fair trade practices

[BUSINESS_NAME] commits to:
- Accurate representation of products and prices
- No misleading or deceptive advertising
- Transparent terms and conditions
- Prompt grievance redressal

## 8. Limitations of public disclosure

Not all internal business, financial, tax, and operational records are publicly disclosed. Certain information is private, legally privileged, or commercially sensitive. Public compliance disclosure does not constitute a waiver of legal privilege or confidentiality."""),
    RequiredPolicySpec("ownership-business-proof", "Ownership and Business Proof Policy", "Public Legal", "COMPLIANCE", "COMPLIANCE", PUBLIC, "Ownership/business proof public summary policy.", "Explains what proof is public, private, verified, or withheld.", content="""# Ownership and Business Proof Policy

This policy explains what business ownership and proof information Subidha Furniture discloses publicly, what is verified for specific purposes, and what is withheld as private or confidential.

## 1. Purpose

Customers, vendors, and business partners sometimes request verification of business ownership, legal registration, and authenticity — for example, before entering a high-value transaction or to confirm they are dealing with a legitimate business. This policy describes our disclosure posture.

## 2. What is publicly disclosed

The following is publicly available or may be confirmed on request:
- Business trading name: [BUSINESS_NAME]
- Operating location: [CITY], [STATE], India
- Contact details: phone, email, and website
- GST registration status (fact of registration, not the full document, unless required for B2B invoice)
- Udyam/MSME registration status (see Udyam/MSME Policy)
- Trade licence status (fact of registration for the operating location)

## 3. What is verified for specific transactions

The following may be provided for specific legitimate transaction or compliance purposes (not publicly displayed):
- GST registration certificate (for B2B GST invoice/input credit purposes)
- Business PAN (for TDS, vendor registration, and similar purposes)
- Bank account details (for payment/refund to verified parties)
- Ownership identity documents (for contract, legal, or regulatory requirements)

Requests must be legitimate, specific, and accompanied by a reciprocal disclosure where applicable.

## 4. What is withheld

The following are private and not disclosed:
- Personal identity documents of individual proprietor/partners (Aadhaar, personal PAN, passport, etc.) — available only to regulatory authorities under lawful process
- Full financial accounts and audit reports — provided only as legally required
- Internal business valuation, liabilities, or credit information
- Internal employee and staff records

## 5. Verification of business authenticity

If you wish to verify that you are dealing with Subidha Furniture:
- Check our GST registration on the government GST portal using our GSTIN
- Verify our trade licence with the [CITY] Municipal Corporation
- Contact us through the official phone/email stated on this website — do not rely on unofficial channels or third-party claims

## 6. Fraudulent impersonation

If you encounter any person or entity fraudulently claiming to be [BUSINESS_NAME], or using our name for unauthorised transactions, report immediately to **[BUSINESS_PHONE]** and to local police."""),
    RequiredPolicySpec("udyam-msme", "Udyam/MSME Policy", "Public Legal", "COMPLIANCE", "COMPLIANCE", PUBLIC, "Udyam/MSME status disclosure policy.", "Explains Udyam/MSME status wording and verification limitations.", content="""# Udyam / MSME Policy

This policy explains [BUSINESS_NAME]'s Micro, Small, and Medium Enterprise (MSME) registration status and the limitations of our public disclosure.

## 1. MSME registration

[BUSINESS_NAME] is registered under the **Udyam Registration framework** administered by the Ministry of Micro, Small and Medium Enterprises, Government of India.

Udyam Registration is a self-declaration-based online registration for MSMEs under the MSMED Act 2006, as revised.

## 2. Current classification

Our enterprise is classified under the Micro or Small enterprise category (as applicable at the time of last registration update) based on annual turnover and investment criteria as defined under the MSMED Act and subsequent notifications.

Classification may change if business scale crosses the prescribed thresholds. We update registration records as required.

## 3. Benefits and applicability

MSME/Udyam registration entitles us to:
- Priority sector treatment under banking and finance norms
- Preference under government procurement schemes (where applicable)
- Access to credit guarantee and subsidy schemes
- Payment dispute protection under MSMED Act Section 16

## 4. What we disclose publicly

- Fact of Udyam registration: **Yes, registered**
- Enterprise category at registration: Micro or Small (as applicable)
- Udyam Registration Number: available on our official documents and on request for B2B/vendor purposes

We do not publicly display the full Udyam certificate on the website. It is available to verified business partners and government authorities on request.

## 5. Verification

You may verify our Udyam registration independently at the official portal: **udyamregistration.gov.in** using our Udyam Registration Number, which is available on our official business documents.

## 6. Limitations and disclaimer

- MSME classification is self-declared. While we maintain accuracy, government audits and re-classifications may change status.
- Our MSME status does not constitute a warranty of financial strength, creditworthiness, or business continuity.
- Do not rely on MSME status alone for high-value credit decisions without independent verification."""),
    RequiredPolicySpec("contact-enquiry-policy", "Contact and Enquiry Policy", "Customer Operations", "CUSTOMER_SUPPORT", "CUSTOMER_SUPPORT", PUBLIC, "Customer enquiry handling policy.", "Defines website/contact enquiry processing and follow-up rules.", content="""# Contact and Enquiry Policy

This policy explains how Subidha Furniture handles customer enquiries, website contact form submissions, and follow-up communications.

## 1. How to contact us

| Channel | Details | Hours |
|---------|---------|-------|
| Phone / WhatsApp | [BUSINESS_PHONE] | 9 AM – 6 PM, Mon–Sat |
| Email | [BUSINESS_EMAIL] | Response within 1–2 business days |
| Website | [WEBSITE_URL] | Contact form available |
| In person | Showroom, [CITY], [STATE] | During showroom hours |

## 2. Enquiry types we handle

- Product enquiries (availability, specification, pricing)
- Quotation requests
- Lucky Plan EMI subscription enquiries
- Rent/lease enquiries
- Delivery enquiries
- Service and repair requests
- Complaint and grievance (see Grievance Policy)
- Data and privacy requests (see Data Requests Policy)

## 3. How we process enquiries

On receiving an enquiry, we will:
- Acknowledge receipt (typically within 1 business day)
- Assign the enquiry to the appropriate team or person
- Respond with information, quotation, or next steps
- Follow up as needed to complete the enquiry or convert to a transaction

## 4. Information you provide

When you contact us, you may provide personal details such as name, phone, address, and product interest. This information is handled per our Privacy Policy and used only to respond to your enquiry and for related business follow-up.

## 5. Quotations

Quotations provided through enquiry channels are valid for the period stated. If no validity is stated, quotations are valid for 7 days. Prices may vary based on product availability and business conditions.

A quotation is not a confirmed order. An order is confirmed only on formal acceptance and advance payment where required.

## 6. Response times

| Priority | Target Response |
|---------|----------------|
| Payment/delivery urgent matter | Within 4 business hours |
| General product/pricing enquiry | Within 1 business day |
| Quotation request | Within 1–2 business days |
| Complaint or grievance | Within 1 business day (acknowledgement) |

Response times are targets and may vary during peak periods or public holidays.

## 7. Communication consent

By submitting an enquiry, you consent to being contacted by us through the channel(s) you used, and through phone, SMS, or WhatsApp, for the purpose of following up on your enquiry. See the Communication Consent Policy for full details.

## 8. Misuse and spam

We reserve the right to disregard or block enquiries that are:
- Spam, abusive, or fraudulent
- Duplicate submissions made to pressure or manipulate
- Intended to elicit proprietary business information under false pretences"""),
    RequiredPolicySpec("data-requests", "Data Requests Policy", "Privacy / Data", "PRIVACY", "PRIVACY", PUBLIC, "Customer data access/correction request policy.", "Defines customer data access, correction, update, and deletion request handling.", content="""# Data Requests Policy

This policy explains how you can exercise your rights regarding the personal data that Subidha Furniture holds about you, in accordance with the Digital Personal Data Protection Act 2023 (DPDP 2023).

## 1. Your rights under DPDP 2023

As a Data Principal under DPDP 2023, you have the following rights:

| Right | Section | What it means |
|-------|---------|---------------|
| Right to Information and Access | Section 11 | Request a summary of your personal data we hold and how we process it |
| Right to Correction and Erasure | Section 12 | Request correction of inaccurate data or deletion of data no longer needed |
| Right to Grievance Redressal | Section 13 | Raise a complaint with our DPO within 30 days |
| Right to Nominate | Section 14 | Nominate someone to exercise your data rights on your behalf |

## 2. How to submit a data request

Submit your request to our Data Protection Officer (DPO):

- **Email**: **[BUSINESS_EMAIL]** (Subject: Data Request — [type])
- **Phone/WhatsApp**: **[BUSINESS_PHONE]**
- **Portal**: Customer → Privacy → Data Requests

Your request must include:
- Your full name and registered phone number or email
- Type of request (access, correction, erasure, grievance, or nomination)
- Specific details of what you are requesting
- Identity verification (we may ask for a copy of identity proof to verify your identity before processing)

## 3. Access request

On a verified access request, we will provide you with:
- A summary of the categories of personal data we hold about you
- The purpose for which it is processed
- Any third parties with whom it has been shared (where applicable)

We will respond within **30 days** of receiving a verified request.

## 4. Correction request

If your personal data is inaccurate, incomplete, or outdated:
- Submit a correction request with the correct information and supporting evidence
- We will update records where the correction is verifiable and appropriate
- Changes to financial, contract, or audit records may be limited to what is permitted under our data retention obligations

## 5. Erasure (deletion) request

You may request deletion of personal data that:
- Is no longer necessary for the purpose collected
- Was collected on the basis of consent that you have withdrawn
- Is being processed unlawfully

We will assess each request. We cannot delete data that we are legally required to retain (e.g., financial records, tax documents, audit trails, contract records) under Income Tax Act 1961, GST law, or other applicable law. We will inform you of the outcome within 30 days.

## 6. Nomination

You may nominate a person to exercise your data rights on your behalf. Nomination must be submitted in writing with your identity verification and the nominee's details.

In the event of your death or incapacity, the nominated person may exercise your data rights under DPDP 2023 Section 14.

## 7. Grievance redressal

If you are not satisfied with how we have handled your personal data, or with our response to a data request:
- Raise a grievance with our DPO at **[BUSINESS_EMAIL]**
- We will respond within 30 days (DPDP 2023 Section 13)
- Unresolved complaints may be escalated to the **Data Protection Board of India** as established under DPDP 2023

## 8. Data requests we cannot fulfil

We may decline a request that:
- Cannot be verified (identity not confirmed)
- Would require us to violate legal retention obligations
- Is vexatious, repetitive, or made in bad faith

We will inform you of the reason for declining within 30 days."""),
)

CUSTOMER_FACING_GAP_SPECS: tuple[RequiredPolicySpec, ...] = (
    RequiredPolicySpec("cookie-tracking-consent", "Cookie and Tracking Consent Policy", "Privacy / Data", "COOKIE_CONSENT", "PRIVACY", PUBLIC, "Cookies, analytics, sessions, and consent controls.", "Explains cookies, analytics, session tracking, security logs, and customer consent controls.", content="""# Cookie and Tracking Consent Policy

[WEBSITE_URL] may use cookies, local storage, session identifiers, analytics, and security logs to operate the website and improve customer support.

## 1. Essential cookies

Essential cookies are used for login, session security, form submission, fraud prevention, cart/quotation flow, and basic website operation.

## 2. Analytics and improvement

Analytics may be used to understand page visits, product interest, enquiry performance, and technical errors. We do not use analytics to sell personal data.

## 3. Communication tracking

Message, enquiry, quotation, and support interactions may be recorded to complete business follow-up.

## 4. Consent and settings

Where consent controls are provided, customers may accept, reject, or manage non-essential tracking. Blocking essential cookies may break login or forms.

## 5. Third-party services

Hosting, analytics, payment, email, WhatsApp, or security providers may process limited technical data under their own terms.

## 6. Updates

Tracking practices may change as website features grow. Policy updates will be published through Policy Governance."""),
    RequiredPolicySpec("kyc-identity-verification", "KYC and Identity Verification Policy", "Customer Operations", "KYC", "COMPLIANCE", PUBLIC, "KYC, identity, address proof, and customer verification.", "Defines identity/address verification for EMI, rent/lease, delivery, refund, and account safety.", content="""# KYC and Identity Verification Policy

KYC may be required for Lucky Plan EMI, rent/lease, high-value delivery, refund, dispute review, account recovery, partner onboarding, or fraud prevention.

## 1. Required information

KYC may include name, phone, address, identity proof, address proof, photo, signature, business proof, or other verification documents.

## 2. Purpose

KYC helps confirm customer identity, prevent fraud, verify delivery location, support contract enforcement, process refunds, and protect financial records.

## 3. Refusal or mismatch

If KYC is missing, expired, rejected, mismatched, or suspicious, the shop may hold subscription activation, rent/lease possession, delivery, refund, or account changes.

## 4. Privacy

KYC documents are private and used only for legitimate business, legal, compliance, audit, dispute, and fraud-prevention purposes.

## 5. Review

Approval, rejection, expiry, and re-verification are controlled through backend workflow.

## 6. False KYC

False or forged KYC may lead to cancellation review, account restriction, recovery action, or legal action."""),
    RequiredPolicySpec("communication-consent", "Communication Consent Policy", "Customer Operations", "COMMUNICATION", "CUSTOMER_SUPPORT", PUBLIC, "WhatsApp, SMS, calls, reminders, and service notices.", "Explains customer communication consent for WhatsApp, SMS, calls, payment reminders, delivery updates, and service notices.", content="""# Communication Consent Policy

By submitting contact details or joining a business workflow, the customer permits Subidha Furniture to contact them for legitimate operational communication.

## 1. Channels

We may use phone calls, SMS, WhatsApp, email, printed notice, portal notification, or in-person communication.

## 2. Purpose

Communication may relate to enquiry, quotation, order, invoice, receipt, EMI reminder, overdue notice, rent/lease demand, payment confirmation, delivery, service, warranty, grievance, data request, OTP, or policy notice.

## 3. Service messages

Operational messages may continue even if promotional communication is refused, where needed for contract, payment, delivery, safety, legal, or support reasons.

## 4. Customer duty

Customers must keep phone/email updated. Failure to receive messages due to wrong details, blocked number, spam folder, network issue, or device issue is not shop fault.

## 5. Opt-out

Customers may request to stop promotional messages. Transactional and legally necessary communication may still continue.

## 6. Misuse reporting

Report fake payment demands or suspicious messages immediately at **[BUSINESS_PHONE]**."""),
    RequiredPolicySpec("emi-subscription-default-policy", "EMI Subscription Default Policy", "Lucky Plan / EMI", "EMI_DEFAULT", "LUCKY_PLAN", PUBLIC, "Overdue EMI, reminders, default handling, and cancellation consequences.", "Defines overdue EMI treatment, reminders, default posture, cancellation consequences, and support escalation.", content="""# EMI Subscription Default Policy

This policy applies when Lucky Plan EMI or subscription payments are late, unpaid, disputed, reversed, or under review.

## 1. Due date responsibility

Customers must pay EMI by the due date stated in schedule/contract. Reminder failure does not remove payment duty.

## 2. Overdue handling

Overdue EMI may trigger reminders, late review, delivery hold, service hold, draw eligibility review, cancellation review, or recovery action.

## 3. Part payment

Part payment may be recorded but does not automatically mark EMI fully paid unless backend rules allow it.

## 4. Disputed payment

If a customer claims payment but shop cannot verify receipt, the EMI may remain pending until reconciliation.

## 5. Cancellation/default

Repeated default, non-response, false proof, or contract breach may lead to cancellation or settlement review under contract terms.

## 6. Audit

EMI status, waiver status, payment status, cancellation, and settlement records remain auditable and cannot be silently changed."""),
    RequiredPolicySpec("lucky-draw-rules-fairness", "Lucky Draw Rules and Fairness Policy", "Lucky Plan / EMI", "LUCKY_DRAW", "LUCKY_PLAN", PUBLIC, "Draw source, last-two-digit rule, winner waiver, and dispute handling.", "Explains draw source, last-two-digit winner rule, future EMI waiver, dispute handling, and no retroactive manipulation.", content="""# Lucky Draw Rules and Fairness Policy

This policy explains the fairness principles for Lucky Plan draw records.

## 1. Draw source

The draw source, date, time, last-two-digit rule, hash proof, or other approved method must be recorded before/during draw as per rulebook.

## 2. Eligibility

Eligibility depends on batch, Lucky ID assignment, subscription status, payment status, and rulebook conditions.

## 3. Winner benefit

The winner receives waiver of future unpaid EMIs only. The winner does not receive a cash prize unless a separate written policy/contract states so.

## 4. No manipulation

After draw commitment/publication, source data, winner result, Lucky ID, and waiver settlement must not be changed for convenience.

## 5. Dispute

Draw disputes must be raised with batch ID, Lucky ID, subscription details, payment proof, and reason. Audit records will be reviewed.

## 6. Transparency

Published winner records should explain enough information for customer trust without exposing private customer data."""),
    RequiredPolicySpec("security-deposit-policy", "Security Deposit Policy", "Rent / Lease / Deposit", "SECURITY_DEPOSIT", "RENT_LEASE", PUBLIC, "Rent/lease deposit collection, liability, deduction, and refund.", "Defines security deposit collection, liability accounting, deduction evidence, return inspection, and refund rules.", content="""# Security Deposit Policy

Security deposit is collected for rent/lease risk protection and is separate from monthly rent unless contract states otherwise.

## 1. Collection

Deposit may be **20% to 30%, or as stated in the contract** or as stated in contract. Deposit receipt must identify customer, contract, amount, date, and mode.

## 2. Use

Deposit may secure unpaid dues, late charges, damage, missing parts, cleaning, transport, repair, replacement, contract breach, or recovery cost.

## 3. Return inspection

Refund review requires asset return, condition check, photos/evidence, dues clearance, and deduction approval.

## 4. Deduction

Deductions must be supported by reason/evidence and recorded in approved workflow.

## 5. Refund

Approved balance refund is processed within **7 to 15 working days after approval** after closure approval.

## 6. No interest

Unless contract states otherwise, security deposit is refundable without interest."""),
    RequiredPolicySpec("possession-handover-policy", "Possession and Handover Policy", "Rent / Lease / Deposit", "POSSESSION", "DELIVERY", PUBLIC, "Possession, handover, acknowledgement, and condition evidence.", "Defines rent/lease possession, handover, customer acknowledgement, asset condition evidence, and delivery proof.", content="""# Possession and Handover Policy

This policy applies to rent/lease possession and any controlled product handover requiring condition evidence.

## 1. Preconditions

Possession may require approved contract, KYC, security deposit, first payment, delivery readiness, address verification, and no blockers.

## 2. Handover evidence

The shop may record photos, product condition, accessories, serial/asset number, delivery person, receiver, location, and acknowledgement.

## 3. Customer duty

Customer must inspect asset at handover and report visible issues immediately. Later claims may require evidence.

## 4. Approved location

Asset must remain at approved location unless written permission is given.

## 5. Risk after handover

Customer is responsible for safe custody, reasonable use, loss, damage, missing parts, and unauthorised movement after possession.

## 6. Return linkage

Handover condition evidence is used during return inspection and deduction/refund review."""),
    RequiredPolicySpec("return-damage-inspection-policy", "Return Damage Inspection Policy", "Rent / Lease / Deposit", "RETURN_DAMAGE", "RENT_LEASE", PUBLIC, "Return inspection, damage evidence, deduction, and dispute handling.", "Defines asset return inspection, damage evidence, missing parts, deduction approval, and dispute handling.", content="""# Return Damage Inspection Policy

This policy applies when rent/lease assets or delivered products are returned for closure, repair, cancellation, or dispute review.

## 1. Inspection basis

Return condition is compared with handover evidence, contract terms, product age, normal wear, photos, missing parts, and customer explanation.

## 2. Damage categories

Damage may include breakage, stains, burns, water damage, termite/pest damage, missing parts, structural damage, unauthorised repair, severe dirt, or misuse.

## 3. Deduction

Approved deductions may include repair, replacement, cleaning, transport, labour, missing items, depreciation, unpaid dues, and recovery cost.

## 4. Customer dispute

Customer may dispute deduction by submitting evidence. The shop will review records and provide decision.

## 5. Closure

Closure is completed only after asset receipt, inspection, deduction/refund decision, and contract/account update.

## 6. Fraud

Concealed damage, swapped parts, or false claim may lead to recovery or legal action."""),
    RequiredPolicySpec("document-esign-consent", "Document and E-Sign Consent Policy", "Public Legal", "DOCUMENT_GOVERNANCE", "COMPLIANCE", PUBLIC, "Digital documents, PDFs, signatures, receipts, contracts, and addendums.", "Explains digital/printed documents, PDF copies, signatures, receipts, contracts, addendums, and acceptance evidence.", content="""# Document and E-Sign Consent Policy

Customers may receive or accept documents physically or digitally, including PDFs, receipts, invoices, contracts, statements, delivery acknowledgements, and amendments.

## 1. Digital documents

Digital copies may be sent through portal, email, WhatsApp, download link, or other approved channel.

## 2. Acceptance

Click acceptance, OTP, signature, payment after document issue, delivery acknowledgement, WhatsApp confirmation, or continued use may be treated as acceptance evidence where allowed.

## 3. Corrections

Wrong document details must be reported promptly. Corrected or revised documents may replace earlier drafts but audit trail remains.

## 4. Printed and digital parity

A backend-generated PDF/record may be treated as official even if printed later.

## 5. Amendments

Contract changes require approved amendment workflow. Informal messages cannot override signed/approved contract records.

## 6. Security

Customers must protect document links and report unauthorised access."""),
    RequiredPolicySpec("data-retention-deletion-policy", "Data Retention and Deletion Policy", "Privacy / Data", "DATA_RETENTION", "PRIVACY", PUBLIC, "KYC, receipts, contracts, audit logs, retention, and deletion rules.", "Explains retention and deletion limits for KYC, receipts, contracts, audit logs, financial records, and customer requests.", content="""# Data Retention and Deletion Policy

This policy explains why some data is retained even after a customer requests deletion or account closure.

## 1. Retained records

Invoices, receipts, payments, contracts, KYC, delivery records, service records, audit logs, tax/accounting records, refunds, disputes, and legal records may be retained.

## 2. Retention reason

Retention supports legal compliance, tax/accounting audit, fraud prevention, contract enforcement, warranty/service support, dispute resolution, and financial integrity.

## 3. Deletion review

Eligible marketing, duplicate, obsolete, or unnecessary data may be deleted/anonymised after verification.

## 4. Non-deletable records

Financial, audit, payment, waiver, stock, reconciliation, journal, contract, and dispute records must not be silently deleted or altered.

## 5. Request process

Requests should be sent to **[BUSINESS_EMAIL]** with identity verification.

## 6. Future systems

Retention rules apply across current webapp, future desktop app, rental/leasing expansion, and connected operational systems."""),
)

INTERNAL_GOVERNANCE_GAP_SPECS: tuple[RequiredPolicySpec, ...] = (
    RequiredPolicySpec("payment-reversal-void-policy", "Payment Reversal and Receipt Void Policy", "Finance / Accounting Controls", "PAYMENT_CONTROL", "PAYMENT", INTERNAL, "Receipt void, payment reversal, and operational cancellation controls.", "Defines when payments and receipts can be reversed/voided and how evidence must be preserved.", requires_admin_acceptance=True, content="""# Payment Reversal and Receipt Void Policy

Internal policy. Do not publish publicly.

## 1. Principle

Payments, receipts, EMI paid status, deposits, advances, and settlement records must not be changed for convenience. Corrections require controlled reversal/void workflow.

## 2. Allowed reasons

Allowed reasons include duplicate payment, wrong customer mapping, failed settlement, wrong amount, chargeback, cashier error, or verified fraud.

## 3. Approval

Cashier may request correction. Admin/finance reviewer must approve where financial impact exists.

## 4. Evidence

Store original receipt, reason, payment proof, customer reference, operator, timestamp, and corrected record link.

## 5. Accounting impact

Reversal must preserve audit trail and trigger/align accounting, reconciliation, and reporting records where applicable.

## 6. Prohibited action

Never delete payment rows, edit paid amount silently, or overwrite receipt numbers."""),
    RequiredPolicySpec("accounting-posting-policy", "Accounting Posting Policy", "Finance / Accounting Controls", "ACCOUNTING", "COMPLIANCE", INTERNAL, "Journal posting governance for EMI/direct-sale/deposit/refund/payout.", "Defines accounting posting rules for EMI, direct sale, deposits, refunds, commissions, payouts, and reversals.", requires_admin_acceptance=True, content="""# Accounting Posting Policy

Internal policy. Accounting truth must be generated by backend services, not manual frontend calculations.

## 1. Posting source

Only approved source events may create journal entries: payments, invoices, refunds, deposits, payouts, adjustments, direct sale finalization, and controlled reversals.

## 2. COA readiness

Posting requires valid chart account mapping, active period, allowed finance account, and no setup blockers.

## 3. No silent mutation

Posted journal lines must not be edited or deleted except through approved reversal/amendment workflow.

## 4. Review

Unposted bridge items must be reviewed before period close.

## 5. Audit

Each journal must show source model, source ID, event, amount, operator/system, and timestamp.

## 6. Future compatibility

Rules apply to Lucky Plan, direct sale, rent, lease, manufacturing, vendor purchase, and future commerce expansion."""),
    RequiredPolicySpec("reconciliation-policy", "Reconciliation Policy", "Finance / Accounting Controls", "RECONCILIATION", "COMPLIANCE", INTERNAL, "Unmatched receipts, settlement matching, and reconciliation evidence.", "Defines reconciliation evidence, unmatched item review, settlement matching, and closure rules.", requires_admin_acceptance=True, content="""# Reconciliation Policy

Internal policy for matching payment records with cash, bank, UPI, settlement, receipt, invoice, and accounting records.

## 1. Daily review

Cashier/finance must review collections, unpaid items, duplicate references, failed payments, bank mismatch, and UPI settlement mismatch.

## 2. Evidence

Each exception needs amount, date, mode, reference number, customer/subscription/invoice, screenshot or bank proof where relevant.

## 3. Resolution

Resolve only through approved actions: match, mark duplicate, reverse, reopen, correct mapping, or escalate.

## 4. Period close

Accounting period or day close should not be completed with material unresolved items.

## 5. Segregation

Cashier cannot independently close major mismatch without admin/finance review.

## 6. Audit retention

Resolved and reopened items must keep full history."""),
    RequiredPolicySpec("cashier-day-close-policy", "Cashier Day Close Policy", "Finance / Accounting Controls", "CASHIER_CONTROL", "PAYMENT", INTERNAL, "Cash/UPI/bank day close and mismatch handling.", "Defines cashier day close, cash/UPI/bank handover, mismatch evidence, and approval controls.", requires_admin_acceptance=True, content="""# Cashier Day Close Policy

Internal policy for daily cashier close.

## 1. Close timing

Cashier close target: **[DAY_CLOSE_TIME]**, or before shift handover/end of business day.

## 2. Required review

Review cash received, UPI received, bank transfer, receipts issued, void/reversal requests, unpaid bills, advances, deposits, and exceptions.

## 3. Mismatch handling

Any mismatch must be recorded with reason, evidence, operator note, and admin review.

## 4. Handover

Cash and summary should be handed to authorised owner/admin/finance person.

## 5. No backdating

Backdated receipt or collection is not allowed unless admin-approved and audit-marked.

## 6. Accountability

Cashier is responsible for accurate entry, receipt issue, and timely exception reporting."""),
    RequiredPolicySpec("finance-account-mapping-policy", "Finance Account Mapping Policy", "Finance / Accounting Controls", "ACCOUNTING", "COMPLIANCE", INTERNAL, "Collection accounts, COA mapping, and posting blockers.", "Defines collection account mapping, COA leaf posting requirements, and group/control/non-posting blockers.", requires_admin_acceptance=True, content="""# Finance Account Mapping Policy

Internal policy for mapping operational collection accounts to accounting chart accounts.

## 1. Mapping requirement

Cash, bank, UPI, customer advance, deposit, receivable, commission, payable, revenue, waiver, refund, and expense mappings must be configured before posting.

## 2. Leaf posting

Only valid leaf/postable accounts should receive journal lines.

## 3. Blockers

Missing, inactive, control-only, duplicate, or wrong-type mappings must block accounting posting.

## 4. Changes

Mapping changes require admin/finance approval and should not rewrite historical postings.

## 5. Testing

After setup/reset/restore, run readiness checks before live collection.

## 6. Future workflows

Mappings must support EMI, direct sale, rent, lease, vendor purchase, manufacturing, deposits, commissions, and payouts."""),
    RequiredPolicySpec("commission-partner-payout-policy", "Commission and Partner Payout Policy", "Inventory / Vendor / Commission", "COMMISSION", "COMPLIANCE", INTERNAL, "Commission approval, payout batching, and partner settlement.", "Defines commission eligibility, approval, payout batching, and partner settlement controls.", requires_admin_acceptance=True, content="""# Commission and Partner Payout Policy

Internal policy for partner/staff/vendor-linked commission and payout workflows.

## 1. Eligibility

Commission is earned only when backend rules confirm eligible sale/subscription/collection and no blocker exists.

## 2. Approval

Commission calculation, approval, hold, rejection, and payout must be audit-recorded.

## 3. Payout batching

Payout batches must show partner, period, amount, source records, deductions, status, approval, and payment reference.

## 4. No premature payout

Do not pay commission on cancelled, reversed, fraudulent, unsettled, or disputed transactions unless specifically approved.

## 5. Reconciliation

Payout payment must reconcile with finance account and accounting records.

## 6. Partner dispute

Partner dispute should reference commission ID, payout batch, source transaction, and reason."""),
    RequiredPolicySpec("vendor-purchase-policy", "Vendor Purchase Policy", "Inventory / Vendor / Commission", "VENDOR", "COMPLIANCE", INTERNAL, "Vendor register, purchase bill, stock inward, and outstanding controls.", "Defines vendor onboarding, purchase bills, stock inward, returns, outstanding, and settlement controls.", requires_admin_acceptance=True, content="""# Vendor Purchase Policy

Internal policy for vendor onboarding, purchase, GRN/stock inward, bills, returns, and settlement.

## 1. Vendor master

Vendor name, phone, address, GST/PAN where applicable, bank details, and terms must be maintained before major purchase.

## 2. Purchase evidence

Purchase order, bill, GRN, stock inward, and payment records must link wherever applicable.

## 3. Stock truth

Stock increases only through approved stock inward/ledger workflow, not manual UI calculation.

## 4. Vendor return

Damaged, wrong, short, or excess goods must be recorded with evidence and linked to bill/stock movement.

## 5. Payment

Vendor payments require bill verification, outstanding check, approval, and finance posting where applicable.

## 6. Audit

No purchase bill/payment should be deleted after posting; use reversal/adjustment."""),
    RequiredPolicySpec("inventory-adjustment-policy", "Inventory Adjustment Policy", "Inventory / Vendor / Commission", "INVENTORY", "COMPLIANCE", INTERNAL, "Stock correction, damage, quality hold, and write-off controls.", "Defines stock adjustment, quality hold, damaged stock, write-off, and approval evidence.", requires_admin_acceptance=True, content="""# Inventory Adjustment Policy

Internal policy for stock adjustment, hold, damage, write-off, and correction.

## 1. Stock source

Inventory truth comes from stock ledger. Manual UI counts are not final.

## 2. Allowed adjustments

Allowed reasons: opening setup, physical count mismatch, damage, quality hold, service hold, return correction, purchase error, write-off, or manufacturing correction.

## 3. Evidence

Each adjustment requires product, location, quantity, reason, operator, approval where required, and photo/document evidence where practical.

## 4. Financial impact

Material write-off/damage may require accounting review.

## 5. Separation

Cashier/staff should not approve own stock write-off.

## 6. Future compatibility

Policy applies to sale, delivery, rent/lease possession, returns, manufacturing, and vendor workflows."""),
    RequiredPolicySpec("contract-amendment-policy", "Contract Amendment Policy", "Staff / Access / Audit", "CONTRACT_AMENDMENT", "COMPLIANCE", INTERNAL, "Amendment request, review, approve, reject, preview, execute, and audit rules.", "Defines who may request amendments and how admin reviews, approves, rejects, previews, executes, and audits them.", requires_admin_acceptance=True, content="""# Contract Amendment Policy

Internal policy for controlled changes to subscription, rent, lease, EMI, and customer contracts.

## 1. Principle

Signed/active contract data must not be edited directly. Use amendment workflow.

## 2. Request reasons

Allowed reasons include customer correction, tenure correction, product change, address update, payment restructuring, cancellation/closure correction, or approved settlement.

## 3. Preview

Financial and operational impact must be previewed before approval/execution.

## 4. Approval

Admin/owner/finance reviewer must approve material changes affecting money, EMI, deposit, waiver, delivery, or accounting.

## 5. Execution

Execution must create audit trail and must not corrupt old EMI/payment/draw/receipt records.

## 6. Rejection

Rejected amendments must keep reason and requester details."""),
    RequiredPolicySpec("admin-access-role-control-policy", "Admin Access and Role Control Policy", "Staff / Access / Audit", "STAFF_ACCESS", "COMPLIANCE", INTERNAL, "Admin/cashier/staff role separation and permission controls.", "Defines staff role boundaries, admin-only controls, cashier limits, and permission review rules.", requires_admin_acceptance=True, content="""# Admin Access and Role Control Policy

Internal policy for user roles and access control.

## 1. Role boundaries

Admin/owner controls setup, policy, accounting, reset, user management, approval, and dangerous actions. Cashier controls daily collection within limits. Customer/partner/vendor must not access admin controls.

## 2. Least privilege

Each user should receive minimum permissions required for their work.

## 3. Internal creation

Admin/cashier/staff accounts must be created internally by authorised admin. Public self-registration should not create internal roles.

## 4. Password reset

Password reset should be identity/email gated and audited.

## 5. Review

Access should be reviewed after staff exit, role change, incident, or suspicious activity.

## 6. Prohibited sharing

Shared passwords, generic admin accounts, and unauthorised access are prohibited."""),
    RequiredPolicySpec("audit-log-retention-policy", "Audit Log Retention Policy", "Staff / Access / Audit", "AUDIT_RETENTION", "COMPLIANCE", INTERNAL, "Protecting financial audit history from deletion.", "Defines audit log protection, retention, and restrictions on deletion or silent mutation.", requires_admin_acceptance=True, content="""# Audit Log Retention Policy

Internal policy for audit trail protection.

## 1. Protected records

Payments, EMIs, waivers, lucky draws, subscriptions, receipts, invoices, journals, stock ledger, deposits, refunds, commissions, payouts, reconciliations, and user access logs are protected.

## 2. No silent deletion

Audit logs and financial source records must not be deleted or overwritten to hide mistakes.

## 3. Correction method

Use reversal, amendment, reopen, correction note, or new version workflow.

## 4. Retention

Audit logs should be retained for business, tax, legal, fraud, recovery, and dispute requirements.

## 5. Access

Only authorised admin/finance roles may review sensitive audit data.

## 6. Incident

Any attempt to tamper with audit logs must be escalated to owner/admin immediately."""),
    RequiredPolicySpec("backup-restore-policy", "Backup and Restore Policy", "Backup / Incident Response", "BACKUP_RESTORE", "COMPLIANCE", INTERNAL, "Backup/restore governance, responsibility, and recovery.", "Defines backup frequency, restore responsibility, dry-run checks, and data recovery controls.", requires_admin_acceptance=True, content="""# Backup and Restore Policy

Internal policy for protecting production data.

## 1. Backup frequency

Minimum backup target: **daily operational backup and additional backup before major resets/restores**. Additional backup is required before reset, restore, bulk import, migration, deployment, or major accounting operation.

## 2. Protected data

Backup must cover customer, product, subscription, EMI, payment, receipt, invoice, accounting, inventory, audit, policy, user, and configuration data.

## 3. Storage

Production secrets must not be committed to Git. Backups must be stored securely with restricted access.

## 4. Restore preview

Restores must use preview/dry-run where available before execution.

## 5. Approval

Production restore/reset requires owner/admin approval and reason.

## 6. Post-restore checks

Run migrations/checks, login test, dashboard check, payment/readiness check, and sample record verification after restore."""),
    RequiredPolicySpec("incident-data-breach-policy", "Incident and Data Breach Policy", "Backup / Incident Response", "INCIDENT_RESPONSE", "COMPLIANCE", INTERNAL, "Security/privacy incident response.", "Defines incident detection, escalation, customer/privacy response, and corrective action process.", requires_admin_acceptance=True, content="""# Incident and Data Breach Policy

Internal policy for suspected security, privacy, data, payment, or operational incidents.

## 1. Incidents covered

Unauthorised access, leaked credentials, suspicious payment changes, data exposure, malware, wrong customer disclosure, lost device, audit tampering, or system compromise.

## 2. Immediate action

Disable affected access, preserve logs, stop unsafe workflow, secure backups, and inform owner/admin.

## 3. Investigation

Record timeline, affected data, users, root cause, evidence, and corrective action.

## 4. Customer/legal response

Where customer data or legal duties are affected, prepare appropriate notice, support response, and compliance action after review.

## 5. Recovery

Patch issue, rotate credentials, restore from trusted backup if required, review permissions, and test system integrity.

## 6. Prevention

Update SOPs, staff training, access rules, monitoring, and backup posture after incident."""),
)


def get_policy_coverage_specs() -> tuple[RequiredPolicySpec, ...]:
    return (*EXISTING_BASE_POLICY_SPECS, *CUSTOMER_FACING_GAP_SPECS, *INTERNAL_GOVERNANCE_GAP_SPECS)


def get_gap_policy_templates() -> list[dict[str, str]]:
    return [spec.as_seed_template() for spec in (*CUSTOMER_FACING_GAP_SPECS, *INTERNAL_GOVERNANCE_GAP_SPECS)]


def get_policy_spec_by_slug(slug: str) -> RequiredPolicySpec | None:
    cleaned = (slug or "").strip().lower()
    return next((spec for spec in get_policy_coverage_specs() if spec.slug == cleaned), None)


def internal_policy_slugs() -> set[str]:
    return {spec.slug for spec in get_policy_coverage_specs() if spec.visibility == INTERNAL}


def public_policy_slugs() -> set[str]:
    return {spec.slug for spec in get_policy_coverage_specs() if spec.visibility == PUBLIC}


def coverage_groups() -> list[str]:
    order = [
        "Public Legal",
        "Customer Operations",
        "Lucky Plan / EMI",
        "Rent / Lease / Deposit",
        "Service / Delivery / Warranty",
        "Privacy / Data",
        "Finance / Accounting Controls",
        "Staff / Access / Audit",
        "Inventory / Vendor / Commission",
        "Backup / Incident Response",
    ]
    seen = {spec.group for spec in get_policy_coverage_specs()}
    return [group for group in order if group in seen]


def group_specs(specs: Iterable[RequiredPolicySpec] | None = None) -> dict[str, list[RequiredPolicySpec]]:
    rows = specs or get_policy_coverage_specs()
    grouped: dict[str, list[RequiredPolicySpec]] = {group: [] for group in coverage_groups()}
    for spec in rows:
        grouped.setdefault(spec.group, []).append(spec)
    return grouped
