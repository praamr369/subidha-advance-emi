"""Contract amendment service.

Phase 1 records auditable requests and admin review decisions.
Phase 3 implements only whitelisted customer contact/address corrections.
Phase 4 implements only approved same-price product reference corrections. It does
not implement true financial product upgrade/downgrade, repricing, EMI schedule
changes, reconciliation, accounting, payout, stock, delivery, waiver, rent/lease
demand, or deposit changes.
"""
from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from subscriptions.models import AuditLog, ContractAmendment, Customer, PlanType, Product, Subscription, SubscriptionStatus
from subscriptions.models_contract_amendment import PHASE1_AMENDMENT_TYPES
from subscriptions.services.audit_service import log_audit

_AMENDABLE_STATUSES = {
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.APPROVED,
    SubscriptionStatus.PAYMENT_PENDING,
    SubscriptionStatus.DELIVERY_PENDING,
    SubscriptionStatus.HANDED_OVER,
}

_PRODUCT_CHANGE_TERMINAL_STATUSES = {
    SubscriptionStatus.CANCELLED,
    SubscriptionStatus.CLOSED,
    SubscriptionStatus.COMPLETED,
    SubscriptionStatus.DEFAULTED,
    SubscriptionStatus.RETURNED,
    "TERMINATED",
    "REVERSED",
}

_HIGH_RISK_AMENDMENTS = {
    "TENURE_EXTENSION",
    "PRODUCT_CHANGE",
    "LUCKY_ID_CHANGE",
    "BATCH_CHANGE",
    "DEPOSIT_ADJUSTMENT",
    "EMI_AMOUNT_CHANGE",
    "CONTRACT_PRICE_CHANGE",
    "RENT_AMOUNT_CHANGE",
    "LEASE_TERM_CHANGE",
}

_PHASE3_IMPLEMENTABLE_AMENDMENTS = {
    "CONTACT_CORRECTION": {"source": "customer", "allowed_fields": {"phone"}},
    "ADDRESS_CHANGE": {"source": "customer", "allowed_fields": {"address", "city"}},
}

_PHASE3_BLOCKED_AMENDMENTS = {
    "LUCKY_ID_CHANGE",
    "BATCH_CHANGE",
    "EMI_AMOUNT_CHANGE",
    "TENURE_EXTENSION",
    "TENURE_CHANGE",
    "CONTRACT_PRICE_CHANGE",
    "CONTRACT_VALUE_CHANGE",
    "PAYMENT_ADJUSTMENT",
    "RECEIPT_ADJUSTMENT",
    "WAIVER_CHANGE",
    "RENT_AMOUNT_CHANGE",
    "LEASE_AMOUNT_CHANGE",
    "LEASE_TERM_CHANGE",
    "RENT_LEASE_DEMAND_CHANGE",
    "SECURITY_DEPOSIT_CHANGE",
    "DEPOSIT_ADJUSTMENT",
    "DEPOSIT_REFUND_CHANGE",
    "ACCOUNTING_CHANGE",
    "JOURNAL_POSTING",
    "RECONCILIATION_CHANGE",
    "SETTLEMENT_ALLOCATION",
    "COMMISSION_CHANGE",
    "PAYOUT_CHANGE",
    "DELIVERY_CONTACT_CORRECTION",
    "DELIVERY_STOCK_CHANGE",
    "INVENTORY_MOVEMENT",
    "CANCELLATION_RETURN_REVERSAL",
    "PRODUCT_UPGRADE",
}

_PHASE3_BLOCK_MESSAGE = (
    "Only whitelisted non-financial customer contact/address corrections and Phase 4 same-price product reference corrections can be implemented. "
    "Financial product changes, EMI, lucky ID, batch, rent/lease billing, deposit, accounting, inventory, reconciliation, commission, payout, delivery, stock, and audit-sensitive changes remain blocked."
)

