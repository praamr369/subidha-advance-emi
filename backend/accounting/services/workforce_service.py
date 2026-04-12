from __future__ import annotations

import calendar
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from accounting.models import (
    MONEY_ZERO,
    AttendanceStatus,
    ChartOfAccount,
    ChartOfAccountType,
    CompensationComponentType,
    EmployeeAttendance,
    EmployeeCompensationComponent,
    EmployeeExpenseClaim,
    EmployeeExpenseClaimPayment,
    EmployeeProfile,
    ExpenseClaimStatus,
    FinanceAccount,
    LeaveRequest,
    LeaveRequestStatus,
    PayrollPeriod,
    PayrollPeriodStatus,
    SalaryPayment,
    SalaryLineSourceType,
    SalarySheet,
    SalarySheetLine,
    SalarySheetStatus,
)
from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.journal_posting_service import _log_accounting_event
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts


def _money(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


def _hours(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


def _days(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.1"))


def _text(value) -> str:
    return str(value or "").strip()


def _expense_claim_payment_total(*, expense_claim_id: int) -> Decimal:
    return sum(
        (
            _money(payment.amount)
            for payment in EmployeeExpenseClaimPayment.objects.filter(
                expense_claim_id=expense_claim_id
            )
        ),
        MONEY_ZERO,
    )


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    month_last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, month_last_day)


def _period_code(year: int, month: int) -> str:
    return f"PAY-{year}-{month:02d}"


def _overlapping_closed_period_exists(start_date: date, end_date: date) -> bool:
    return PayrollPeriod.objects.filter(
        status=PayrollPeriodStatus.CLOSED,
        start_date__lte=end_date,
        end_date__gte=start_date,
    ).exists()


def assert_payroll_period_open_for_date(*, reference_date: date):
    if PayrollPeriod.objects.filter(
        status=PayrollPeriodStatus.CLOSED,
        start_date__lte=reference_date,
        end_date__gte=reference_date,
    ).exists():
        raise ValueError("Payroll period is closed for the selected date.")


def assert_payroll_period_open_for_range(*, start_date: date, end_date: date):
    if _overlapping_closed_period_exists(start_date, end_date):
        raise ValueError("Payroll period is closed for one or more dates in the selected range.")


@transaction.atomic
def get_or_create_payroll_period(*, year: int, month: int) -> PayrollPeriod:
    period = PayrollPeriod.objects.select_for_update().filter(year=year, month=month).first()
    if period is not None:
        return period

    start_date, end_date = _month_bounds(year, month)
    return PayrollPeriod.objects.create(
        code=_period_code(year, month),
        year=year,
        month=month,
        start_date=start_date,
        end_date=end_date,
    )


def replace_employee_compensation_components(
    *,
    employee: EmployeeProfile,
    components: list[dict],
):
    EmployeeCompensationComponent.objects.filter(employee=employee).delete()
    EmployeeCompensationComponent.objects.bulk_create(
        [
            EmployeeCompensationComponent(
                employee=employee,
                component_name=_text(component.get("component_name")),
                component_type=(component.get("component_type") or CompensationComponentType.EARNING).strip().upper(),
                amount=_money(component.get("amount")),
                sort_order=int(component.get("sort_order") or index),
                is_active=bool(component.get("is_active", True)),
                notes=_text(component.get("notes")),
            )
            for index, component in enumerate(components, start=1)
            if _text(component.get("component_name"))
        ]
    )


@transaction.atomic
def upsert_employee_attendance(
    *,
    employee,
    attendance_date,
    status: str,
    notes: str = "",
    worked_hours=None,
    overtime_hours=None,
    leave_request=None,
    recorded_by=None,
):
    assert_payroll_period_open_for_date(reference_date=attendance_date)
    attendance, created = EmployeeAttendance.objects.select_for_update().get_or_create(
        employee=employee,
        attendance_date=attendance_date,
        defaults={
            "status": status,
            "worked_hours": _hours(worked_hours),
            "overtime_hours": _hours(overtime_hours),
            "leave_request": leave_request,
            "notes": notes,
            "recorded_by": recorded_by,
        },
    )
    if not created:
        attendance.status = status
        attendance.worked_hours = _hours(worked_hours)
        attendance.overtime_hours = _hours(overtime_hours)
        attendance.leave_request = leave_request
        attendance.notes = notes
        attendance.recorded_by = recorded_by
        attendance.save(
            update_fields=[
                "status",
                "worked_hours",
                "overtime_hours",
                "leave_request",
                "notes",
                "recorded_by",
                "updated_at",
            ]
        )

    _log_accounting_event(
        event="ACCOUNTING_EMPLOYEE_ATTENDANCE_RECORDED",
        instance=attendance,
        performed_by=recorded_by,
        metadata={
            "employee_attendance_id": attendance.id,
            "employee_id": attendance.employee_id,
            "employee_code": attendance.employee.employee_code,
            "attendance_date": attendance.attendance_date.isoformat(),
            "status": attendance.status,
            "worked_hours": f"{attendance.worked_hours:.2f}",
            "overtime_hours": f"{attendance.overtime_hours:.2f}",
            "created": created,
        },
    )
    return attendance, created


def _normalize_leave_day_count(*, start_date: date, end_date: date, explicit_day_count=None) -> Decimal:
    span_days = Decimal((end_date - start_date).days + 1)
    if explicit_day_count in {None, ""}:
        return span_days.quantize(Decimal("0.1"))
    day_count = _days(explicit_day_count)
    if day_count <= MONEY_ZERO:
        raise ValueError("Leave days must be greater than zero.")
    if day_count > span_days:
        raise ValueError("Leave days cannot exceed the inclusive date span.")
    if day_count % Decimal("1.0") != Decimal("0.0") and span_days > Decimal("1.0"):
        raise ValueError("Fractional leave days are only supported for single-date leave requests.")
    return day_count


@transaction.atomic
def upsert_leave_request_draft(*, payload: dict, leave_request_id: int | None = None, performed_by=None) -> LeaveRequest:
    payload = dict(payload)
    if leave_request_id is None:
        start_date = payload.get("start_date")
        end_date = payload.get("end_date") or start_date
        if start_date is None or end_date is None:
            raise ValueError("Leave start and end dates are required.")
        assert_payroll_period_open_for_range(start_date=start_date, end_date=end_date)
        payload["day_count"] = _normalize_leave_day_count(
            start_date=start_date,
            end_date=end_date,
            explicit_day_count=payload.get("day_count"),
        )
        leave_request = LeaveRequest.objects.create(**payload)
        _log_accounting_event(
            event="ACCOUNTING_LEAVE_REQUEST_CREATED",
            instance=leave_request,
            performed_by=performed_by,
            metadata={
                "leave_request_id": leave_request.id,
                "request_no": leave_request.request_no,
                "employee_id": leave_request.employee_id,
            },
        )
        return leave_request

    leave_request = LeaveRequest.objects.select_for_update().get(pk=leave_request_id)
    if leave_request.status != LeaveRequestStatus.DRAFT:
        raise ValueError("Only draft leave requests can be edited.")
    start_date = payload.get("start_date") or leave_request.start_date
    end_date = payload.get("end_date") or leave_request.end_date
    assert_payroll_period_open_for_range(start_date=start_date, end_date=end_date)
    payload["day_count"] = _normalize_leave_day_count(
        start_date=start_date,
        end_date=end_date,
        explicit_day_count=payload.get("day_count", leave_request.day_count),
    )
    for field_name, value in payload.items():
        setattr(leave_request, field_name, value)
    leave_request.save()
    _log_accounting_event(
        event="ACCOUNTING_LEAVE_REQUEST_UPDATED",
        instance=leave_request,
        performed_by=performed_by,
        metadata={
            "leave_request_id": leave_request.id,
            "request_no": leave_request.request_no,
        },
    )
    return leave_request


def _iter_leave_dates(leave_request: LeaveRequest):
    cursor = leave_request.start_date
    while cursor <= leave_request.end_date:
        yield cursor
        cursor += timedelta(days=1)


def _sync_leave_request_attendance(*, leave_request: LeaveRequest, recorded_by=None):
    existing_rows = {
        row.attendance_date: row
        for row in EmployeeAttendance.objects.select_for_update().filter(
            employee=leave_request.employee,
            attendance_date__range=(leave_request.start_date, leave_request.end_date),
        )
    }
    for attendance_date in _iter_leave_dates(leave_request):
        existing = existing_rows.get(attendance_date)
        if existing and existing.leave_request_id not in {None, leave_request.id}:
            raise ValueError("One or more leave dates are already linked to another leave request.")
        if existing and existing.status not in {AttendanceStatus.LEAVE}:
            raise ValueError("One or more leave dates already have attendance recorded.")

    leave_note = leave_request.reason or leave_request.leave_type.name
    if leave_request.day_count % Decimal("1.0") != Decimal("0.0"):
        leave_note = f"{leave_note} ({leave_request.day_count} day)"

    for attendance_date in _iter_leave_dates(leave_request):
        upsert_employee_attendance(
            employee=leave_request.employee,
            attendance_date=attendance_date,
            status=AttendanceStatus.LEAVE,
            worked_hours=Decimal("0.00"),
            overtime_hours=Decimal("0.00"),
            leave_request=leave_request,
            notes=leave_note,
            recorded_by=recorded_by,
        )


@transaction.atomic
def approve_leave_request(*, leave_request_id: int, approved_by):
    leave_request = LeaveRequest.objects.select_for_update().select_related("employee", "leave_type").get(pk=leave_request_id)
    if leave_request.status == LeaveRequestStatus.APPROVED:
        return leave_request, False
    if leave_request.status != LeaveRequestStatus.DRAFT:
        raise ValueError("Only draft leave requests can be approved.")

    assert_payroll_period_open_for_range(start_date=leave_request.start_date, end_date=leave_request.end_date)
    _sync_leave_request_attendance(leave_request=leave_request, recorded_by=approved_by)
    leave_request.status = LeaveRequestStatus.APPROVED
    leave_request.approved_by = approved_by
    leave_request.approved_at = timezone.now()
    leave_request.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

    _log_accounting_event(
        event="ACCOUNTING_LEAVE_REQUEST_APPROVED",
        instance=leave_request,
        performed_by=approved_by,
        metadata={
            "leave_request_id": leave_request.id,
            "request_no": leave_request.request_no,
        },
    )
    return leave_request, True


@transaction.atomic
def reject_leave_request(*, leave_request_id: int, rejection_reason: str, rejected_by):
    leave_request = LeaveRequest.objects.select_for_update().get(pk=leave_request_id)
    if leave_request.status == LeaveRequestStatus.REJECTED:
        return leave_request, False
    if leave_request.status != LeaveRequestStatus.DRAFT:
        raise ValueError("Only draft leave requests can be rejected.")
    rejection_reason = _text(rejection_reason)
    if not rejection_reason:
        raise ValueError("Rejection reason is required.")

    leave_request.status = LeaveRequestStatus.REJECTED
    leave_request.rejected_by = rejected_by
    leave_request.rejected_at = timezone.now()
    leave_request.rejection_reason = rejection_reason
    leave_request.save(
        update_fields=["status", "rejected_by", "rejected_at", "rejection_reason", "updated_at"]
    )
    _log_accounting_event(
        event="ACCOUNTING_LEAVE_REQUEST_REJECTED",
        instance=leave_request,
        performed_by=rejected_by,
        metadata={
            "leave_request_id": leave_request.id,
            "request_no": leave_request.request_no,
            "reason": rejection_reason,
        },
    )
    return leave_request, True


@transaction.atomic
def cancel_leave_request(*, leave_request_id: int, cancel_reason: str, cancelled_by):
    leave_request = LeaveRequest.objects.select_for_update().get(pk=leave_request_id)
    if leave_request.status == LeaveRequestStatus.CANCELLED:
        return leave_request, False
    if leave_request.status != LeaveRequestStatus.DRAFT:
        raise ValueError("Only draft leave requests can be cancelled.")
    cancel_reason = _text(cancel_reason)
    if not cancel_reason:
        raise ValueError("Cancellation reason is required.")
    leave_request.status = LeaveRequestStatus.CANCELLED
    leave_request.cancelled_by = cancelled_by
    leave_request.cancelled_at = timezone.now()
    leave_request.cancel_reason = cancel_reason
    leave_request.save(
        update_fields=["status", "cancelled_by", "cancelled_at", "cancel_reason", "updated_at"]
    )
    _log_accounting_event(
        event="ACCOUNTING_LEAVE_REQUEST_CANCELLED",
        instance=leave_request,
        performed_by=cancelled_by,
        metadata={
            "leave_request_id": leave_request.id,
            "request_no": leave_request.request_no,
            "reason": cancel_reason,
        },
    )
    return leave_request, True


def _normalized_salary_line_payloads(*, lines: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    for index, line in enumerate(lines, start=1):
        component_name = _text(line.get("component_name"))
        if not component_name:
            continue
        component_type = (line.get("component_type") or CompensationComponentType.EARNING).strip().upper()
        if component_type not in CompensationComponentType.values:
            raise ValueError("Unsupported salary component type.")
        amount = _money(line.get("amount"))
        if amount <= MONEY_ZERO:
            raise ValueError("Salary line amount must be greater than zero.")
        normalized.append(
            {
                "component_name": component_name,
                "component_type": component_type,
                "source_type": (line.get("source_type") or SalaryLineSourceType.MANUAL).strip().upper(),
                "source_reference": _text(line.get("source_reference")),
                "quantity": _hours(line.get("quantity")) if line.get("quantity") not in {None, ""} else None,
                "rate": _money(line.get("rate")) if line.get("rate") not in {None, ""} else None,
                "amount": amount,
                "sort_order": int(line.get("sort_order") or index),
                "notes": _text(line.get("notes")),
            }
        )
    return normalized


def _build_generated_salary_lines(*, employee: EmployeeProfile, payroll_period: PayrollPeriod) -> list[dict]:
    lines: list[dict] = []

    if (employee.base_salary or MONEY_ZERO) > MONEY_ZERO:
        lines.append(
            {
                "component_name": "Base Salary",
                "component_type": CompensationComponentType.EARNING,
                "source_type": SalaryLineSourceType.BASE_SALARY,
                "source_reference": employee.employee_code,
                "quantity": Decimal("1.00"),
                "rate": _money(employee.base_salary),
                "amount": _money(employee.base_salary),
                "sort_order": 1,
                "notes": "",
            }
        )

    component_lines = []
    for index, component in enumerate(
        employee.compensation_components.filter(is_active=True).order_by("sort_order", "id"),
        start=2,
    ):
        component_lines.append(
            {
                "component_name": component.component_name,
                "component_type": component.component_type,
                "source_type": SalaryLineSourceType.COMPONENT,
                "source_reference": str(component.id),
                "quantity": Decimal("1.00"),
                "rate": _money(component.amount),
                "amount": _money(component.amount),
                "sort_order": index,
                "notes": component.notes,
            }
        )
    lines.extend(component_lines)

    attendance_rows = EmployeeAttendance.objects.filter(
        employee=employee,
        attendance_date__range=(payroll_period.start_date, payroll_period.end_date),
    )
    overtime_hours = sum((_hours(row.overtime_hours) for row in attendance_rows), Decimal("0.00"))
    if overtime_hours > Decimal("0.00"):
        period_days = Decimal((payroll_period.end_date - payroll_period.start_date).days + 1)
        default_rate = MONEY_ZERO
        if (employee.base_salary or MONEY_ZERO) > MONEY_ZERO and (employee.standard_daily_hours or MONEY_ZERO) > MONEY_ZERO:
            default_rate = _money(
                Decimal(employee.base_salary) / period_days / Decimal(employee.standard_daily_hours)
            )
        overtime_rate = _money(employee.overtime_rate_per_hour or default_rate)
        overtime_amount = _money(overtime_hours * overtime_rate)
        if overtime_amount > MONEY_ZERO:
            lines.append(
                {
                    "component_name": "Overtime",
                    "component_type": CompensationComponentType.EARNING,
                    "source_type": SalaryLineSourceType.OVERTIME,
                    "source_reference": payroll_period.code,
                    "quantity": overtime_hours,
                    "rate": overtime_rate,
                    "amount": overtime_amount,
                    "sort_order": len(lines) + 1,
                    "notes": f"Approved overtime through attendance in {payroll_period.code}",
                }
            )

    unpaid_leave_requests = LeaveRequest.objects.filter(
        employee=employee,
        leave_type__is_paid=False,
        status=LeaveRequestStatus.APPROVED,
        start_date__lte=payroll_period.end_date,
        end_date__gte=payroll_period.start_date,
    ).select_related("leave_type")
    if unpaid_leave_requests.exists() and (employee.base_salary or MONEY_ZERO) > MONEY_ZERO:
        period_days = Decimal((payroll_period.end_date - payroll_period.start_date).days + 1)
        daily_rate = _money(Decimal(employee.base_salary) / period_days)
        unpaid_days = Decimal("0.0")
        for leave_request in unpaid_leave_requests:
            overlap_start = max(leave_request.start_date, payroll_period.start_date)
            overlap_end = min(leave_request.end_date, payroll_period.end_date)
            overlap_span = Decimal((overlap_end - overlap_start).days + 1)
            full_span = Decimal((leave_request.end_date - leave_request.start_date).days + 1)
            ratio = overlap_span / full_span if full_span > Decimal("0.0") else Decimal("0.0")
            unpaid_days += _days(leave_request.day_count * ratio)
        unpaid_deduction_amount = _money(unpaid_days * daily_rate)
        if unpaid_deduction_amount > MONEY_ZERO:
            lines.append(
                {
                    "component_name": "Unpaid Leave Deduction",
                    "component_type": CompensationComponentType.DEDUCTION,
                    "source_type": SalaryLineSourceType.LEAVE_DEDUCTION,
                    "source_reference": payroll_period.code,
                    "quantity": unpaid_days,
                    "rate": daily_rate,
                    "amount": unpaid_deduction_amount,
                    "sort_order": len(lines) + 1,
                    "notes": "Derived from approved unpaid leave requests in the payroll period.",
                }
            )

    return lines


def _build_legacy_salary_lines(*, gross_amount, deductions_amount) -> list[dict]:
    lines: list[dict] = []
    gross_amount = _money(gross_amount)
    deductions_amount = _money(deductions_amount)
    if gross_amount > MONEY_ZERO:
        lines.append(
            {
                "component_name": "Payroll Gross",
                "component_type": CompensationComponentType.EARNING,
                "source_type": SalaryLineSourceType.MANUAL,
                "source_reference": "LEGACY",
                "quantity": Decimal("1.00"),
                "rate": gross_amount,
                "amount": gross_amount,
                "sort_order": 1,
                "notes": "",
            }
        )
    if deductions_amount > MONEY_ZERO:
        lines.append(
            {
                "component_name": "Payroll Deductions",
                "component_type": CompensationComponentType.DEDUCTION,
                "source_type": SalaryLineSourceType.MANUAL,
                "source_reference": "LEGACY",
                "quantity": Decimal("1.00"),
                "rate": deductions_amount,
                "amount": deductions_amount,
                "sort_order": 2,
                "notes": "",
            }
        )
    return lines


def _replace_salary_sheet_lines(*, salary_sheet: SalarySheet, lines: list[dict]):
    salary_sheet.lines.all().delete()
    SalarySheetLine.objects.bulk_create(
        [SalarySheetLine(salary_sheet=salary_sheet, **line) for line in lines]
    )


@transaction.atomic
def upsert_salary_sheet_draft(*, payload: dict, salary_sheet_id: int | None = None, performed_by=None) -> SalarySheet:
    payload = dict(payload)
    line_payloads = payload.pop("lines", None)
    auto_generate = bool(payload.pop("auto_generate", False))
    if salary_sheet_id is None:
        payroll_period = payload.get("payroll_period")
        employee = payload.get("employee")
        if employee is None or payload.get("year") is None or payload.get("month") is None:
            raise ValueError("Employee, year, and month are required for salary sheets.")
        year = payload.get("year") or getattr(payroll_period, "year", None)
        month = payload.get("month") or getattr(payroll_period, "month", None)
        if payroll_period is None:
            payroll_period = get_or_create_payroll_period(year=year, month=month)
            payload["payroll_period"] = payroll_period
        if payroll_period.status == PayrollPeriodStatus.CLOSED:
            raise ValueError("Payroll period is closed.")
        salary_sheet = SalarySheet.objects.create(**payload)
    else:
        salary_sheet = SalarySheet.objects.select_for_update().select_related("payroll_period").get(pk=salary_sheet_id)
        if salary_sheet.status != SalarySheetStatus.DRAFT:
            raise ValueError("Only draft salary sheets can be edited.")
        payroll_period = payload.get("payroll_period") or salary_sheet.payroll_period
        year = payload.get("year") or salary_sheet.year
        month = payload.get("month") or salary_sheet.month
        if payroll_period is None:
            payroll_period = get_or_create_payroll_period(year=year, month=month)
            payload["payroll_period"] = payroll_period
        if payroll_period.status == PayrollPeriodStatus.CLOSED:
            raise ValueError("Payroll period is closed.")
        for field_name, value in payload.items():
            setattr(salary_sheet, field_name, value)
        salary_sheet.save()

    if line_payloads is not None:
        normalized_lines = _normalized_salary_line_payloads(lines=line_payloads)
    elif auto_generate:
        normalized_lines = _build_generated_salary_lines(
            employee=salary_sheet.employee,
            payroll_period=salary_sheet.payroll_period,
        )
    else:
        normalized_lines = _build_legacy_salary_lines(
            gross_amount=payload.get("gross_amount", salary_sheet.gross_amount),
            deductions_amount=payload.get("deductions_amount", salary_sheet.deductions_amount),
        )
        if not normalized_lines:
            normalized_lines = _build_generated_salary_lines(
                employee=salary_sheet.employee,
                payroll_period=salary_sheet.payroll_period,
            )

    if not normalized_lines:
        raise ValueError("Salary sheet requires at least one earning or deduction line.")

    gross_amount = sum(
        (_money(line["amount"]) for line in normalized_lines if line["component_type"] == CompensationComponentType.EARNING),
        MONEY_ZERO,
    )
    deductions_amount = sum(
        (_money(line["amount"]) for line in normalized_lines if line["component_type"] == CompensationComponentType.DEDUCTION),
        MONEY_ZERO,
    )
    net_amount = _money(gross_amount - deductions_amount)
    if net_amount < MONEY_ZERO:
        raise ValueError("Salary deductions cannot exceed total earnings.")

    salary_sheet.gross_amount = gross_amount
    salary_sheet.deductions_amount = deductions_amount
    salary_sheet.net_amount = net_amount
    salary_sheet.save(
        update_fields=[
            "employee",
            "payroll_period",
            "year",
            "month",
            "gross_amount",
            "deductions_amount",
            "net_amount",
            "updated_at",
        ]
    )
    _replace_salary_sheet_lines(salary_sheet=salary_sheet, lines=normalized_lines)

    _log_accounting_event(
        event="ACCOUNTING_SALARY_SHEET_DRAFT_SAVED",
        instance=salary_sheet,
        performed_by=performed_by,
        metadata={
            "salary_sheet_id": salary_sheet.id,
            "employee_id": salary_sheet.employee_id,
            "year": salary_sheet.year,
            "month": salary_sheet.month,
            "line_count": salary_sheet.lines.count(),
        },
    )
    return salary_sheet


@transaction.atomic
def close_payroll_period(*, payroll_period_id: int, close_reason: str = "", closed_by=None):
    payroll_period = PayrollPeriod.objects.select_for_update().prefetch_related("salary_sheets").get(pk=payroll_period_id)
    if payroll_period.status == PayrollPeriodStatus.CLOSED:
        return payroll_period, False
    blocking_statuses = {
        SalarySheetStatus.DRAFT,
        SalarySheetStatus.APPROVED,
    }
    if payroll_period.salary_sheets.filter(status__in=blocking_statuses).exists():
        raise ValueError("Payroll period cannot be closed while draft or approved salary sheets still exist.")

    payroll_period.status = PayrollPeriodStatus.CLOSED
    payroll_period.closed_at = timezone.now()
    payroll_period.closed_by = closed_by
    payroll_period.close_reason = _text(close_reason)
    payroll_period.save(update_fields=["status", "closed_at", "closed_by", "close_reason", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_PAYROLL_PERIOD_CLOSED",
        instance=payroll_period,
        performed_by=closed_by,
        metadata={
            "payroll_period_id": payroll_period.id,
            "code": payroll_period.code,
        },
    )
    return payroll_period, True


@transaction.atomic
def upsert_employee_expense_claim_draft(*, payload: dict, expense_claim_id: int | None = None, performed_by=None):
    payload = dict(payload)
    if expense_claim_id is None:
        expense_date = payload.get("expense_date") or payload.get("claim_date")
        if expense_date is None:
            raise ValueError("Expense date is required.")
        assert_payroll_period_open_for_date(reference_date=expense_date)
        claim = EmployeeExpenseClaim.objects.create(**payload)
        _log_accounting_event(
            event="ACCOUNTING_EMPLOYEE_EXPENSE_CLAIM_CREATED",
            instance=claim,
            performed_by=performed_by,
            metadata={"expense_claim_id": claim.id, "claim_no": claim.claim_no},
        )
        return claim

    claim = EmployeeExpenseClaim.objects.select_for_update().get(pk=expense_claim_id)
    if claim.status != ExpenseClaimStatus.DRAFT:
        raise ValueError("Only draft expense claims can be edited.")
    expense_date = payload.get("expense_date") or payload.get("claim_date") or claim.expense_date
    assert_payroll_period_open_for_date(reference_date=expense_date)
    for field_name, value in payload.items():
        setattr(claim, field_name, value)
    claim.save()
    _log_accounting_event(
        event="ACCOUNTING_EMPLOYEE_EXPENSE_CLAIM_UPDATED",
        instance=claim,
        performed_by=performed_by,
        metadata={"expense_claim_id": claim.id, "claim_no": claim.claim_no},
    )
    return claim


@transaction.atomic
def approve_employee_expense_claim(*, expense_claim_id: int, approved_amount=None, approved_by=None):
    claim = EmployeeExpenseClaim.objects.select_for_update().get(pk=expense_claim_id)
    if claim.status == ExpenseClaimStatus.APPROVED:
        return claim, False
    if claim.status != ExpenseClaimStatus.DRAFT:
        raise ValueError("Only draft expense claims can be approved.")
    resolved_approved_amount = _money(approved_amount if approved_amount not in {None, ""} else claim.claimed_amount)
    if resolved_approved_amount <= MONEY_ZERO:
        raise ValueError("Approved amount must be greater than zero.")
    if resolved_approved_amount > claim.claimed_amount:
        raise ValueError("Approved amount cannot exceed claimed amount.")
    claim.approved_amount = resolved_approved_amount
    claim.status = ExpenseClaimStatus.APPROVED
    claim.approved_by = approved_by
    claim.approved_at = timezone.now()
    claim.save(update_fields=["approved_amount", "status", "approved_by", "approved_at", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_EMPLOYEE_EXPENSE_CLAIM_APPROVED",
        instance=claim,
        performed_by=approved_by,
        metadata={"expense_claim_id": claim.id, "claim_no": claim.claim_no},
    )
    return claim, True


@transaction.atomic
def reject_employee_expense_claim(*, expense_claim_id: int, rejection_reason: str, rejected_by=None):
    claim = EmployeeExpenseClaim.objects.select_for_update().get(pk=expense_claim_id)
    if claim.status == ExpenseClaimStatus.REJECTED:
        return claim, False
    if claim.status != ExpenseClaimStatus.DRAFT:
        raise ValueError("Only draft expense claims can be rejected.")
    rejection_reason = _text(rejection_reason)
    if not rejection_reason:
        raise ValueError("Rejection reason is required.")
    claim.status = ExpenseClaimStatus.REJECTED
    claim.rejected_by = rejected_by
    claim.rejected_at = timezone.now()
    claim.rejection_reason = rejection_reason
    claim.save(update_fields=["status", "rejected_by", "rejected_at", "rejection_reason", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_EMPLOYEE_EXPENSE_CLAIM_REJECTED",
        instance=claim,
        performed_by=rejected_by,
        metadata={"expense_claim_id": claim.id, "claim_no": claim.claim_no, "reason": rejection_reason},
    )
    return claim, True


@transaction.atomic
def post_employee_expense_claim(*, expense_claim_id: int, posted_by=None):
    claim = EmployeeExpenseClaim.objects.select_for_update().select_related("employee", "expense_account").get(pk=expense_claim_id)
    if claim.status in {ExpenseClaimStatus.POSTED, ExpenseClaimStatus.PAID_PARTIAL, ExpenseClaimStatus.PAID} and claim.posted_journal_entry_id:
        return claim, False
    if claim.status != ExpenseClaimStatus.APPROVED:
        raise ValueError("Expense claim must be approved before posting.")
    if claim.approved_amount <= MONEY_ZERO:
        raise ValueError("Expense claim approved amount must be greater than zero.")

    accounts = ensure_phase3_system_accounts()
    posted_journal, _ = post_bridge_entry(
        source_instance=claim,
        purpose="EMPLOYEE_REIMBURSEMENT_ACCRUAL",
        entry_date=claim.claim_date,
        memo=f"Employee reimbursement claim {claim.claim_no}",
        voucher_type="EMPLOYEE_REIMBURSEMENT_ACCRUAL",
        source_type="EMPLOYEE_EXPENSE_CLAIM",
        source_reference=claim.claim_no,
        trace_metadata={
            "employee_id": claim.employee_id,
            "employee_code": claim.employee.employee_code,
            "approved_amount": f"{claim.approved_amount:.2f}",
        },
        lines=[
            {
                "chart_account": claim.expense_account,
                "description": claim.employee.name,
                "debit_amount": claim.approved_amount,
                "credit_amount": MONEY_ZERO,
            },
            {
                "chart_account": accounts["EMPLOYEE_REIMBURSEMENT_PAYABLE"],
                "description": claim.claim_no,
                "debit_amount": MONEY_ZERO,
                "credit_amount": claim.approved_amount,
            },
        ],
        posted_by=posted_by,
    )
    claim.posted_journal_entry = posted_journal
    claim.status = ExpenseClaimStatus.POSTED
    claim.save(update_fields=["posted_journal_entry", "status", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_EMPLOYEE_EXPENSE_CLAIM_POSTED",
        instance=claim,
        performed_by=posted_by,
        metadata={"expense_claim_id": claim.id, "claim_no": claim.claim_no, "journal_entry_id": posted_journal.id},
    )
    return claim, True


@transaction.atomic
def post_employee_expense_claim_payment(
    *,
    expense_claim_id: int,
    payment_date,
    amount,
    finance_account_id: int,
    reference_no: str = "",
    posted_by=None,
):
    claim = EmployeeExpenseClaim.objects.select_for_update().select_related("employee").prefetch_related("payments").get(pk=expense_claim_id)
    if claim.posted_journal_entry_id is None or claim.status not in {
        ExpenseClaimStatus.POSTED,
        ExpenseClaimStatus.PAID_PARTIAL,
        ExpenseClaimStatus.PAID,
    }:
        raise ValueError("Expense claim must be posted before reimbursement payment.")
    finance_account = FinanceAccount.objects.select_for_update().select_related("chart_account").get(pk=finance_account_id)
    payment_amount = _money(amount)
    if payment_amount <= MONEY_ZERO:
        raise ValueError("Claim payment amount must be greater than zero.")

    paid_total = _expense_claim_payment_total(expense_claim_id=claim.id)
    outstanding = _money(claim.approved_amount - paid_total)
    if outstanding <= MONEY_ZERO:
        raise ValueError("Expense claim is already fully reimbursed.")
    if payment_amount > outstanding:
        raise ValueError("Claim payment amount cannot exceed the outstanding reimbursement balance.")

    claim_payment = EmployeeExpenseClaimPayment.objects.create(
        expense_claim=claim,
        payment_date=payment_date,
        amount=payment_amount,
        finance_account=finance_account,
        reference_no=_text(reference_no) or None,
    )

    accounts = ensure_phase3_system_accounts()
    posted_journal, _ = post_bridge_entry(
        source_instance=claim_payment,
        purpose="EMPLOYEE_REIMBURSEMENT_PAYMENT",
        entry_date=payment_date,
        memo=f"Employee reimbursement payment {claim.claim_no}",
        voucher_type="EMPLOYEE_REIMBURSEMENT_PAYMENT",
        source_type="EMPLOYEE_EXPENSE_CLAIM_PAYMENT",
        source_reference=claim_payment.reference_no or claim.claim_no,
        trace_metadata={
            "expense_claim_id": claim.id,
            "employee_id": claim.employee_id,
            "employee_code": claim.employee.employee_code,
            "amount": f"{payment_amount:.2f}",
        },
        lines=[
            {
                "chart_account": accounts["EMPLOYEE_REIMBURSEMENT_PAYABLE"],
                "description": claim.employee.name,
                "debit_amount": payment_amount,
                "credit_amount": MONEY_ZERO,
            },
            {
                "chart_account": finance_account.chart_account,
                "description": claim_payment.reference_no or claim.claim_no,
                "debit_amount": MONEY_ZERO,
                "credit_amount": payment_amount,
            },
        ],
        posted_by=posted_by,
    )
    claim_payment.posted_journal_entry = posted_journal
    claim_payment.save(update_fields=["posted_journal_entry", "updated_at"])

    paid_total = _expense_claim_payment_total(expense_claim_id=claim.id)
    claim.status = (
        ExpenseClaimStatus.PAID
        if paid_total >= claim.approved_amount
        else ExpenseClaimStatus.PAID_PARTIAL
    )
    claim.save(update_fields=["status", "updated_at"])

    _log_accounting_event(
        event="ACCOUNTING_EMPLOYEE_EXPENSE_CLAIM_PAYMENT_POSTED",
        instance=claim_payment,
        performed_by=posted_by,
        metadata={
            "expense_claim_payment_id": claim_payment.id,
            "expense_claim_id": claim.id,
            "journal_entry_id": posted_journal.id,
        },
    )
    return claim_payment


def build_attendance_calendar(*, employee_id: int, year: int, month: int) -> dict:
    start_date, end_date = _month_bounds(year, month)
    employee = EmployeeProfile.objects.get(pk=employee_id)
    rows = {
        row.attendance_date: row
        for row in EmployeeAttendance.objects.filter(
            employee_id=employee_id,
            attendance_date__range=(start_date, end_date),
        ).select_related("leave_request")
    }

    days = []
    totals = {
        "present_count": 0,
        "half_day_count": 0,
        "absent_count": 0,
        "leave_count": 0,
        "worked_hours": Decimal("0.00"),
        "overtime_hours": Decimal("0.00"),
    }
    cursor = start_date
    while cursor <= end_date:
        row = rows.get(cursor)
        status_value = row.status if row else None
        if status_value == AttendanceStatus.PRESENT:
            totals["present_count"] += 1
        elif status_value == AttendanceStatus.HALF_DAY:
            totals["half_day_count"] += 1
        elif status_value == AttendanceStatus.ABSENT:
            totals["absent_count"] += 1
        elif status_value == AttendanceStatus.LEAVE:
            totals["leave_count"] += 1
        if row:
            totals["worked_hours"] += _hours(row.worked_hours)
            totals["overtime_hours"] += _hours(row.overtime_hours)

        days.append(
            {
                "date": cursor.isoformat(),
                "status": status_value,
                "worked_hours": f"{_hours(getattr(row, 'worked_hours', MONEY_ZERO)):.2f}",
                "overtime_hours": f"{_hours(getattr(row, 'overtime_hours', MONEY_ZERO)):.2f}",
                "notes": getattr(row, "notes", ""),
                "leave_request_id": getattr(row, "leave_request_id", None),
            }
        )
        cursor += timedelta(days=1)

    return {
        "employee": {
            "id": employee.id,
            "employee_code": employee.employee_code,
            "name": employee.name,
            "department": employee.department,
        },
        "year": year,
        "month": month,
        "days": days,
        "summary": {
            "present_count": totals["present_count"],
            "half_day_count": totals["half_day_count"],
            "absent_count": totals["absent_count"],
            "leave_count": totals["leave_count"],
            "worked_hours": f"{totals['worked_hours']:.2f}",
            "overtime_hours": f"{totals['overtime_hours']:.2f}",
        },
    }


def build_staff_ledger(*, employee_id: int | None = None, branch_id: int | None = None) -> dict:
    employee_filter = Q()
    if employee_id is not None:
        employee_filter = Q(employee_id=employee_id)
    if branch_id is not None:
        employee_filter &= Q(employee__branch_id=branch_id)

    rows = []
    for salary_sheet in (
        SalarySheet.objects.filter(employee_filter, status__in=[
            SalarySheetStatus.POSTED,
            SalarySheetStatus.PAID_PARTIAL,
            SalarySheetStatus.PAID,
        ])
        .select_related("employee", "posted_journal_entry", "payroll_period")
        .order_by("year", "month", "created_at", "id")
    ):
        rows.append(
            {
                "employee_id": salary_sheet.employee_id,
                "employee_code": salary_sheet.employee.employee_code,
                "employee_name": salary_sheet.employee.name,
                "entry_date": date(salary_sheet.year, salary_sheet.month, 1).isoformat(),
                "entry_kind": "SALARY_ACCRUAL",
                "source_type": "SALARY_SHEET",
                "source_reference": f"{salary_sheet.employee.employee_code}-{salary_sheet.year}-{salary_sheet.month:02d}",
                "document_no": salary_sheet.posted_journal_entry.entry_no if salary_sheet.posted_journal_entry_id else None,
                "debit_amount": "0.00",
                "credit_amount": f"{salary_sheet.net_amount:.2f}",
                "notes": salary_sheet.payroll_period.code if salary_sheet.payroll_period_id else "",
                "_sort_key": (date(salary_sheet.year, salary_sheet.month, 1), salary_sheet.created_at, f"SAL-{salary_sheet.id}"),
            }
        )
    salary_payment_queryset = (
        SalaryPayment.objects.filter(salary_sheet__employee_id=employee_id) if employee_id is not None else SalaryPayment.objects.all()
    )
    if branch_id is not None:
        salary_payment_queryset = salary_payment_queryset.filter(branch_id=branch_id)
    for salary_payment in salary_payment_queryset.select_related("salary_sheet", "salary_sheet__employee", "posted_journal_entry").order_by("payment_date", "created_at", "id"):
        rows.append(
            {
                "employee_id": salary_payment.salary_sheet.employee_id,
                "employee_code": salary_payment.salary_sheet.employee.employee_code,
                "employee_name": salary_payment.salary_sheet.employee.name,
                "entry_date": salary_payment.payment_date.isoformat(),
                "entry_kind": "SALARY_PAYMENT",
                "source_type": "SALARY_PAYMENT",
                "source_reference": salary_payment.reference_no or f"SALPAY-{salary_payment.id}",
                "document_no": salary_payment.posted_journal_entry.entry_no if salary_payment.posted_journal_entry_id else None,
                "debit_amount": f"{salary_payment.amount:.2f}",
                "credit_amount": "0.00",
                "notes": "",
                "_sort_key": (salary_payment.payment_date, salary_payment.created_at, f"SALPAY-{salary_payment.id}"),
            }
        )

    for claim in (
        EmployeeExpenseClaim.objects.filter(employee_filter, status__in=[
            ExpenseClaimStatus.POSTED,
            ExpenseClaimStatus.PAID_PARTIAL,
            ExpenseClaimStatus.PAID,
        ])
        .select_related("employee", "posted_journal_entry", "expense_account")
        .order_by("expense_date", "created_at", "id")
    ):
        rows.append(
            {
                "employee_id": claim.employee_id,
                "employee_code": claim.employee.employee_code,
                "employee_name": claim.employee.name,
                "entry_date": claim.claim_date.isoformat(),
                "entry_kind": "REIMBURSEMENT_ACCRUAL",
                "source_type": "EMPLOYEE_EXPENSE_CLAIM",
                "source_reference": claim.claim_no,
                "document_no": claim.posted_journal_entry.entry_no if claim.posted_journal_entry_id else None,
                "debit_amount": "0.00",
                "credit_amount": f"{claim.approved_amount:.2f}",
                "notes": claim.category or claim.expense_account.name,
                "_sort_key": (claim.claim_date, claim.created_at, f"CLAIM-{claim.id}"),
            }
        )

    claim_payment_queryset = (
        EmployeeExpenseClaimPayment.objects.filter(expense_claim__employee_id=employee_id)
        if employee_id is not None
        else EmployeeExpenseClaimPayment.objects.all()
    )
    if branch_id is not None:
        claim_payment_queryset = claim_payment_queryset.filter(branch_id=branch_id)
    for claim_payment in claim_payment_queryset.select_related(
        "expense_claim",
        "expense_claim__employee",
        "posted_journal_entry",
    ).order_by("payment_date", "created_at", "id"):
        rows.append(
            {
                "employee_id": claim_payment.expense_claim.employee_id,
                "employee_code": claim_payment.expense_claim.employee.employee_code,
                "employee_name": claim_payment.expense_claim.employee.name,
                "entry_date": claim_payment.payment_date.isoformat(),
                "entry_kind": "REIMBURSEMENT_PAYMENT",
                "source_type": "EMPLOYEE_EXPENSE_CLAIM_PAYMENT",
                "source_reference": claim_payment.reference_no or claim_payment.expense_claim.claim_no,
                "document_no": claim_payment.posted_journal_entry.entry_no if claim_payment.posted_journal_entry_id else None,
                "debit_amount": f"{claim_payment.amount:.2f}",
                "credit_amount": "0.00",
                "notes": "",
                "_sort_key": (claim_payment.payment_date, claim_payment.created_at, f"CLPAY-{claim_payment.id}"),
            }
        )

    rows.sort(key=lambda row: row["_sort_key"])

    balance_by_employee: dict[int, Decimal] = {}
    normalized_rows = []
    for row in rows:
        employee_balance = balance_by_employee.setdefault(row["employee_id"], MONEY_ZERO)
        employee_balance = _money(employee_balance + _money(row["credit_amount"]) - _money(row["debit_amount"]))
        balance_by_employee[row["employee_id"]] = employee_balance
        normalized_rows.append(
            {
                key: value
                for key, value in row.items()
                if key != "_sort_key"
            }
            | {
                "running_balance": f"{employee_balance:.2f}",
                "balance_side": "PAYABLE" if employee_balance >= MONEY_ZERO else "RECEIVABLE",
            }
        )

    employee_summaries = []
    employee_map = EmployeeProfile.objects.in_bulk(balance_by_employee.keys())
    for employee_pk, balance in sorted(balance_by_employee.items()):
        employee = employee_map.get(employee_pk)
        if employee is None:
            continue
        employee_summaries.append(
            {
                "employee_id": employee.id,
                "employee_code": employee.employee_code,
                "employee_name": employee.name,
                "closing_balance": f"{balance:.2f}",
                "balance_side": "PAYABLE" if balance >= MONEY_ZERO else "RECEIVABLE",
            }
        )

    return {
        "employee_id": employee_id,
        "rows": normalized_rows,
        "employees": employee_summaries,
    }
