from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from accounting.models import (
    AttendanceStatus,
    EmployeeAttendance,
    EmployeeExpenseClaim,
    EmployeeProfile,
    ExpenseClaimStatus,
    LeaveRequest,
    LeaveRequestStatus,
    PayrollPeriod,
    PayrollPeriodStatus,
    SalaryPayment,
    SalarySheet,
    SalarySheetStatus,
)
from accounting.services.workforce_service import (
    approve_employee_expense_claim,
    approve_leave_request,
    reject_employee_expense_claim,
    reject_leave_request,
    upsert_employee_attendance,
)
from branch_control.models import CashCounter
from subscriptions.models import AuditLog

User = get_user_model()


def _money(value) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.01"))


def _text(value) -> str:
    return str(value or "").strip()


def _write_audit(*, actor, action_type: str, model_name: str, object_id: int, metadata=None):
    # AuditLog has a strict enum; store HR event as metadata.
    normalized = (action_type or "").strip().upper()
    mapped_action = (
        AuditLog.ActionType.USER_CREATED
        if normalized in {"HR_USER_CREATED"}
        else AuditLog.ActionType.USER_UPDATED
    )
    AuditLog.objects.create(
        action_type=mapped_action,
        performed_by=actor,
        model_name=model_name,
        object_id=object_id,
        metadata={"hr_event": normalized, **(metadata or {})},
    )


def get_hr_summary() -> dict:
    today = timezone.localdate()
    active_staff = EmployeeProfile.objects.filter(is_active=True)
    attendance_today = EmployeeAttendance.objects.filter(attendance_date=today)

    today_present = attendance_today.filter(status=AttendanceStatus.PRESENT).count()
    today_absent = attendance_today.filter(status=AttendanceStatus.ABSENT).count()

    pending_leave = LeaveRequest.objects.filter(status=LeaveRequestStatus.DRAFT).count()
    pending_expenses = EmployeeExpenseClaim.objects.filter(status=ExpenseClaimStatus.DRAFT).count()

    payroll_pending = SalarySheet.objects.filter(
        status__in=[SalarySheetStatus.DRAFT, SalarySheetStatus.APPROVED]
    ).count()
    # SalaryPayment does not expose a separate status field; use count for operational visibility.
    salary_payment_pending = SalaryPayment.objects.count()

    branch_summary = (
        active_staff.values("branch_id")
        .annotate(count=Count("id"))
        .order_by("-count")
    )
    counter_summary = (
        CashCounter.objects.filter(is_active=True)
        .values("branch_id")
        .annotate(assigned_count=Count("assigned_user_id"))
        .order_by("-assigned_count")
    )

    return {
        "as_of": timezone.now().isoformat(),
        "total_active_staff": active_staff.count(),
        "today_present": today_present,
        "today_absent": today_absent,
        "pending_leave_requests": pending_leave,
        "pending_expense_claims": pending_expenses,
        "payroll_pending": payroll_pending,
        "salary_payment_pending": salary_payment_pending,
        "branch_assignment_summary": list(branch_summary[:20]),
        "counter_assignment_summary": list(counter_summary[:20]),
    }


@transaction.atomic
def create_staff_profile(
    *,
    performed_by,
    name: str,
    phone: str,
    email: str | None = None,
    role: str | None = None,
    branch_id: int | None = None,
    cash_counter_id: int | None = None,
    joining_date: date | None = None,
    is_active: bool = True,
    base_salary: Decimal | None = None,
    notes: str = "",
) -> dict:
    cleaned_phone = _text(phone)
    cleaned_name = _text(name)
    if not cleaned_name:
        raise ValueError("Staff name is required.")
    if not cleaned_phone:
        raise ValueError("Staff phone is required.")

    if EmployeeProfile.objects.filter(phone=cleaned_phone, is_active=True).exists():
        raise ValueError("An active staff profile already exists with this phone number.")

    user = None
    if role in {"ADMIN", "CASHIER"}:
        existing = User.objects.filter(phone=cleaned_phone).first()
        if existing is not None:
            user = existing
        else:
            username = cleaned_phone
            if User.objects.filter(username=username).exists():
                username = f"{username}-{timezone.now().strftime('%H%M%S')}"
            user = User.objects.create_user(
                username=username,
                password=User.objects.make_random_password(),
                phone=cleaned_phone,
                email=_text(email),
                first_name=cleaned_name,
                role=role,
                is_active=True,
                is_staff=True,
                is_superuser=False,
            )
            _write_audit(
                actor=performed_by,
                action_type="HR_USER_CREATED",
                model_name="User",
                object_id=user.id,
                metadata={"phone": cleaned_phone, "role": role},
            )

    if cash_counter_id and user:
        counter = CashCounter.objects.select_for_update().get(pk=cash_counter_id)
        counter.assigned_user = user
        counter.save(update_fields=["assigned_user", "updated_at"])
        _write_audit(
            actor=performed_by,
            action_type="HR_CASH_COUNTER_ASSIGNED",
            model_name="CashCounter",
            object_id=counter.id,
            metadata={"assigned_user_id": user.id, "branch_id": counter.branch_id},
        )

    employee = EmployeeProfile.objects.create(
        name=cleaned_name,
        phone=cleaned_phone,
        branch_id=branch_id,
        joining_date=joining_date or timezone.localdate(),
        base_salary=base_salary,
        is_active=is_active,
        notes=_text(notes),
    )
    _write_audit(
        actor=performed_by,
        action_type="HR_STAFF_PROFILE_CREATED",
        model_name="EmployeeProfile",
        object_id=employee.id,
        metadata={"employee_code": employee.employee_code, "phone": cleaned_phone, "user_id": getattr(user, "id", None)},
    )

    return {"employee": employee, "user": user}