_PHASE4_PRODUCT_REFERENCE_CORRECTION_PHASE = "PHASE_4_PRODUCT_REFERENCE_CORRECTION"
_PHASE4_FINANCIAL_PRODUCT_CHANGE_MESSAGE = "Financial product change requires contract repricing preview and reconciliation and is not implemented in this phase."
_PHASE4_PRODUCT_ID_KEYS = {"approved_product_id", "product_id", "target_product_id", "new_product_id"}
_PHASE4_PRODUCT_DISPLAY_ONLY_KEYS = {
    "approved_product_name",
    "target_product_name",
    "new_product_name",
    "product_name",
    "approved_product_code",
    "target_product_code",
    "new_product_code",
    "product_code",
    "approved_product_sku",
    "target_product_sku",
    "new_product_sku",
    "sku",
    "note",
    "notes",
    "reason",
    "display_label",
}
_PHASE4_FORBIDDEN_KEY_TOKENS = {
    "new_total_amount",
    "total_amount",
    "monthly_amount",
    "emi_amount",
    "tenure_months",
    "price_difference",
    "extra_amount",
    "refund_amount",
    "adjustment_amount",
    "recalculation",
    "payment_adjustment",
    "accounting_adjustment",
    "reconciliation_adjustment",
    "price",
    "batch",
    "lucky_id",
    "payment",
    "deposit",
    "waiver",
    "rent_amount",
    "lease_amount",
    "rent_lease_demand",
    "security_deposit",
    "commission",
    "payout",
    "accounting",
    "journal",
    "reconciliation",
    "stock",
    "inventory",
    "delivery",
}
_PHASE4_PRESERVED_FIELDS = [
    "total_amount",
    "monthly_amount",
    "tenure_months",
    "paid_amount",
    "payment_records",
    "receipt_documents",
    "emi_rows",
    "lucky_id",
    "batch",
    "waivers",
    "accounting_journals",
    "reconciliation_records",
    "inventory_stock",
    "delivery_records",
    "commission_records",
    "payout_records",
    "rent_lease_billing",
    "security_deposit",
]


def _source_for(*, contract_type: str, subscription: Subscription | None = None, rent_lease_contract: Subscription | None = None) -> Subscription:
    if contract_type == "EMI_SUBSCRIPTION":
        if not subscription:
            raise ValidationError({"subscription": "EMI subscription source is required."})
        if rent_lease_contract:
            raise ValidationError({"source": "Exactly one contract source is allowed."})
        if subscription.plan_type != PlanType.EMI:
            raise ValidationError({"subscription": "EMI amendment requires an EMI subscription."})
        return subscription
    if contract_type == "RENT_LEASE":
        if not rent_lease_contract:
            raise ValidationError({"rent_lease_contract": "Rent/lease contract source is required."})
        if subscription:
            raise ValidationError({"source": "Exactly one contract source is allowed."})
        if rent_lease_contract.plan_type not in {PlanType.RENT, PlanType.LEASE}:
            raise ValidationError({"rent_lease_contract": "Rent/lease amendment requires a RENT or LEASE contract."})
        return rent_lease_contract
    raise ValidationError({"contract_type": "Direct Sale amendments are not supported."})


def _snapshot_for(source: Subscription) -> dict:
    return {
        "subscription_id": source.id,
        "subscription_number": source.subscription_number,
        "contract_reference": source.contract_reference,
        "plan_type": source.plan_type,
        "customer_id": source.customer_id,
        "product_id": source.product_id,
        "batch_id": source.batch_id,
        "lucky_id_id": source.lucky_id_id,
        "tenure_months": source.tenure_months,
        "total_amount": str(source.total_amount),
        "monthly_amount": str(source.monthly_amount),
        "status": source.status,
        "start_date": str(source.start_date),
    }


