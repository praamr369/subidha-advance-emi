"""Preview-only product recontract calculations for contract amendments.

This service intentionally does not mutate Subscription, EMI, Payment, Receipt,
Accounting, Reconciliation, Stock, Delivery, Commission, Payout, Waiver,
Lucky Draw, Rent/Lease demand, or Deposit records.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date

from subscriptions.models import (
    AuditLog,
    ContractAmendment,
    ContractRecontractEvent,
    ContractRecontractFinancialImpactPreview,
    ContractRecontractScheduleLine,
    Emi,
    EmiStatus,
    MONEY_ZERO,
    Product,
    Subscription,
)
from subscriptions.services.audit_service import log_audit
_PREVIEW_ALLOWED_STATUSES = {"REQUESTED", "UNDER_REVIEW", "APPROVED"}
_EXECUTION_BLOCKED_MESSAGE = (
    "Product recontract execution requires accounting and reconciliation posting integration and is not enabled yet."
)
_POST_EXECUTION_BLOCKED_MESSAGE = "Product recontract has already been executed for this amendment. Further preview, consent, approval, schedule, and financial impact actions are read-only/blocked."
_TARGET_PRODUCT_ID_KEYS = ("approved_product_id", "target_product_id", "new_product_id", "product_id")
_PREVIEW_WARNINGS = [
    "Preview only — no source records are mutated.",
    "No contract, EMI, payment, receipt, accounting, reconciliation, stock, delivery, commission, payout, waiver, rent/lease demand, or deposit records are changed.",
    "Accounting and reconciliation are not posted by this preview.",
    "Final execution requires a later approved financial implementation phase.",
]


def _q2(value: Decimal | int | str | None) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _money(value: Decimal | int | str | None) -> str:
    return str(_q2(value))


def _date(value):
    if not value:
        return None
    if hasattr(value, "isoformat"):
        return value
    return parse_date(str(value))


def _event_is_executed(event: ContractRecontractEvent | None) -> bool:
    if not event:
        return False
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    return bool(metadata.get("execution_performed") is True or metadata.get("execution_status") == "EXECUTED")


def _latest_event(amendment: ContractAmendment, *, lock: bool = False) -> ContractRecontractEvent | None:
    queryset = ContractRecontractEvent.objects.select_related("old_product", "new_product", "subscription").filter(amendment=amendment)
    if lock:
        queryset = queryset.select_for_update()
    return queryset.order_by("-created_at", "-id").first()


def _assert_not_executed_for_amendment(amendment: ContractAmendment) -> None:
    if _event_is_executed(_latest_event(amendment, lock=True)):
        raise ValidationError({"detail": _POST_EXECUTION_BLOCKED_MESSAGE})


def _event_preview_summary(event: ContractRecontractEvent | None) -> dict | None:
    if not event:
        return None
    return {
        "id": event.pk,
        "status": event.status,
        "impact_type": event.impact_type,
        "old_product_id": event.old_product_id,
        "old_product_name": event.old_product.name if event.old_product_id else "",
        "old_product_code": event.old_product.product_code if event.old_product_id else "",
        "new_product_id": event.new_product_id,
        "new_product_name": event.new_product.name if event.new_product_id else "",
        "new_product_code": event.new_product.product_code if event.new_product_id else "",
        "old_contract_total": _money(event.old_contract_total),
        "new_contract_total": _money(event.new_contract_total),
        "price_difference": _money(event.price_difference),
        "amount_already_paid": _money(event.amount_already_paid),
        "old_remaining_balance": _money(event.old_remaining_balance),
        "proposed_new_remaining_balance": _money(event.new_remaining_balance),
        "current_tenure_months": event.current_tenure_months,
        "preview_tenure_months": event.preview_tenure_months,
        "current_monthly_amount": _money(event.current_monthly_amount),
        "proposed_monthly_amount": _money(event.proposed_monthly_amount),
        "pending_emi_count": event.pending_emi_count,
        "effective_date_preview": event.effective_date_preview.isoformat() if event.effective_date_preview else None,
        "warnings": event.warnings or [],
        "customer_consent_status": event.customer_consent_status,
        "customer_consented_at": event.customer_consented_at.isoformat() if event.customer_consented_at else None,
        "customer_consent_note": event.customer_consent_note or "",
        "admin_approval_status": event.admin_approval_status,
        "admin_approved_by": event.admin_approved_by_id,
        "admin_approved_at": event.admin_approved_at.isoformat() if event.admin_approved_at else None,
        "admin_approval_note": event.admin_approval_note or "",
        "admin_approval_snapshot": event.admin_approval_snapshot or {},
        "schedule_preview_lines": [
            {
                "id": line.id,
                "line_no": line.line_no,
                "original_emi_id": line.original_emi_id,
                "original_due_date": line.original_due_date.isoformat() if line.original_due_date else None,
                "original_amount": _money(line.original_amount) if line.original_amount is not None else None,
                "proposed_due_date": line.proposed_due_date.isoformat() if line.proposed_due_date else None,
                "proposed_amount": _money(line.proposed_amount),
                "proposed_principal_component": _money(line.proposed_principal_component) if line.proposed_principal_component is not None else None,
                "proposed_status": line.proposed_status,
                "adjustment_type": line.adjustment_type,
                "source_record_mutation": line.source_record_mutation,
                "metadata": line.metadata or {},
            }
            for line in event.schedule_preview_lines.order_by("line_no", "id")
        ],
        "latest_financial_impact_preview": _latest_financial_impact_preview_summary(event),
        "source_record_mutation": False,
    }


def _latest_financial_impact_preview_summary(event: ContractRecontractEvent | None) -> dict | None:
    if not event:
        return None
    preview = (
        event.financial_impact_previews.order_by("-created_at", "-id").first()
        if hasattr(event, "financial_impact_previews")
        else ContractRecontractFinancialImpactPreview.objects.filter(event=event).order_by("-created_at", "-id").first()
    )
    if not preview:
        return None
    return {
        "id": preview.id,
        "event_id": preview.event_id,
        "impact_type": preview.impact_type,
        "accounting_preview_status": preview.accounting_preview_status,
        "reconciliation_preview_status": preview.reconciliation_preview_status,
        "price_difference": _money(preview.price_difference),
        "additional_receivable_amount": _money(preview.additional_receivable_amount),
        "credit_or_reduction_amount": _money(preview.credit_or_reduction_amount),
        "projected_customer_balance": _money(preview.projected_customer_balance),
        "projected_future_emi_total": _money(preview.projected_future_emi_total),
        "journal_preview": preview.journal_preview or {},
        "reconciliation_preview": preview.reconciliation_preview or {},
        "warnings": preview.warnings or [],
        "blocked_reason": preview.blocked_reason or "",
        "source_record_mutation": preview.source_record_mutation,
        "metadata": preview.metadata or {},
        "created_at": preview.created_at.isoformat() if preview.created_at else None,
        "updated_at": preview.updated_at.isoformat() if preview.updated_at else None,
    }


def latest_product_recontract_preview_summary(amendment: ContractAmendment) -> dict | None:
    event = (
        ContractRecontractEvent.objects.filter(amendment=amendment, status=ContractRecontractEvent.Status.PREVIEWED)
        .select_related("old_product", "new_product")
        .prefetch_related("schedule_preview_lines")
        .order_by("-created_at", "-id")
        .first()
    )
    return _event_preview_summary(event)


def _event_for_schedule_preview(amendment: ContractAmendment) -> ContractRecontractEvent:
    event = (
        ContractRecontractEvent.objects.select_for_update()
        .select_related("subscription", "old_product", "new_product")
        .prefetch_related("schedule_preview_lines")
        .filter(amendment=amendment)
        .order_by("-created_at", "-id")
        .first()
    )
    if not event:
        raise ValidationError({"detail": "No saved product recontract preview exists for this amendment."})
    if _event_is_executed(event):
        raise ValidationError({"detail": _POST_EXECUTION_BLOCKED_MESSAGE})
    if event.status != ContractRecontractEvent.Status.PREVIEWED:
        raise ValidationError({"detail": "Schedule preview requires the latest recontract event to be PREVIEWED."})
    if event.customer_consent_status != ContractRecontractEvent.CustomerConsentStatus.ACCEPTED:
        raise ValidationError({"detail": "Schedule preview requires customer consent status ACCEPTED."})
    if event.admin_approval_status != ContractRecontractEvent.AdminApprovalStatus.APPROVED:
        raise ValidationError({"detail": "Schedule preview requires admin approval status APPROVED."})
    return event


def _deterministic_installments(total: Decimal, count: int) -> list[Decimal]:
    q_total = _q2(total)
    if count <= 0:
        return []
    if q_total <= MONEY_ZERO:
        return [_q2(MONEY_ZERO) for _ in range(count)]
    unit = _q2(q_total / Decimal(count))
    rows = [unit for _ in range(count)]
    balance = q_total - sum(rows)
    rows[-1] = _q2(rows[-1] + balance)
    return rows


def create_product_recontract_schedule_preview(*, amendment: ContractAmendment, requested_by=None) -> ContractRecontractEvent:
    """Create and persist preview-only future EMI schedule lines for an approved recontract event."""
    with transaction.atomic():
        locked_amendment = ContractAmendment.objects.select_for_update().get(pk=amendment.pk)
        event = _event_for_schedule_preview(locked_amendment)
        pending_emis = list(
            Emi.objects.select_for_update()
            .filter(subscription_id=event.subscription_id, status=EmiStatus.PENDING)
            .order_by("month_no", "due_date", "id")
        )
        pending_count = len(pending_emis)
        if pending_count <= 0:
            raise ValidationError(
                {"detail": "Schedule preview is blocked: no pending EMI rows exist; manual settlement/credit policy is required."}
            )
        if event.pending_emi_count and event.pending_emi_count != pending_count:
            raise ValidationError(
                {"detail": "Schedule preview is blocked: pending EMI mapping changed after preview snapshot; regenerate product preview first."}
            )

        ContractRecontractScheduleLine.objects.select_for_update().filter(
            event=event, proposed_status=ContractRecontractScheduleLine.ProposedStatus.PREVIEW_ONLY
        ).update(
            proposed_status=ContractRecontractScheduleLine.ProposedStatus.SUPERSEDED,
            updated_at=timezone.now(),
        )

        proposed_amounts = _deterministic_installments(event.new_remaining_balance, pending_count)
        lines = []
        for idx, (emi, proposed_amount) in enumerate(zip(pending_emis, proposed_amounts), start=1):
            adjustment = ContractRecontractScheduleLine.AdjustmentType.EXISTING_PENDING_REPLACEMENT
            if proposed_amount < _q2(emi.amount):
                adjustment = ContractRecontractScheduleLine.AdjustmentType.REDUCED_EMI
            lines.append(
                ContractRecontractScheduleLine(
                    event=event,
                    line_no=idx,
                    original_emi=emi,
                    original_due_date=emi.due_date,
                    original_amount=_q2(emi.amount),
                    proposed_due_date=emi.due_date,
                    proposed_amount=proposed_amount,
                    proposed_principal_component=None,
                    proposed_status=ContractRecontractScheduleLine.ProposedStatus.PREVIEW_ONLY,
                    adjustment_type=adjustment,
                    source_record_mutation=False,
                    metadata={
                        "phase": "PHASE_6D_SCHEDULE_PREVIEW_ONLY",
                        "source_record_mutation": False,
                    },
                )
            )
        ContractRecontractScheduleLine.objects.bulk_create(lines)

        event_metadata = event.metadata or {}
        event_metadata["phase"] = "PHASE_6D_SCHEDULE_PREVIEW_ONLY"
        event_metadata["schedule_preview_created"] = True
        event_metadata["schedule_preview_created_at"] = timezone.now().isoformat()
        event_metadata["schedule_preview_line_count"] = len(lines)
        event_metadata["source_record_mutation"] = False
        event.metadata = event_metadata
        event.save(update_fields=["metadata", "updated_at"])

        log_audit(
            action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_APPROVED,
            instance=locked_amendment,
            performed_by=requested_by,
            metadata={
                "event": "CONTRACT_RECONTRACT_SCHEDULE_PREVIEW_CREATED",
                "phase": "PHASE_6D_SCHEDULE_PREVIEW_ONLY",
                "amendment_id": locked_amendment.pk,
                "recontract_event_id": event.pk,
                "subscription_id": event.subscription_id,
                "line_count": len(lines),
                "source_record_mutation": False,
                "execution_performed": False,
            },
        )
    return (
        ContractRecontractEvent.objects.select_related("old_product", "new_product")
        .prefetch_related("schedule_preview_lines")
        .get(pk=event.pk)
    )


def _values_for(amendment: ContractAmendment) -> dict:
    values = amendment.approved_values or amendment.requested_values or amendment.new_values or {}
    if not isinstance(values, dict):
        raise ValidationError({"detail": "Product recontract preview values must be a JSON object."})
    return values


def _target_product_id(values: dict) -> int:
    for key in _TARGET_PRODUCT_ID_KEYS:
        raw_value = values.get(key)
        if raw_value not in (None, ""):
            try:
                return int(raw_value)
            except (TypeError, ValueError):
                raise ValidationError({"detail": f"{key} must be a valid product id."})
    raise ValidationError({"detail": "Product recontract preview requires approved_product_id or target_product_id."})


def _product_payload(product: Product | None, prefix: str) -> dict:
    return {
        f"{prefix}_product_id": product.pk if product else None,
        f"{prefix}_product_name": product.name if product else "",
        f"{prefix}_product_code": product.product_code if product else "",
    }


def _impact_type(price_difference: Decimal) -> str:
    if price_difference > MONEY_ZERO:
        return "UPGRADE_EXTRA_PAYABLE"
    if price_difference < MONEY_ZERO:
        return "DOWNGRADE_CREDIT_REQUIRED"
    return "SAME_PRICE_REFERENCE_CORRECTION"


def _preview_tenure(values: dict, current_tenure: int, explicit_tenure_months: int | None = None) -> int:
    raw = explicit_tenure_months or values.get("preview_tenure_months") or values.get("proposed_tenure_months")
    if raw in (None, ""):
        return int(current_tenure)
    try:
        tenure = int(raw)
    except (TypeError, ValueError):
        raise ValidationError({"detail": "Preview tenure must be a valid positive integer."})
    if tenure <= 0:
        raise ValidationError({"detail": "Preview tenure must be greater than zero."})
    return tenure


def preview_product_recontract(*, amendment: ContractAmendment, preview_tenure_months: int | None = None, effective_date=None) -> dict:
    if amendment.amendment_type != "PRODUCT_CHANGE":
        raise ValidationError({"detail": "Product recontract preview is supported only for PRODUCT_CHANGE amendments."})
    if amendment.status not in _PREVIEW_ALLOWED_STATUSES:
        raise ValidationError({"detail": "Product recontract preview requires REQUESTED, UNDER_REVIEW, or APPROVED status."})
    if _event_is_executed(_latest_event(amendment)):
        return {
            "preview_status": "BLOCKED",
            "impact_type": "EXECUTED",
            "blocked_reason": _POST_EXECUTION_BLOCKED_MESSAGE,
            "warnings": [_POST_EXECUTION_BLOCKED_MESSAGE],
            "source_record_mutation": False,
        }

    values = _values_for(amendment)
    target_product_id = _target_product_id(values)

    source = amendment.source_contract()
    if not source:
        raise ValidationError({"detail": "Source subscription is required for product recontract preview."})

    source = Subscription.objects.select_related("product", "batch", "lucky_id", "customer", "partner").get(pk=source.pk)

    try:
        target_product = Product.objects.get(pk=target_product_id)
    except Product.DoesNotExist:
        raise ValidationError({"detail": "Target product does not exist."})

    old_contract_total = _q2(source.total_amount)
    new_contract_total = _q2(target_product.base_price)
    price_difference = _q2(new_contract_total - old_contract_total)

    try:
        amount_already_paid = _q2(source.total_paid())
    except Exception as exc:
        return {
            "preview_status": "BLOCKED",
            "impact_type": "UNKNOWN",
            "blocked_reason": f"Payment truth is not safely computable: {exc}",
            "warnings": _PREVIEW_WARNINGS,
            "source_record_mutation": False,
        }

    current_tenure = int(source.tenure_months)
    proposed_tenure = _preview_tenure(values, current_tenure, preview_tenure_months)
    old_remaining_balance = _q2(max(old_contract_total - amount_already_paid - _q2(source.waived_amount), MONEY_ZERO))
    proposed_new_remaining_balance = _q2(max(new_contract_total - amount_already_paid - _q2(source.waived_amount), MONEY_ZERO))
    proposed_monthly_amount = _q2(new_contract_total / Decimal(proposed_tenure))
    pending_emi_count = source.emis.filter(status=EmiStatus.PENDING).count()

    preview_effective_date = effective_date or values.get("effective_date") or values.get("preview_effective_date") or timezone.localdate()
    if hasattr(preview_effective_date, "isoformat"):
        preview_effective_date = preview_effective_date.isoformat()

    return {
        "preview_status": "READY",
        "impact_type": _impact_type(price_difference),
        "blocked_reason": "",
        "source_record_mutation": False,
        **_product_payload(source.product, "old"),
        **_product_payload(target_product, "new"),
        "subscription_id": source.pk,
        "subscription_number": source.subscription_number,
        "old_contract_total": _money(old_contract_total),
        "new_contract_total": _money(new_contract_total),
        "price_difference": _money(price_difference),
        "amount_already_paid": _money(amount_already_paid),
        "old_remaining_balance": _money(old_remaining_balance),
        "proposed_new_remaining_balance": _money(proposed_new_remaining_balance),
        "current_tenure_months": current_tenure,
        "preview_tenure_months": proposed_tenure,
        "current_monthly_amount": _money(source.monthly_amount),
        "proposed_monthly_amount": _money(proposed_monthly_amount),
        "pending_emi_count": pending_emi_count,
        "effective_date_preview": preview_effective_date,
        "warnings": _PREVIEW_WARNINGS,
    }


def create_product_recontract_preview_snapshot(
    *,
    amendment: ContractAmendment,
    requested_by=None,
    preview_tenure_months: int | None = None,
    effective_date=None,
) -> ContractRecontractEvent:
    """Persist one backend-calculated product recontract preview as audit evidence only."""
    with transaction.atomic():
        locked_amendment = ContractAmendment.objects.select_for_update().get(pk=amendment.pk)
        _assert_not_executed_for_amendment(locked_amendment)
        preview = preview_product_recontract(
            amendment=locked_amendment,
            preview_tenure_months=preview_tenure_months,
            effective_date=effective_date,
        )
        if preview.get("preview_status") != "READY":
            raise ValidationError({"detail": preview.get("blocked_reason") or "Product recontract preview is blocked."})

        source = locked_amendment.source_contract()
        if not source:
            raise ValidationError({"detail": "Source subscription is required for product recontract preview persistence."})

        ContractRecontractEvent.objects.select_for_update().filter(
            amendment=locked_amendment,
            status=ContractRecontractEvent.Status.PREVIEWED,
        ).update(status=ContractRecontractEvent.Status.SUPERSEDED, updated_at=timezone.now())

        event = ContractRecontractEvent.objects.create(
            amendment=locked_amendment,
            subscription=source,
            old_product_id=preview.get("old_product_id"),
            new_product_id=preview.get("new_product_id"),
            old_contract_total=_q2(preview.get("old_contract_total")),
            new_contract_total=_q2(preview.get("new_contract_total")),
            price_difference=_q2(preview.get("price_difference")),
            amount_already_paid=_q2(preview.get("amount_already_paid")),
            old_remaining_balance=_q2(preview.get("old_remaining_balance")),
            new_remaining_balance=_q2(preview.get("proposed_new_remaining_balance")),
            current_tenure_months=int(preview.get("current_tenure_months") or 0),
            preview_tenure_months=int(preview.get("preview_tenure_months") or 0),
            current_monthly_amount=_q2(preview.get("current_monthly_amount")),
            proposed_monthly_amount=_q2(preview.get("proposed_monthly_amount")),
            pending_emi_count=int(preview.get("pending_emi_count") or 0),
            impact_type=preview.get("impact_type") or ContractRecontractEvent.ImpactType.SAME_PRICE_REFERENCE_CORRECTION,
            effective_date_preview=_date(preview.get("effective_date_preview")),
            preview_snapshot=preview,
            warnings=preview.get("warnings") or [],
            blocked_reason=preview.get("blocked_reason") or "",
            source_record_mutation=False,
            created_by=requested_by,
            metadata={
                "phase": "PHASE_6A_PREVIEW_SNAPSHOT_ONLY",
                "source": "product_recontract_preview_service",
                "source_record_mutation": False,
            },
        )

        metadata = locked_amendment.metadata or {}
        metadata["latest_product_recontract_event_id"] = event.pk
        metadata["latest_product_recontract_event_status"] = event.status
        metadata["latest_product_recontract_event_created_at"] = event.created_at.isoformat()
        locked_amendment.metadata = metadata
        locked_amendment.save(update_fields=["metadata", "updated_at"])

        log_audit(
            action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_APPROVED,
            instance=locked_amendment,
            performed_by=requested_by,
            metadata={
                "event": "CONTRACT_RECONTRACT_PREVIEW_CREATED",
                "phase": "PHASE_6A_PREVIEW_SNAPSHOT_ONLY",
                "amendment_id": locked_amendment.pk,
                "recontract_event_id": event.pk,
                "subscription_id": source.pk,
                "impact_type": event.impact_type,
                "source_record_mutation": False,
            },
        )
        return event


def record_product_recontract_customer_consent(
    *,
    amendment: ContractAmendment,
    customer_user,
    decision: str,
    note: str = "",
) -> ContractRecontractEvent:
    """Record customer consent/rejection against the latest saved preview only."""
    decision = (decision or "").strip().upper()
    if decision not in {
        ContractRecontractEvent.CustomerConsentStatus.ACCEPTED,
        ContractRecontractEvent.CustomerConsentStatus.REJECTED,
    }:
        raise ValidationError({"decision": "Decision must be ACCEPTED or REJECTED."})

    customer = getattr(customer_user, "customer_profile", None)
    if not customer:
        raise ValidationError({"detail": "Customer profile not found."})
    if amendment.customer_id != customer.id:
        raise ValidationError({"detail": "You can consent only to your own amendment."})

    with transaction.atomic():
        locked_amendment = ContractAmendment.objects.select_for_update().get(pk=amendment.pk)
        if locked_amendment.customer_id != customer.id:
            raise ValidationError({"detail": "You can consent only to your own amendment."})

        event = _latest_event(locked_amendment, lock=True)
        if not event:
            raise ValidationError({"detail": "No saved product recontract preview exists for this amendment."})
        if _event_is_executed(event):
            raise ValidationError({"detail": _POST_EXECUTION_BLOCKED_MESSAGE})
        if event.status != ContractRecontractEvent.Status.PREVIEWED:
            raise ValidationError({"detail": "Customer consent requires the latest saved preview to be active and PREVIEWED."})
        if event.customer_consent_status != ContractRecontractEvent.CustomerConsentStatus.PENDING:
            raise ValidationError({"detail": "Customer consent has already been recorded for this preview."})

        consented_at = timezone.now()
        snapshot = _event_preview_summary(event) or {}
        snapshot.update(
            {
                "decision": decision,
                "note": note or "",
                "consented_by": customer_user.pk,
                "consented_at": consented_at.isoformat(),
                "phase": "PHASE_6B_CUSTOMER_CONSENT_ONLY",
                "source_record_mutation": False,
            }
        )

        event.customer_consent_status = decision
        event.customer_consented_by = customer_user
        event.customer_consented_at = consented_at
        event.customer_consent_note = note or ""
        event.customer_consent_snapshot = snapshot
        metadata = event.metadata or {}
        metadata["customer_consent_status"] = decision
        metadata["customer_consent_recorded_at"] = event.customer_consented_at.isoformat()
        metadata["phase"] = "PHASE_6B_CUSTOMER_CONSENT_ONLY"
        metadata["source_record_mutation"] = False
        event.metadata = metadata
        event.save(
            update_fields=[
                "customer_consent_status",
                "customer_consented_by",
                "customer_consented_at",
                "customer_consent_note",
                "customer_consent_snapshot",
                "metadata",
                "updated_at",
            ]
        )

        log_audit(
            action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_APPROVED,
            instance=locked_amendment,
            performed_by=customer_user,
            metadata={
                "event": "CONTRACT_RECONTRACT_CUSTOMER_CONSENT_RECORDED",
                "phase": "PHASE_6B_CUSTOMER_CONSENT_ONLY",
                "amendment_id": locked_amendment.pk,
                "recontract_event_id": event.pk,
                "subscription_id": event.subscription_id,
                "decision": decision,
                "source_record_mutation": False,
            },
        )
        return event


def record_product_recontract_admin_approval(
    *,
    amendment: ContractAmendment,
    admin_user,
    decision: str,
    note: str = "",
) -> ContractRecontractEvent:
    """Record admin approval/rejection against a customer-accepted preview only."""
    decision = (decision or "").strip().upper()
    if decision not in {
        ContractRecontractEvent.AdminApprovalStatus.APPROVED,
        ContractRecontractEvent.AdminApprovalStatus.REJECTED,
    }:
        raise ValidationError({"decision": "Decision must be APPROVED or REJECTED."})

    with transaction.atomic():
        locked_amendment = ContractAmendment.objects.select_for_update().get(pk=amendment.pk)
        event = _latest_event(locked_amendment, lock=True)
        if not event:
            raise ValidationError({"detail": "No saved product recontract preview exists for this amendment."})
        if _event_is_executed(event):
            raise ValidationError({"detail": _POST_EXECUTION_BLOCKED_MESSAGE})
        if event.status != ContractRecontractEvent.Status.PREVIEWED:
            raise ValidationError({"detail": "Admin approval requires the latest saved preview to be active and PREVIEWED."})
        if not event.preview_snapshot:
            raise ValidationError({"detail": "Admin approval requires a saved backend preview snapshot."})
        if event.customer_consent_status == ContractRecontractEvent.CustomerConsentStatus.PENDING:
            raise ValidationError({"detail": "Admin approval requires customer ACCEPTED consent first."})
        if event.customer_consent_status == ContractRecontractEvent.CustomerConsentStatus.REJECTED:
            raise ValidationError({"detail": "Admin approval is blocked because the customer rejected this preview."})
        if event.customer_consent_status != ContractRecontractEvent.CustomerConsentStatus.ACCEPTED:
            raise ValidationError({"detail": "Admin approval requires customer ACCEPTED consent first."})
        if event.admin_approval_status != ContractRecontractEvent.AdminApprovalStatus.PENDING:
            raise ValidationError({"detail": "Admin approval decision has already been recorded for this preview."})

        approved_at = timezone.now()
        snapshot = _event_preview_summary(event) or {}
        snapshot.update(
            {
                "decision": decision,
                "note": note or "",
                "approved_by": admin_user.pk,
                "approved_at": approved_at.isoformat(),
                "phase": "PHASE_6C_ADMIN_APPROVAL_DECISION_ONLY",
                "source_record_mutation": False,
                "execution_performed": False,
            }
        )

        event.admin_approval_status = decision
        event.admin_approved_by = admin_user
        event.admin_approved_at = approved_at
        event.admin_approval_note = note or ""
        event.admin_approval_snapshot = snapshot
        metadata = event.metadata or {}
        metadata["admin_approval_status"] = decision
        metadata["admin_approval_recorded_at"] = event.admin_approved_at.isoformat()
        metadata["phase"] = "PHASE_6C_ADMIN_APPROVAL_DECISION_ONLY"
        metadata["source_record_mutation"] = False
        metadata["execution_performed"] = False
        event.metadata = metadata
        event.save(
            update_fields=[
                "admin_approval_status",
                "admin_approved_by",
                "admin_approved_at",
                "admin_approval_note",
                "admin_approval_snapshot",
                "metadata",
                "updated_at",
            ]
        )

        log_audit(
            action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_APPROVED,
            instance=locked_amendment,
            performed_by=admin_user,
            metadata={
                "event": "CONTRACT_RECONTRACT_ADMIN_DECISION_RECORDED",
                "phase": "PHASE_6C_ADMIN_APPROVAL_DECISION_ONLY",
                "amendment_id": locked_amendment.pk,
                "recontract_event_id": event.pk,
                "subscription_id": event.subscription_id,
                "decision": decision,
                "source_record_mutation": False,
                "execution_performed": False,
            },
        )
        return event


def create_product_recontract_financial_impact_preview(
    *,
    amendment: ContractAmendment,
    requested_by=None,
) -> ContractRecontractFinancialImpactPreview:
    with transaction.atomic():
        locked_amendment = ContractAmendment.objects.select_for_update().get(pk=amendment.pk)
        event = (
            ContractRecontractEvent.objects.select_for_update()
            .prefetch_related("schedule_preview_lines")
            .filter(amendment=locked_amendment)
            .order_by("-created_at", "-id")
            .first()
        )
        if not event:
            raise ValidationError({"detail": "No saved product recontract preview exists for this amendment."})
        if _event_is_executed(event):
            raise ValidationError({"detail": _POST_EXECUTION_BLOCKED_MESSAGE})
        if event.status != ContractRecontractEvent.Status.PREVIEWED:
            raise ValidationError({"detail": "Financial impact preview requires latest recontract event status PREVIEWED."})
        if event.customer_consent_status != ContractRecontractEvent.CustomerConsentStatus.ACCEPTED:
            raise ValidationError({"detail": "Financial impact preview requires customer consent status ACCEPTED."})
        if event.admin_approval_status != ContractRecontractEvent.AdminApprovalStatus.APPROVED:
            raise ValidationError({"detail": "Financial impact preview requires admin approval status APPROVED."})
        schedule_lines = list(
            event.schedule_preview_lines.filter(proposed_status=ContractRecontractScheduleLine.ProposedStatus.PREVIEW_ONLY).order_by(
                "line_no", "id"
            )
        )
        if not schedule_lines:
            raise ValidationError({"detail": "Financial impact preview requires generated schedule preview lines."})

        now = timezone.now()
        ContractRecontractFinancialImpactPreview.objects.select_for_update().filter(
            event=event,
            accounting_preview_status=ContractRecontractFinancialImpactPreview.PreviewStatus.PREVIEWED,
        ).update(accounting_preview_status=ContractRecontractFinancialImpactPreview.PreviewStatus.SUPERSEDED, updated_at=now)
        ContractRecontractFinancialImpactPreview.objects.select_for_update().filter(
            event=event,
            reconciliation_preview_status=ContractRecontractFinancialImpactPreview.PreviewStatus.PREVIEWED,
        ).update(reconciliation_preview_status=ContractRecontractFinancialImpactPreview.PreviewStatus.SUPERSEDED, updated_at=now)

        impact_type = event.impact_type
        price_difference = _q2(event.price_difference)
        projected_future_emi_total = _q2(sum((line.proposed_amount for line in schedule_lines), MONEY_ZERO))
        warnings = [
            "Preview evidence only. No source records are mutated.",
            "No journal entries are posted from this preview.",
            "No reconciliation items or settlements are created from this preview.",
        ]
        blocked_reason = ""
        accounting_status = ContractRecontractFinancialImpactPreview.PreviewStatus.PREVIEWED
        reconciliation_status = ContractRecontractFinancialImpactPreview.PreviewStatus.PREVIEWED
        additional_receivable_amount = MONEY_ZERO
        credit_or_reduction_amount = MONEY_ZERO
        projected_customer_balance = _q2(event.new_remaining_balance)

        journal_lines = []
        reconciliation_rows = []
        if impact_type == ContractRecontractEvent.ImpactType.UPGRADE_EXTRA_PAYABLE:
            additional_receivable_amount = _q2(price_difference)
            journal_lines = [
                {"line_no": 1, "entry_side": "DR", "label": "Customer Receivable / Contract Receivable", "amount": _money(additional_receivable_amount)},
                {"line_no": 2, "entry_side": "CR", "label": "Product Recontract Revenue Adjustment / Contract Increase", "amount": _money(additional_receivable_amount)},
            ]
            reconciliation_rows = [
                {"reference_type": "CONTRACT_RECONTRACT_EVENT", "reference_id": event.id, "adjustment_type": "RECEIVABLE_INCREASE_PREVIEW", "amount": _money(additional_receivable_amount), "status": "PREVIEWED"}
            ]
        elif impact_type == ContractRecontractEvent.ImpactType.DOWNGRADE_CREDIT_REQUIRED:
            credit_or_reduction_amount = _q2(abs(price_difference))
            projected_customer_balance = _q2(max(event.new_remaining_balance, MONEY_ZERO))
            journal_lines = [
                {"line_no": 1, "entry_side": "DR", "label": "Product Recontract Revenue Adjustment / Contract Decrease", "amount": _money(credit_or_reduction_amount)},
                {"line_no": 2, "entry_side": "CR", "label": "Customer Credit / Receivable Reduction / Refund Required", "amount": _money(credit_or_reduction_amount)},
            ]
            reconciliation_rows = [
                {"reference_type": "CONTRACT_RECONTRACT_EVENT", "reference_id": event.id, "adjustment_type": "CUSTOMER_CREDIT_PREVIEW", "amount": _money(credit_or_reduction_amount), "status": "PREVIEWED"}
            ]
        elif impact_type == ContractRecontractEvent.ImpactType.SAME_PRICE_REFERENCE_CORRECTION:
            reconciliation_rows = [
                {"reference_type": "CONTRACT_RECONTRACT_EVENT", "reference_id": event.id, "adjustment_type": "NO_MONETARY_RECONCILIATION_REQUIRED", "amount": _money(MONEY_ZERO), "status": "PREVIEWED"}
            ]
        else:
            blocked_reason = "Financial impact preview blocked: unsupported impact type for accounting mapping."
            accounting_status = ContractRecontractFinancialImpactPreview.PreviewStatus.BLOCKED
            reconciliation_status = ContractRecontractFinancialImpactPreview.PreviewStatus.BLOCKED
            warnings.append(blocked_reason)

        preview = ContractRecontractFinancialImpactPreview.objects.create(
            event=event,
            impact_type=impact_type,
            accounting_preview_status=accounting_status,
            reconciliation_preview_status=reconciliation_status,
            price_difference=price_difference,
            additional_receivable_amount=_q2(additional_receivable_amount),
            credit_or_reduction_amount=_q2(credit_or_reduction_amount),
            projected_customer_balance=projected_customer_balance,
            projected_future_emi_total=projected_future_emi_total,
            journal_preview={
                "preview_only": True,
                "posting_performed": False,
                "lines": journal_lines,
            },
            reconciliation_preview={
                "preview_only": True,
                "items_created": False,
                "rows": reconciliation_rows,
            },
            warnings=warnings,
            blocked_reason=blocked_reason or None,
            source_record_mutation=False,
            created_by=requested_by,
            metadata={
                "phase": "PHASE_6E_FINANCIAL_IMPACT_PREVIEW_ONLY",
                "event": "CONTRACT_RECONTRACT_FINANCIAL_IMPACT_PREVIEW_CREATED",
                "source_record_mutation": False,
                "journal_posted": False,
                "reconciliation_created": False,
                "schedule_preview_line_count": len(schedule_lines),
            },
        )
        log_audit(
            action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_APPROVED,
            instance=locked_amendment,
            performed_by=requested_by,
            metadata={
                "event": "CONTRACT_RECONTRACT_FINANCIAL_IMPACT_PREVIEW_CREATED",
                "phase": "PHASE_6E_FINANCIAL_IMPACT_PREVIEW_ONLY",
                "amendment_id": locked_amendment.pk,
                "recontract_event_id": event.pk,
                "financial_impact_preview_id": preview.pk,
                "source_record_mutation": False,
                "journal_posted": False,
                "reconciliation_created": False,
            },
        )
        return preview