def mark_attendance(
    *,
    performed_by,
    employee: EmployeeProfile,
    attendance_date: date,
    status: str,
    notes: str = "",
    worked_hours: Decimal | None = None,
    overtime_hours: Decimal | None = None,
):
    attendance, created = upsert_employee_attendance(
        employee=employee,
        attendance_date=attendance_date,
        status=status,
        notes=_text(notes),
        worked_hours=worked_hours,
        overtime_hours=overtime_hours,
        recorded_by=performed_by,
    )
    _write_audit(
        actor=performed_by,
        action_type="HR_ATTENDANCE_MARKED",
        model_name="EmployeeAttendance",
        object_id=attendance.id,
        metadata={"employee_id": employee.id, "date": attendance_date.isoformat(), "status": status, "created": created},
    )
    return attendance


def approve_leave_request_action(*, performed_by, leave_request_id: int) -> LeaveRequest:
    leave_request, updated = approve_leave_request(
        leave_request_id=leave_request_id,
        approved_by=performed_by,
    )
    _write_audit(
        actor=performed_by,
        action_type="HR_LEAVE_APPROVED",
        model_name="LeaveRequest",
        object_id=leave_request.id,
        metadata={"updated": updated, "request_no": leave_request.request_no},
    )
    return leave_request


def reject_leave_request_action(*, performed_by, leave_request_id: int, reason: str) -> LeaveRequest:
    leave_request, updated = reject_leave_request(
        leave_request_id=leave_request_id,
        rejection_reason=_text(reason),
        rejected_by=performed_by,
    )
    _write_audit(
        actor=performed_by,
        action_type="HR_LEAVE_REJECTED",
        model_name="LeaveRequest",
        object_id=leave_request.id,
        metadata={"updated": updated, "request_no": leave_request.request_no},
    )
    return leave_request


def approve_expense_claim_action(*, performed_by, expense_claim_id: int) -> EmployeeExpenseClaim:
    claim, updated = approve_employee_expense_claim(
        expense_claim_id=expense_claim_id,
        approved_by=performed_by,
    )
    _write_audit(
        actor=performed_by,
        action_type="HR_EXPENSE_APPROVED",
        model_name="EmployeeExpenseClaim",
        object_id=claim.id,
        metadata={"updated": updated, "claim_no": claim.claim_no},
    )
    return claim


def reject_expense_claim_action(*, performed_by, expense_claim_id: int, reason: str) -> EmployeeExpenseClaim:
    claim, updated = reject_employee_expense_claim(
        expense_claim_id=expense_claim_id,
        rejection_reason=_text(reason),
        rejected_by=performed_by,
    )
    _write_audit(
        actor=performed_by,
        action_type="HR_EXPENSE_REJECTED",
        model_name="EmployeeExpenseClaim",
        object_id=claim.id,
        metadata={"updated": updated, "claim_no": claim.claim_no},
    )
    return claim


def record_salary_payment(*, performed_by, salary_payment: SalaryPayment) -> SalaryPayment:
    _write_audit(
        actor=performed_by,
        action_type="HR_SALARY_PAYMENT_RECORDED",
        model_name="SalaryPayment",
        object_id=salary_payment.id,
        metadata={"salary_sheet_id": salary_payment.salary_sheet_id, "amount": str(salary_payment.amount)},
    )
    return salary_payment