def _review_flags(contract_type: str, amendment_type: str) -> dict:
    return {
        "requires_emi_recalculation": amendment_type in {"TENURE_EXTENSION", "EMI_AMOUNT_CHANGE", "CONTRACT_PRICE_CHANGE"},
        "requires_inventory_review": amendment_type == "PRODUCT_CHANGE",
        "requires_lucky_id_review": amendment_type in {"LUCKY_ID_CHANGE", "BATCH_CHANGE"},
        "requires_accounting_review": amendment_type in _HIGH_RISK_AMENDMENTS,
        "requires_rent_lease_review": contract_type == "RENT_LEASE" or amendment_type in {"DEPOSIT_ADJUSTMENT", "RENT_AMOUNT_CHANGE", "LEASE_TERM_CHANGE"},
    }


def _normalized_value_key(key: str) -> str:
    return (key or "").strip().lower().replace("-", "_").replace(" ", "_")


def _product_snapshot(product: Product | None, prefix: str) -> dict:
    return {
        f"{prefix}_product_id": product.pk if product else None,
        f"{prefix}_product_name": product.name if product else "",
        f"{prefix}_product_code": product.product_code if product else "",
        f"{prefix}_product_sku": getattr(product, "sku", "") if product else "",
    }


def _financial_snapshot(source: Subscription) -> dict:
    return {
        "total_amount": str(source.total_amount),
        "monthly_amount": str(source.monthly_amount),
        "tenure_months": source.tenure_months,
    }


def _product_change_values(amendment: ContractAmendment) -> dict:
    values = (
        amendment.approved_values
        if amendment.status == "APPROVED"
        else amendment.requested_values or amendment.new_values or {}
    )
    if not isinstance(values, dict):
        raise ValidationError({"detail": "Approved product reference correction values must be a JSON object."})
    return values


def _phase4_product_change_candidate(values: dict) -> tuple[int | None, list[str], list[str]]:
    target_product_id = None
    unsupported_keys: list[str] = []
    forbidden_keys: list[str] = []
    for raw_key, raw_value in values.items():
        key = _normalized_value_key(str(raw_key))
        if any(token == key or token in key for token in _PHASE4_FORBIDDEN_KEY_TOKENS):
            forbidden_keys.append(str(raw_key))
            continue
        if key in _PHASE4_PRODUCT_ID_KEYS:
            if raw_value in (None, ""):
                continue
            try:
                target_product_id = int(raw_value)
            except (TypeError, ValueError):
                unsupported_keys.append(str(raw_key))
            continue
        if key in _PHASE4_PRODUCT_DISPLAY_ONLY_KEYS:
            continue
        unsupported_keys.append(str(raw_key))
    return target_product_id, sorted(set(forbidden_keys)), sorted(set(unsupported_keys))


