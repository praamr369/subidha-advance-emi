from __future__ import annotations

from decimal import Decimal
from django.db import transaction

from accounting.models import (
    ChartOfAccount,
    ExpenseVoucher,
    ExpenseVoucherStatus,
    FinanceAccountCoaMapping,
    JournalEntryType,
    MONEY_ZERO,
)
from accounting.services.journal_posting_service import (
    _log_accounting_event,
    create_journal_entry,
    post_journal_entry,
)


def _sync_voucher_amounts(voucher: ExpenseVoucher) -> None:
    tax = voucher.tax_amount or MONEY_ZERO
    gross = voucher.gross_amount or MONEY_ZERO
    net = voucher.net_amount or MONEY_ZERO

    if gross <= MONEY_ZERO and net > MONEY_ZERO:
        voucher.gross_amount = (net - tax) if (net > tax and (net - tax) > MONEY_ZERO) else net
    elif net <= MONEY_ZERO and gross > MONEY_ZERO:
        voucher.net_amount = gross + tax


@transaction.atomic
def approve_expense_voucher(*, expense_voucher_id: int, approved_by):
    voucher = ExpenseVoucher.objects.select_for_update().get(pk=expense_voucher_id)

    if voucher.status == ExpenseVoucherStatus.APPROVED:
        return voucher, False
    if voucher.status == ExpenseVoucherStatus.POSTED:
        return voucher, False
    if voucher.status == ExpenseVoucherStatus.CANCELLED:
        raise ValueError("Cancelled expense vouchers cannot be approved.")

    _sync_voucher_amounts(voucher)
    voucher.status = ExpenseVoucherStatus.APPROVED
    voucher.save(update_fields=["status", "gross_amount", "net_amount", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_EXPENSE_APPROVED",
        instance=voucher,
        performed_by=approved_by,
        metadata={"expense_voucher_id": voucher.id, "voucher_no": voucher.voucher_no},
    )
    return voucher, True


@transaction.atomic
def post_expense_voucher(*, expense_voucher_id: int, posted_by):
    voucher = (
        ExpenseVoucher.objects.select_for_update()
        .select_related("expense_account", "finance_account", "finance_account__chart_account")
        .get(pk=expense_voucher_id)
    )

    if voucher.status == ExpenseVoucherStatus.POSTED and voucher.posted_journal_entry_id:
        return voucher, False

    if voucher.status == ExpenseVoucherStatus.CANCELLED:
        raise ValueError("Cancelled expense vouchers cannot be posted.")
    if voucher.status != ExpenseVoucherStatus.APPROVED:
        raise ValueError("Expense voucher must be approved before posting.")
    if voucher.finance_account_id is None:
        raise ValueError("Expense voucher requires a finance account before posting.")

    _sync_voucher_amounts(voucher)

    finance_chart = getattr(voucher.finance_account, "chart_account", None)
    if finance_chart is None:
        mapping = FinanceAccountCoaMapping.objects.filter(
            finance_account=voucher.finance_account,
            is_active=True,
        ).first()
        if mapping and mapping.chart_account:
            finance_chart = mapping.chart_account
    if finance_chart is None:
        raise ValueError(f"Finance account '{voucher.finance_account.name}' has no linked Chart of Account.")

    journal_entry = create_journal_entry(
        entry_date=voucher.expense_date,
        entry_type=JournalEntryType.EXPENSE,
        memo=voucher.notes or f"Expense voucher {voucher.voucher_no}",
        source_model="ExpenseVoucher",
        source_id=str(voucher.id),
        lines=[
            {
                "chart_account": voucher.expense_account,
                "description": voucher.notes or voucher.voucher_no,
                "debit_amount": voucher.net_amount,
                "credit_amount": 0,
            },
            {
                "chart_account": finance_chart,
                "description": voucher.voucher_no,
                "debit_amount": 0,
                "credit_amount": voucher.net_amount,
            },
        ],
    )
    posted_journal, _ = post_journal_entry(
        journal_entry_id=journal_entry.id,
        posted_by=posted_by,
    )

    voucher.posted_journal_entry = posted_journal
    voucher.status = ExpenseVoucherStatus.POSTED
    voucher.save(update_fields=["posted_journal_entry", "status", "gross_amount", "net_amount", "updated_at"])

    _log_accounting_event(
        event="ACCOUNTING_EXPENSE_POSTED",
        instance=voucher,
        performed_by=posted_by,
        metadata={
            "expense_voucher_id": voucher.id,
            "voucher_no": voucher.voucher_no,
            "journal_entry_id": posted_journal.id,
            "journal_entry_no": posted_journal.entry_no,
        },
    )
    return voucher, True

