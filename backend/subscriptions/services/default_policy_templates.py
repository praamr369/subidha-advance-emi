from __future__ import annotations

from copy import deepcopy

from subscriptions.services.policy_coverage_catalog import get_gap_policy_templates

DEFAULT_POLICY_STATUS = "DRAFT"

# Phase PG-2A compatibility note:
# The historical template body list remains intentionally compact here. Extra customer-facing and
# internal governance templates are provided by policy_coverage_catalog.get_gap_policy_templates().
DEFAULT_POLICY_TEMPLATES = [
    {"slug": "terms", "title": "Terms and Conditions", "category": "GENERAL", "summary": "General terms for using Subidha Furniture's website, direct sale, Lucky Plan EMI, rent/lease, delivery, payment, and service workflows.", "default_status": DEFAULT_POLICY_STATUS, "content": "# Terms and Conditions\n\nGeneral public terms for Subidha Furniture operations. Review and customize before publishing."},
    {"slug": "privacy", "title": "Privacy Policy", "category": "PRIVACY", "summary": "Explains how Subidha Furniture collects, uses, stores, protects, and handles customer personal data.", "default_status": DEFAULT_POLICY_STATUS, "content": "# Privacy Policy\n\nCustomer privacy and personal data handling policy. Review and customize before publishing."},
    {"slug": "refund-cancellation", "title": "Refund and Cancellation Policy", "category": "REFUND", "summary": "Explains cancellation, return, refund, reversal, and adjustment rules.", "default_status": DEFAULT_POLICY_STATUS, "content": "# Refund and Cancellation Policy\n\nRefund, cancellation, reversal, and adjustment policy. Review and customize before publishing."},
    {"slug": "warranty", "title": "Warranty Policy", "category": "WARRANTY", "summary": "Explains product warranty support, exclusions, and service escalation.", "default_status": DEFAULT_POLICY_STATUS, "content": "# Warranty Policy\n\nWarranty policy draft. Review and customize before publishing."},
    {"slug": "delivery-policy", "title": "Delivery Policy", "category": "DELIVERY", "summary": "Explains delivery scheduling, handover, failed delivery, customer acknowledgement, and delivery evidence.", "default_status": DEFAULT_POLICY_STATUS, "content": "# Delivery Policy\n\nDelivery policy draft. Review and customize before publishing."},
    {"slug": "rental-lease-policy", "title": "Rental and Lease Policy", "category": "RENT_LEASE", "summary": "Explains rent/lease contract onboarding, possession, monthly demand, security deposit, return, and closure rules.", "default_status": DEFAULT_POLICY_STATUS, "content": "# Rental and Lease Policy\n\nRent/lease policy draft. Review and customize before publishing."},
    {"slug": "lucky-plan-policy", "title": "Lucky Plan Policy", "category": "LUCKY_PLAN", "summary": "Explains Lucky Plan EMI, Lucky IDs, winner waiver, draw rules, and customer responsibilities.", "default_status": DEFAULT_POLICY_STATUS, "content": "# Lucky Plan Policy\n\nLucky Plan policy draft. Review and customize before publishing."},
    {"slug": "direct-sale-policy", "title": "Direct Sale Policy", "category": "DIRECT_SALE", "summary": "Explains direct-sale invoice, receipt, delivery, return, cancellation, and warranty terms.", "default_status": DEFAULT_POLICY_STATUS, "content": "# Direct Sale Policy\n\nDirect-sale policy draft. Review and customize before publishing."},
    {"slug": "payment-policy", "title": "Payment Policy", "category": "PAYMENT", "summary": "Explains accepted payment modes, receipts, failed payments, outstanding dues, reconciliation, and customer payment responsibilities.", "default_status": DEFAULT_POLICY_STATUS, "content": "# Payment Policy\n\nPayment policy draft. Review and customize before publishing."},
    {"slug": "service-policy", "title": "Service and Repair Policy", "category": "SERVICE", "summary": "Explains customer support, service tickets, repair inspection, chargeable service, warranty service, and closure.", "default_status": DEFAULT_POLICY_STATUS, "content": "# Service and Repair Policy\n\nService policy draft. Review and customize before publishing."},
    {"slug": "grievance", "title": "Grievance Policy", "category": "GRIEVANCE", "summary": "Explains customer grievance submission, escalation, response, and closure process.", "default_status": DEFAULT_POLICY_STATUS, "content": "# Grievance Policy\n\nGrievance policy draft. Review and customize before publishing."},
    {"slug": "business-compliance", "title": "Business Compliance Policy", "category": "COMPLIANCE", "summary": "Explains public business compliance identity and registration disclosure rules.", "default_status": DEFAULT_POLICY_STATUS, "content": "# Business Compliance Policy\n\nBusiness compliance policy draft. Review and customize before publishing."},
    {"slug": "ownership-business-proof", "title": "Ownership and Business Proof Policy", "category": "COMPLIANCE", "summary": "Explains ownership and business proof disclosure rules.", "default_status": DEFAULT_POLICY_STATUS, "content": "# Ownership and Business Proof Policy\n\nOwnership/business proof policy draft. Review and customize before publishing."},
    {"slug": "udyam-msme", "title": "Udyam/MSME Policy", "category": "COMPLIANCE", "summary": "Explains Udyam/MSME status disclosure and verification limits.", "default_status": DEFAULT_POLICY_STATUS, "content": "# Udyam/MSME Policy\n\nUdyam/MSME policy draft. Review and customize before publishing."},
    {"slug": "data-requests", "title": "Data Requests Policy", "category": "PRIVACY", "summary": "Explains customer data access, correction, retention, and deletion request handling.", "default_status": DEFAULT_POLICY_STATUS, "content": "# Data Requests Policy\n\nData request policy draft. Review and customize before publishing."},
    {"slug": "contact-enquiry-policy", "title": "Contact and Enquiry Policy", "category": "CUSTOMER_SUPPORT", "summary": "Explains safe handling of public enquiries and lead/contact submissions.", "default_status": DEFAULT_POLICY_STATUS, "content": "# Contact and Enquiry Policy\n\nContact/enquiry policy draft. Review and customize before publishing."},
]


def get_default_policy_templates() -> list[dict]:
    merged: dict[str, dict] = {}
    for template in [*DEFAULT_POLICY_TEMPLATES, *get_gap_policy_templates()]:
        merged.setdefault(template["slug"], template)
    return deepcopy(list(merged.values()))