def _product_change_block_reason(amendment: ContractAmendment) -> str:
    if amendment.status != "APPROVED":
        return "Implementation requires APPROVED status."
    if amendment.amendment_type != "PRODUCT_CHANGE":
        return _PHASE3_BLOCK_MESSAGE
    if amendment.contract_type not in {"EMI_SUBSCRIPTION", "RENT_LEASE"}:
        return "Product reference correction supports EMI subscription and rent/lease contracts only."
    try:
        values = _product_change_values(amendment)
    except ValidationError:
        return "Approved product reference correction values must be a JSON object."
    target_product_id, forbidden_keys, unsupported_keys = _phase4_product_change_candidate(values)
    if forbidden_keys:
        return "Same-price product reference correction cannot include financial, EMI, tenure, lucky ID, batch, payment, deposit, waiver, accounting, reconciliation, inventory, stock, delivery, commission, or payout keys: " + ", ".join(forbidden_keys) + "."
    if unsupported_keys:
        return f"Product reference correction blocked: unsupported value keys: {', '.join(unsupported_keys)}."
    if not target_product_id:
        return "Product reference correction requires approved_product_id."
    source = amendment.source_contract()
    if not source:
        return "Source subscription is required for product reference correction."
    if source.status in _PRODUCT_CHANGE_TERMINAL_STATUSES:
        return f"Product reference correction is blocked for terminal subscription status '{source.status}'."
    if source.status not in _AMENDABLE_STATUSES:
        return f"Product reference correction is not allowed for subscription status '{source.status}'."
    try:
        target_product = Product.objects.get(pk=target_product_id)
    except Product.DoesNotExist:
        return "Target product does not exist."
    if hasattr(target_product, "is_active") and not target_product.is_active:
        return "Target product is inactive."
    if getattr(target_product, "lifecycle_status", "ACTIVE") != "ACTIVE":
        return f"Target product lifecycle status '{target_product.lifecycle_status}' is not eligible."
    if source.plan_type == PlanType.EMI and hasattr(target_product, "is_emi_enabled") and not target_product.is_emi_enabled:
        return "Target product is not enabled for EMI subscriptions."
    if source.plan_type == PlanType.RENT and hasattr(target_product, "is_rent_enabled") and not target_product.is_rent_enabled:
        return "Target product is not enabled for rent contracts."
    if source.plan_type == PlanType.LEASE and hasattr(target_product, "is_lease_enabled") and not target_product.is_lease_enabled:
        return "Target product is not enabled for lease contracts."
    if Decimal(str(target_product.base_price)) != Decimal(str(source.total_amount)):
        return _PHASE4_FINANCIAL_PRODUCT_CHANGE_MESSAGE
    if source.product_id == target_product.pk:
        return "Target product is already linked to this contract."
    return ""


def phase3_implementation_metadata(amendment: ContractAmendment) -> dict:
    if amendment.amendment_type == "PRODUCT_CHANGE":
        block_reason = _product_change_block_reason(amendment)
        return {"is_implementable": not block_reason, "implementation_block_reason": block_reason, "implementable_fields": ["product"]}
    config = _PHASE3_IMPLEMENTABLE_AMENDMENTS.get(amendment.amendment_type)
    if amendment.status != "APPROVED":
        return {"is_implementable": False, "implementation_block_reason": "Implementation requires APPROVED status.", "implementable_fields": sorted(config["allowed_fields"]) if config else []}
    if not config:
        return {"is_implementable": False, "implementation_block_reason": _PHASE3_BLOCK_MESSAGE, "implementable_fields": []}
    values = amendment.approved_values or amendment.requested_values or amendment.new_values or {}
    requested_keys = set(values.keys())
    allowed_fields = set(config["allowed_fields"])
    unsupported_keys = sorted(requested_keys - allowed_fields)
    if unsupported_keys:
        return {"is_implementable": False, "implementation_block_reason": f"Unsupported requested value keys for Phase 3 implementation: {', '.join(unsupported_keys)}.", "implementable_fields": sorted(allowed_fields)}
    if not requested_keys:
        return {"is_implementable": False, "implementation_block_reason": "No approved values are available to implement.", "implementable_fields": sorted(allowed_fields)}
    return {"is_implementable": True, "implementation_block_reason": "", "implementable_fields": sorted(allowed_fields)}


def _implementation_values_for(amendment: ContractAmendment, allowed_fields: set[str]) -> dict:
    values = amendment.approved_values or amendment.requested_values or amendment.new_values or {}
    if not isinstance(values, dict):
        raise ValidationError({"detail": "Approved values must be a JSON object."})
    unsupported_keys = sorted(set(values.keys()) - allowed_fields)
    if unsupported_keys:
        raise ValidationError({"detail": f"Unsupported requested value keys for Phase 3 implementation: {', '.join(unsupported_keys)}."})
    selected = {key: values[key] for key in sorted(values.keys()) if key in allowed_fields}
    if not selected:
        raise ValidationError({"detail": "No whitelisted approved values are available to implement."})
    return selected


