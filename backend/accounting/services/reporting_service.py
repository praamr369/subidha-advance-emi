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
from billing.models import BillingInvoice
from inventory.models import PurchaseBill


def _money(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


def _money_string(value) -> str:
    return f"{_money(value):.2f}"


def _balance_for_account_type(account_type: str, debit_total: Decimal, credit_total: Decimal) -> Decimal:
    if account_type in {ChartOfAccountType.ASSET, ChartOfAccountType.EXPENSE}:
        return debit_total - credit_total
    return credit_total - debit_total


def _balance_side_for_account_type(account_type: str, balance: Decimal) -> str:
    """Label a positive `balance` (from `_balance_for_account_type`) with its natural DR/CR side.

    ASSET/EXPENSE balances are debit-total minus credit-total, so a non-negative
    balance sits on the debit side. LIABILITY/EQUITY/INCOME balances are the
    reverse (credit-total minus debit-total), so a non-negative balance there
    sits on the credit side.
    """
    natural_side = (
        "DR" if account_type in {ChartOfAccountType.ASSET, ChartOfAccountType.EXPENSE} else "CR"
    )
    opposite_side = "CR" if natural_side == "DR" else "DR"
    return natural_side if balance >= MONEY_ZERO else opposite_side


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
                "balance_side": _balance_side_for_account_type(row["account_type"], balance),
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

    account_map = ChartOfAccount.objects.in_bulk([account_id for _, account_id in collapsed.keys()])

    for (group, account_id), amount in collapsed.items():
        account = account_map[account_id]
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
    category: str | None = None,
) -> dict:
    account = ChartOfAccount.objects.get(pk=account_id)
    rows = []
    running_debits = MONEY_ZERO
    running_credits = MONEY_ZERO

    lines_qs = _posted_lines_queryset(start_date=start_date, end_date=end_date).filter(
        chart_account_id=account_id
    )
    
    if category:
        cat = category.strip().upper()
        from django.db.models import Q
        if cat == "SALARY":
            lines_qs = lines_qs.filter(Q(journal_entry__entry_type="SALARY") | Q(journal_entry__source_model__icontains="Salary"))
        elif cat == "EXPENSE":
            lines_qs = lines_qs.filter(Q(journal_entry__entry_type="EXPENSE") | Q(journal_entry__source_model__icontains="Expense") | Q(journal_entry__source_model__icontains="Voucher") | Q(journal_entry__source_model__icontains="Claim"))
        elif cat == "COMMISSION":
            lines_qs = lines_qs.filter(journal_entry__source_model__icontains="Commission")
        elif cat == "PURCHASE":
            lines_qs = lines_qs.filter(Q(journal_entry__source_model__icontains="Purchase") | Q(journal_entry__source_model__icontains="Inventory"))
        elif cat == "MANUAL":
            lines_qs = lines_qs.filter(journal_entry__entry_type="MANUAL")
        elif cat == "MONEY_MOVEMENT":
            lines_qs = lines_qs.filter(Q(journal_entry__entry_type="MONEY_MOVEMENT") | Q(journal_entry__source_model__icontains="Fund") | Q(journal_entry__source_model__icontains="Movement") | Q(journal_entry__source_model__icontains="Transfer"))
        elif cat == "BILLING":
            lines_qs = lines_qs.filter(Q(journal_entry__source_model__icontains="Billing") | Q(journal_entry__source_model__icontains="Invoice"))

    for line in lines_qs:
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
                "voucher_type": line.journal_entry.voucher_type,
                "source_type": line.journal_entry.source_type,
                "source_reference": line.journal_entry.source_reference,
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


