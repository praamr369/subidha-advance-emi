from __future__ import annotations

from decimal import Decimal

from accounting.models import (
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
    MoneyMovement,
    MoneyMovementStatus,
    JournalEntryLine,
    JournalEntryStatus,
)
from accounting.services.finance_account_readiness import finance_account_readiness
from django.db.models import Sum
from django.db.models.functions import Coalesce


def _money(value: Decimal | int | str | None) -> str:
    return f"{Decimal(value or '0.00'):.2f}"


def _finance_account_row(account: FinanceAccount) -> dict:
    readiness = finance_account_readiness(account)
    chart = account.chart_account
    posting_ready = bool(
        chart
        and chart.is_active
        and chart.account_type == ChartOfAccountType.ASSET
        and chart.allow_manual_posting
    )
    movement_eligible = bool(
        account.is_active
        and account.is_real_settlement_account
        and posting_ready
    )
    return {
        "id": account.id,
        "name": account.name,
        "kind": account.kind,
        "branch_id": account.branch_id,
        "branch_code": getattr(account.branch, "code", None),
        "branch_name": getattr(account.branch, "name", None),
        "chart_account_id": account.chart_account_id,
        "chart_account_code": getattr(chart, "code", None),
        "chart_account_name": getattr(chart, "name", None),
        "chart_account_type": getattr(chart, "account_type", None),
        "opening_balance": _money(account.opening_balance),
        "is_active": account.is_active,
        "is_real_settlement_account": account.is_real_settlement_account,
        "collection_ready": readiness.collection_ready,
        "collection_blocker_reason": readiness.collection_blocker_reason,
        "recommended_action": readiness.recommended_action,
        "posting_ready": posting_ready,
        "movement_eligible": movement_eligible,
    }


def build_accounting_books_readiness() -> dict:
    accounts = FinanceAccount.objects.select_related("chart_account", "branch").order_by("kind", "name", "id")
    active_accounts = accounts.filter(is_active=True)
    settlement_accounts = active_accounts.filter(is_real_settlement_account=True)
    movement_rows = [_finance_account_row(account) for account in settlement_accounts]

    # Calculate real-time balances from posted journals
    chart_ids = [row["chart_account_id"] for row in movement_rows if row.get("chart_account_id")]
    balances_by_chart = {}
    if chart_ids:
        agg = JournalEntryLine.objects.filter(
            journal_entry__status=JournalEntryStatus.POSTED,
            chart_account_id__in=chart_ids
        ).values("chart_account_id").annotate(
            debits=Coalesce(Sum("debit_amount"), Decimal("0.00")),
            credits=Coalesce(Sum("credit_amount"), Decimal("0.00"))
        )
        for row in agg:
            balances_by_chart[row["chart_account_id"]] = row["debits"] - row["credits"]

    for row in movement_rows:
        opening = Decimal(row["opening_balance"])
        chart_id = row.get("chart_account_id")
        net_change = balances_by_chart.get(chart_id, Decimal("0.00")) if chart_id else Decimal("0.00")
        row["current_balance"] = _money(opening + net_change)

    movement_eligible = [row for row in movement_rows if row["movement_eligible"]]

    blockers: list[str] = []
    warnings: list[str] = []

    if not settlement_accounts.exists():
        blockers.append("Create at least one active settlement finance account before using Books.")
    if len(movement_eligible) < 2:
        warnings.append("Money movement requires at least two active settlement finance accounts mapped to posting-ready ASSET chart accounts.")

    for row in movement_rows:
        if not row["posting_ready"]:
            warnings.append(f"{row['name']} is not mapped to a posting-ready ASSET chart account.")
        if not row["collection_ready"] and row.get("collection_blocker_reason"):
            warnings.append(f"{row['name']}: {row['collection_blocker_reason']}")

    cash_count = settlement_accounts.filter(kind=FinanceAccountKind.CASH).count()
    bank_count = settlement_accounts.filter(kind=FinanceAccountKind.BANK).count()
    upi_count = settlement_accounts.filter(kind=FinanceAccountKind.UPI).count()
    if cash_count == 0:
        warnings.append("No active CASH settlement finance account is configured.")
    if bank_count == 0 and upi_count == 0:
        warnings.append("Configure at least one BANK or UPI settlement finance account for non-cash collections.")

    draft_count = MoneyMovement.objects.filter(status=MoneyMovementStatus.DRAFT).count()
    posted_count = MoneyMovement.objects.filter(status=MoneyMovementStatus.POSTED).count()
    cancelled_count = MoneyMovement.objects.filter(status=MoneyMovementStatus.CANCELLED).count()

    return {
        "status": "READY" if not blockers else "NEEDS_SETUP",
        "blockers": blockers,
        "warnings": sorted(set(warnings)),
        "counts": {
            "finance_accounts_total": accounts.count(),
            "active_finance_accounts": active_accounts.count(),
            "active_settlement_accounts": settlement_accounts.count(),
            "movement_eligible_accounts": len(movement_eligible),
            "cash_accounts": cash_count,
            "bank_accounts": bank_count,
            "upi_accounts": upi_count,
            "draft_money_movements": draft_count,
            "posted_money_movements": posted_count,
            "cancelled_money_movements": cancelled_count,
        },
        "movement_eligible_accounts": movement_eligible,
        "finance_accounts": movement_rows,
        "safety_note": "Books can create only explicit admin-controlled inter-account money movement drafts. Posting remains a separate action and creates one controlled journal entry through the accounting service.",
    }