@transaction.atomic
def create_amendment(*, subscription: Subscription | None = None, rent_lease_contract: Subscription | None = None, contract_type: str = "EMI_SUBSCRIPTION", amendment_type: str, requested_values: dict | None = None, reason: str, requested_by, requested_role: str = "CUSTOMER", admin_note: str = "", metadata: dict | None = None, previous_values: dict | None = None, new_values: dict | None = None, notes: str = "") -> ContractAmendment:
    if amendment_type not in PHASE1_AMENDMENT_TYPES:
        raise ValidationError({"amendment_type": f"Unknown amendment type: {amendment_type!r}"})
    if requested_role not in {"CUSTOMER", "PARTNER"}:
        raise ValidationError({"requested_role": "Only CUSTOMER or PARTNER can request amendments."})
    if not reason or not reason.strip():
        raise ValidationError({"reason": "Amendment reason is required."})
    if (
        contract_type == "EMI_SUBSCRIPTION"
        and subscription
        and not rent_lease_contract
        and subscription.plan_type in {PlanType.RENT, PlanType.LEASE}
    ):
        contract_type = "RENT_LEASE"
        rent_lease_contract = subscription
        subscription = None
    source = _source_for(contract_type=contract_type, subscription=subscription, rent_lease_contract=rent_lease_contract)
    if source.status not in _AMENDABLE_STATUSES:
        raise ValidationError(f"Cannot request an amendment on a contract in status '{source.status}'.")
    values = requested_values if requested_values is not None else (new_values or {})
    old_values = previous_values if previous_values is not None else _snapshot_for(source)
    amendment = ContractAmendment.objects.create(
        subscription=source if contract_type == "EMI_SUBSCRIPTION" else None,
        rent_lease_contract=source if contract_type == "RENT_LEASE" else None,
        contract_type=contract_type,
        customer=source.customer,
        partner=source.partner,
        requested_by=requested_by,
        requested_role=requested_role,
        amendment_type=amendment_type,
        status="REQUESTED",
        previous_values=old_values,
        new_values=values or {},
        old_values=old_values,
        requested_values=values or {},
        reason=reason.strip(),
        admin_note=(admin_note or "").strip(),
        notes=(notes or "").strip(),
        metadata={"phase": "PHASE_1_REQUEST_ONLY", **(metadata or {})},
        **_review_flags(contract_type, amendment_type),
    )
    log_audit(action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_REQUESTED, instance=source, performed_by=requested_by, metadata={"amendment_id": amendment.pk, "amendment_no": amendment.amendment_no, "amendment_type": amendment_type, "phase": "PHASE_1"})
    return amendment


@transaction.atomic
def mark_under_review(*, amendment: ContractAmendment, reviewed_by, admin_note: str = "") -> ContractAmendment:
    if amendment.status != "REQUESTED":
        raise ValidationError(f"Cannot move amendment in status '{amendment.status}' to review. Must be REQUESTED.")
    amendment.status = "UNDER_REVIEW"
    amendment.admin_note = (admin_note or amendment.admin_note or "").strip()
    amendment.save(update_fields=["status", "admin_note", "updated_at"])
    return amendment


@transaction.atomic
def approve_amendment(*, amendment: ContractAmendment, approved_by, approved_values: dict | None = None, admin_note: str = "") -> ContractAmendment:
    if amendment.status not in {"REQUESTED", "UNDER_REVIEW"}:
        raise ValidationError(f"Cannot approve amendment in status '{amendment.status}'.")
    amendment.status = "APPROVED"
    amendment.approved_by = approved_by
    amendment.approved_at = timezone.now()
    amendment.approved_values = approved_values if approved_values is not None else (amendment.requested_values or {})
    amendment.admin_note = (admin_note or amendment.admin_note or "").strip()
    amendment.metadata = {**(amendment.metadata or {}), "approved_without_implementation": True}
    amendment.save(update_fields=["status", "approved_by", "approved_at", "approved_values", "admin_note", "metadata", "updated_at"])
    source = amendment.source_contract()
    log_audit(action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_APPROVED, instance=source, performed_by=approved_by, metadata={"amendment_id": amendment.pk, "amendment_no": amendment.amendment_no, "phase": "PHASE_1_APPROVAL_ONLY"})
    return amendment


