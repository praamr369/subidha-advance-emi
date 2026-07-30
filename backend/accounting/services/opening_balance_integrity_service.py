"""Day-0 opening-balance integrity checks (read-only).

Verifies that the migrated opening balances (finance accounts, vendor payables,
customer receivables) form a consistent, balanced set before the business goes
live. No financial record is created or mutated here.
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Count, Q, Sum

MONEY_ZERO = Decimal("0.00")


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(MONEY_ZERO)


def _s(value) -> str:
    return f"{_money(value)}"


def build_opening_balance_integrity() -> dict:
    """Return a read-only opening-balance integrity snapshot for Day-0 setup."""
    from accounting.models import (
        CustomerOpeningOutstanding,
        FinanceAccount,
        JournalEntry,
        JournalEntryLine,
        JournalEntryStatus,
        VendorLedgerEntry,
    )

    opening_journals = JournalEntry.objects.filter(source_type="OPENING_BALANCE_MIGRATION")
    posted_journals = opening_journals.filter(status=JournalEntryStatus.POSTED)
    non_posted = opening_journals.exclude(status=JournalEntryStatus.POSTED).count()

    agg = JournalEntryLine.objects.filter(
        journal_entry__in=posted_journals,
    ).aggregate(total_debit=Sum("debit_amount"), total_credit=Sum("credit_amount"))
    total_debit = _money(agg["total_debit"])
    total_credit = _money(agg["total_credit"])
    difference = total_debit - total_credit
    is_balanced = difference == MONEY_ZERO

    # Finance-account opening balances vs journal-backed openings.
    fin_with_opening = FinanceAccount.objects.filter(opening_balance__gt=MONEY_ZERO)
    fin_journal_ids = set(
        posted_journals.filter(source_model="FinanceAccount").values_list("source_id", flat=True)
    )
    fin_missing_journal = [
        fa.id for fa in fin_with_opening if str(fa.id) not in fin_journal_ids
    ]

    # Customer opening receivables.
    receivables = CustomerOpeningOutstanding.objects.all()
    rec_total_original = _money(receivables.aggregate(t=Sum("outstanding_amount"))["t"])
    rec_total_collected = _money(receivables.aggregate(t=Sum("collected_amount"))["t"])
    rec_remaining = _money(rec_total_original - rec_total_collected)
    rec_settled = receivables.filter(is_settled=True).count()
    rec_open = receivables.filter(is_settled=False).count()
    rec_journal_ids = set(
        posted_journals.filter(source_model="CustomerOpeningOutstanding").values_list("source_id", flat=True)
    )
    rec_missing_journal = [
        r.id for r in receivables if str(r.id) not in rec_journal_ids
    ]

    # Vendor opening payables.
    vendor_opening = VendorLedgerEntry.objects.filter(entry_type="OPENING_BALANCE")
    vendor_opening_agg = vendor_opening.aggregate(debit=Sum("debit"), credit=Sum("credit"))
    # Vendor subledger convention: a debit entry increases the payable owed to the
    # vendor (balance_after tracks the outstanding payable), so net payable = debit - credit.
    vendor_opening_net = _money((vendor_opening_agg["debit"] or MONEY_ZERO) - (vendor_opening_agg["credit"] or MONEY_ZERO))
    vendors_with_opening = vendor_opening.values("vendor_id").distinct().count()

    # Opening stock — value should be posted to the GL (Dr Inventory Asset / Cr Retained Earnings).
    try:
        from inventory.models import OpeningStockEntry, OpeningStockEntryStatus

        posted_stock = OpeningStockEntry.objects.filter(status=OpeningStockEntryStatus.POSTED)
        stock_total = posted_stock.count()
        stock_valuation = _money(posted_stock.aggregate(t=Sum("valuation_amount_snapshot"))["t"])
        stock_journal_ids = set(
            posted_journals.filter(source_model="OpeningStockEntry").values_list("source_id", flat=True)
        )
        stock_missing_journal = [e.id for e in posted_stock if str(e.id) not in stock_journal_ids]
    except Exception:
        stock_total = 0
        stock_valuation = MONEY_ZERO
        stock_missing_journal = []

    blockers: list[str] = []
    warnings: list[str] = []
    if non_posted:
        blockers.append(f"{non_posted} opening-balance journal(s) are not POSTED.")
    if not is_balanced:
        blockers.append(
            f"Opening trial balance is not zero: debit {_s(total_debit)} vs credit {_s(total_credit)} (difference {_s(difference)})."
        )
    if fin_missing_journal:
        warnings.append(
            f"{len(fin_missing_journal)} finance account(s) carry an opening balance without a posted opening journal."
        )
    if rec_missing_journal:
        warnings.append(
            f"{len(rec_missing_journal)} customer opening receivable(s) have no posted opening journal."
        )
    if stock_missing_journal:
        warnings.append(
            f"{len(stock_missing_journal)} posted opening-stock entry(ies) have no GL journal; inventory value is not in the opening books."
        )
    if not opening_journals.exists():
        warnings.append("No opening balances have been migrated yet. Enter finance, vendor, and customer opening balances before go-live.")

    status = "BLOCKED" if blockers else ("REQUIRED_PENDING" if warnings else "READY")

    return {
        "status": status,
        "blockers": blockers,
        "warnings": warnings,
        "trial_balance": {
            "opening_journal_count": opening_journals.count(),
            "posted_journal_count": posted_journals.count(),
            "non_posted_journal_count": non_posted,
            "total_debit": _s(total_debit),
            "total_credit": _s(total_credit),
            "difference": _s(difference),
            "is_balanced": is_balanced,
        },
        "finance_accounts": {
            "with_opening_balance": fin_with_opening.count(),
            "missing_opening_journal": len(fin_missing_journal),
        },
        "customer_receivables": {
            "total": receivables.count(),
            "open": rec_open,
            "settled": rec_settled,
            "total_original": _s(rec_total_original),
            "total_collected": _s(rec_total_collected),
            "total_remaining": _s(rec_remaining),
            "missing_opening_journal": len(rec_missing_journal),
        },
        "vendor_payables": {
            "vendors_with_opening": vendors_with_opening,
            "opening_payable_net": _s(vendor_opening_net),
        },
        "opening_stock": {
            "posted_entries": stock_total,
            "total_valuation": _s(stock_valuation),
            "missing_gl_journal": len(stock_missing_journal),
        },
    }
