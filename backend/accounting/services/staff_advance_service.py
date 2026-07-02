from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounting.models import (
    ChartOfAccount,
    StaffAdvance,
    StaffAdvanceRecovery,
    StaffAdvanceRecoverySource,
    StaffAdvanceStatus,
    JournalEntryType,
)
from accounting.services.finance_account_collection_guard import assert_finance_account_allowed_for_payment_collection
from accounting.services.journal_posting_service import create_journal_entry, post_journal_entry


def _asset_account() -> ChartOfAccount:
    account = ChartOfAccount.objects.filter(system_code="STAFF_ADVANCE_ASSET", is_active=True).order_by("id").first()
    if account is None:
        raise ValueError("STAFF_ADVANCE_ASSET is missing. Run Accounting Setup defaults first.")
    return account


def _payroll_deductions_clearing_account() -> ChartOfAccount:
    from accounting.services.operational_accounts_service import ensure_phase3_system_accounts

    return ensure_phase3_system_accounts()["PAYROLL_DEDUCTIONS_CLEARING"]


def _money(value) -> Decimal:
    amount = Decimal(str(value)).quantize(Decimal("0.01"))
    if amount <= 0:
        raise ValueError("Amount must be greater than zero.")
    return amount


@transaction.atomic
def approve_staff_advance(*, staff_advance_id: int, performed_by) -> StaffAdvance:
    row = StaffAdvance.objects.select_for_update().get(pk=staff_advance_id)
    if row.status == StaffAdvanceStatus.APPROVED:
        return row
    if row.status != StaffAdvanceStatus.DRAFT:
        raise ValueError("Only draft staff advances can be approved.")
    row.status = StaffAdvanceStatus.APPROVED
    row.approved_by = performed_by
    row.approved_at = timezone.now()
    row.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
    return row


@transaction.atomic
def disburse_staff_advance(*, staff_advance_id: int, finance_account, disbursement_date, reference_no: str, performed_by) -> StaffAdvance:
    row = StaffAdvance.objects.select_for_update().select_related("employee").get(pk=staff_advance_id)
    if row.status == StaffAdvanceStatus.DISBURSED and row.posted_journal_entry_id:
        return row
    if row.status != StaffAdvanceStatus.APPROVED:
        raise ValueError("Only approved staff advances can be disbursed.")
    assert_finance_account_allowed_for_payment_collection(finance_account)
    journal = create_journal_entry(
        entry_date=disbursement_date,
        entry_type=JournalEntryType.SYSTEM_BRIDGE,
        memo=f"Staff advance disbursement - {row.employee.name}",
        source_model="StaffAdvance",
        source_id=str(row.id),
        source_type="STAFF_ADVANCE_DISBURSEMENT",
        source_reference=f"STAFF-ADVANCE:{row.id}:DISBURSE",
        voucher_type="STAFF_ADVANCE",
        lines=[
            {"chart_account": _asset_account(), "debit_amount": row.amount, "credit_amount": Decimal("0.00"), "description": "Staff advance receivable"},
            {"chart_account": finance_account.chart_account, "debit_amount": Decimal("0.00"), "credit_amount": row.amount, "description": f"Paid from {finance_account.name}"},
        ],
    )
    journal, _ = post_journal_entry(journal_entry_id=journal.id, posted_by=performed_by)
    row.finance_account = finance_account
    row.reference_no = reference_no
    row.status = StaffAdvanceStatus.DISBURSED
    row.disbursed_at = timezone.now()
    row.posted_journal_entry = journal
    row.save(update_fields=["finance_account", "reference_no", "status", "disbursed_at", "posted_journal_entry", "updated_at"])
    return row