@transaction.atomic
def reject_amendment(*, amendment: ContractAmendment, rejected_by, rejection_reason: str, admin_note: str = "") -> ContractAmendment:
    if amendment.status not in {"REQUESTED", "UNDER_REVIEW"}:
        raise ValidationError(f"Cannot reject amendment in status '{amendment.status}'.")
    if not rejection_reason or not rejection_reason.strip():
        raise ValidationError({"rejection_reason": "Rejection reason is required."})
    amendment.status = "REJECTED"
    amendment.rejection_reason = rejection_reason.strip()
    amendment.admin_note = (admin_note or amendment.admin_note or "").strip()
    amendment.save(update_fields=["status", "rejection_reason", "admin_note", "updated_at"])
    source = amendment.source_contract()
    log_audit(action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_REJECTED, instance=source, performed_by=rejected_by, metadata={"amendment_id": amendment.pk, "amendment_no": amendment.amendment_no, "reason": rejection_reason[:200], "phase": "PHASE_1"})
    return amendment


@transaction.atomic
def apply_amendment(*, amendment: ContractAmendment, applied_by) -> ContractAmendment:
    implemented = implement_approved_amendment(amendment=amendment, implemented_by=applied_by)
    implemented.status = "APPLIED"
    implemented.metadata = {**(implemented.metadata or {}), "legacy_apply_alias": True}
    implemented.save(update_fields=["status", "metadata", "updated_at"])
    source = implemented.source_contract()
    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_APPLIED,
        instance=source,
        performed_by=applied_by,
        metadata={
            "amendment_id": implemented.pk,
            "amendment_no": implemented.amendment_no,
            "amendment_type": implemented.amendment_type,
            "phase": "LEGACY_APPLY_ALIAS",
        },
    )
    return implemented


def _implement_customer_field_amendment(*, locked_amendment: ContractAmendment, implemented_by) -> ContractAmendment:
    config = _PHASE3_IMPLEMENTABLE_AMENDMENTS.get(locked_amendment.amendment_type)
    if not config or locked_amendment.amendment_type in _PHASE3_BLOCKED_AMENDMENTS:
        raise ValidationError({"detail": _PHASE3_BLOCK_MESSAGE})
    metadata = phase3_implementation_metadata(locked_amendment)
    if not metadata["is_implementable"]:
        raise ValidationError({"detail": metadata["implementation_block_reason"]})
    if config["source"] != "customer" or not locked_amendment.customer_id:
        raise ValidationError({"detail": "Phase 3 implementation requires a linked customer source record."})
    customer = Customer.objects.select_for_update().get(pk=locked_amendment.customer_id)
    values = _implementation_values_for(locked_amendment, set(config["allowed_fields"]))
    field_changes = {}
    update_fields = []
    for field_name, after_value in values.items():
        before_value = getattr(customer, field_name)
        setattr(customer, field_name, after_value)
        update_fields.append(field_name)
        field_changes[field_name] = {"source_model": "Customer", "source_id": customer.pk, "before": before_value, "after": after_value}
    customer.save(update_fields=update_fields)
    now = timezone.now()
    locked_amendment.status = "IMPLEMENTED"
    locked_amendment.implemented_by = implemented_by
    locked_amendment.implemented_at = now
    locked_amendment.implemented_values = {"phase": "PHASE_3_WHITELISTED_NON_FINANCIAL", "source_model": "Customer", "source_id": customer.pk, "fields": field_changes}
    locked_amendment.metadata = {**(locked_amendment.metadata or {}), "approved_without_implementation": False, "implementation_phase": "PHASE_3_WHITELISTED_NON_FINANCIAL"}
    locked_amendment.save(update_fields=["status", "implemented_by", "implemented_at", "implemented_values", "metadata", "updated_at"])
    source = locked_amendment.source_contract()
    log_audit(action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_IMPLEMENTED, instance=source, performed_by=implemented_by, metadata={"amendment_id": locked_amendment.pk, "amendment_no": locked_amendment.amendment_no, "amendment_type": locked_amendment.amendment_type, "implemented_fields": sorted(field_changes.keys()), "phase": "PHASE_3_WHITELISTED_NON_FINANCIAL"})
    return locked_amendment


