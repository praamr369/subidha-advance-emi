from __future__ import annotations

from typing import Any

from django.db import transaction

from accounting.models import BusinessTaxRegistrationMode
from accounting.services.tax_profile_service import build_tax_profile_snapshot, get_active_business_tax_profile
from subscriptions.models_business_setup import (
    BenefitFundingSource,
    BusinessRulePolicy,
    LegalRiskStatus,
)


def get_or_create_active_business_rule_policy() -> BusinessRulePolicy:
    active = BusinessRulePolicy.objects.filter(is_active=True).order_by("-created_at", "-id").first()
    if active is not None:
        return active
    return BusinessRulePolicy.objects.create(
        name="Default legal controls",
        is_active=True,
        notes="Seeded default controls: public waiver launch blocked until advocate/CA approval.",
    )


def _invoice_mode_for_tax_mode(tax_mode: str) -> str:
    if tax_mode in {BusinessTaxRegistrationMode.GST_REGULAR, BusinessTaxRegistrationMode.GST_COMPOSITION}:
        return "GST_TAX_INVOICE"
    return "NON_GST_BILL"


def business_rule_policy_payload(policy: BusinessRulePolicy | None = None) -> dict[str, Any]:
    policy = policy or get_or_create_active_business_rule_policy()
    tax_profile = get_active_business_tax_profile()
    tax_snapshot = build_tax_profile_snapshot()
    gst_status = (tax_profile.mode or BusinessTaxRegistrationMode.GST_UNREGISTERED).strip().upper()
    invoice_mode = _invoice_mode_for_tax_mode(gst_status)
    waiver_public_launch_blocked = policy.risk_status != LegalRiskStatus.APPROVED_FOR_PUBLIC_LAUNCH
    gst_registered = gst_status in {
        BusinessTaxRegistrationMode.GST_REGULAR,
        BusinessTaxRegistrationMode.GST_COMPOSITION,
    }

    blockers: list[str] = []
    warnings: list[str] = []

    if policy.funding_source == BenefitFundingSource.CUSTOMER_POOL_BLOCKED:
        blockers.append("Customer-pool funding is blocked for Lucky Plan classification.")
    if waiver_public_launch_blocked:
        blockers.append("Lucky Plan waiver public launch is blocked until advocate/CA approval is recorded.")
    if gst_status == BusinessTaxRegistrationMode.GST_UNREGISTERED:
        blockers.append("GST tax invoices, GST credit notes, GST debit notes, ITC wording, and GST collection are blocked while GST status is UNREGISTERED.")
    if not policy.partner_receipt_admin_approval_required:
        blockers.append("Partner receipt finalization must require admin approval.")
    if not policy.kyc_masking_required:
        blockers.append("KYC masking must remain enabled for customer, partner, vendor, and staff document APIs.")
    if not policy.deposit_refund_requires_inspection:
        blockers.append("Deposit refund closure must require approved return inspection.")
    if policy.late_payment_charge_enabled and not policy.late_payment_charge_configured:
        blockers.append("Late payment charge cannot be enabled until the charge policy is configured.")

    if not gst_registered:
        warnings.append("HSN/SAC can be maintained as internal readiness data only; do not show tax charged.")
    if policy.risk_status in {LegalRiskStatus.DRAFT, LegalRiskStatus.CA_REVIEW_REQUIRED, LegalRiskStatus.ADVOCATE_REVIEW_REQUIRED}:
        warnings.append("Legal/CA review is still required before public launch wording is used.")
    if not policy.late_payment_charge_enabled:
        warnings.append("Late payment charges are disabled until an approved policy is configured.")

    return {
        "policy": {
            "id": policy.id,
            "name": policy.name,
            "is_active": policy.is_active,
            "plan_type": policy.plan_type,
            "benefit_type": policy.benefit_type,
            "selection_method": policy.selection_method,
            "funding_source": policy.funding_source,
            "risk_status": policy.risk_status,
            "refund_sla_working_days": policy.refund_sla_working_days,
            "late_payment_charge_enabled": policy.late_payment_charge_enabled,
            "late_payment_charge_configured": policy.late_payment_charge_configured,
            "late_payment_charge_label": policy.late_payment_charge_label,
            "partner_receipt_admin_approval_required": policy.partner_receipt_admin_approval_required,
            "kyc_masking_required": policy.kyc_masking_required,
            "deposit_refund_requires_inspection": policy.deposit_refund_requires_inspection,
            "gst_documents_require_hsn_sac": policy.gst_documents_require_hsn_sac,
            "non_gst_document_labels": policy.non_gst_document_labels,
            "notes": policy.notes,
            "created_at": policy.created_at,
            "updated_at": policy.updated_at,
        },
        "tax_profile": tax_snapshot,
        "derived": {
            "gst_status": gst_status,
            "invoice_mode": invoice_mode,
            "tax_invoice_enabled": gst_registered,
            "gst_credit_note_enabled": gst_registered,
            "gst_debit_note_enabled": gst_registered,
            "gst_collection_enabled": gst_registered,
            "receipt_voucher_enabled": gst_registered,
            "refund_voucher_enabled": gst_registered,
            "waiver_public_launch_blocked": waiver_public_launch_blocked,
            "partner_final_receipt_blocked_until_admin_approval": policy.partner_receipt_admin_approval_required,
            "deposit_refund_blocked_until_inspection": policy.deposit_refund_requires_inspection,
            "late_payment_charge_application_enabled": policy.late_payment_charge_enabled and policy.late_payment_charge_configured,
            "document_labels": policy.non_gst_document_labels if not gst_registered else [
                "Tax Invoice",
                "Receipt Voucher",
                "Refund Voucher",
                "GST Credit Note",
                "GST Debit Note",
                "Bill of Supply",
            ],
        },
        "status": "BLOCKED" if blockers else ("NEEDS_REVIEW" if warnings else "READY"),
        "blockers": blockers,
        "warnings": warnings,
    }


@transaction.atomic
def update_active_business_rule_policy(*, payload: dict[str, Any], performed_by=None) -> BusinessRulePolicy:
    policy = BusinessRulePolicy.objects.select_for_update().filter(is_active=True).order_by("-created_at", "-id").first()
    if policy is None:
        policy = BusinessRulePolicy(name="Default legal controls", is_active=True)

    editable_fields = {
        "name",
        "plan_type",
        "benefit_type",
        "selection_method",
        "funding_source",
        "risk_status",
        "refund_sla_working_days",
        "late_payment_charge_enabled",
        "late_payment_charge_configured",
        "late_payment_charge_label",
        "partner_receipt_admin_approval_required",
        "kyc_masking_required",
        "deposit_refund_requires_inspection",
        "gst_documents_require_hsn_sac",
        "non_gst_document_labels",
        "notes",
    }
    for field in editable_fields:
        if field in payload:
            setattr(policy, field, payload[field])
    policy.updated_by = performed_by
    policy.is_active = True
    policy.save()
    return policy
