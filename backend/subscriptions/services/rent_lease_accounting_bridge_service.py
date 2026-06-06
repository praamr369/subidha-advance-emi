"""Controlled accounting bridge for rent/lease demands and customer advances.

This module is intentionally explicit: source collection remains authoritative and
journal entries are created only when an admin calls an execute endpoint after
previewing the posting. It does not create Payment, ReceiptDocument,
MoneyMovement, SettlementAllocation, or ReconciliationItem rows.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccountCoaMapping,
    FinanceAccountMappingPurpose,
    JournalEntry,
    JournalEntryStatus,
    JournalEntryType,
)
from accounting.services.journal_posting_service import create_journal_entry, post_journal_entry
from subscriptions.models import (
    AuditLog,
    CustomerAdvance,
    MONEY_ZERO,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionType,
    q2,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.services.rent_lease_finance_sync_service import get_active_account_mapping

SOURCE_MODEL_ADVANCE = "CustomerAdvance"
SOURCE_MODEL_DEMAND = "RentLeaseBillingDemand"
SOURCE_MODEL_DEPOSIT_TX = "RentLeaseDepositTransaction"

EVENT_CUSTOMER_ADVANCE = "CUSTOMER_ADVANCE_LIABILITY"
EVENT_RENT_LEASE_MONTHLY = "RENT_LEASE_MONTHLY_INCOME"
EVENT_DEPOSIT_LIABILITY = "SECURITY_DEPOSIT_LIABILITY"
EVENT_DEPOSIT_REFUND = "SECURITY_DEPOSIT_REFUND"
EVENT_DEPOSIT_DAMAGE_RECOVERY = "SECURITY_DEPOSIT_DAMAGE_RECOVERY"

BRIDGE_VOUCHER_TYPE = "CONTROLLED_ACCOUNTING_BRIDGE"


def _money(value: Any) -> Decimal:
    return q2(Decimal(str(value or MONEY_ZERO)))


def _account_payload(account: ChartOfAccount | None) -> dict[str, Any] | None:
    if account is None:
        return None
    return {
        "id": account.id,
        "code": account.code,
        "name": account.name,
        "account_type": account.account_type,
    }


def _line_payload(*, side: str, account: ChartOfAccount, amount: Decimal, description: str) -> dict[str, Any]:
    return {
        "side": side,
        "account": _account_payload(account),
        "amount": f"{_money(amount):.2f}",
        "description": description,
    }


def _existing_posting(*, source_model: str, source_id: int, event: str) -> JournalEntry | None:
    return (
        JournalEntry.objects.filter(
            source_model=source_model,
            source_id=str(source_id),
            source_type=event,
        )
        .exclude(status=JournalEntryStatus.VOID)
        .order_by("-id")
        .first()
    )


def _require_account_type(account: ChartOfAccount | None, expected: str, label: str) -> None:
    if account is None:
        raise ValidationError(f"{label} is required before posting.")
    if not account.is_active:
        raise ValidationError(f"{label} must be active before posting.")
    if account.account_type != expected:
        raise ValidationError(f"{label} must be a {expected} chart account.")


def _customer_advance_liability_account() -> ChartOfAccount | None:
    mapping = (
        FinanceAccountCoaMapping.objects.select_related("chart_account")
        .filter(
            purpose=FinanceAccountMappingPurpose.CUSTOMER_ADVANCE_UNEARNED_REVENUE,
            is_active=True,
        )
        .order_by("-is_default", "id")
        .first()
    )
    return mapping.chart_account if mapping else None


def _settlement_chart_account():
    mapping = get_active_account_mapping()
    if mapping is None or mapping.settlement_finance_account_id is None:
        return mapping, None
    account = mapping.settlement_finance_account.chart_account
    return mapping, account


def _posted_response(entry: JournalEntry, *, created: bool = False) -> dict[str, Any]:
    return {
        "can_post": False,
        "status": "POSTED",
        "created": created,
        "journal_entry_id": entry.id,
        "entry_no": entry.entry_no,
        "reason": "This source already has a non-void accounting bridge journal entry.",
    }


def _preview_response(
    *,
    source_model: str,
    source_id: int,
    source_reference: str,
    event: str,
    amount: Decimal,
    debit_account: ChartOfAccount | None,
    credit_account: ChartOfAccount | None,
    debit_label: str,
    credit_label: str,
    narration: str,
) -> dict[str, Any]:
    existing = _existing_posting(source_model=source_model, source_id=source_id, event=event)
    if existing:
        return {
            "source_model": source_model,
            "source_id": source_id,
            "source_reference": source_reference,
            "event": event,
            "amount": f"{_money(amount):.2f}",
            **_posted_response(existing),
            "lines": [],
        }

    try:
        if amount <= MONEY_ZERO:
            raise ValidationError("Posting amount must be greater than zero.")
        _require_account_type(debit_account, ChartOfAccountType.ASSET if debit_label == "Settlement account" else debit_account.account_type if debit_account else ChartOfAccountType.ASSET, debit_label)
        if credit_label in {"Security deposit liability", "Customer advance liability"}:
            _require_account_type(credit_account, ChartOfAccountType.LIABILITY, credit_label)
        elif credit_label in {"Rent/lease monthly income", "Damage recovery income"}:
            _require_account_type(credit_account, ChartOfAccountType.INCOME, credit_label)
        elif credit_label == "Deposit refund account":
            if credit_account is None:
                raise ValidationError("Deposit refund account is required before posting.")
            if credit_account.account_type not in {ChartOfAccountType.ASSET, ChartOfAccountType.LIABILITY, ChartOfAccountType.EXPENSE}:
                raise ValidationError("Deposit refund account must be ASSET, LIABILITY, or EXPENSE.")
    except ValidationError as exc:
        return {
            "source_model": source_model,
            "source_id": source_id,
            "source_reference": source_reference,
            "event": event,
            "amount": f"{_money(amount):.2f}",
            "can_post": False,
            "status": "BLOCKED",
            "journal_entry_id": None,
            "reason": str(exc.messages[0] if hasattr(exc, "messages") and exc.messages else exc),
            "lines": [],
        }

    return {
        "source_model": source_model,
        "source_id": source_id,
        "source_reference": source_reference,
        "event": event,
        "amount": f"{_money(amount):.2f}",
        "can_post": True,
        "status": "READY",
        "journal_entry_id": None,
        "reason": "Ready for explicit admin posting. Duplicate posting is blocked by source/event lookup.",
        "narration": narration,
        "lines": [
            _line_payload(side="DEBIT", account=debit_account, amount=amount, description=debit_label),
            _line_payload(side="CREDIT", account=credit_account, amount=amount, description=credit_label),
        ],
    }


@transaction.atomic
def _execute_posting(
    *,
    source_model: str,
    source_id: int,
    source_reference: str,
    event: str,
    amount: Decimal,
    debit_account: ChartOfAccount,
    credit_account: ChartOfAccount,
    debit_label: str,
    credit_label: str,
    narration: str,
    source_instance=None,
    performed_by=None,
) -> dict[str, Any]:
    existing = _existing_posting(source_model=source_model, source_id=source_id, event=event)
    if existing:
        return {"source_model": source_model, "source_id": source_id, "event": event, **_posted_response(existing, created=False)}

    preview = _preview_response(
        source_model=source_model,
        source_id=source_id,
        source_reference=source_reference,
        event=event,
        amount=amount,
        debit_account=debit_account,
        credit_account=credit_account,
        debit_label=debit_label,
        credit_label=credit_label,
        narration=narration,
    )
    if not preview.get("can_post"):
        raise ValidationError(preview.get("reason") or "Source is not postable.")

    entry = create_journal_entry(
        entry_date=timezone.localdate(),
        entry_type=JournalEntryType.SYSTEM_BRIDGE,
        memo=narration,
        source_model=source_model,
        source_id=str(source_id),
        voucher_type=BRIDGE_VOUCHER_TYPE,
        source_type=event,
        source_reference=source_reference,
        lines=[
            {
                "chart_account": debit_account,
                "description": debit_label,
                "debit_amount": amount,
                "credit_amount": MONEY_ZERO,
            },
            {
                "chart_account": credit_account,
                "description": credit_label,
                "debit_amount": MONEY_ZERO,
                "credit_amount": amount,
            },
        ],
    )
    entry, _ = post_journal_entry(journal_entry_id=entry.id, posted_by=performed_by)

    if source_instance is not None:
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=source_instance,
            performed_by=performed_by,
            metadata={
                "event": "CONTROLLED_ACCOUNTING_BRIDGE_POSTED",
                "bridge_event": event,
                "journal_entry_id": entry.id,
                "entry_no": entry.entry_no,
                "amount": f"{amount:.2f}",
            },
        )

    return {**preview, "created": True, "status": "POSTED", "can_post": False, "journal_entry_id": entry.id, "entry_no": entry.entry_no}


def preview_customer_advance_posting(advance: CustomerAdvance) -> dict[str, Any]:
    liability = _customer_advance_liability_account()
    return _preview_response(
        source_model=SOURCE_MODEL_ADVANCE,
        source_id=advance.id,
        source_reference=advance.reference_no or f"ADV-{advance.id}",
        event=EVENT_CUSTOMER_ADVANCE,
        amount=_money(advance.amount),
        debit_account=advance.finance_account.chart_account,
        credit_account=liability,
        debit_label="Settlement account",
        credit_label="Customer advance liability",
        narration=f"Customer advance liability posting for advance #{advance.id}",
    )


def post_customer_advance(advance: CustomerAdvance, *, performed_by=None) -> dict[str, Any]:
    liability = _customer_advance_liability_account()
    return _execute_posting(
        source_model=SOURCE_MODEL_ADVANCE,
        source_id=advance.id,
        source_reference=advance.reference_no or f"ADV-{advance.id}",
        event=EVENT_CUSTOMER_ADVANCE,
        amount=_money(advance.amount),
        debit_account=advance.finance_account.chart_account,
        credit_account=liability,
        debit_label="Settlement account",
        credit_label="Customer advance liability",
        narration=f"Customer advance liability posting for advance #{advance.id}",
        source_instance=advance,
        performed_by=performed_by,
    )


def preview_monthly_demand_posting(demand: RentLeaseBillingDemand) -> dict[str, Any]:
    mapping, settlement_account = _settlement_chart_account()
    income_account = mapping.monthly_income_account if mapping else None
    return _preview_response(
        source_model=SOURCE_MODEL_DEMAND,
        source_id=demand.id,
        source_reference=demand.reference_key,
        event=EVENT_RENT_LEASE_MONTHLY,
        amount=_money(demand.collected_amount),
        debit_account=settlement_account,
        credit_account=income_account,
        debit_label="Settlement account",
        credit_label="Rent/lease monthly income",
        narration=f"Rent/lease monthly income posting for demand {demand.reference_key}",
    )


def post_monthly_demand(demand: RentLeaseBillingDemand, *, performed_by=None) -> dict[str, Any]:
    mapping, settlement_account = _settlement_chart_account()
    return _execute_posting(
        source_model=SOURCE_MODEL_DEMAND,
        source_id=demand.id,
        source_reference=demand.reference_key,
        event=EVENT_RENT_LEASE_MONTHLY,
        amount=_money(demand.collected_amount),
        debit_account=settlement_account,
        credit_account=mapping.monthly_income_account if mapping else None,
        debit_label="Settlement account",
        credit_label="Rent/lease monthly income",
        narration=f"Rent/lease monthly income posting for demand {demand.reference_key}",
        source_instance=demand,
        performed_by=performed_by,
    )


def preview_deposit_liability_posting(demand: RentLeaseBillingDemand) -> dict[str, Any]:
    mapping, settlement_account = _settlement_chart_account()
    liability = mapping.deposit_liability_account if mapping else None
    return _preview_response(
        source_model=SOURCE_MODEL_DEMAND,
        source_id=demand.id,
        source_reference=demand.reference_key,
        event=EVENT_DEPOSIT_LIABILITY,
        amount=_money(demand.collected_amount),
        debit_account=settlement_account,
        credit_account=liability,
        debit_label="Settlement account",
        credit_label="Security deposit liability",
        narration=f"Security deposit liability posting for demand {demand.reference_key}",
    )


def post_deposit_liability(demand: RentLeaseBillingDemand, *, performed_by=None) -> dict[str, Any]:
    mapping, settlement_account = _settlement_chart_account()
    return _execute_posting(
        source_model=SOURCE_MODEL_DEMAND,
        source_id=demand.id,
        source_reference=demand.reference_key,
        event=EVENT_DEPOSIT_LIABILITY,
        amount=_money(demand.collected_amount),
        debit_account=settlement_account,
        credit_account=mapping.deposit_liability_account if mapping else None,
        debit_label="Settlement account",
        credit_label="Security deposit liability",
        narration=f"Security deposit liability posting for demand {demand.reference_key}",
        source_instance=demand,
        performed_by=performed_by,
    )


def _latest_deposit_transaction(demand: RentLeaseBillingDemand, tx_type: str) -> RentLeaseDepositTransaction | None:
    return (
        RentLeaseDepositTransaction.objects.filter(demand=demand, transaction_type=tx_type, amount__gt=MONEY_ZERO)
        .order_by("-created_at", "-id")
        .first()
    )


def preview_deposit_transaction_posting(demand: RentLeaseBillingDemand, *, event: str) -> dict[str, Any]:
    mapping = get_active_account_mapping()
    if event == EVENT_DEPOSIT_REFUND:
        tx = _latest_deposit_transaction(demand, RentLeaseDepositTransactionType.REFUNDED)
        credit = mapping.deposit_refund_account if mapping else None
        label = "Deposit refund account"
        narration = f"Security deposit refund posting for demand {demand.reference_key}"
    elif event == EVENT_DEPOSIT_DAMAGE_RECOVERY:
        tx = _latest_deposit_transaction(demand, RentLeaseDepositTransactionType.DEDUCTION)
        credit = mapping.damage_recovery_income_account if mapping else None
        label = "Damage recovery income"
        narration = f"Security deposit damage recovery posting for demand {demand.reference_key}"
    else:
        raise ValidationError("Unsupported deposit transaction posting event.")

    if tx is None:
        return {
            "source_model": SOURCE_MODEL_DEPOSIT_TX,
            "source_id": None,
            "source_reference": demand.reference_key,
            "event": event,
            "amount": "0.00",
            "can_post": False,
            "status": "BLOCKED",
            "journal_entry_id": None,
            "reason": "No matching deposit transaction exists for this posting action.",
            "lines": [],
        }

    liability = mapping.deposit_liability_account if mapping else None
    return _preview_response(
        source_model=SOURCE_MODEL_DEPOSIT_TX,
        source_id=tx.id,
        source_reference=demand.reference_key,
        event=event,
        amount=_money(tx.amount),
        debit_account=liability,
        credit_account=credit,
        debit_label="Security deposit liability",
        credit_label=label,
        narration=narration,
    )


def post_deposit_transaction(demand: RentLeaseBillingDemand, *, event: str, performed_by=None) -> dict[str, Any]:
    preview = preview_deposit_transaction_posting(demand, event=event)
    if not preview.get("source_id"):
        raise ValidationError(preview.get("reason") or "No deposit transaction is postable.")
    tx = RentLeaseDepositTransaction.objects.select_related("demand").get(pk=preview["source_id"])
    mapping = get_active_account_mapping()
    credit = mapping.deposit_refund_account if event == EVENT_DEPOSIT_REFUND else mapping.damage_recovery_income_account
    credit_label = "Deposit refund account" if event == EVENT_DEPOSIT_REFUND else "Damage recovery income"
    return _execute_posting(
        source_model=SOURCE_MODEL_DEPOSIT_TX,
        source_id=tx.id,
        source_reference=demand.reference_key,
        event=event,
        amount=_money(tx.amount),
        debit_account=mapping.deposit_liability_account if mapping else None,
        credit_account=credit,
        debit_label="Security deposit liability",
        credit_label=credit_label,
        narration=preview.get("narration") or f"Deposit transaction posting for demand {demand.reference_key}",
        source_instance=tx,
        performed_by=performed_by,
    )


def _posted_count(*, source_model: str, event: str) -> int:
    return JournalEntry.objects.filter(source_model=source_model, source_type=event, status=JournalEntryStatus.POSTED).count()


def build_accounting_bridge_summary() -> dict[str, Any]:
    mapping = get_active_account_mapping()
    advance_liability = _customer_advance_liability_account()
    monthly_total = RentLeaseBillingDemand.objects.filter(
        demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY],
        collected_amount__gt=MONEY_ZERO,
    ).count()
    deposit_total = RentLeaseBillingDemand.objects.filter(
        demand_type=RentLeaseDemandType.SECURITY_DEPOSIT,
        collected_amount__gt=MONEY_ZERO,
    ).count()
    advances_total = CustomerAdvance.objects.filter(amount__gt=MONEY_ZERO).count()
    monthly_posted = _posted_count(source_model=SOURCE_MODEL_DEMAND, event=EVENT_RENT_LEASE_MONTHLY)
    deposit_posted = _posted_count(source_model=SOURCE_MODEL_DEMAND, event=EVENT_DEPOSIT_LIABILITY)
    advances_posted = _posted_count(source_model=SOURCE_MODEL_ADVANCE, event=EVENT_CUSTOMER_ADVANCE)
    required_mapping_ok = bool(mapping and mapping.settlement_finance_account_id)
    return {
        "posting_mode": "EXPLICIT_ADMIN_CONTROLLED",
        "auto_posting_enabled": False,
        "mapping_configured": bool(mapping),
        "settlement_account_configured": bool(mapping and mapping.settlement_finance_account_id),
        "customer_advance_liability_configured": bool(advance_liability),
        "reversal_posture": "Existing reversal/void workflows remain separate; this bridge does not fake reversal readiness.",
        "customer_advances": {
            "status": "READY" if advance_liability else "NEEDS_MAPPING",
            "total_sources": advances_total,
            "posted_sources": advances_posted,
            "pending_posting": max(advances_total - advances_posted, 0),
            "route": "/admin/accounting",
            "reason": None if advance_liability else "Map CUSTOMER_ADVANCE_UNEARNED_REVENUE to a liability account before posting advances.",
        },
        "rent_lease_dues": {
            "status": "PENDING_POSTING" if required_mapping_ok and monthly_total > monthly_posted else "READY" if required_mapping_ok else "NEEDS_MAPPING",
            "total_sources": monthly_total,
            "posted_sources": monthly_posted,
            "pending_posting": max(monthly_total - monthly_posted, 0),
            "route": "/admin/rent-lease",
            "reason": None if required_mapping_ok else "Active rent/lease mapping and settlement finance account are required before posting monthly dues.",
        },
        "security_deposits": {
            "status": "PENDING_POSTING" if required_mapping_ok and deposit_total > deposit_posted else "READY" if required_mapping_ok else "NEEDS_MAPPING",
            "total_sources": deposit_total,
            "posted_sources": deposit_posted,
            "pending_posting": max(deposit_total - deposit_posted, 0),
            "route": "/admin/finance/deposits#accounting-mapping",
            "reason": None if required_mapping_ok else "Active rent/lease mapping and settlement finance account are required before posting deposit liabilities.",
        },
    }