def _implement_product_change(*, locked_amendment: ContractAmendment, implemented_by) -> ContractAmendment:
    metadata = phase3_implementation_metadata(locked_amendment)
    if not metadata["is_implementable"]:
        raise ValidationError({"detail": metadata["implementation_block_reason"]})
    values = _product_change_values(locked_amendment)
    target_product_id, _forbidden_keys, _unsupported_keys = _phase4_product_change_candidate(values)
    if not target_product_id:
        raise ValidationError({"detail": "Product reference correction requires approved_product_id."})
    source = locked_amendment.source_contract()
    if not source:
        raise ValidationError({"detail": "Source subscription is required for product reference correction."})
    source = Subscription.objects.select_for_update().select_related("product", "batch", "lucky_id", "customer", "partner").get(pk=source.pk)
    target_product = Product.objects.select_for_update().get(pk=target_product_id)
    locked_amendment.subscription = source if locked_amendment.contract_type == "EMI_SUBSCRIPTION" else None
    locked_amendment.rent_lease_contract = source if locked_amendment.contract_type == "RENT_LEASE" else None
    metadata = phase3_implementation_metadata(locked_amendment)
    if not metadata["is_implementable"]:
        raise ValidationError({"detail": metadata["implementation_block_reason"]})
    before_product = _product_snapshot(source.product, "old")
    after_product = _product_snapshot(target_product, "new")
    before_financials = _financial_snapshot(source)
    old_product_id = source.product_id
    source.product = target_product
    source.full_clean()
    Subscription.objects.filter(pk=source.pk, product_id=old_product_id).update(product=target_product)
    after_financials = _financial_snapshot(source)
    if before_financials != after_financials:
        raise ValidationError({"detail": "Product reference correction attempted to alter locked financial terms."})
    now = timezone.now()
    locked_amendment.status = "IMPLEMENTED"
    locked_amendment.implemented_by = implemented_by
    locked_amendment.implemented_at = now
    locked_amendment.implemented_values = {
        "phase": _PHASE4_PRODUCT_REFERENCE_CORRECTION_PHASE,
        "source_model": "Subscription",
        "source_id": source.pk,
        "contract_type": locked_amendment.contract_type,
        "amendment_type": "PRODUCT_CHANGE",
        "semantics": "PRODUCT_REFERENCE_CORRECTION_SAME_PRICE_ONLY",
        "before": {**before_product, **before_financials},
        "after": {**after_product, **after_financials},
        "financial_invariants": {
            "total_amount_unchanged": before_financials["total_amount"] == after_financials["total_amount"],
            "monthly_amount_unchanged": before_financials["monthly_amount"] == after_financials["monthly_amount"],
            "tenure_months_unchanged": before_financials["tenure_months"] == after_financials["tenure_months"],
        },
        "preserved_fields": _PHASE4_PRESERVED_FIELDS,
    }
    locked_amendment.metadata = {**(locked_amendment.metadata or {}), "approved_without_implementation": False, "implementation_phase": _PHASE4_PRODUCT_REFERENCE_CORRECTION_PHASE, "implementation_semantics": "PRODUCT_REFERENCE_CORRECTION_SAME_PRICE_ONLY"}
    locked_amendment.save(update_fields=["status", "implemented_by", "implemented_at", "implemented_values", "metadata", "updated_at"])
    log_audit(action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_IMPLEMENTED, instance=source, performed_by=implemented_by, metadata={"amendment_id": locked_amendment.pk, "amendment_no": locked_amendment.amendment_no, "amendment_type": locked_amendment.amendment_type, "implemented_fields": ["product"], "old_product_id": old_product_id, "new_product_id": target_product.pk, "phase": _PHASE4_PRODUCT_REFERENCE_CORRECTION_PHASE, "semantics": "PRODUCT_REFERENCE_CORRECTION_SAME_PRICE_ONLY", "financial_terms_preserved": True})
    return locked_amendment


