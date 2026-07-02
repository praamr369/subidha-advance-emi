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
    RequiredPolicySpec("terms", "Terms and Conditions", "Public Legal", "GENERAL", "GENERAL", PUBLIC, "General customer-facing website and business terms.", "Defines customer website, direct sale, EMI, rent/lease, payment, delivery, service, and account responsibilities."),
    RequiredPolicySpec("privacy", "Privacy Policy", "Privacy / Data", "PRIVACY", "PRIVACY", PUBLIC, "Customer privacy and personal data handling.", "Explains personal data collection, use, retention, sharing, and customer privacy rights."),
    RequiredPolicySpec("refund-cancellation", "Refund and Cancellation Policy", "Customer Operations", "REFUND", "REFUND", PUBLIC, "Refund, return, cancellation, and reversal policy.", "Explains cancellation, refund, return, and reversal rules for direct sale, EMI, rent/lease, and service transactions."),
    RequiredPolicySpec("delivery-policy", "Delivery Policy", "Service / Delivery / Warranty", "DELIVERY", "DELIVERY", PUBLIC, "Delivery eligibility, scheduling, handover, and failure handling.", "Defines delivery scheduling, product handover, customer acknowledgement, and delivery exception handling."),
    RequiredPolicySpec("warranty", "Warranty Policy", "Service / Delivery / Warranty", "WARRANTY", "WARRANTY", PUBLIC, "Warranty eligibility and exclusions.", "Defines manufacturer/shop warranty treatment, inspection, exclusions, and service escalation."),
    RequiredPolicySpec("service-policy", "Service and Repair Policy", "Service / Delivery / Warranty", "SERVICE", "SERVICE", PUBLIC, "Service request and repair policy.", "Defines service tickets, repair inspection, chargeable service, warranty service, and closure evidence."),
    RequiredPolicySpec("payment-policy", "Payment Policy", "Customer Operations", "PAYMENT", "PAYMENT", PUBLIC, "Customer payment modes, receipts, failed payments, and disputes.", "Defines approved payment modes, payment proof, receipt requirement, failed payment handling, and dispute responsibilities."),
    RequiredPolicySpec("direct-sale-policy", "Direct Sale Policy", "Customer Operations", "DIRECT_SALE", "DIRECT_SALE", PUBLIC, "Direct sale invoice, receipt, delivery, and return terms.", "Defines normal retail/direct-sale purchase terms and customer responsibilities."),
    RequiredPolicySpec("lucky-plan-policy", "Lucky Plan Policy", "Lucky Plan / EMI", "LUCKY_PLAN", "LUCKY_PLAN", PUBLIC, "Lucky Plan EMI customer terms.", "Defines Lucky Plan EMI enrollment, Lucky IDs, winner waiver, payment duties, and customer terms."),
    RequiredPolicySpec("rental-lease-policy", "Rental and Lease Policy", "Rent / Lease / Deposit", "RENT_LEASE", "RENT_LEASE", PUBLIC, "Rent/lease contract and asset use terms.", "Defines rent/lease onboarding, monthly demand, possession, use, return, and closure duties."),
    RequiredPolicySpec("grievance", "Grievance Policy", "Customer Operations", "GRIEVANCE", "GRIEVANCE", PUBLIC, "Customer complaint and escalation process.", "Defines customer grievance intake, response, escalation, and closure responsibilities."),
    RequiredPolicySpec("business-compliance", "Business Compliance Policy", "Public Legal", "COMPLIANCE", "COMPLIANCE", PUBLIC, "Public business compliance information policy.", "Explains business identity and public compliance representation."),
    RequiredPolicySpec("ownership-business-proof", "Ownership and Business Proof Policy", "Public Legal", "COMPLIANCE", "COMPLIANCE", PUBLIC, "Ownership/business proof public summary policy.", "Explains what proof is public, private, verified, or withheld."),
    RequiredPolicySpec("udyam-msme", "Udyam/MSME Policy", "Public Legal", "COMPLIANCE", "COMPLIANCE", PUBLIC, "Udyam/MSME status disclosure policy.", "Explains Udyam/MSME status wording and verification limitations."),
    RequiredPolicySpec("contact-enquiry-policy", "Contact and Enquiry Policy", "Customer Operations", "CUSTOMER_SUPPORT", "CUSTOMER_SUPPORT", PUBLIC, "Customer enquiry handling policy.", "Defines website/contact enquiry processing and follow-up rules."),
    RequiredPolicySpec("data-requests", "Data Requests Policy", "Privacy / Data", "PRIVACY", "PRIVACY", PUBLIC, "Customer data access/correction request policy.", "Defines customer data access, correction, update, and deletion request handling."),
)

CUSTOMER_FACING_GAP_SPECS: tuple[RequiredPolicySpec, ...] = (
    RequiredPolicySpec("cookie-tracking-consent", "Cookie and Tracking Consent Policy", "Privacy / Data", "COOKIE_CONSENT", "PRIVACY", PUBLIC, "Cookies, analytics, sessions, and consent controls.", "Explains cookies, analytics, session tracking, security logs, and customer consent controls.", content="""# Cookie and Tracking Consent Policy

www.subidhafurnitureasansol.com may use cookies, local storage, session identifiers, analytics, and security logs to operate the website and improve customer support.

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

Report fake payment demands or suspicious messages immediately at **+91 94764 90946**."""),
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

Requests should be sent to **subidhafurnitureofficial@gmail.com** with identity verification.

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