# Plain-language labels for the money-movement source types that post to
# cash/bank/UPI accounts. Unknown types fall back to a title-cased version, so a
# new rail still shows up (just less pretty) rather than being hidden.
MONEY_SOURCE_LABELS: dict[str, str] = {
    "PAYMENT": "EMI collections",
    "SUBSCRIPTION_PAYMENT": "EMI collections",
    "DIRECT_SALE": "Direct sales",
    "RENT_LEASE": "Rent & lease",
    "RENT": "Rent",
    "LEASE": "Lease",
    "SECURITY_DEPOSIT": "Security deposits",
    "CUSTOMER_ADVANCE": "Customer advances",
    "MONEY_MOVEMENT": "Account transfers",
    "FINANCE_TRANSFER": "Account transfers",
    "RECEIPT": "Receipts",
    "VENDOR_PAYMENT": "Vendor payments",
    "VENDOR_SETTLEMENT": "Vendor settlements",
    "SALARY_PAYMENT": "Salary payouts",
    "EXPENSE": "Expenses",
    "COMMISSION_PAYOUT": "Commission payouts",
    "OWNER_FUND_INJECTION": "Owner fund injection",
}


def _money_source_label(source_type: str | None) -> str:
    if not source_type:
        return "Other"
    return MONEY_SOURCE_LABELS.get(source_type, source_type.replace("_", " ").title())


def build_money_in_hand(*, branch_id: int | None = None) -> dict:
    """Authoritative 'how much money do I hold right now' from the posted ledger.

    Every rail that moves money — EMI, rent/lease, direct sale, deposits, finance
    transfers — posts a journal to a cash/bank/UPI chart account, so the posted
    ledger is the single source of truth. This deliberately does NOT read the
    Payment model, which only covers one rail and misses the rest.

    Also returns `income_by_source` — money IN (debits to cash/bank/UPI) grouped
    by where it came from — and `outflow_by_source` — money OUT (credits) grouped
    by where it went — so the operator can see, transparently, which rail every
    rupee came from and every settlement went to.
    """
    per_kind: dict[str, Decimal] = {"CASH": MONEY_ZERO, "BANK": MONEY_ZERO, "UPI": MONEY_ZERO}
    accounts: list[dict] = []
    income_totals: dict[str, Decimal] = {}
    outflow_totals: dict[str, Decimal] = {}
    money_in_rows: list[dict] = []
    money_out_rows: list[dict] = []
    for kind in ("CASH", "BANK", "UPI"):
        book = build_finance_book(kinds=[kind], branch_id=branch_id)
        per_kind[kind] = _money(book["summary"]["net_balance"])
        accounts.extend(book["accounts"])
        for row in book["rows"]:
            source_type = row.get("source_type") or ""
            debit = _money(row.get("debit_amount"))
            credit = _money(row.get("credit_amount"))
            if debit > MONEY_ZERO:
                income_totals[source_type] = income_totals.get(source_type, MONEY_ZERO) + debit
                money_in_rows.append(
                    {
                        "entry_date": row.get("entry_date"),
                        "source_type": source_type or "OTHER",
                        "source_label": _money_source_label(source_type),
                        "finance_account_name": row.get("finance_account_name"),
                        "kind": kind,
                        "reference": row.get("source_reference") or row.get("entry_no"),
                        "description": row.get("description") or "",
                        "amount": _money_string(debit),
                    }
                )
            if credit > MONEY_ZERO:
                outflow_totals[source_type] = outflow_totals.get(source_type, MONEY_ZERO) + credit
                money_out_rows.append(
                    {
                        "entry_date": row.get("entry_date"),
                        "source_type": source_type or "OTHER",
                        "source_label": _money_source_label(source_type),
                        "finance_account_name": row.get("finance_account_name"),
                        "kind": kind,
                        "reference": row.get("source_reference") or row.get("entry_no"),
                        "description": row.get("description") or "",
                        "amount": _money_string(credit),
                    }
                )
    total = per_kind["CASH"] + per_kind["BANK"] + per_kind["UPI"]
    # Most recent money-in events across every rail, so "recent collections" shows
    # real receipts (EMI, direct sale, rent/lease, deposits) not just Payment rows.
    recent_receipts = sorted(
        money_in_rows, key=lambda r: (r["entry_date"] or ""), reverse=True
    )[:8]
    # Most recent money-out events (security deposit refunds, vendor payments,
    # salary payouts, etc.) — mirrors recent_receipts for the outflow side.
    recent_outflows = sorted(
        money_out_rows, key=lambda r: (r["entry_date"] or ""), reverse=True
    )[:8]

    def _breakdown(totals: dict[str, Decimal]) -> list[dict]:
        return [
            {
                "source_type": source_type or "OTHER",
                "label": _money_source_label(source_type),
                "amount": _money_string(amount),
            }
            for source_type, amount in sorted(totals.items(), key=lambda item: item[1], reverse=True)
            if amount > MONEY_ZERO
        ]

    total_income = sum(income_totals.values(), MONEY_ZERO)
    total_outflow = sum(outflow_totals.values(), MONEY_ZERO)
    return {
        "cash": _money_string(per_kind["CASH"]),
        "bank": _money_string(per_kind["BANK"]),
        "upi": _money_string(per_kind["UPI"]),
        "total": _money_string(total),
        "accounts": accounts,
        "income_by_source": _breakdown(income_totals),
        "outflow_by_source": _breakdown(outflow_totals),
        "total_income": _money_string(total_income),
        "total_outflow": _money_string(total_outflow),
        "recent_receipts": recent_receipts,
        "recent_outflows": recent_outflows,
    }