@transaction.atomic
def implement_approved_amendment(*, amendment: ContractAmendment, implemented_by) -> ContractAmendment:
    locked_amendment = ContractAmendment.objects.select_for_update().get(pk=amendment.pk)
    if locked_amendment.status == "IMPLEMENTED":
        raise ValidationError({"detail": "This amendment is already implemented."})
    if locked_amendment.status != "APPROVED":
        raise ValidationError({"detail": f"Cannot implement amendment in status '{locked_amendment.status}'. Must be APPROVED."})
    if locked_amendment.amendment_type == "PRODUCT_CHANGE":
        return _implement_product_change(locked_amendment=locked_amendment, implemented_by=implemented_by)
    if locked_amendment.amendment_type == "PRODUCT_UPGRADE":
        raise ValidationError({"detail": "Product upgrade/downgrade must use the product recontract workflow instead of direct implementation."})
    return _implement_customer_field_amendment(locked_amendment=locked_amendment, implemented_by=implemented_by)


def get_workflow_capability(amendment: ContractAmendment) -> dict:
    capability = {
        "category": "BLOCKED",
        "can_review": amendment.status == "REQUESTED",
        "can_approve_decision": amendment.status in {"REQUESTED", "UNDER_REVIEW"},
        "can_reject_decision": amendment.status in {"REQUESTED", "UNDER_REVIEW"},
        "can_execute_directly": False,
        "requires_recontract_workflow": False,
        "requires_customer_consent": False,
        "requires_accounting_bridge": False,
        "requires_reconciliation_bridge": False,
        "blocked_reason": ""
    }

    if amendment.amendment_type in {"PRODUCT_CHANGE", "PRODUCT_UPGRADE"}:
        meta = phase3_implementation_metadata(amendment)
        if meta["is_implementable"] and amendment.amendment_type == "PRODUCT_CHANGE":
            capability["category"] = "SAME_PRICE_PRODUCT_REFERENCE"
            capability["can_execute_directly"] = True
            return capability

        capability["category"] = "PRODUCT_RECONTRACT"
        capability["requires_recontract_workflow"] = True
        capability["requires_customer_consent"] = True
        capability["requires_accounting_bridge"] = True
        capability["requires_reconciliation_bridge"] = True
        capability["blocked_reason"] = "Product upgrade/downgrade must use product recontract workflow."
        return capability

    if amendment.amendment_type in {"LUCKY_ID_CHANGE", "BATCH_CHANGE"}:
        capability["category"] = "LUCKY_ID_BATCH_PREVIEW"
        capability["requires_preview"] = True
        capability["blocked_reason"] = "Lucky ID and Batch changes require dedicated preview workflow (future phase)."
        return capability

    if amendment.contract_type == "RENT_LEASE" or amendment.amendment_type in {"DEPOSIT_ADJUSTMENT", "RENT_AMOUNT_CHANGE", "LEASE_TERM_CHANGE"}:
        capability["category"] = "RENT_LEASE_PREVIEW"
        capability["blocked_reason"] = "Rent/lease amendments require dedicated preview workflow (future phase)."
        return capability

    meta = phase3_implementation_metadata(amendment)
    if meta["is_implementable"]:
        capability["category"] = "NON_FINANCIAL"
        capability["can_execute_directly"] = True
    else:
        capability["category"] = "BLOCKED"
        capability["blocked_reason"] = meta["implementation_block_reason"]

    return capability

