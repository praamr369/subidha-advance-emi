from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from accounting.models import AccountingBridgePosting, JournalEntryStatus, MONEY_ZERO as ACCOUNTING_MONEY_ZERO
from reconciliation.models import ReconciliationEvidence, ReconciliationItem, ReconciliationItemStatus
from subscriptions.models import (
    AuditLog,
    ContractAmendment,
    ContractRecontractEvent,
    ContractRecontractFinancialImpactPreview,
    ContractRecontractScheduleLine,
    Emi,
    EmiStatus,
    MONEY_ZERO,
    OperationalCancellation,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.services.product_recontract_accounting_service import POSTING_PURPOSE
from subscriptions.services.product_recontract_reconciliation_service import (
    RECONCILIATION_EXCEPTION_CODE,
    RECONCILIATION_MODULE,
    RECONCILIATION_SOURCE_TYPE,
)

PHASE_6F4 = "PHASE_6F4_PRODUCT_RECONTRACT_EXECUTION"
EXECUTION_EVENT = "CONTRACT_RECONTRACT_EXECUTED"
_EXECUTION_ALLOWED_AMENDMENT_STATUS = "APPROVED"
_TERMINAL_SUBSCRIPTION_STATUSES = {
    SubscriptionStatus.CANCELLED,
    SubscriptionStatus.CLOSED,
    SubscriptionStatus.COMPLETED,
    SubscriptionStatus.DEFAULTED,
    SubscriptionStatus.RETURNED,
}
_REQUIRED_RECONCILIATION_EVIDENCE_TYPES = {
    "ContractRecontractEvent",
    "ContractRecontractFinancialImpactPreview",
    "AccountingBridgePosting",
    "JournalEntry",
    "FinancialSourceLifecycleEvent",
}


def _q2(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _money(value) -> str:
    return f"{_q2(value):.2f}"


def _snapshot_emi(emi: Emi) -> dict:
    return {
        "id": emi.id,
        "month_no": emi.month_no,
        "due_date": emi.due_date.isoformat() if emi.due_date else None,
        "amount": _money(emi.amount),
        "status": emi.status,
    }


def _snapshot_subscription(subscription: Subscription) -> dict:
    return {
        "id": subscription.id,
        "product_id": subscription.product_id,
        "total_amount": _money(subscription.total_amount),
        "monthly_amount": _money(subscription.monthly_amount),
        "tenure_months": subscription.tenure_months,
        "status": subscription.status,
        "batch_id": subscription.batch_id,
        "lucky_id": subscription.lucky_id_id,
        "waived_amount": _money(subscription.waived_amount),
    }


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


def _expected_amount(*, event: ContractRecontractEvent, financial_preview: ContractRecontractFinancialImpactPreview) -> Decimal:
    if event.impact_type == ContractRecontractEvent.ImpactType.UPGRADE_EXTRA_PAYABLE:
        return _q2(financial_preview.additional_receivable_amount or event.price_difference)
    if event.impact_type == ContractRecontractEvent.ImpactType.DOWNGRADE_CREDIT_REQUIRED:
        return _q2(financial_preview.credit_or_reduction_amount or abs(_q2(event.price_difference)))
    raise ValidationError({"detail": "Final product recontract execution requires monetary accounting/reconciliation evidence."})


def _posted_journal_amount(bridge: AccountingBridgePosting) -> Decimal:
    journal = bridge.journal_entry
    if journal is None:
        raise ValidationError({"detail": "Execution requires accounting bridge posting linked to a journal entry."})
    if journal.status != JournalEntryStatus.POSTED:
        raise ValidationError({"detail": "Execution requires posted accounting journal evidence."})
    totals = journal.lines.aggregate(total_debit=Sum("debit_amount"), total_credit=Sum("credit_amount"))
    total_debit = _q2(totals.get("total_debit") or ACCOUNTING_MONEY_ZERO)
    total_credit = _q2(totals.get("total_credit") or ACCOUNTING_MONEY_ZERO)
    if total_debit != total_credit:
        raise ValidationError({"detail": "Execution blocked: accounting journal debit/credit totals are not balanced."})
    if total_debit <= MONEY_ZERO:
        raise ValidationError({"detail": "Execution blocked: accounting journal amount must be positive."})
    return total_debit


def _accounting_bridge_for_event(event: ContractRecontractEvent) -> AccountingBridgePosting | None:
    return (
        AccountingBridgePosting.objects.select_for_update()
        .select_related("journal_entry")
        .prefetch_related("journal_entry__lines")
        .filter(
            source_model="ContractRecontractEvent",
            source_id=str(event.id),
            purpose=POSTING_PURPOSE,
        )
        .first()
    )


def _reconciliation_item_for_event(event: ContractRecontractEvent) -> ReconciliationItem | None:
    return (
        ReconciliationItem.objects.select_for_update()
        .select_related("run")
        .filter(
            module=RECONCILIATION_MODULE,
            source_type=RECONCILIATION_SOURCE_TYPE,
            source_id=str(event.id),
            exception_code=RECONCILIATION_EXCEPTION_CODE,
        )
        .order_by("-created_at", "-id")
        .first()
    )


def _verify_reconciliation_evidence(
    *,
    event: ContractRecontractEvent,
    financial_preview: ContractRecontractFinancialImpactPreview,
    bridge: AccountingBridgePosting,
    expected_amount: Decimal,
) -> ReconciliationItem:
    item = _reconciliation_item_for_event(event)
    if item is None:
        raise ValidationError({"detail": "Execution requires durable reconciliation bridge evidence first."})
    if item.status != ReconciliationItemStatus.MATCHED:
        raise ValidationError({"detail": "Execution requires matched reconciliation bridge evidence."})
    metadata = item.metadata or {}
    if metadata.get("reconciliation_status") != "LINKED":
        raise ValidationError({"detail": "Execution requires LINKED reconciliation bridge evidence."})
    if int(metadata.get("financial_impact_preview_id") or 0) != financial_preview.id:
        raise ValidationError({"detail": "Execution blocked: reconciliation evidence does not link the latest financial impact preview."})
    if int(metadata.get("accounting_bridge_posting_id") or 0) != bridge.id:
        raise ValidationError({"detail": "Execution blocked: reconciliation evidence does not link the accounting bridge posting."})
    if int(metadata.get("journal_entry_id") or 0) != bridge.journal_entry_id:
        raise ValidationError({"detail": "Execution blocked: reconciliation evidence does not link the posted journal entry."})

    actual_amount = _q2(item.actual_amount)
    item_expected_amount = _q2(item.expected_amount)
    variance_amount = _q2(item.amount_delta)
    if item_expected_amount != expected_amount:
        raise ValidationError({"detail": "Execution blocked: reconciliation expected amount does not match financial impact amount."})
    if actual_amount != expected_amount:
        raise ValidationError({"detail": "Execution blocked: reconciliation actual amount does not match expected amount."})
    if variance_amount != MONEY_ZERO:
        raise ValidationError({"detail": "Execution blocked: reconciliation variance must be zero."})

    evidence_types = set(
        ReconciliationEvidence.objects.filter(item=item).values_list("evidence_type", flat=True)
    )
    missing = sorted(_REQUIRED_RECONCILIATION_EVIDENCE_TYPES - evidence_types)
    if missing:
        raise ValidationError({"detail": f"Execution blocked: reconciliation evidence is incomplete: {', '.join(missing)}."})
    return item


def _verify_operational_cancellation(subscription: Subscription) -> None:
    if OperationalCancellation.objects.select_for_update().filter(
        source_type=OperationalCancellation.SourceType.SUBSCRIPTION,
        source_id=subscription.id,
    ).exists():
        raise ValidationError({"detail": "Execution blocked: subscription has an operational cancellation record."})


def _assert_subscription_executable(subscription: Subscription) -> None:
    if subscription.status in _TERMINAL_SUBSCRIPTION_STATUSES:
        raise ValidationError({"detail": f"Execution blocked: subscription status {subscription.status} is terminal."})
    if subscription.plan_type != "EMI":
        raise ValidationError({"detail": "Product recontract execution is supported only for EMI subscriptions."})
    if not subscription.batch_id or not subscription.lucky_id_id:
        raise ValidationError({"detail": "Product recontract execution requires EMI batch and lucky ID mapping to remain intact."})


def _schedule_preview_lines(event: ContractRecontractEvent) -> list[ContractRecontractScheduleLine]:
    return list(
        ContractRecontractScheduleLine.objects.select_for_update()
        .select_related("original_emi")
        .filter(event=event, proposed_status=ContractRecontractScheduleLine.ProposedStatus.PREVIEW_ONLY)
        .order_by("line_no", "id")
    )


@transaction.atomic
def execute_product_recontract_event(*, amendment: ContractAmendment, executed_by=None) -> ContractRecontractEvent:
    """
    Execute product recontract source mutation after verifying the full evidence chain.

    Mutates only:
    - Subscription.product
    - Subscription.total_amount
    - Subscription.monthly_amount
    - Subscription.tenure_months
    - pending EMI amount/due_date from schedule preview lines
    - ContractRecontractEvent metadata execution snapshot

    It does not mutate payments, receipts, posted accounting, reconciliation, settlement/day-close,
    paid/waived/cancelled EMI rows, lucky ID, batch, waiver, draw, inventory, delivery,
    commission, payout, rent/lease demand, or deposit records.
    """
    if executed_by is None or not getattr(executed_by, "pk", None):
        raise ValidationError({"detail": "Product recontract execution requires an authenticated admin actor."})

    locked_amendment = ContractAmendment.objects.select_for_update().get(pk=amendment.pk)
    if locked_amendment.amendment_type != "PRODUCT_CHANGE":
        raise ValidationError({"detail": "Product recontract execution is supported only for PRODUCT_CHANGE amendments."})
    if locked_amendment.status != _EXECUTION_ALLOWED_AMENDMENT_STATUS:
        raise ValidationError({"detail": f"Cannot execute recontract for amendment status '{locked_amendment.status}'. Must be APPROVED."})

    event = (
        ContractRecontractEvent.objects.select_for_update()
        .select_related("amendment", "subscription", "old_product", "new_product")
        .prefetch_related("schedule_preview_lines")
        .filter(amendment=locked_amendment)
        .order_by("-created_at", "-id")
        .first()
    )
    if not event:
        raise ValidationError({"detail": "No recontract event exists for this amendment."})
    if event.status != ContractRecontractEvent.Status.PREVIEWED:
        raise ValidationError({"detail": "Execution requires latest recontract event status PREVIEWED."})
    if (event.metadata or {}).get("execution_status") == "EXECUTED":
        raise ValidationError({"detail": "This recontract event is already executed."})
    if event.customer_consent_status != ContractRecontractEvent.CustomerConsentStatus.ACCEPTED:
        raise ValidationError({"detail": "Execution requires customer consent ACCEPTED."})
    if event.admin_approval_status != ContractRecontractEvent.AdminApprovalStatus.APPROVED:
        raise ValidationError({"detail": "Execution requires admin approval APPROVED."})
    if not event.new_product_id:
        raise ValidationError({"detail": "Execution requires a target product on the recontract event."})

    financial_preview = _latest_financial_preview(event)
    if financial_preview is None:
        raise ValidationError({"detail": "Execution requires latest financial impact preview with accounting and reconciliation PREVIEWED status."})
    if financial_preview.blocked_reason:
        raise ValidationError({"detail": f"Execution blocked: {financial_preview.blocked_reason}"})

    bridge = _accounting_bridge_for_event(event)
    if bridge is None:
        raise ValidationError({"detail": "Execution requires durable accounting bridge posting evidence first."})
    expected_amount = _expected_amount(event=event, financial_preview=financial_preview)
    posted_amount = _posted_journal_amount(bridge)
    if posted_amount != expected_amount:
        raise ValidationError(
            {
                "detail": "Execution blocked: expected amount does not match posted accounting amount.",
                "expected_amount": _money(expected_amount),
                "posted_amount": _money(posted_amount),
                "variance_amount": _money(posted_amount - expected_amount),
            }
        )

    reconciliation_item = _verify_reconciliation_evidence(
        event=event,
        financial_preview=financial_preview,
        bridge=bridge,
        expected_amount=expected_amount,
    )

    subscription = Subscription.objects.select_for_update().select_related("product", "batch", "lucky_id").get(pk=event.subscription_id)
    _assert_subscription_executable(subscription)
    _verify_operational_cancellation(subscription)

    schedule_lines = _schedule_preview_lines(event)
    if not schedule_lines:
        raise ValidationError({"detail": "Execution requires schedule preview lines in PREVIEW_ONLY status."})

    pending_emis = list(
        Emi.objects.select_for_update()
        .filter(subscription_id=subscription.id, status=EmiStatus.PENDING)
        .order_by("month_no", "due_date", "id")
    )
    if len(pending_emis) != len(schedule_lines):
        raise ValidationError({"detail": "Execution blocked: pending EMI rows and schedule preview line count do not match."})

    schedule_by_emi_id = {line.original_emi_id: line for line in schedule_lines if line.original_emi_id}
    pending_ids = [emi.id for emi in pending_emis]
    if set(schedule_by_emi_id.keys()) != set(pending_ids):
        raise ValidationError({"detail": "Execution blocked: schedule preview mapping no longer matches pending EMI records."})

    for line in schedule_lines:
        if _q2(line.proposed_amount) <= MONEY_ZERO:
            raise ValidationError({"detail": "Execution blocked: proposed pending EMI amount must be greater than zero."})

    before_subscription = _snapshot_subscription(subscription)
    before_pending_emis = [_snapshot_emi(emi) for emi in pending_emis]
    protected_emi_ids = list(
        Emi.objects.filter(subscription_id=subscription.id)
        .exclude(status=EmiStatus.PENDING)
        .order_by("month_no", "id")
        .values_list("id", flat=True)
    )

    subscription.product_id = event.new_product_id
    subscription.total_amount = _q2(event.new_contract_total)
    subscription.monthly_amount = _q2(event.proposed_monthly_amount)
    subscription.tenure_months = int(event.preview_tenure_months)
    subscription.save(update_fields=["product", "total_amount", "monthly_amount", "tenure_months"])

    updated_lines = []
    for emi in pending_emis:
        line = schedule_by_emi_id[emi.id]
        emi.amount = _q2(line.proposed_amount)
        emi.due_date = line.proposed_due_date
        emi.save(update_fields=["amount", "due_date"])
        updated_lines.append(
            {
                "emi_id": emi.id,
                "schedule_line_id": line.id,
                "month_no": emi.month_no,
                "old_due_date": line.original_due_date.isoformat() if line.original_due_date else None,
                "new_due_date": emi.due_date.isoformat() if emi.due_date else None,
                "old_amount": _money(line.original_amount),
                "new_amount": _money(emi.amount),
            }
        )

    after_subscription = _snapshot_subscription(subscription)
    after_pending_emis = [_snapshot_emi(emi) for emi in pending_emis]
    executed_at = timezone.now()
    event_metadata = event.metadata or {}
    event_metadata.update(
        {
            "phase": PHASE_6F4,
            "execution_status": "EXECUTED",
            "execution_event": EXECUTION_EVENT,
            "execution_performed": True,
            "executed_by": executed_by.pk,
            "executed_at": executed_at.isoformat(),
            "financial_impact_preview_id": financial_preview.id,
            "accounting_bridge_posting_id": bridge.id,
            "journal_entry_id": bridge.journal_entry_id,
            "reconciliation_item_id": reconciliation_item.id,
            "reconciliation_run_id": reconciliation_item.run_id,
            "expected_amount": _money(expected_amount),
            "posted_amount": _money(posted_amount),
            "variance_amount": "0.00",
            "before_subscription": before_subscription,
            "after_subscription": after_subscription,
            "before_pending_emis": before_pending_emis,
            "after_pending_emis": after_pending_emis,
            "updated_pending_emi_lines": updated_lines,
            "protected_emi_ids": protected_emi_ids,
            "payments_mutated": False,
            "receipts_mutated": False,
            "accounting_mutated_by_execution": False,
            "reconciliation_mutated_by_execution": False,
            "settlement_mutated": False,
            "day_close_mutated": False,
            "lucky_id_mutated": False,
            "batch_mutated": False,
            "waiver_mutated": False,
            "lucky_draw_mutated": False,
            "inventory_mutated": False,
            "delivery_mutated": False,
            "commission_mutated": False,
            "payout_mutated": False,
            "rent_lease_demand_mutated": False,
            "deposit_mutated": False,
        }
    )
    event.metadata = event_metadata
    event.save(update_fields=["metadata", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_IMPLEMENTED,
        instance=locked_amendment,
        performed_by=executed_by,
        metadata={
            "event": EXECUTION_EVENT,
            "phase": PHASE_6F4,
            "amendment_id": locked_amendment.id,
            "recontract_event_id": event.id,
            "subscription_id": subscription.id,
            "old_product_id": before_subscription["product_id"],
            "new_product_id": subscription.product_id,
            "old_total_amount": before_subscription["total_amount"],
            "new_total_amount": after_subscription["total_amount"],
            "old_monthly_amount": before_subscription["monthly_amount"],
            "new_monthly_amount": after_subscription["monthly_amount"],
            "old_tenure_months": before_subscription["tenure_months"],
            "new_tenure_months": after_subscription["tenure_months"],
            "financial_impact_preview_id": financial_preview.id,
            "accounting_bridge_posting_id": bridge.id,
            "journal_entry_id": bridge.journal_entry_id,
            "reconciliation_item_id": reconciliation_item.id,
            "expected_amount": _money(expected_amount),
            "posted_amount": _money(posted_amount),
            "payments_mutated": False,
            "receipts_mutated": False,
            "paid_or_non_pending_emis_mutated": False,
        },
    )

    return (
        ContractRecontractEvent.objects.select_related("amendment", "subscription", "old_product", "new_product")
        .prefetch_related("schedule_preview_lines", "financial_impact_previews")
        .get(pk=event.pk)
    )
