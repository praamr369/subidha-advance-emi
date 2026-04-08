from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from accounting.models import (
    MONEY_ZERO,
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    JournalEntryLine,
    JournalEntryStatus,
)


def _money(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


def _money_string(value) -> str:
    return f"{_money(value):.2f}"


def _balance_for_account_type(account_type: str, debit_total: Decimal, credit_total: Decimal) -> Decimal:
    if account_type in {ChartOfAccountType.ASSET, ChartOfAccountType.EXPENSE}:
        return debit_total - credit_total
    return credit_total - debit_total


def _posted_lines_queryset(*, start_date: date | None = None, end_date: date | None = None, as_of: date | None = None):
    queryset = JournalEntryLine.objects.select_related(
        "journal_entry",
        "chart_account",
    ).filter(journal_entry__status=JournalEntryStatus.POSTED)

    effective_end_date = as_of or end_date
    if start_date and effective_end_date:
        queryset = queryset.filter(
            journal_entry__entry_date__range=(start_date, effective_end_date)
        )
    elif start_date:
        queryset = queryset.filter(journal_entry__entry_date__gte=start_date)
    elif effective_end_date:
        queryset = queryset.filter(journal_entry__entry_date__lte=effective_end_date)

    return queryset.order_by(
        "journal_entry__entry_date",
        "journal_entry_id",
        "id",
    )


def build_trial_balance(*, start_date: date | None = None, end_date: date | None = None) -> dict:
    rows_by_account: dict[int, dict] = {}
    total_debits = MONEY_ZERO
    total_credits = MONEY_ZERO

    for line in _posted_lines_queryset(start_date=start_date, end_date=end_date):
        account = line.chart_account
        row = rows_by_account.setdefault(
            account.id,
            {
                "account_id": account.id,
                "account_code": account.code,
                "account_name": account.name,
                "account_type": account.account_type,
                "debit_total": MONEY_ZERO,
                "credit_total": MONEY_ZERO,
            },
        )
        row["debit_total"] += _money(line.debit_amount)
        row["credit_total"] += _money(line.credit_amount)
        total_debits += _money(line.debit_amount)
        total_credits += _money(line.credit_amount)

    rows = []
    for row in rows_by_account.values():
        balance = _balance_for_account_type(
            row["account_type"],
            row["debit_total"],
            row["credit_total"],
        )
        rows.append(
            {
                **row,
                "debit_total": _money_string(row["debit_total"]),
                "credit_total": _money_string(row["credit_total"]),
                "balance": _money_string(balance),
                "balance_side": "DR" if balance >= MONEY_ZERO else "CR",
            }
        )

    rows.sort(key=lambda row: (row["account_code"], row["account_id"]))
    return {
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "rows": rows,
        "total_debits": _money_string(total_debits),
        "total_credits": _money_string(total_credits),
        "balanced": total_debits == total_credits,
    }


def build_profit_loss(*, start_date: date | None = None, end_date: date | None = None) -> dict:
    grouped_rows: dict[str, list[dict]] = defaultdict(list)
    income_total = MONEY_ZERO
    expense_total = MONEY_ZERO

    for line in _posted_lines_queryset(start_date=start_date, end_date=end_date):
        account = line.chart_account
        if account.account_type not in {
            ChartOfAccountType.INCOME,
            ChartOfAccountType.EXPENSE,
        }:
            continue
        amount = _balance_for_account_type(
            account.account_type,
            _money(line.debit_amount),
            _money(line.credit_amount),
        )
        grouped_rows[account.account_type].append(
            {
                "account_id": account.id,
                "account_code": account.code,
                "account_name": account.name,
                "amount": amount,
            }
        )

    income_rows = []
    expense_rows = []
    collapsed: dict[tuple[str, int], Decimal] = defaultdict(lambda: MONEY_ZERO)
    for group, rows in grouped_rows.items():
        for row in rows:
            collapsed[(group, row["account_id"])] += row["amount"]

    for (group, account_id), amount in collapsed.items():
        account = ChartOfAccount.objects.get(pk=account_id)
        payload = {
            "account_id": account.id,
            "account_code": account.code,
            "account_name": account.name,
            "amount": _money_string(amount),
        }
        if group == ChartOfAccountType.INCOME:
            income_total += amount
            income_rows.append(payload)
        else:
            expense_total += amount
            expense_rows.append(payload)

    income_rows.sort(key=lambda row: (row["account_code"], row["account_id"]))
    expense_rows.sort(key=lambda row: (row["account_code"], row["account_id"]))
    net_profit = income_total - expense_total
    return {
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "income": income_rows,
        "expenses": expense_rows,
        "income_total": _money_string(income_total),
        "expense_total": _money_string(expense_total),
        "net_profit": _money_string(net_profit),
    }


def build_balance_sheet(*, as_of: date) -> dict:
    grouped: dict[str, list[dict]] = defaultdict(list)
    totals: dict[str, Decimal] = defaultdict(lambda: MONEY_ZERO)

    collapsed: dict[int, dict] = {}
    for line in _posted_lines_queryset(as_of=as_of):
        account = line.chart_account
        if account.account_type not in {
            ChartOfAccountType.ASSET,
            ChartOfAccountType.LIABILITY,
            ChartOfAccountType.EQUITY,
            ChartOfAccountType.INCOME,
            ChartOfAccountType.EXPENSE,
        }:
            continue

        row = collapsed.setdefault(
            account.id,
            {
                "account_id": account.id,
                "account_code": account.code,
                "account_name": account.name,
                "account_type": account.account_type,
                "debit_total": MONEY_ZERO,
                "credit_total": MONEY_ZERO,
            },
        )
        row["debit_total"] += _money(line.debit_amount)
        row["credit_total"] += _money(line.credit_amount)

    net_income = MONEY_ZERO
    for row in collapsed.values():
        account_type = row["account_type"]
        balance = _balance_for_account_type(
            account_type,
            row["debit_total"],
            row["credit_total"],
        )
        if account_type == ChartOfAccountType.INCOME:
            net_income += balance
            continue
        if account_type == ChartOfAccountType.EXPENSE:
            net_income -= balance
            continue
        payload = {
            "account_id": row["account_id"],
            "account_code": row["account_code"],
            "account_name": row["account_name"],
            "balance": _money_string(balance),
        }
        grouped[account_type].append(payload)
        totals[account_type] += balance

    grouped[ChartOfAccountType.EQUITY].append(
        {
            "account_id": None,
            "account_code": "NET-INCOME",
            "account_name": "Current Period Net Income",
            "balance": _money_string(net_income),
        }
    )
    totals[ChartOfAccountType.EQUITY] += net_income

    for group in grouped.values():
        group.sort(key=lambda row: (row["account_code"] or "", row["account_name"]))

    total_assets = totals[ChartOfAccountType.ASSET]
    total_liabilities = totals[ChartOfAccountType.LIABILITY]
    total_equity = totals[ChartOfAccountType.EQUITY]
    return {
        "as_of": as_of.isoformat(),
        "assets": grouped[ChartOfAccountType.ASSET],
        "liabilities": grouped[ChartOfAccountType.LIABILITY],
        "equity": grouped[ChartOfAccountType.EQUITY],
        "total_assets": _money_string(total_assets),
        "total_liabilities": _money_string(total_liabilities),
        "total_equity": _money_string(total_equity),
        "balanced": total_assets == (total_liabilities + total_equity),
    }


def build_general_ledger(
    *,
    account_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    account = ChartOfAccount.objects.get(pk=account_id)
    rows = []
    running_debits = MONEY_ZERO
    running_credits = MONEY_ZERO

    for line in _posted_lines_queryset(start_date=start_date, end_date=end_date).filter(
        chart_account_id=account_id
    ):
        running_debits += _money(line.debit_amount)
        running_credits += _money(line.credit_amount)
        running_balance = _balance_for_account_type(
            account.account_type,
            running_debits,
            running_credits,
        )
        rows.append(
            {
                "journal_entry_id": line.journal_entry_id,
                "entry_no": line.journal_entry.entry_no,
                "entry_date": line.journal_entry.entry_date.isoformat(),
                "entry_type": line.journal_entry.entry_type,
                "memo": line.journal_entry.memo,
                "source_model": line.journal_entry.source_model,
                "source_id": line.journal_entry.source_id,
                "description": line.description,
                "debit_amount": _money_string(line.debit_amount),
                "credit_amount": _money_string(line.credit_amount),
                "running_balance": _money_string(running_balance),
            }
        )

    return {
        "account": {
            "id": account.id,
            "code": account.code,
            "name": account.name,
            "account_type": account.account_type,
        },
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "rows": rows,
        "closing_balance": _money_string(
            _balance_for_account_type(
                account.account_type,
                running_debits,
                running_credits,
            )
        ),
    }


def build_cashbook(
    *,
    finance_account_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    finance_account = FinanceAccount.objects.select_related("chart_account").get(
        pk=finance_account_id
    )
    ledger = build_general_ledger(
        account_id=finance_account.chart_account_id,
        start_date=start_date,
        end_date=end_date,
    )
    return {
        "finance_account": {
            "id": finance_account.id,
            "name": finance_account.name,
            "kind": finance_account.kind,
            "chart_account_id": finance_account.chart_account_id,
            "chart_account_code": finance_account.chart_account.code,
        },
        **ledger,
    }
