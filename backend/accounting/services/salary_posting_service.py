from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
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
from accounting.services.journal_posting_service import _log_accounting_event, void_journal_entry
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
    # payroll_period is nullable, so select_related() on it produces a LEFT OUTER
    # JOIN; Postgres rejects `SELECT ... FOR UPDATE` on the nullable side of an
    # outer join. select_for_update(of=("self",)) limits the row lock to the
    # SalarySheet table itself, which is all that's needed here.
    # No prefetch_related("lines") here: _reconcile_staff_advance_deduction_line
    # may mutate lines below, and the totals must always read fresh rows.
    salary_sheet = (
        SalarySheet.objects.select_for_update(of=("self",))
        .select_related("employee", "payroll_period")
        .get(pk=salary_sheet_id)
    )

    if salary_sheet.status in {
        SalarySheetStatus.POSTED,
        SalarySheetStatus.PAID_PARTIAL,
        SalarySheetStatus.PAID,
    } and salary_sheet.posted_journal_entry_id:
        return salary_sheet, False

    if salary_sheet.status != SalarySheetStatus.APPROVED:
        raise ValueError("Salary sheet must be approved before posting.")

    totals_adjusted = _reconcile_staff_advance_deduction_line(
        salary_sheet=salary_sheet, posted_by=posted_by
    )

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
    # Any reconciled totals ride along with the APPROVED -> POSTED transition,
    # the only save the sheet's immutability guard permits at this stage.
    update_fields = ["posted_journal_entry", "status", "updated_at"]
    if totals_adjusted:
        update_fields += ["gross_amount", "deductions_amount", "net_amount"]
    salary_sheet.save(update_fields=update_fields)

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

    _apply_staff_advance_recovery_from_salary_sheet(salary_sheet=salary_sheet, posted_by=posted_by)

    return salary_sheet, True


def _reconcile_staff_advance_deduction_line(*, salary_sheet: SalarySheet, posted_by) -> bool:
    """
    A Staff Advance Recovery deduction line is sized when the sheet is drafted,
    but a cash recovery can land in the gap between draft and post, leaving the
    line larger than what is actually still outstanding. Posting a stale line
    would over-deduct the employee's salary and leave an unclearable balance in
    Payroll Deductions Clearing. So, inside the posting lock, re-clamp the line
    to the live outstanding balance (never increase it beyond what was approved).
    Sheet totals are updated in memory only -- the immutability guard on
    SalarySheet only allows a save on the APPROVED -> POSTED transition, so the
    caller persists them with that save. Returns True when totals changed.
    """
    from accounting.models import SalaryLineSourceType
    from accounting.services.staff_advance_service import total_outstanding_staff_advance

    advance_lines = list(
        salary_sheet.lines.filter(
            component_type=CompensationComponentType.DEDUCTION,
            source_type=SalaryLineSourceType.STAFF_ADVANCE_DEDUCTION,
        ).order_by("sort_order", "id")
    )
    if not advance_lines:
        return False

    line_total = sum((_money(line.amount) for line in advance_lines), Decimal("0.00"))
    outstanding = _money(total_outstanding_staff_advance(employee_id=salary_sheet.employee_id))
    if line_total <= outstanding:
        return False

    # Shrink (or remove) the deduction so it never exceeds what is still owed.
    remaining = outstanding
    for line in advance_lines:
        chunk = min(_money(line.amount), remaining)
        if chunk <= Decimal("0.00"):
            line.delete()
            continue
        if chunk != _money(line.amount):
            line.amount = chunk
            line.rate = chunk
            line.quantity = Decimal("1.00")
            line.notes = (line.notes or "").strip()
            suffix = "Adjusted at posting to match outstanding advance balance."
            line.notes = f"{line.notes} {suffix}".strip()
            line.save(update_fields=["amount", "rate", "quantity", "notes", "updated_at"])
        remaining -= chunk

    gross = sum(
        (
            _money(line.amount)
            for line in salary_sheet.lines.all()
            if line.component_type == CompensationComponentType.EARNING
        ),
        Decimal("0.00"),
    )
    deductions = sum(
        (
            _money(line.amount)
            for line in salary_sheet.lines.all()
            if line.component_type == CompensationComponentType.DEDUCTION
        ),
        Decimal("0.00"),
    )
    salary_sheet.gross_amount = gross
    salary_sheet.deductions_amount = deductions
    salary_sheet.net_amount = gross - deductions

    _log_accounting_event(
        event="ACCOUNTING_SALARY_ADVANCE_LINE_RECONCILED",
        instance=salary_sheet,
        performed_by=posted_by,
        metadata={
            "salary_sheet_id": salary_sheet.id,
            "employee_id": salary_sheet.employee_id,
            "drafted_deduction": f"{line_total:.2f}",
            "outstanding_at_post": f"{outstanding:.2f}",
        },
    )
    return True