def build_finance_book(
    *,
    kinds: list[str],
    start_date: date | None = None,
    end_date: date | None = None,
    branch_id: int | None = None,
) -> dict:
    finance_accounts = list(
        FinanceAccount.objects.select_related("chart_account")
        .filter(kind__in=kinds, is_active=True, is_real_settlement_account=True)
        .order_by("name", "id")
    )
    if branch_id is not None:
        finance_accounts = [account for account in finance_accounts if account.branch_id == int(branch_id)]
    finance_account_ids = [account.id for account in finance_accounts]
    chart_account_ids = set([account.chart_account_id for account in finance_accounts if account.chart_account_id])
    finance_account_by_chart_account_id = {
        account.chart_account_id: account for account in finance_accounts if account.chart_account_id
    }
    finance_account_by_id = {account.id: account for account in finance_accounts}

    from accounting.models import FinanceAccountCoaMapping
    mappings = FinanceAccountCoaMapping.objects.filter(finance_account_id__in=finance_account_ids)
    for mapping in mappings:
        if mapping.chart_account_id:
            chart_account_ids.add(mapping.chart_account_id)
            finance_account_by_chart_account_id[mapping.chart_account_id] = finance_account_by_id[mapping.finance_account_id]
            
    chart_account_ids = list(chart_account_ids)
    rows = []
    total_debit = MONEY_ZERO
    total_credit = MONEY_ZERO
    # Per-account running net so the operator can see the balance held in each
    # individual cash counter / bank / UPI account, not just the combined total.
    per_account: dict[int, dict] = {}
    for line in _posted_lines_queryset(start_date=start_date, end_date=end_date).filter(
        chart_account_id__in=chart_account_ids
    ):
        matched_account = finance_account_by_chart_account_id[line.chart_account_id]
        debit = _money(line.debit_amount)
        credit = _money(line.credit_amount)
        total_debit += debit
        total_credit += credit
        bucket = per_account.setdefault(
            matched_account.id,
            {
                "finance_account_id": matched_account.id,
                "finance_account_name": matched_account.name,
                "kind": matched_account.kind,
                "total_debit": MONEY_ZERO,
                "total_credit": MONEY_ZERO,
            },
        )
        bucket["total_debit"] += debit
        bucket["total_credit"] += credit
        rows.append(
            {
                "finance_account_id": matched_account.id,
                "finance_account_name": matched_account.name,
                "branch_id": matched_account.branch_id,
                "kind": matched_account.kind,
                "journal_entry_id": line.journal_entry_id,
                "entry_no": line.journal_entry.entry_no,
                "entry_date": line.journal_entry.entry_date.isoformat(),
                "voucher_type": line.journal_entry.voucher_type,
                "source_type": line.journal_entry.source_type,
                "source_reference": line.journal_entry.source_reference,
                "memo": line.journal_entry.memo,
                "source_model": line.journal_entry.source_model,
                "source_id": line.journal_entry.source_id,
                "description": line.description,
                "debit_amount": _money_string(line.debit_amount),
                "credit_amount": _money_string(line.credit_amount),
            }
        )
    # For cash/bank/UPI (asset) accounts, debit increases the balance and credit
    # decreases it, so the net balance held is debit − credit.
    accounts_summary = [
        {
            "finance_account_id": bucket["finance_account_id"],
            "finance_account_name": bucket["finance_account_name"],
            "kind": bucket["kind"],
            "total_debit": _money_string(bucket["total_debit"]),
            "total_credit": _money_string(bucket["total_credit"]),
            "net_balance": _money_string(bucket["total_debit"] - bucket["total_credit"]),
        }
        for bucket in per_account.values()
    ]
    return {
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "branch_id": branch_id,
        "finance_account_kinds": kinds,
        "rows": rows,
        "summary": {
            "total_debit": _money_string(total_debit),
            "total_credit": _money_string(total_credit),
            "net_balance": _money_string(total_debit - total_credit),
            "row_count": len(rows),
        },
        "accounts": accounts_summary,
    }


