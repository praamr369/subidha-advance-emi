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
            "content": _template_content(self),
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
    RequiredPolicySpec("cookie-tracking-consent", "Cookie and Tracking Consent Policy", "Privacy / Data", "COOKIE_CONSENT", "PRIVACY", PUBLIC, "Cookies, analytics, sessions, and consent controls.", "Explains cookies, analytics, session tracking, security logs, and customer consent controls."),
    RequiredPolicySpec("kyc-identity-verification", "KYC and Identity Verification Policy", "Customer Operations", "KYC", "COMPLIANCE", PUBLIC, "KYC, identity, address proof, and customer verification.", "Defines identity/address verification for EMI, rent/lease, delivery, refund, and account safety."),
    RequiredPolicySpec("communication-consent", "Communication Consent Policy", "Customer Operations", "COMMUNICATION", "CUSTOMER_SUPPORT", PUBLIC, "WhatsApp, SMS, calls, reminders, and service notices.", "Explains customer communication consent for WhatsApp, SMS, calls, payment reminders, delivery updates, and service notices."),
    RequiredPolicySpec("emi-subscription-default-policy", "EMI Subscription Default Policy", "Lucky Plan / EMI", "EMI_DEFAULT", "LUCKY_PLAN", PUBLIC, "Overdue EMI, reminders, default handling, and cancellation consequences.", "Defines overdue EMI treatment, reminders, default posture, cancellation consequences, and support escalation."),
    RequiredPolicySpec("lucky-draw-rules-fairness", "Lucky Draw Rules and Fairness Policy", "Lucky Plan / EMI", "LUCKY_DRAW", "LUCKY_PLAN", PUBLIC, "Draw source, last-two-digit rule, winner waiver, and dispute handling.", "Explains draw source, last-two-digit winner rule, future EMI waiver, dispute handling, and no retroactive manipulation."),
    RequiredPolicySpec("security-deposit-policy", "Security Deposit Policy", "Rent / Lease / Deposit", "SECURITY_DEPOSIT", "RENT_LEASE", PUBLIC, "Rent/lease deposit collection, liability, deduction, and refund.", "Defines security deposit collection, liability accounting, deduction evidence, return inspection, and refund rules."),
    RequiredPolicySpec("possession-handover-policy", "Possession and Handover Policy", "Rent / Lease / Deposit", "POSSESSION", "DELIVERY", PUBLIC, "Possession, handover, acknowledgement, and condition evidence.", "Defines rent/lease possession, handover, customer acknowledgement, asset condition evidence, and delivery proof."),
    RequiredPolicySpec("return-damage-inspection-policy", "Return Damage Inspection Policy", "Rent / Lease / Deposit", "RETURN_DAMAGE", "RENT_LEASE", PUBLIC, "Return inspection, damage evidence, deduction, and dispute handling.", "Defines asset return inspection, damage evidence, missing parts, deduction approval, and dispute handling."),
    RequiredPolicySpec("document-esign-consent", "Document and E-Sign Consent Policy", "Public Legal", "DOCUMENT_GOVERNANCE", "COMPLIANCE", PUBLIC, "Digital documents, PDFs, signatures, receipts, contracts, and addendums.", "Explains digital/printed documents, PDF copies, signatures, receipts, contracts, addendums, and acceptance evidence."),
    RequiredPolicySpec("data-retention-deletion-policy", "Data Retention and Deletion Policy", "Privacy / Data", "DATA_RETENTION", "PRIVACY", PUBLIC, "KYC, receipts, contracts, audit logs, retention, and deletion rules.", "Explains retention and deletion limits for KYC, receipts, contracts, audit logs, financial records, and customer requests."),
)