def _apply_staff_advance_recovery_from_salary_sheet(*, salary_sheet: SalarySheet, posted_by) -> None:
    """
    If the salary sheet includes a Staff Advance Recovery deduction line,
    actually apply that recovery against the employee's outstanding staff
    advance(s) now that the salary sheet is posted -- oldest advance first.
    Safe to call more than once: a sheet can only be posted once (guarded
    above), so this only ever runs a single time per sheet.
    """
    from accounting.models import CompensationComponentType, SalaryLineSourceType
    from accounting.services.staff_advance_service import outstanding_staff_advances, recover_staff_advance_via_salary

    deduction_amount = sum(
        (
            _money(line.amount)
            for line in salary_sheet.lines.all()
            if line.component_type == CompensationComponentType.DEDUCTION
            and line.source_type == SalaryLineSourceType.STAFF_ADVANCE_DEDUCTION
        ),
        Decimal("0.00"),
    )
    if deduction_amount <= Decimal("0.00"):
        return

    remaining = deduction_amount
    for advance in outstanding_staff_advances(employee_id=salary_sheet.employee_id):
        if remaining <= Decimal("0.00"):
            break
        chunk = min(remaining, advance.outstanding_amount)
        if chunk <= Decimal("0.00"):
            continue
        recover_staff_advance_via_salary(
            staff_advance_id=advance.id,
            amount=chunk,
            salary_sheet=salary_sheet,
            performed_by=posted_by,
        )
        remaining -= chunk


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


@transaction.atomic
def reverse_salary_payment(*, salary_payment_id: int, reason: str, performed_by) -> SalarySheet:
    """
    Reverses a previously recorded salary payment: voids its posted journal
    entry (preserving audit trail as a VOID row, not deleting it) and removes
    the payment record.

    SalarySheet.status only allows forward transitions (APPROVED -> POSTED ->
    PAID_PARTIAL/PAID) by design -- PAID is a deliberate terminal state with
    no backward path, protecting completed payroll from silent status flips.
    This function respects that: it recomputes what the status *would* be
    from the remaining payments and only applies it if the model allows that
    transition. If the sheet is already PAID and reverting would require an
    unsupported backward transition, the sheet status is left as-is; the
    journal void and payment removal are still the authoritative correction.
    """
    reason = (reason or "").strip()
    if not reason:
        raise ValueError("Reversal reason is required.")

    payment = SalaryPayment.objects.select_for_update().select_related("salary_sheet").get(pk=salary_payment_id)
    salary_sheet = SalarySheet.objects.select_for_update(of=("self",)).get(pk=payment.salary_sheet_id)
    status_before = salary_sheet.status

    if payment.posted_journal_entry_id:
        void_journal_entry(journal_entry_id=payment.posted_journal_entry_id, performed_by=performed_by, reason=reason)

    payment_id = payment.id
    payment_amount = payment.amount
    payment.delete()

    total_paid = _salary_payment_total(salary_sheet_id=salary_sheet.id)
    if total_paid <= Decimal("0.00"):
        target_status = SalarySheetStatus.POSTED
    elif total_paid >= salary_sheet.net_amount:
        target_status = SalarySheetStatus.PAID
    else:
        target_status = SalarySheetStatus.PAID_PARTIAL

    status_reverted = False
    if target_status != salary_sheet.status:
        salary_sheet.status = target_status
        try:
            salary_sheet.save(update_fields=["status", "updated_at"])
            status_reverted = True
        except DjangoValidationError:
            salary_sheet.refresh_from_db()

    _log_accounting_event(
        event="ACCOUNTING_SALARY_PAYMENT_REVERSED",
        instance=salary_sheet,
        performed_by=performed_by,
        metadata={
            "salary_payment_id": payment_id,
            "salary_sheet_id": salary_sheet.id,
            "amount": f"{payment_amount:.2f}",
            "reason": reason,
            "status_before": status_before,
            "status_after": salary_sheet.status,
            "status_reverted": status_reverted,
        },
    )
    return salary_sheet