def build_sales_book(*, start_date: date | None = None, end_date: date | None = None, branch_id: int | None = None) -> dict:
    queryset = BillingInvoice.objects.select_related("posted_journal_entry").filter(
        status="POSTED",
        posted_journal_entry__isnull=False,
    )
    if branch_id is not None:
        queryset = queryset.filter(branch_id=branch_id)
    if start_date:
        queryset = queryset.filter(invoice_date__gte=start_date)
    if end_date:
        queryset = queryset.filter(invoice_date__lte=end_date)
    rows = [
        {
            "invoice_id": invoice.id,
            "document_no": invoice.document_no,
            "invoice_date": invoice.invoice_date.isoformat(),
            "branch_id": invoice.branch_id,
            "customer_name": invoice.customer_name_snapshot,
            "billing_channel": invoice.billing_channel,
            "tax_mode": invoice.tax_mode,
            "grand_total": _money_string(invoice.grand_total),
            "tax_total": _money_string(invoice.tax_total),
            "journal_entry_id": invoice.posted_journal_entry_id,
            "journal_entry_no": invoice.posted_journal_entry.entry_no,
        }
        for invoice in queryset.order_by("-invoice_date", "-id")
    ]
    return {
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "branch_id": branch_id,
        "rows": rows,
    }


def build_purchase_book(*, start_date: date | None = None, end_date: date | None = None, branch_id: int | None = None) -> dict:
    queryset = PurchaseBill.objects.select_related("vendor", "posted_journal_entry").filter(
        status="POSTED",
        posted_journal_entry__isnull=False,
    )
    if branch_id is not None:
        queryset = queryset.filter(branch_id=branch_id)
    if start_date:
        queryset = queryset.filter(bill_date__gte=start_date)
    if end_date:
        queryset = queryset.filter(bill_date__lte=end_date)
    rows = [
        {
            "purchase_bill_id": bill.id,
            "bill_no": bill.bill_no,
            "bill_date": bill.bill_date.isoformat(),
            "branch_id": bill.branch_id,
            "vendor_name": bill.vendor.name,
            "tax_mode": bill.tax_mode,
            "grand_total": _money_string(bill.grand_total),
            "tax_total": _money_string(bill.tax_total),
            "journal_entry_id": bill.posted_journal_entry_id,
            "journal_entry_no": bill.posted_journal_entry.entry_no,
        }
        for bill in queryset.order_by("-bill_date", "-id")
    ]
    return {
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "branch_id": branch_id,
        "rows": rows,
    }