@transaction.atomic
def recover_staff_advance(*, staff_advance_id: int, amount, finance_account, recovery_date, reference_no: str, performed_by) -> StaffAdvanceRecovery:
    row = StaffAdvance.objects.select_for_update().select_related("employee").get(pk=staff_advance_id)
    if row.status not in {StaffAdvanceStatus.DISBURSED, StaffAdvanceStatus.PARTIALLY_RECOVERED}:
        raise ValueError("Only disbursed staff advances can receive recovery payments.")
    value = _money(amount)
    if value > row.outstanding_amount:
        raise ValueError("Recovery amount cannot exceed the outstanding staff advance.")
    assert_finance_account_allowed_for_payment_collection(finance_account)
    journal = create_journal_entry(
        entry_date=recovery_date,
        entry_type=JournalEntryType.SYSTEM_BRIDGE,
        memo=f"Staff advance recovery - {row.employee.name}",
        source_model="StaffAdvance",
        source_id=str(row.id),
        source_type="STAFF_ADVANCE_RECOVERY",
        source_reference=f"STAFF-ADVANCE:{row.id}:RECOVERY:{timezone.now().isoformat()}",
        voucher_type="STAFF_ADVANCE",
        lines=[
            {"chart_account": finance_account.chart_account, "debit_amount": value, "credit_amount": Decimal("0.00"), "description": f"Recovered into {finance_account.name}"},
            {"chart_account": _asset_account(), "debit_amount": Decimal("0.00"), "credit_amount": value, "description": "Reduce staff advance receivable"},
        ],
    )
    journal, _ = post_journal_entry(journal_entry_id=journal.id, posted_by=performed_by)
    recovery = StaffAdvanceRecovery.objects.create(
        staff_advance=row,
        recovery_date=recovery_date,
        amount=value,
        finance_account=finance_account,
        reference_no=reference_no,
        posted_journal_entry=journal,
        recorded_by=performed_by,
    )
    row.recovered_amount += value
    row.status = StaffAdvanceStatus.RECOVERED if row.recovered_amount == row.amount else StaffAdvanceStatus.PARTIALLY_RECOVERED
    row.save(update_fields=["recovered_amount", "status", "updated_at"])
    return recovery


def outstanding_staff_advances(*, employee_id: int):
    return (
        StaffAdvance.objects.filter(
            employee_id=employee_id,
            status__in=[StaffAdvanceStatus.DISBURSED, StaffAdvanceStatus.PARTIALLY_RECOVERED],
        )
        .order_by("request_date", "id")
    )


def total_outstanding_staff_advance(*, employee_id: int) -> Decimal:
    total = Decimal("0.00")
    for advance in outstanding_staff_advances(employee_id=employee_id):
        total += advance.outstanding_amount
    return total


@transaction.atomic
def recover_staff_advance_via_salary(*, staff_advance_id: int, amount, salary_sheet, performed_by) -> StaffAdvanceRecovery:
    """
    Recovers a staff advance by deducting it from a posted salary sheet
    instead of a cash/bank collection. No money physically moves through a
    finance account. The salary sheet's own posting already credited
    Payroll Deductions Clearing for this deduction line (a suspense
    liability); this call clears that suspense balance to its real
    destination: debit Payroll Deductions Clearing / credit Staff Advance
    Asset. It does not touch Salary Payable again -- that was already set
    correctly (net of deductions) by the salary sheet posting itself.
    """
    row = StaffAdvance.objects.select_for_update().select_related("employee").get(pk=staff_advance_id)
    if row.status not in {StaffAdvanceStatus.DISBURSED, StaffAdvanceStatus.PARTIALLY_RECOVERED}:
        raise ValueError("Only disbursed staff advances can receive recovery payments.")
    value = _money(amount)
    if value > row.outstanding_amount:
        raise ValueError("Recovery amount cannot exceed the outstanding staff advance.")

    journal = create_journal_entry(
        entry_date=salary_sheet.payroll_period.end_date if salary_sheet.payroll_period_id else timezone.localdate(),
        entry_type=JournalEntryType.SYSTEM_BRIDGE,
        memo=f"Staff advance recovery via salary - {row.employee.name}",
        source_model="StaffAdvance",
        source_id=str(row.id),
        source_type="STAFF_ADVANCE_SALARY_RECOVERY",
        source_reference=f"STAFF-ADVANCE:{row.id}:SALARY-RECOVERY:{salary_sheet.id}",
        voucher_type="STAFF_ADVANCE",
        lines=[
            {"chart_account": _payroll_deductions_clearing_account(), "debit_amount": value, "credit_amount": Decimal("0.00"), "description": f"Clear deduction from salary sheet {salary_sheet.year}-{salary_sheet.month:02d}"},
            {"chart_account": _asset_account(), "debit_amount": Decimal("0.00"), "credit_amount": value, "description": "Reduce staff advance receivable"},
        ],
    )
    journal, _ = post_journal_entry(journal_entry_id=journal.id, posted_by=performed_by)
    recovery = StaffAdvanceRecovery.objects.create(
        staff_advance=row,
        recovery_date=salary_sheet.payroll_period.end_date if salary_sheet.payroll_period_id else timezone.localdate(),
        amount=value,
        recovery_source=StaffAdvanceRecoverySource.SALARY_DEDUCTION,
        salary_sheet=salary_sheet,
        reference_no=f"SALARY-{salary_sheet.year}-{salary_sheet.month:02d}",
        posted_journal_entry=journal,
        recorded_by=performed_by,
    )
    row.recovered_amount += value
    row.status = StaffAdvanceStatus.RECOVERED if row.recovered_amount == row.amount else StaffAdvanceStatus.PARTIALLY_RECOVERED
    row.save(update_fields=["recovered_amount", "status", "updated_at"])
    return recovery
