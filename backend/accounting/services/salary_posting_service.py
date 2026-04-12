from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounting.models import (
    CompensationComponentType,
    FinanceAccount,
    SalaryPayment,
    SalarySheet,
    SalarySheetStatus,
)
from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.journal_posting_service import _log_accounting_event
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _salary_earnings_total(salary_sheet: SalarySheet) -> Decimal:
    if salary_sheet.lines.exists():
        return sum(
            (
                _money(line.amount)
                for line in salary_sheet.lines.all()
                if line.component_type == CompensationComponentType.EARNING
            ),
            Decimal("0.00"),
        )
    return _money(salary_sheet.gross_amount)


def _salary_deductions_total(salary_sheet: SalarySheet) -> Decimal:
    if salary_sheet.lines.exists():
        return sum(
            (
                _money(line.amount)
                for line in salary_sheet.lines.all()
                if line.component_type == CompensationComponentType.DEDUCTION
            ),
            Decimal("0.00"),
        )
    return _money(salary_sheet.deductions_amount)


def _salary_payment_total(*, salary_sheet_id: int) -> Decimal:
    return sum(
        (
            _money(payment.amount)
            for payment in SalaryPayment.objects.filter(salary_sheet_id=salary_sheet_id)
        ),
        Decimal("0.00"),
    )


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
    salary_sheet = SalarySheet.objects.select_for_update().select_related("employee", "payroll_period").prefetch_related("lines").get(
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

    earnings_total = _salary_earnings_total(salary_sheet)
    deductions_total = _salary_deductions_total(salary_sheet)
    net_amount = _money(salary_sheet.net_amount)
    if earnings_total <= Decimal("0.00"):
        raise ValueError("Salary sheet earnings total must be greater than zero.")

    accounts = ensure_phase3_system_accounts()
    bridge_lines = [
        {
            "chart_account": accounts["SALARY_EXPENSE"],
            "description": salary_sheet.employee.name,
            "debit_amount": earnings_total,
            "credit_amount": Decimal("0.00"),
        },
        {
            "chart_account": accounts["SALARY_PAYABLE"],
            "description": salary_sheet.employee.name,
            "debit_amount": Decimal("0.00"),
            "credit_amount": net_amount,
        },
    ]
    if deductions_total > Decimal("0.00"):
        bridge_lines.append(
            {
                "chart_account": accounts["PAYROLL_DEDUCTIONS_CLEARING"],
                "description": salary_sheet.employee.name,
                "debit_amount": Decimal("0.00"),
                "credit_amount": deductions_total,
            }
        )

    posted_journal, _ = post_bridge_entry(
        source_instance=salary_sheet,
        purpose="SALARY_ACCRUAL",
        entry_date=salary_sheet.payroll_period.end_date if salary_sheet.payroll_period_id else timezone.localdate(),
        memo=f"Salary sheet {salary_sheet.employee.employee_code} {salary_sheet.year}-{salary_sheet.month:02d}",
        voucher_type="SALARY_ACCRUAL",
        source_type="SALARY_SHEET",
        source_reference=f"{salary_sheet.employee.employee_code}-{salary_sheet.year}-{salary_sheet.month:02d}",
        trace_metadata={
            "employee_id": salary_sheet.employee_id,
            "employee_code": salary_sheet.employee.employee_code,
            "earnings_total": f"{earnings_total:.2f}",
            "deductions_total": f"{deductions_total:.2f}",
            "net_amount": f"{net_amount:.2f}",
        },
        lines=bridge_lines,
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
    salary_sheet = (
        SalarySheet.objects.select_for_update()
        .select_related("employee")
        .prefetch_related("salary_payments")
        .get(pk=salary_sheet_id)
    )
    finance_account = FinanceAccount.objects.select_for_update().select_related(
        "chart_account"
    ).get(pk=finance_account_id)
    accounts = ensure_phase3_system_accounts()

    payment_amount = Decimal(str(amount or "0.00")).quantize(Decimal("0.01"))
    if payment_amount <= Decimal("0.00"):
        raise ValueError("Salary payment amount must be greater than zero.")
    if salary_sheet.posted_journal_entry_id is None or salary_sheet.status not in {
        SalarySheetStatus.POSTED,
        SalarySheetStatus.PAID_PARTIAL,
        SalarySheetStatus.PAID,
    }:
        raise ValueError("Salary sheet must be posted before salary payment.")

    total_paid = _salary_payment_total(salary_sheet_id=salary_sheet.id)
    outstanding = Decimal(str(salary_sheet.net_amount or "0.00")) - total_paid
    if outstanding <= Decimal("0.00"):
        raise ValueError("Salary sheet is already fully paid.")
    if payment_amount > outstanding:
        raise ValueError("Salary payment amount cannot exceed the outstanding salary balance.")

    salary_payment = SalaryPayment.objects.create(
        salary_sheet=salary_sheet,
        payment_date=payment_date,
        amount=payment_amount,
        finance_account=finance_account,
        reference_no=reference_no,
    )

    posted_journal, _ = post_bridge_entry(
        source_instance=salary_payment,
        purpose="SALARY_PAYMENT",
        entry_date=payment_date,
        memo=f"Salary payment {salary_sheet.employee.employee_code}",
        voucher_type="SALARY_PAYMENT",
        source_type="SALARY_PAYMENT",
        source_reference=salary_payment.reference_no or f"SALPAY-{salary_payment.id}",
        trace_metadata={
            "salary_sheet_id": salary_sheet.id,
            "employee_id": salary_sheet.employee_id,
            "employee_code": salary_sheet.employee.employee_code,
            "amount": f"{payment_amount:.2f}",
        },
        lines=[
            {
                "chart_account": accounts["SALARY_PAYABLE"],
                "description": salary_sheet.employee.name,
                "debit_amount": payment_amount,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": finance_account.chart_account,
                "description": reference_no or f"Salary payment {salary_payment.id}",
                "debit_amount": Decimal("0.00"),
                "credit_amount": payment_amount,
            },
        ],
        posted_by=posted_by,
    )

    salary_payment.posted_journal_entry = posted_journal
    salary_payment.save(update_fields=["posted_journal_entry", "updated_at"])

    total_paid = _salary_payment_total(salary_sheet_id=salary_sheet.id)
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
