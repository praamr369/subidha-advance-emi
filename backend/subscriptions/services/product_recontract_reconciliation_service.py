from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Max, Sum
from django.utils import timezone

from accounting.models import AccountingBridgePosting, JournalEntryStatus, MONEY_ZERO as ACCOUNTING_MONEY_ZERO
from reconciliation.models import (
    FinancialSourceLifecycleEvent,
    ReconciliationEvidence,
    ReconciliationItem,
    ReconciliationItemStatus,
    ReconciliationRun,
    ReconciliationRunStatus,
    ReconciliationSeverity,
)
from reconciliation.services.financial_source_lifecycle_event_service import create_lifecycle_event
from subscriptions.models import (
    AuditLog,
    ContractRecontractEvent,
    ContractRecontractFinancialImpactPreview,
    ContractRecontractScheduleLine,
    MONEY_ZERO,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.services.product_recontract_accounting_service import POSTING_PURPOSE
from subscriptions.services.reconciliation_service import reconcile_subscription

PHASE_6F3 = "PHASE_6F3_RECONCILIATION_BRIDGE_ONLY"
RECONCILIATION_MODULE = "PRODUCT_RECONTRACT_RECONCILIATION_BRIDGE"
RECONCILIATION_SCOPE = "PRODUCT_RECONTRACT_ADJUSTMENT"
RECONCILIATION_SOURCE_TYPE = "PRODUCT_RECONTRACT_ADJUSTMENT"
RECONCILIATION_EXCEPTION_CODE = "CONTRACT_RECONTRACT_RECONCILIATION_BRIDGE"
_POST_EXECUTION_BLOCKED_MESSAGE = "Product recontract has already been executed for this amendment. Further reconciliation bridge actions are read-only/blocked."


def _q2(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _money(value) -> str:
    return f"{_q2(value):.2f}"


def _event_is_executed(event: ContractRecontractEvent) -> bool:
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    return bool(metadata.get("execution_performed") is True or metadata.get("execution_status") == "EXECUTED")


def _latest_financial_preview(event: ContractRecontractEvent) -> ContractRecontractFinancialImpactPreview | None:
    return (
        ContractRecontractFinancialImpactPreview.objects.select_for_update()
        .filter(
            event=event,
            accounting_preview_status=ContractRecontractFinancialImpactPreview.PreviewStatus.PREVIEWED,
            reconciliation_preview_status=ContractRecontractFinancialImpactPreview.PreviewStatus.PREVIEWED,
        )
        .order_by("-created_at", "-id")
        .first()
    )


def _assert_schedule_preview_exists(event: ContractRecontractEvent) -> None:
    exists = event.schedule_preview_lines.filter(
        proposed_status=ContractRecontractScheduleLine.ProposedStatus.PREVIEW_ONLY
    ).exists()
    if not exists:
        raise ValidationError({"detail": "Reconciliation bridge requires generated product recontract schedule preview lines."})


def _expected_amount(*, event: ContractRecontractEvent, financial_preview: ContractRecontractFinancialImpactPreview) -> Decimal:
    if event.impact_type == ContractRecontractEvent.ImpactType.UPGRADE_EXTRA_PAYABLE:
        return _q2(financial_preview.additional_receivable_amount or event.price_difference)
    if event.impact_type == ContractRecontractEvent.ImpactType.DOWNGRADE_CREDIT_REQUIRED:
        return _q2(financial_preview.credit_or_reduction_amount or abs(_q2(event.price_difference)))
    if event.impact_type == ContractRecontractEvent.ImpactType.SAME_PRICE_REFERENCE_CORRECTION:
        raise ValidationError({"detail": "Same-price reference correction does not require recontract reconciliation bridge evidence."})
    raise ValidationError({"detail": "Unsupported product recontract impact type for reconciliation bridge."})


def _accounting_bridge_for_event(event: ContractRecontractEvent) -> AccountingBridgePosting | None:
    return (
        AccountingBridgePosting.objects.select_for_update()
        .select_related("journal_entry")
        .prefetch_related("journal_entry__lines")
        .filter(
            source_model="ContractRecontractEvent",
            source_id=str(event.pk),
            purpose=POSTING_PURPOSE,
        )
        .first()
    )


def _posted_journal_amount(bridge: AccountingBridgePosting) -> Decimal:
    journal = bridge.journal_entry
    if journal is None:
        raise ValidationError({"detail": "Accounting bridge posting is not linked to a journal entry."})
    if journal.status != JournalEntryStatus.POSTED:
        raise ValidationError({"detail": "Reconciliation bridge requires posted accounting journal evidence."})
    totals = journal.lines.aggregate(
        total_debit=Sum("debit_amount"),
        total_credit=Sum("credit_amount"),
    )
    total_debit = _q2(totals.get("total_debit") or ACCOUNTING_MONEY_ZERO)
    total_credit = _q2(totals.get("total_credit") or ACCOUNTING_MONEY_ZERO)
    if total_debit != total_credit:
        raise ValidationError({"detail": "Reconciliation bridge blocked: accounting journal debit/credit totals are not balanced."})
    if total_debit <= MONEY_ZERO:
        raise ValidationError({"detail": "Reconciliation bridge blocked: accounting journal amount must be positive."})
    return total_debit


def _existing_reconciliation_item(event: ContractRecontractEvent) -> ReconciliationItem | None:
    return (
        ReconciliationItem.objects.select_for_update()
        .filter(
            module=RECONCILIATION_MODULE,
            source_type=RECONCILIATION_SOURCE_TYPE,
            source_id=str(event.pk),
            exception_code=RECONCILIATION_EXCEPTION_CODE,
        )
        .order_by("-created_at", "-id")
        .first()
    )


def _duplicate_reconciliation_error(item: ReconciliationItem) -> ValidationError:
    return ValidationError(
        {
            "detail": "Product recontract reconciliation bridge evidence already exists for this event.",
            "reconciliation_record_id": item.id,
            "reconciliation_item_id": item.id,
        }
    )


def _next_run_no() -> int:
    return (ReconciliationRun.objects.aggregate(mx=Max("run_no"))["mx"] or 0) + 1


def _content_type_for(instance):
    return ContentType.objects.get_for_model(instance.__class__)


def _create_evidence(*, item: ReconciliationItem, evidence_type: str, instance, label: str, amount=None, status: str | None = None, metadata: dict | None = None):
    return ReconciliationEvidence.objects.create(
        item=item,
        evidence_type=evidence_type,
        content_type=_content_type_for(instance),
        object_id=str(instance.pk),
        label=label,
        amount=_q2(amount) if amount is not None else None,
        status=status,
        metadata=metadata or {},
    )


@transaction.atomic
def execute_product_recontract_reconciliation(
    *,
    event: ContractRecontractEvent,
    financial_preview: ContractRecontractFinancialImpactPreview | None = None,
    requested_by=None,
    performed_by=None,
) -> dict:
    """
    Create durable reconciliation/lifecycle evidence for a product recontract adjustment only.

    Phase 6F.3 intentionally does not execute the recontract and does not mutate source
    subscription, EMI, payment, receipt, settlement/day-close, finance account, inventory,
    delivery, commission, payout, waiver, lucky draw, lucky ID, batch, rent/lease demand,
    or deposit rows.
    """

    actor = requested_by or performed_by
    if actor is None or not getattr(actor, "pk", None):
        raise ValidationError({"detail": "Reconciliation bridge requires an authenticated admin actor."})

    locked_event = (
        ContractRecontractEvent.objects.select_for_update()
        .select_related("amendment", "subscription", "old_product", "new_product")
        .prefetch_related("schedule_preview_lines")
        .get(pk=event.pk)
    )

    if _event_is_executed(locked_event):
        raise ValidationError({"detail": _POST_EXECUTION_BLOCKED_MESSAGE})
    if locked_event.status != ContractRecontractEvent.Status.PREVIEWED:
        raise ValidationError({"detail": "Reconciliation bridge requires latest recontract event status PREVIEWED."})
    if locked_event.customer_consent_status != ContractRecontractEvent.CustomerConsentStatus.ACCEPTED:
        raise ValidationError({"detail": "Reconciliation bridge requires customer consent status ACCEPTED."})
    if locked_event.admin_approval_status != ContractRecontractEvent.AdminApprovalStatus.APPROVED:
        raise ValidationError({"detail": "Reconciliation bridge requires admin approval status APPROVED."})

    _assert_schedule_preview_exists(locked_event)

    if financial_preview is not None:
        financial_preview = ContractRecontractFinancialImpactPreview.objects.select_for_update().get(pk=financial_preview.pk)
        if financial_preview.event_id != locked_event.id:
            raise ValidationError({"detail": "Financial impact preview does not belong to this recontract event."})
        if (
            financial_preview.accounting_preview_status != ContractRecontractFinancialImpactPreview.PreviewStatus.PREVIEWED
            or financial_preview.reconciliation_preview_status != ContractRecontractFinancialImpactPreview.PreviewStatus.PREVIEWED
        ):
            raise ValidationError({"detail": "Reconciliation bridge requires PREVIEWED financial impact preview statuses."})
    else:
        financial_preview = _latest_financial_preview(locked_event)

    if financial_preview is None:
        raise ValidationError({"detail": "Reconciliation bridge requires financial impact preview evidence."})
    if financial_preview.blocked_reason:
        raise ValidationError({"detail": f"Reconciliation bridge blocked: {financial_preview.blocked_reason}"})

    existing_item = _existing_reconciliation_item(locked_event)
    if existing_item is not None:
        raise _duplicate_reconciliation_error(existing_item)

    bridge = _accounting_bridge_for_event(locked_event)
    if bridge is None:
        raise ValidationError({"detail": "Reconciliation bridge requires posted accounting bridge evidence first."})

    expected_amount = _expected_amount(event=locked_event, financial_preview=financial_preview)
    posted_amount = _posted_journal_amount(bridge)
    variance_amount = _q2(posted_amount - expected_amount)
    if variance_amount != MONEY_ZERO:
        raise ValidationError(
            {
                "detail": "Reconciliation bridge blocked: expected amount does not match posted accounting amount.",
                "expected_amount": _money(expected_amount),
                "posted_amount": _money(posted_amount),
                "variance_amount": _money(variance_amount),
            }
        )

    now = timezone.now()
    run = ReconciliationRun.objects.create(
        run_no=_next_run_no(),
        scope=RECONCILIATION_SCOPE,
        module=RECONCILIATION_MODULE,
        branch=getattr(locked_event.subscription, "branch", None),
        date_from=locked_event.effective_date_preview,
        date_to=locked_event.effective_date_preview,
        status=ReconciliationRunStatus.COMPLETED,
        started_by=actor,
        started_at=now,
        finished_at=now,
        total_checked=1,
        total_matched=1,
        total_exceptions=0,
        high_risk_count=0,
        metadata={
            "phase": PHASE_6F3,
            "event": "CONTRACT_RECONTRACT_RECONCILIATION_QUEUED",
            "recontract_event_id": locked_event.id,
            "amendment_id": locked_event.amendment_id,
            "subscription_id": locked_event.subscription_id,
            "financial_impact_preview_id": financial_preview.id,
            "accounting_bridge_posting_id": bridge.id,
            "journal_entry_id": bridge.journal_entry_id,
            "expected_amount": _money(expected_amount),
            "posted_amount": _money(posted_amount),
            "variance_amount": _money(variance_amount),
            "source_record_mutation": False,
            "execution_performed": False,
            "payment_created": False,
            "receipt_created": False,
            "settlement_created": False,
            "day_close_created": False,
        },
    )

    lifecycle_event = create_lifecycle_event(
        source_type=FinancialSourceLifecycleEvent.SourceType.OTHER,
        source_id=locked_event.id,
        event_type=FinancialSourceLifecycleEvent.EventType.ADJUSTED,
        event_status=FinancialSourceLifecycleEvent.EventStatus.ACTIVE,
        reason="Product recontract adjustment reconciliation bridge evidence.",
        amount=expected_amount,
        created_by=actor,
        related_journal=bridge.journal_entry,
        metadata={
            "phase": PHASE_6F3,
            "logical_source_type": RECONCILIATION_SOURCE_TYPE,
            "recontract_event_id": locked_event.id,
            "amendment_id": locked_event.amendment_id,
            "subscription_id": locked_event.subscription_id,
            "financial_impact_preview_id": financial_preview.id,
            "accounting_bridge_posting_id": bridge.id,
            "journal_entry_id": bridge.journal_entry_id,
            "expected_amount": _money(expected_amount),
            "posted_amount": _money(posted_amount),
            "variance_amount": _money(variance_amount),
            "source_record_mutation": False,
            "execution_performed": False,
        },
    )

    item = ReconciliationItem.objects.create(
        run=run,
        module=RECONCILIATION_MODULE,
        source_type=RECONCILIATION_SOURCE_TYPE,
        source_id=str(locked_event.id),
        source_label=f"Product recontract adjustment event {locked_event.id}",
        expected_amount=expected_amount,
        actual_amount=posted_amount,
        amount_delta=variance_amount,
        severity=ReconciliationSeverity.LOW,
        status=ReconciliationItemStatus.MATCHED,
        exception_code=RECONCILIATION_EXCEPTION_CODE,
        exception_message="Product recontract adjustment linked to financial preview, accounting bridge, posted journal, and lifecycle event.",
        recommended_action="Evidence-only bridge. Do not treat as cash settlement or final recontract execution.",
        metadata={
            "phase": PHASE_6F3,
            "reconciliation_status": "LINKED",
            "recontract_event_id": locked_event.id,
            "amendment_id": locked_event.amendment_id,
            "subscription_id": locked_event.subscription_id,
            "financial_impact_preview_id": financial_preview.id,
            "accounting_bridge_posting_id": bridge.id,
            "journal_entry_id": bridge.journal_entry_id,
            "lifecycle_event_id": lifecycle_event.id,
            "source_record_mutation": False,
            "execution_performed": False,
            "payment_created": False,
            "receipt_created": False,
            "settlement_created": False,
            "day_close_created": False,
        },
    )

    _create_evidence(
        item=item,
        evidence_type="ContractRecontractEvent",
        instance=locked_event,
        label=f"Recontract event {locked_event.id}",
        amount=expected_amount,
        status=locked_event.status,
        metadata={"impact_type": locked_event.impact_type},
    )
    _create_evidence(
        item=item,
        evidence_type="ContractRecontractFinancialImpactPreview",
        instance=financial_preview,
        label=f"Financial impact preview {financial_preview.id}",
        amount=expected_amount,
        status=financial_preview.reconciliation_preview_status,
        metadata={"impact_type": financial_preview.impact_type},
    )
    _create_evidence(
        item=item,
        evidence_type="AccountingBridgePosting",
        instance=bridge,
        label=str(bridge),
        amount=posted_amount,
        status="POSTED",
        metadata={"purpose": bridge.purpose, "source_reference": bridge.source_reference},
    )
    _create_evidence(
        item=item,
        evidence_type="JournalEntry",
        instance=bridge.journal_entry,
        label=bridge.journal_entry.entry_no,
        amount=posted_amount,
        status=bridge.journal_entry.status,
        metadata={"entry_date": str(bridge.journal_entry.entry_date), "voucher_type": bridge.journal_entry.voucher_type},
    )
    _create_evidence(
        item=item,
        evidence_type="FinancialSourceLifecycleEvent",
        instance=lifecycle_event,
        label=lifecycle_event.event_no,
        amount=expected_amount,
        status=lifecycle_event.event_status,
        metadata={"event_type": lifecycle_event.event_type, "logical_source_type": RECONCILIATION_SOURCE_TYPE},
    )

    subscription_snapshot = reconcile_subscription(locked_event.subscription)

    event_metadata = locked_event.metadata or {}
    event_metadata.update(
        {
            "phase": PHASE_6F3,
            "reconciliation_bridge_status": "LINKED",
            "reconciliation_record_id": item.id,
            "reconciliation_item_id": item.id,
            "reconciliation_run_id": run.id,
            "lifecycle_event_id": lifecycle_event.id,
            "reconciliation_bridge_created_at": now.isoformat(),
            "reconciliation_expected_amount": _money(expected_amount),
            "reconciliation_posted_amount": _money(posted_amount),
            "reconciliation_variance_amount": _money(variance_amount),
            "source_record_mutation": False,
            "execution_performed": False,
            "payment_created": False,
            "receipt_created": False,
            "settlement_created": False,
            "day_close_created": False,
        }
    )
    locked_event.metadata = event_metadata
    locked_event.save(update_fields=["metadata", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_APPROVED,
        instance=locked_event.amendment,
        performed_by=actor,
        metadata={
            "event": "CONTRACT_RECONTRACT_RECONCILIATION_QUEUED",
            "phase": PHASE_6F3,
            "amendment_id": locked_event.amendment_id,
            "recontract_event_id": locked_event.id,
            "financial_impact_preview_id": financial_preview.id,
            "accounting_bridge_posting_id": bridge.id,
            "journal_entry_id": bridge.journal_entry_id,
            "reconciliation_run_id": run.id,
            "reconciliation_item_id": item.id,
            "lifecycle_event_id": lifecycle_event.id,
            "expected_amount": _money(expected_amount),
            "posted_amount": _money(posted_amount),
            "variance_amount": _money(variance_amount),
            "source_record_mutation": False,
            "execution_performed": False,
        },
    )

    return {
        "reconciliation_record_id": item.id,
        "reconciliation_item_id": item.id,
        "reconciliation_run_id": run.id,
        "lifecycle_event_id": lifecycle_event.id,
        "event_id": locked_event.id,
        "financial_impact_preview_id": financial_preview.id,
        "accounting_posting": {
            "id": bridge.id,
            "purpose": bridge.purpose,
            "source_reference": bridge.source_reference,
        },
        "journal_entry": {
            "id": bridge.journal_entry_id,
            "entry_no": bridge.journal_entry.entry_no,
            "status": bridge.journal_entry.status,
        },
        "expected_amount": _money(expected_amount),
        "posted_amount": _money(posted_amount),
        "variance_amount": _money(variance_amount),
        "reconciliation_status": "LINKED",
        "source_record_mutation": False,
        "execution_performed": False,
        "payment_created": False,
        "receipt_created": False,
        "settlement_created": False,
        "day_close_created": False,
        "subscription_reconciliation_snapshot": subscription_snapshot,
    }