INTERNAL_GOVERNANCE_GAP_SPECS: tuple[RequiredPolicySpec, ...] = (
    RequiredPolicySpec("payment-reversal-void-policy", "Payment Reversal and Receipt Void Policy", "Finance / Accounting Controls", "PAYMENT_CONTROL", "PAYMENT", INTERNAL, "Receipt void, payment reversal, and operational cancellation controls.", "Defines when payments and receipts can be reversed/voided and how evidence must be preserved.", requires_admin_acceptance=True),
    RequiredPolicySpec("accounting-posting-policy", "Accounting Posting Policy", "Finance / Accounting Controls", "ACCOUNTING", "COMPLIANCE", INTERNAL, "Journal posting governance for EMI/direct-sale/deposit/refund/payout.", "Defines accounting posting rules for EMI, direct sale, deposits, refunds, commissions, payouts, and reversals.", requires_admin_acceptance=True),
    RequiredPolicySpec("reconciliation-policy", "Reconciliation Policy", "Finance / Accounting Controls", "RECONCILIATION", "COMPLIANCE", INTERNAL, "Unmatched receipts, settlement matching, and reconciliation evidence.", "Defines reconciliation evidence, unmatched item review, settlement matching, and closure rules.", requires_admin_acceptance=True),
    RequiredPolicySpec("cashier-day-close-policy", "Cashier Day Close Policy", "Finance / Accounting Controls", "CASHIER_CONTROL", "PAYMENT", INTERNAL, "Cash/UPI/bank day close and mismatch handling.", "Defines cashier day close, cash/UPI/bank handover, mismatch evidence, and approval controls.", requires_admin_acceptance=True),
    RequiredPolicySpec("finance-account-mapping-policy", "Finance Account Mapping Policy", "Finance / Accounting Controls", "ACCOUNTING", "COMPLIANCE", INTERNAL, "Collection accounts, COA mapping, and posting blockers.", "Defines collection account mapping, COA leaf posting requirements, and group/control/non-posting blockers.", requires_admin_acceptance=True),
    RequiredPolicySpec("commission-partner-payout-policy", "Commission and Partner Payout Policy", "Inventory / Vendor / Commission", "COMMISSION", "COMPLIANCE", INTERNAL, "Commission approval, payout batching, and partner settlement.", "Defines commission eligibility, approval, payout batching, and partner settlement controls.", requires_admin_acceptance=True),
    RequiredPolicySpec("vendor-purchase-policy", "Vendor Purchase Policy", "Inventory / Vendor / Commission", "VENDOR", "COMPLIANCE", INTERNAL, "Vendor register, purchase bill, stock inward, and outstanding controls.", "Defines vendor onboarding, purchase bills, stock inward, returns, outstanding, and settlement controls.", requires_admin_acceptance=True),
    RequiredPolicySpec("inventory-adjustment-policy", "Inventory Adjustment Policy", "Inventory / Vendor / Commission", "INVENTORY", "COMPLIANCE", INTERNAL, "Stock correction, damage, quality hold, and write-off controls.", "Defines stock adjustment, quality hold, damaged stock, write-off, and approval evidence.", requires_admin_acceptance=True),
    RequiredPolicySpec("contract-amendment-policy", "Contract Amendment Policy", "Staff / Access / Audit", "CONTRACT_AMENDMENT", "COMPLIANCE", INTERNAL, "Amendment request, review, approve, reject, preview, execute, and audit rules.", "Defines who may request amendments and how admin reviews, approves, rejects, previews, executes, and audits them.", requires_admin_acceptance=True),
    RequiredPolicySpec("admin-access-role-control-policy", "Admin Access and Role Control Policy", "Staff / Access / Audit", "STAFF_ACCESS", "COMPLIANCE", INTERNAL, "Admin/cashier/staff role separation and permission controls.", "Defines staff role boundaries, admin-only controls, cashier limits, and permission review rules.", requires_admin_acceptance=True),
    RequiredPolicySpec("audit-log-retention-policy", "Audit Log Retention Policy", "Staff / Access / Audit", "AUDIT_RETENTION", "COMPLIANCE", INTERNAL, "Protecting financial audit history from deletion.", "Defines audit log protection, retention, and restrictions on deletion or silent mutation.", requires_admin_acceptance=True),
    RequiredPolicySpec("backup-restore-policy", "Backup and Restore Policy", "Backup / Incident Response", "BACKUP_RESTORE", "COMPLIANCE", INTERNAL, "Backup/restore governance, responsibility, and recovery.", "Defines backup frequency, restore responsibility, dry-run checks, and data recovery controls.", requires_admin_acceptance=True),
    RequiredPolicySpec("incident-data-breach-policy", "Incident and Data Breach Policy", "Backup / Incident Response", "INCIDENT_RESPONSE", "COMPLIANCE", INTERNAL, "Security/privacy incident response.", "Defines incident detection, escalation, customer/privacy response, and corrective action process.", requires_admin_acceptance=True),
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
