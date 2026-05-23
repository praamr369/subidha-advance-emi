import logging
from decimal import Decimal, InvalidOperation
from typing import Optional

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from reconciliation.services.financial_source_lifecycle_event_service import (
    create_lifecycle_event_for_operational_cancellation,
)
from accounting.models import FinanceAccount, FinanceAccountKind
from accounting.services.finance_account_collection_guard import (
    assert_finance_account_allowed_for_payment_collection,
)
from accounting.services.finance_posting_service import FinancePostingService
from branch_control.models import Branch
from branch_control.services.branch_service import (
    assigned_counter_for_user,
    assert_user_branch_access,
    assert_user_counter_access,
    default_branch_for_model,
)
from subscriptions.models import (
    AuditLog,
    BusinessEventType,
    Emi,
    EmiStatus,
    FinancialLedger,
    LedgerEntryType,
    LuckyIdStatus,
    MONEY_ZERO,
    Payment,
    OperationalCancellation,
    PaymentReconciliation,
    PaymentReconciliationEvent,
    ReconciliationEventType,
    ReconciliationStatus,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.business_event_service import append_business_event
from subscriptions.services.commission_service import (
    create_commission_for_payment,
    reverse_commission_for_payment,
)
from subscriptions.services.operational_notification_service import (
    schedule_emi_payment_posted_notifications,
)
from subscriptions.services.subscription_status_service import (
    resolve_expected_subscription_status,
)
from services.payments.allocate_payment import allocate_payment

finance_logger = logging.getLogger("finance.events")


def _to_decimal(value) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Invalid decimal value.")


def _normalize_amount(value) -> Decimal:
    amount = _to_decimal(value)
    if amount <= MONEY_ZERO:
        raise ValueError("Payment amount must be greater than zero.")
    return amount


def _normalize_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _safe_role(user) -> str:
    return getattr(user, "role", "") if user else ""


def _safe_enum_value(value):
    return getattr(value, "value", value)


def _assert_payment_write_allowed(subscription: Subscription, emi: Emi):
    subscription_status = _safe_enum_value(getattr(subscription, "status", None))
    emi_status = _safe_enum_value(getattr(emi, "status", None))

    blocked_subscription_statuses = {
        _safe_enum_value(getattr(SubscriptionStatus, "COMPLETED", "COMPLETED")),
        _safe_enum_value(getattr(SubscriptionStatus, "DEFAULTED", "DEFAULTED")),
        "COMPLETED",
        "DEFAULTED",
        "CANCELLED",
    }

    if subscription_status in blocked_subscription_statuses:
        raise ValueError(
            f"Cannot collect payment for a {str(subscription_status).lower()} subscription."
        )

    waived_status = _safe_enum_value(getattr(EmiStatus, "WAIVED", "WAIVED"))
    paid_status = _safe_enum_value(getattr(EmiStatus, "PAID", "PAID"))

    if emi_status == waived_status:
        raise ValueError("Cannot collect payment for a waived EMI.")

    if emi_status == paid_status:
        raise ValueError("This EMI is already fully paid.")


def _find_existing_reference(reference_no: Optional[str]) -> Optional[Payment]:
    if not reference_no:
        return None

    return (
        Payment.objects.select_related("emi", "subscription", "customer")
        .filter(reference_no=reference_no)
        .first()
    )


def _create_audit_log(
    *,
    action_type,
    performed_by,
    object_id,
    metadata: Optional[dict] = None,
    model_name: str = "payment",
):
    AuditLog.objects.create(
        action_type=action_type,
        performed_by=performed_by,
        model_name=model_name,
        object_id=object_id,
        metadata=metadata or {},
    )


def _create_ledger_entry(
    *,
    emi: Emi,
    payment,
    entry_type,
    amount: Decimal,
    entry_direction: str,
    allocation_context: Optional[dict] = None,
):
    FinancialLedger.objects.create(
        emi=emi,
        payment=payment,
        entry_type=entry_type,
        entry_direction=entry_direction,
        amount=amount,
        allocation_context=allocation_context or {},
    )


def _get_emi_net_paid(emi: Emi) -> Decimal:
    payment_total = (
        FinancialLedger.objects.filter(
            emi=emi,
            entry_type=LedgerEntryType.EMI_PAYMENT,
        ).aggregate(total=Sum("amount"))["total"]
        or MONEY_ZERO
    )

    reversal_total = (
        FinancialLedger.objects.filter(
            emi=emi,
            entry_type=LedgerEntryType.PAYMENT_REVERSAL,
        ).aggregate(total=Sum("amount"))["total"]
        or MONEY_ZERO
    )

    net_paid = Decimal(str(payment_total)) - Decimal(str(reversal_total))
    if net_paid < MONEY_ZERO:
        return MONEY_ZERO
    return net_paid


def _refresh_emi_status(emi: Emi):
    net_paid = _get_emi_net_paid(emi)

    waived_status = _safe_enum_value(getattr(EmiStatus, "WAIVED", "WAIVED"))
    pending_status = _safe_enum_value(getattr(EmiStatus, "PENDING", "PENDING"))
    partial_status = _safe_enum_value(getattr(EmiStatus, "PARTIAL", "PARTIAL"))
    paid_status = _safe_enum_value(getattr(EmiStatus, "PAID", "PAID"))

    if net_paid >= emi.amount:
        emi.status = paid_status
        if hasattr(emi, "paid_date"):
            emi.paid_date = timezone.now().date()
            emi.save(update_fields=["status", "paid_date"])
        else:
            emi.save(update_fields=["status"])
        return

    if net_paid > MONEY_ZERO:
        # Only use PARTIAL if your EmiStatus enum supports it.
        # If not, keep PENDING as fallback.
        if hasattr(EmiStatus, "PARTIAL"):
            emi.status = partial_status
        else:
            emi.status = pending_status

        if hasattr(emi, "paid_date"):
            emi.paid_date = None
            emi.save(update_fields=["status", "paid_date"])
        else:
            emi.save(update_fields=["status"])
        return

    if _safe_enum_value(getattr(emi, "status", None)) != waived_status:
        emi.status = pending_status

    if hasattr(emi, "paid_date"):
        emi.paid_date = None
        emi.save(update_fields=["status", "paid_date"])
    else:
        emi.save(update_fields=["status"])


def _refresh_subscription_status(subscription: Subscription):
    emis = subscription.emis.all()

    if not emis.exists():
        return

    statuses = {_safe_enum_value(e.status) for e in emis}
    current_status = _safe_enum_value(getattr(subscription, "status", None))
    winner_lucky_status = _safe_enum_value(getattr(LuckyIdStatus, "WON", "WON"))
    is_winner = bool(
        subscription.winner_month is not None
        or current_status == _safe_enum_value(getattr(SubscriptionStatus, "WON", "WON"))
        or _safe_enum_value(getattr(subscription.lucky_id, "status", None))
        == winner_lucky_status
    )
    next_status = resolve_expected_subscription_status(
        current_status=current_status,
        emi_statuses=statuses,
        is_winner=is_winner,
    )

    if current_status != next_status:
        subscription.status = next_status
        subscription.save(update_fields=["status"])


def _reconcile_after_payment(subscription: Subscription, emi: Emi):
    _refresh_emi_status(emi)
    _refresh_subscription_status(subscription)


def _fallback_finance_account_for_method(method: str):
    normalized = (method or "CASH").strip().upper()
    kind = FinanceAccountKind.CASH
    if normalized == "BANK":
        kind = FinanceAccountKind.BANK
    elif normalized == "UPI":
        kind = FinanceAccountKind.UPI
    candidates = list(
        FinanceAccount.objects.select_related("chart_account")
        .filter(kind=kind, is_active=True)
        .order_by("id")[:2]
    )
    if candidates:
        return candidates[0]
    return None


def _emi_outstanding_amount(emi: Emi) -> Decimal:
    net_paid = _get_emi_net_paid(emi)
    outstanding = Decimal(str(emi.amount)) - Decimal(str(net_paid))
    if outstanding < MONEY_ZERO:
        return MONEY_ZERO
    return outstanding


def _upsert_payment_reconciliation(
    *,
    payment: Payment,
    expected_amount: Decimal,
    actor,
    note: Optional[str] = None,
):
    expected_amount = Decimal(str(expected_amount or MONEY_ZERO))
    paid_amount = Decimal(str(payment.amount or MONEY_ZERO))
    variance = paid_amount - expected_amount

    if payment.emi_id is None:
        status_value = ReconciliationStatus.UNLINKED
    elif paid_amount == expected_amount:
        status_value = ReconciliationStatus.MATCHED
    elif paid_amount < expected_amount:
        status_value = ReconciliationStatus.PARTIAL
    else:
        status_value = ReconciliationStatus.OVERPAID

    reconciliation, created = PaymentReconciliation.objects.get_or_create(
        payment=payment,
        defaults={
            "matched_emi": payment.emi,
            "status": status_value,
            "expected_amount": expected_amount,
            "paid_amount": paid_amount,
            "variance_amount": variance,
            "notes": note or "",
        },
    )
    if not created:
        reconciliation.matched_emi = payment.emi
        reconciliation.status = status_value
        reconciliation.expected_amount = expected_amount
        reconciliation.paid_amount = paid_amount
        reconciliation.variance_amount = variance
        if note:
            reconciliation.notes = "\n".join(
                part for part in [reconciliation.notes.strip(), note] if part
            ).strip()
        reconciliation.reconciled_by = actor
        reconciliation.reconciled_at = timezone.now()
        reconciliation.save(
            update_fields=[
                "matched_emi",
                "status",
                "expected_amount",
                "paid_amount",
                "variance_amount",
                "notes",
                "reconciled_by",
                "reconciled_at",
                "updated_at",
            ]
        )

    PaymentReconciliationEvent.objects.create(
        reconciliation=reconciliation,
        event_type=ReconciliationEventType.CREATED if created else ReconciliationEventType.STATUS_CHANGED,
        old_status="",
        new_status=reconciliation.status,
        message=note or f"Expected {expected_amount:.2f}, paid {paid_amount:.2f}",
        actor=actor,
    )
    return reconciliation


def _sync_billing_best_effort(
    *,
    subscription: Subscription,
    actor,
    source_model: str,
    source_id,
    event_type: str,
):
    try:
        from billing.services.billing_sync_service import sync_subscription_billing_profile

        sync_subscription_billing_profile(
            subscription_id=subscription.id,
            source_model=source_model,
            source_id=str(source_id),
            event_type=event_type,
            performed_by=actor,
            idempotency_key=f"{source_model.upper()}:{source_id}:{event_type}",
        )
    except Exception:  # pragma: no cover - best-effort mirror sync
        return


def _resolve_branch_and_counter(
    *,
    actor,
    subscription,
    branch_id: int | None = None,
    cash_counter_id: int | None = None,
):
    from branch_control.models import CashCounter

    branch = None
    counter = None

    if cash_counter_id:
        counter = (
            CashCounter.objects.select_related("branch", "finance_account")
            .filter(is_active=True)
            .get(pk=cash_counter_id)
        )
        assert_user_counter_access(user=actor, counter=counter)
        branch = counter.branch

    if branch is None and branch_id:
        branch = Branch.objects.get(pk=branch_id)
        assert_user_branch_access(user=actor, branch_id=branch.id)

    if branch is None and counter is None and getattr(actor, "role", "") == "CASHIER":
        counter = assigned_counter_for_user(actor)
        if counter is not None:
            branch = counter.branch

    if branch is None:
        branch = getattr(subscription, "branch", None) or default_branch_for_model()

    if branch is not None:
        assert_user_branch_access(user=actor, branch_id=branch.id)

    return branch, counter


@transaction.atomic
def record_emi_payment(
    *,
    emi_id: int,
    amount,
    collected_by,
    method: str = "CASH",
    reference_no: Optional[str] = None,
    note: Optional[str] = None,
    payment_date=None,
    branch_id: int | None = None,
    cash_counter_id: int | None = None,
    finance_account_id: int | None = None,
    contract_reference_id: int | None = None,
    unified_collection_source_type: str | None = None,
    unified_collection_source_id: int | None = None,
):
    """
    Canonical payment collection entrypoint.

    Current real-model alignment:
    - Payment model supports: customer, subscription, emi, amount, method,
      reference_no, collected_by, payment_date, allocation_metadata
    - Payment model does NOT support: note/notes/status
    - Reversal is tracked through allocation_metadata + ledger compensation
    """
    amount = _normalize_amount(amount)
    method = (_normalize_text(method) or "CASH").upper()
    reference_no = _normalize_text(reference_no)
    note = _normalize_text(note)  # accepted for API compatibility, not persisted
    payment_date = payment_date or timezone.now().date()

    existing = _find_existing_reference(reference_no)
    if existing:
        if existing.emi_id != emi_id or Decimal(str(existing.amount)) != amount:
            raise ValueError(
                "A payment with this reference number already exists with different details."
            )

        return {
            "payment": existing,
            "emi": existing.emi,
            "subscription": existing.subscription,
            "finance_account": getattr(existing, "finance_account", None),
            "reconciliation": getattr(existing, "reconciliation", None),
            "created": False,
        }

    emi = (
        Emi.objects.select_for_update()
        .select_related("subscription", "subscription__customer")
        .get(id=emi_id)
    )
    subscription = emi.subscription

    _assert_payment_write_allowed(subscription, emi)
    outstanding_before = _emi_outstanding_amount(emi)
    if amount > outstanding_before:
        raise ValueError("Payment amount cannot exceed the EMI outstanding balance. Collect extra money as customer advance instead.")
    branch, cash_counter = _resolve_branch_and_counter(
        actor=collected_by,
        subscription=subscription,
        branch_id=branch_id,
        cash_counter_id=cash_counter_id,
    )
    resolved_finance_account_id = finance_account_id or getattr(cash_counter, "finance_account_id", None)
    if resolved_finance_account_id is None:
        fallback_finance_account = _fallback_finance_account_for_method(method)
        if fallback_finance_account is None:
            raise ValueError("Finance account selection is required for payment collection.")
        finance_account = fallback_finance_account
    else:
        finance_account = FinancePostingService.resolve_operational_finance_account(
            finance_account_id=resolved_finance_account_id,
        )
    assert_finance_account_allowed_for_payment_collection(finance_account)
    finance_branch_id = getattr(finance_account, "branch_id", None)
    if branch and finance_branch_id and branch.id != finance_branch_id:
        raise ValueError("Selected finance account does not belong to the payment branch.")

    payment = Payment.objects.create(
        customer=subscription.customer,
        subscription=subscription,
        emi=emi,
        amount=amount,
        branch=branch,
        cash_counter=cash_counter,
        finance_account=finance_account,
        method=method,
        reference_no=reference_no,
        collected_by=collected_by,
        payment_date=payment_date,
        allocation_metadata={
            "collection_mode": "DIRECT",
            "finance_account_id": finance_account.id,
            "finance_chart_account_id": finance_account.chart_account_id,
            "posting_side": {
                "debit": finance_account.chart_account.code,
                "credit": "ACCOUNTS_RECEIVABLE",
            },
        },
    )

    allocated_amount = allocate_payment(payment)

    _create_ledger_entry(
        emi=emi,
        payment=payment,
        entry_type=LedgerEntryType.EMI_PAYMENT,
        entry_direction="CREDIT",
        amount=amount,
        allocation_context={
            "method": method,
            "reference_no": reference_no,
            "note_accepted_but_not_persisted": note,
        },
    )

    _create_audit_log(
        action_type=AuditLog.ActionType.EMI_PAID,
        performed_by=collected_by,
        object_id=payment.id,
        metadata={
            "payment_id": payment.id,
            "subscription_id": subscription.id,
            "emi_id": emi.id,
            "branch_id": payment.branch_id,
            "cash_counter_id": payment.cash_counter_id,
            "finance_account_id": payment.finance_account_id,
            "amount": str(amount),
            "method": method,
            "reference_no": reference_no,
            **(
                {
                    "contract_reference_id": contract_reference_id,
                    "unified_collection_source_type": unified_collection_source_type,
                    "unified_collection_source_id": unified_collection_source_id,
                }
                if contract_reference_id is not None
                or unified_collection_source_type is not None
                or unified_collection_source_id is not None
                else {}
            ),
        },
    )
    append_business_event(
        event_type=BusinessEventType.PAYMENT_RECEIVED,
        source_module="subscriptions.services.payment_service.record_emi_payment",
        actor_user=collected_by,
        customer=subscription.customer,
        subscription=subscription,
        payment=payment,
        batch=subscription.batch,
        lucky_id=subscription.lucky_id,
        payload={
            "amount": str(amount),
            "method": method,
            "reference_no": reference_no,
        },
        idempotency_key=reference_no,
    )
    append_business_event(
        event_type=BusinessEventType.EMI_PAID,
        source_module="subscriptions.services.payment_service.record_emi_payment",
        actor_user=collected_by,
        customer=subscription.customer,
        subscription=subscription,
        payment=payment,
        batch=subscription.batch,
        lucky_id=subscription.lucky_id,
        payload={
            "emi_id": emi.id,
            "month_no": emi.month_no,
            "amount": str(amount),
        },
    )

    create_commission_for_payment(
        payment=payment,
        actor=collected_by,
    )

    _reconcile_after_payment(subscription, emi)
    FinancePostingService.post_subscription_collection(
        payment=payment,
        finance_account=finance_account,
        performed_by=collected_by,
    )
    finance_logger.info(
        "finance.payment_posted",
        extra={
            "payment_id": payment.id,
            "subscription_id": subscription.id,
            "emi_id": emi.id,
            "amount": str(amount),
            "method": method,
            "finance_account_id": finance_account.id,
            "collected_by_user_id": getattr(collected_by, "id", None),
        },
    )
    reconciliation = _upsert_payment_reconciliation(
        payment=payment,
        expected_amount=outstanding_before,
        actor=collected_by,
        note=f"Collected through finance account {finance_account.name}.",
    )
    _sync_billing_best_effort(
        subscription=subscription,
        actor=collected_by,
        source_model="Payment",
        source_id=payment.id,
        event_type="PAYMENT_POSTED",
    )

    subscription_label = (getattr(subscription, "subscription_number", None) or "").strip() or f"SUB-{subscription.id}"
    schedule_emi_payment_posted_notifications(
        payment_id=payment.id,
        customer_user_id=subscription.customer.user_id,
        partner_user_id=getattr(subscription, "partner_id", None),
        cashier_user_id=getattr(collected_by, "id", None),
        subscription_label=subscription_label,
        amount_str=str(amount),
    )

    return {
        "payment": payment,
        "emi": emi,
        "subscription": subscription,
        "allocated_amount": allocated_amount,
        "finance_account": finance_account,
        "reconciliation": reconciliation,
        "created": True,
    }


@transaction.atomic
def collect_payment_for_admin(
    *,
    emi=None,
    emi_id: Optional[int] = None,
    amount=None,
    admin_user=None,
    collected_by=None,
    payment_method: Optional[str] = None,
    method: Optional[str] = None,
    payment_date=None,
    reference_no: Optional[str] = None,
    notes: Optional[str] = None,
    note: Optional[str] = None,
    branch_id: Optional[int] = None,
    cash_counter_id: Optional[int] = None,
    finance_account_id: Optional[int] = None,
):
    """
    Backward-compatible admin wrapper.

    Accepts both old and new argument names:
    - emi or emi_id
    - payment_method or method
    - notes or note
    - admin_user or collected_by
    """
    actor = admin_user or collected_by
    role = _safe_role(actor)

    if not actor:
        raise ValueError("Admin user is required.")

    if role != "ADMIN" and not getattr(actor, "is_superuser", False):
        raise ValueError("Only admin can collect payments from this flow.")

    resolved_emi_id = emi_id or getattr(emi, "id", None)
    if not resolved_emi_id:
        raise ValueError("emi_id is required.")

    resolved_method = method or payment_method or "CASH"
    resolved_note = note if note is not None else notes

    return record_emi_payment(
        emi_id=resolved_emi_id,
        amount=amount,
        collected_by=actor,
        method=resolved_method,
        reference_no=reference_no,
        note=resolved_note,
        payment_date=payment_date,
        branch_id=branch_id,
        cash_counter_id=cash_counter_id,
        finance_account_id=finance_account_id,
    )


@transaction.atomic
def verify_payment(*, payment_id: int, verified_by):
    """
    Compatibility helper.

    Current real-model alignment:
    - if verified_by / verified_at fields exist, set them
    - no synthetic payment.status field is assumed
    - avoid select_related + select_for_update outer-join locking issue
    """
    role = _safe_role(verified_by)
    if role != "ADMIN" and not getattr(verified_by, "is_superuser", False):
        raise ValueError("Only admin can verify payments.")

    if not payment_id:
        raise ValueError("payment_id is required.")

    payment = Payment.objects.select_for_update().get(id=payment_id)

    update_fields = []

    if hasattr(payment, "verified_by"):
        payment.verified_by = verified_by
        update_fields.append("verified_by")

    if hasattr(payment, "verified_at"):
        payment.verified_at = timezone.now()
        update_fields.append("verified_at")

    if update_fields:
        payment.save(update_fields=update_fields)

    commission_result = create_commission_for_payment(
        payment=payment,
        actor=verified_by,
    )

    emi = payment.emi
    subscription = payment.subscription

    return {
        "payment": payment,
        "emi": emi,
        "subscription": subscription,
        "commission": commission_result.get("commission"),
        "commission_created": commission_result.get("created", False),
        "updated": bool(update_fields),
    }


@transaction.atomic
def reverse_payment_for_admin(
    *,
    payment_id: int,
    reversed_by,
    reason: Optional[str] = None,
):
    role = _safe_role(reversed_by)
    if role != "ADMIN" and not getattr(reversed_by, "is_superuser", False):
        raise ValueError("Only admin can reverse payments.")

    if not payment_id:
        raise ValueError("payment_id is required.")

    payment = Payment.objects.select_for_update().get(id=payment_id)

    reason = _normalize_text(reason)

    metadata = dict(getattr(payment, "allocation_metadata", {}) or {})
    reversal = dict(metadata.get("reversal") or {})

    if reversal.get("is_reversed"):
        raise ValueError("Payment is already reversed.")

    reversal.update(
        {
            "is_reversed": True,
            "reason": reason,
            "reversed_by_id": getattr(reversed_by, "id", None),
            "reversed_at": timezone.now().isoformat(),
        }
    )
    metadata["reversal"] = reversal
    payment.allocation_metadata = metadata
    payment.save(update_fields=["allocation_metadata"])

    emi = payment.emi
    subscription = payment.subscription

    _create_ledger_entry(
        emi=emi,
        payment=None,
        entry_type=LedgerEntryType.PAYMENT_REVERSAL,
        entry_direction="DEBIT",
        amount=payment.amount,
        allocation_context={
            "reversed_payment_id": payment.id,
            "reason": reason,
            "reversed_by_id": getattr(reversed_by, "id", None),
        },
    )

    _create_audit_log(
        action_type=AuditLog.ActionType.PAYMENT_RECONCILED,
        performed_by=reversed_by,
        object_id=payment.id,
        metadata={
            "payment_id": payment.id,
            "subscription_id": payment.subscription_id,
            "emi_id": payment.emi_id,
            "amount": str(payment.amount),
            "reason": reason,
        },
    )
    if not reason:
        raise ValueError("Reversal reason is required.")
    if OperationalCancellation.objects.filter(
        source_type=OperationalCancellation.SourceType.EMI_PAYMENT,
        source_id=payment.id,
    ).exists():
        raise ValueError("Payment already has an audited reversal.")
    cancellation = OperationalCancellation.objects.create(
        source_type=OperationalCancellation.SourceType.EMI_PAYMENT,
        source_id=payment.id,
        source_reference=payment.reference_no or f"PAY-{payment.id}",
        customer=payment.customer,
        partner=getattr(payment.subscription, "partner", None),
        amount_snapshot=payment.amount,
        status_before="POSTED",
        status_after="REVERSED",
        cancellation_type=OperationalCancellation.CancellationType.PAYMENT_REVERSAL,
        reason=reason,
        requested_by=reversed_by,
        approved_by=reversed_by,
        cancelled_by=reversed_by,
        reversal_reference=f"PAYMENT_REVERSAL:{payment.id}",
        metadata={
            "payment_id": payment.id,
            "subscription_id": payment.subscription_id,
            "emi_id": payment.emi_id,
        },
    )
    create_lifecycle_event_for_operational_cancellation(
        cancellation=cancellation,
        related_payment=payment,
    )

    reverse_commission_for_payment(
        payment=payment,
        actor=reversed_by,
        reason=reason,
    )

    _reconcile_after_payment(subscription, emi)
    _sync_billing_best_effort(
        subscription=subscription,
        actor=reversed_by,
        source_model="Payment",
        source_id=payment.id,
        event_type="PAYMENT_REVERSED",
    )
    finance_logger.info(
        "finance.payment_reversed",
        extra={
            "payment_id": payment.id,
            "subscription_id": subscription.id,
            "emi_id": emi.id,
            "amount": str(payment.amount),
            "reason": reason or "",
            "reversed_by_user_id": getattr(reversed_by, "id", None),
        },
    )

    return {
        "detail": "Payment reversed successfully.",
        "payment": payment,
        "emi": emi,
        "subscription": subscription,
        "updated": True,
    }
