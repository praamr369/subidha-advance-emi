from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    JournalEntryType,
    SalaryPayment,
    SalarySheet,
    SalarySheetStatus,
)
from accounting.services.journal_posting_service import (
    _log_accounting_event,
    create_journal_entry,
    post_journal_entry,
)


def _ensure_system_account(*, system_code: str, code: str, name: str, account_type: str):
    account, _ = ChartOfAccount.objects.get_or_create(
        system_code=system_code,
        defaults={
            "code": code,
            "name": name,
            "account_type": account_type,
            "allow_manual_posting": False,
            "is_active": True,
        },
    )
    return account


@transaction.atomic
def approve_salary_sheet(*, salary_sheet_id: int, approved_by):
    salary_sheet = SalarySheet.objects.select_for_update().get(pk=salary_sheet_id)

    if salary_sheet.status == SalarySheetStatus.APPROVED:
        return salary_sheet, False
    if salary_sheet.status in {
        SalarySheetStatus.POSTED,
        SalarySheetStatus.PAID_PARTIAL,
        SalarySheetStatus.PAID,
    }:
        return salary_sheet, False

    salary_sheet.status = SalarySheetStatus.APPROVED
    salary_sheet.save(update_fields=["status", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_SALARY_APPROVED",
        instance=salary_sheet,
        performed_by=approved_by,
        metadata={
            "salary_sheet_id": salary_sheet.id,
            "employee_id": salary_sheet.employee_id,
            "period": f"{salary_sheet.year}-{salary_sheet.month:02d}",
        },
    )
    return salary_sheet, True


@transaction.atomic
def post_salary_sheet(*, salary_sheet_id: int, posted_by):
    salary_sheet = SalarySheet.objects.select_for_update().select_related("employee").get(
        pk=salary_sheet_id
    )

    if salary_sheet.status in {
        SalarySheetStatus.POSTED,
        SalarySheetStatus.PAID_PARTIAL,
        SalarySheetStatus.PAID,
    } and salary_sheet.posted_journal_entry_id:
        return salary_sheet, False

    if salary_sheet.status != SalarySheetStatus.APPROVED:
        raise ValueError("Salary sheet must be approved before posting.")

    salary_expense_account = _ensure_system_account(
        system_code="SALARY_EXPENSE",
        code="SYS-SALARY-EXPENSE",
        name="Salary Expense",
        account_type=ChartOfAccountType.EXPENSE,
    )
    salary_payable_account = _ensure_system_account(
        system_code="SALARY_PAYABLE",
        code="SYS-SALARY-PAYABLE",
        name="Salary Payable",
        account_type=ChartOfAccountType.LIABILITY,
    )

    journal_entry = create_journal_entry(
        entry_date=timezone.localdate(),
        entry_type=JournalEntryType.SALARY,
        memo=f"Salary sheet {salary_sheet.employee.employee_code} {salary_sheet.year}-{salary_sheet.month:02d}",
        source_model="SalarySheet",
        source_id=str(salary_sheet.id),
        lines=[
            {
                "chart_account": salary_expense_account,
                "description": salary_sheet.employee.name,
                "debit_amount": salary_sheet.net_amount,
                "credit_amount": 0,
            },
            {
                "chart_account": salary_payable_account,
                "description": salary_sheet.employee.name,
                "debit_amount": 0,
                "credit_amount": salary_sheet.net_amount,
            },
        ],
    )
    posted_journal, _ = post_journal_entry(
        journal_entry_id=journal_entry.id,
        posted_by=posted_by,
    )

    salary_sheet.posted_journal_entry = posted_journal
    salary_sheet.status = SalarySheetStatus.POSTED
    salary_sheet.save(update_fields=["posted_journal_entry", "status", "updated_at"])

    _log_accounting_event(
        event="ACCOUNTING_SALARY_POSTED",
        instance=salary_sheet,
        performed_by=posted_by,
        metadata={
            "salary_sheet_id": salary_sheet.id,
            "journal_entry_id": posted_journal.id,
            "journal_entry_no": posted_journal.entry_no,
        },
    )
    return salary_sheet, True


@transaction.atomic
def post_salary_payment(
    *,
    salary_sheet_id: int,
    payment_date,
    amount,
    finance_account_id: int,
    reference_no: str = "",
    posted_by=None,
):
    salary_sheet = SalarySheet.objects.select_for_update().get(pk=salary_sheet_id)
    finance_account = FinanceAccount.objects.select_for_update().select_related(
        "chart_account"
    ).get(pk=finance_account_id)
    salary_payable_account = _ensure_system_account(
        system_code="SALARY_PAYABLE",
        code="SYS-SALARY-PAYABLE",
        name="Salary Payable",
        account_type=ChartOfAccountType.LIABILITY,
    )

    salary_payment = SalaryPayment.objects.create(
        salary_sheet=salary_sheet,
        payment_date=payment_date,
        amount=amount,
        finance_account=finance_account,
        reference_no=reference_no,
    )

    journal_entry = create_journal_entry(
        entry_date=payment_date,
        entry_type=JournalEntryType.SALARY,
        memo=f"Salary payment {salary_sheet.employee.employee_code}",
        source_model="SalaryPayment",
        source_id=str(salary_payment.id),
        lines=[
            {
                "chart_account": salary_payable_account,
                "description": salary_sheet.employee.name,
                "debit_amount": amount,
                "credit_amount": 0,
            },
            {
                "chart_account": finance_account.chart_account,
                "description": reference_no or f"Salary payment {salary_payment.id}",
                "debit_amount": 0,
                "credit_amount": amount,
            },
        ],
    )
    posted_journal, _ = post_journal_entry(
        journal_entry_id=journal_entry.id,
        posted_by=posted_by,
    )

    salary_payment.posted_journal_entry = posted_journal
    salary_payment.save(update_fields=["posted_journal_entry", "updated_at"])

    total_paid = sum(payment.amount for payment in salary_sheet.salary_payments.all())
    if total_paid >= salary_sheet.net_amount:
        salary_sheet.status = SalarySheetStatus.PAID
    else:
        salary_sheet.status = SalarySheetStatus.PAID_PARTIAL
    salary_sheet.save(update_fields=["status", "updated_at"])

    _log_accounting_event(
        event="ACCOUNTING_SALARY_PAYMENT_POSTED",
        instance=salary_payment,
        performed_by=posted_by,
        metadata={
            "salary_payment_id": salary_payment.id,
            "salary_sheet_id": salary_sheet.id,
            "journal_entry_id": posted_journal.id,
        },
    )
    return salary_payment

