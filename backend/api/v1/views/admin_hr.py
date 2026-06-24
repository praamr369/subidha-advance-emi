from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import StaffIdentity, UserRole
from accounting.models import (
    AttendanceStatus,
    EmployeeStatus,
    EmployeeAttendance,
    EmployeeDocument,
    EmployeeExpenseClaim,
    EmployeeProfile,
    EmploymentType,
    LeaveRequest,
    PayrollPeriod,
    SalaryPayment,
    SalarySheet,
)
from accounting.services.hr_workspace_service import (
    approve_expense_claim_action,
    approve_leave_request_action,
    create_staff_profile,
    get_hr_summary,
    mark_attendance,
    record_salary_payment,
    reject_expense_claim_action,
    reject_leave_request_action,
    _write_audit,
)
from api.v1.permissions import IsAdmin
from api.v1.serializers.accounting import (
    EmployeeAttendanceSerializer,
    EmployeeExpenseClaimSerializer,
    EmployeeProfileSerializer,
    EmployeeDocumentSerializer,
    LeaveRequestSerializer,
    SalaryPaymentSerializer,
    SalarySheetSerializer,
)
from accounting.services.staff_pdf_service import (
    render_salary_agreement_pdf,
    render_staff_profile_pdf,
)

User = get_user_model()

ONBOARDING_STATUS = "ONBOARDING"
STAFF_LOGIN_ROLE_CHOICES = ((UserRole.STAFF, "Staff"),)
KYC_STATUS_CHOICES = (("PENDING", "Pending"), ("VERIFIED", "Verified"), ("REJECTED", "Rejected"))
DEFAULT_DEPARTMENTS = ["SALES", "COLLECTION", "DELIVERY", "INVENTORY", "ACCOUNTING", "HR", "SERVICE", "MANUFACTURING"]
DEFAULT_TITLES = ["Sales Executive", "Cashier", "Delivery Staff", "Inventory Staff", "Accountant", "HR Executive", "Service Staff", "Helper", "Manager"]
DEFAULT_ATTENDANCE_POLICIES = ["DAY_SHIFT", "SHOP_STANDARD", "FIELD_STAFF", "FLEXIBLE"]
DEFAULT_SHIFTS = ["DAY", "EVENING", "FULL_DAY", "FIELD"]
DEFAULT_WEEKLY_OFF = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "ROTATIONAL"]
DEFAULT_COST_CENTERS = ["SALES", "COLLECTION", "DELIVERY", "INVENTORY", "ACCOUNTING", "HR", "SERVICE", "MANUFACTURING"]
DEFAULT_KYC_TYPES = ["AADHAAR", "PAN", "VOTER_ID", "DRIVING_LICENSE", "PASSPORT", "OTHER"]
DEFAULT_EMERGENCY_RELATIONS = ["FATHER", "MOTHER", "SPOUSE", "BROTHER", "SISTER", "FRIEND", "OTHER"]


def _choices_payload(choices):
    return [{"value": value, "label": label} for value, label in choices]


def _unique_values(existing_values, defaults):
    values = []
    seen = set()
    for raw in [*defaults, *existing_values]:
        value = (raw or "").strip()
        if not value:
            continue
        key = value.upper()
        if key in seen:
            continue
        seen.add(key)
        values.append({"value": key, "label": value.replace("_", " ").title()})
    return values


class _AdminBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AdminHrSummaryView(_AdminBase):
    def get(self, request):
        return Response(get_hr_summary())


class AdminHrStaffOptionsView(_AdminBase):
    def get(self, request):
        existing = EmployeeProfile.objects.all()
        return Response(
            {
                "employment_statuses": [
                    {"value": EmployeeStatus.DRAFT, "label": "Draft"},
                    {"value": ONBOARDING_STATUS, "label": "Onboarding"},
                    {"value": EmployeeStatus.ACTIVE, "label": "Active"},
                    {"value": EmployeeStatus.INACTIVE, "label": "Inactive"},
                ],
                "employment_types": _choices_payload(EmploymentType.choices),
                "payment_modes": [{"value": "CASH", "label": "Cash"}, {"value": "BANK", "label": "Bank"}, {"value": "UPI", "label": "UPI"}],
                "user_roles": _choices_payload(STAFF_LOGIN_ROLE_CHOICES),
                "departments": _unique_values(existing.values_list("department", flat=True), DEFAULT_DEPARTMENTS),
                "roles_titles": _unique_values(existing.values_list("designation", flat=True), DEFAULT_TITLES),
                "attendance_policies": _unique_values(existing.values_list("attendance_policy", flat=True), DEFAULT_ATTENDANCE_POLICIES),
                "shifts": _unique_values(existing.values_list("shift_name", flat=True), DEFAULT_SHIFTS),
                "weekly_offs": _unique_values([], DEFAULT_WEEKLY_OFF),
                "cost_centers": _unique_values(existing.values_list("cost_center_code", flat=True), DEFAULT_COST_CENTERS),
                "kyc_statuses": _choices_payload(KYC_STATUS_CHOICES),
                "kyc_types": _unique_values(existing.values_list("kyc_id_type", flat=True), DEFAULT_KYC_TYPES),
                "emergency_relations": _unique_values([], DEFAULT_EMERGENCY_RELATIONS),
                "payroll_accounting": {
                    "enabled": False,
                    "message": "Payroll accounting bridge is not enabled here. Staff creation stores HR/payroll setup only; salary sheets, salary payments, journals, money movements, receipts, and reconciliation remain separate controlled workflows.",
                },
                "unsupported_profile_fields": [
                    {"field": "weekly_off", "reason": "No persisted EmployeeProfile field yet; captured only as operator context in notes if submitted."},
                    {"field": "emergency_contact_relation", "reason": "No persisted EmployeeProfile field yet; emergency contact name and phone are stored."},
                    {"field": "salary_type", "reason": "Mapped to employment_type/pay basis; no separate persisted salary_type field yet."},
                ],
            }
        )


class HrStaffCreateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, allow_blank=True)
    full_name = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField()
    email = serializers.EmailField(required=False, allow_blank=True)
    create_login_account = serializers.BooleanField(required=False, default=False)
    user_role = serializers.ChoiceField(choices=STAFF_LOGIN_ROLE_CHOICES, required=False, allow_null=True)
    role = serializers.ChoiceField(choices=[(UserRole.STAFF, UserRole.STAFF), (UserRole.ADMIN, UserRole.ADMIN), (UserRole.CASHIER, UserRole.CASHIER)], required=False, allow_null=True)
    username = serializers.CharField(required=False, allow_blank=True, max_length=150)
    temporary_password = serializers.CharField(required=False, allow_blank=True, min_length=8, write_only=True)
    branch = serializers.IntegerField(required=False, allow_null=True)
    cash_counter = serializers.IntegerField(required=False, allow_null=True)
    joining_date = serializers.DateField(required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False, default=False)
    employment_status = serializers.ChoiceField(
        choices=[(EmployeeStatus.DRAFT, EmployeeStatus.DRAFT), (ONBOARDING_STATUS, ONBOARDING_STATUS), (EmployeeStatus.ACTIVE, EmployeeStatus.ACTIVE), (EmployeeStatus.INACTIVE, EmployeeStatus.INACTIVE)],
        required=False,
        default=EmployeeStatus.DRAFT,
    )
    base_salary = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    designation = serializers.CharField(required=False, allow_blank=True)
    title = serializers.CharField(required=False, allow_blank=True)
    department = serializers.CharField(required=False, allow_blank=True)
    employment_type = serializers.ChoiceField(choices=EmploymentType.choices, required=False)
    staff_type = serializers.CharField(required=False, allow_blank=True)
    reporting_manager = serializers.CharField(required=False, allow_blank=True)
    work_location = serializers.CharField(required=False, allow_blank=True)
    probation_end_date = serializers.DateField(required=False, allow_null=True)
    attendance_policy = serializers.CharField(required=False, allow_blank=True)
    shift_name = serializers.CharField(required=False, allow_blank=True)
    shift = serializers.CharField(required=False, allow_blank=True)
    weekly_off = serializers.CharField(required=False, allow_blank=True)
    salary_effective_from = serializers.DateField(required=False, allow_null=True)
    salary_effective_date = serializers.DateField(required=False, allow_null=True)
    temporary_contract_end_date = serializers.DateField(required=False, allow_null=True)
    daily_wage_rate = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    hourly_wage_rate = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    piece_rate_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    piece_rate_unit_label = serializers.CharField(required=False, allow_blank=True)
    payroll_eligible = serializers.BooleanField(required=False, default=False)
    salary_type = serializers.CharField(required=False, allow_blank=True)
    payment_mode = serializers.ChoiceField(choices=[("CASH", "CASH"), ("BANK", "BANK"), ("UPI", "UPI")], required=False)
    bank_account_name = serializers.CharField(required=False, allow_blank=True)
    bank_account_number = serializers.CharField(required=False, allow_blank=True)
    bank_ifsc = serializers.CharField(required=False, allow_blank=True)
    upi_id = serializers.CharField(required=False, allow_blank=True)
    kyc_status = serializers.ChoiceField(choices=KYC_STATUS_CHOICES, required=False, default="PENDING")
    kyc_type = serializers.CharField(required=False, allow_blank=True)
    kyc_reference = serializers.CharField(required=False, allow_blank=True)
    kyc_id_type = serializers.CharField(required=False, allow_blank=True)
    kyc_id_number = serializers.CharField(required=False, allow_blank=True)
    kyc_verified = serializers.BooleanField(required=False, default=False)
    address = serializers.CharField(required=False, allow_blank=True)
    emergency_contact_name = serializers.CharField(required=False, allow_blank=True)
    emergency_contact_relation = serializers.CharField(required=False, allow_blank=True)
    emergency_contact_phone = serializers.CharField(required=False, allow_blank=True)
    emergency_phone = serializers.CharField(required=False, allow_blank=True)
    cost_center = serializers.CharField(required=False, allow_blank=True)
    cost_center_code = serializers.CharField(required=False, allow_blank=True)
    payroll_expense_account = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs.get("name") and attrs.get("full_name"):
            attrs["name"] = attrs["full_name"]
        if not attrs.get("designation") and attrs.get("title"):
            attrs["designation"] = attrs["title"]
        if not attrs.get("employment_type") and attrs.get("staff_type"):
            staff_type = attrs["staff_type"].strip().upper()
            valid_types = {value for value, _label in EmploymentType.choices}
            if staff_type in valid_types:
                attrs["employment_type"] = staff_type
        if not attrs.get("employment_type") and attrs.get("salary_type"):
            salary_type = attrs["salary_type"].strip().upper()
            valid_types = {value for value, _label in EmploymentType.choices}
            if salary_type in valid_types:
                attrs["employment_type"] = salary_type
        if not attrs.get("emergency_contact_phone") and attrs.get("emergency_phone"):
            attrs["emergency_contact_phone"] = attrs["emergency_phone"]
        if not attrs.get("cost_center_code") and attrs.get("cost_center"):
            attrs["cost_center_code"] = attrs["cost_center"]
        if not attrs.get("salary_effective_from") and attrs.get("salary_effective_date"):
            attrs["salary_effective_from"] = attrs["salary_effective_date"]
        if not attrs.get("kyc_id_type") and attrs.get("kyc_type"):
            attrs["kyc_id_type"] = attrs["kyc_type"]
        if not attrs.get("kyc_id_number") and attrs.get("kyc_reference"):
            attrs["kyc_id_number"] = attrs["kyc_reference"]
        if not attrs.get("shift_name") and attrs.get("shift"):
            attrs["shift_name"] = attrs["shift"]

        employment_status = attrs.get("employment_status") or EmployeeStatus.DRAFT
        errors = {}
        name = (attrs.get("name") or "").strip()
        phone = (attrs.get("phone") or "").strip()
        employment_type = attrs.get("employment_type") or EmploymentType.PERMANENT_MONTHLY

        if not name:
            errors["name"] = "Staff full name is required."
        if not phone:
            errors["phone"] = "Phone is required."

        if employment_status in {ONBOARDING_STATUS, EmployeeStatus.ACTIVE}:
            if not (attrs.get("designation") or "").strip():
                errors["designation"] = "Role/title is required for onboarding or activation."
            if not attrs.get("branch"):
                errors["branch"] = "Branch is required for onboarding or activation."
            if not attrs.get("joining_date"):
                errors["joining_date"] = "Joining date is required for onboarding or activation."
            if not (attrs.get("department") or "").strip():
                errors["department"] = "Department is required for onboarding or activation."
            if not employment_type:
                errors["employment_type"] = "Staff type is required for onboarding or activation."

        if employment_status == EmployeeStatus.ACTIVE:
            if not ((attrs.get("attendance_policy") or "").strip() or (attrs.get("shift_name") or "").strip()):
                errors["attendance_policy"] = "Attendance policy or shift is required before activation."
            kyc_status = attrs.get("kyc_status") or ("VERIFIED" if attrs.get("kyc_verified") else "PENDING")
            if kyc_status != "VERIFIED" or not attrs.get("kyc_id_type") or not attrs.get("kyc_id_number"):
                errors["kyc_status"] = "Verified KYC type and reference are required before activation."

        if attrs.get("payroll_eligible"):
            if employment_type in {EmploymentType.PERMANENT_MONTHLY, EmploymentType.TEMPORARY, EmploymentType.MANUFACTURING, EmploymentType.SERVICE} and attrs.get("base_salary") is None:
                errors["base_salary"] = "Base salary is required when payroll eligible."
            if employment_type == EmploymentType.DAILY_WAGE and attrs.get("daily_wage_rate") is None:
                errors["daily_wage_rate"] = "Daily wage is required when payroll eligible."
            if employment_type == EmploymentType.HOURLY and attrs.get("hourly_wage_rate") is None:
                errors["hourly_wage_rate"] = "Hourly wage is required when payroll eligible."
            if employment_type == EmploymentType.PIECE_RATE:
                if attrs.get("piece_rate_amount") is None:
                    errors["piece_rate_amount"] = "Piece rate is required when payroll eligible."
                if not (attrs.get("piece_rate_unit_label") or "").strip():
                    errors["piece_rate_unit_label"] = "Piece-rate unit is required when payroll eligible."
            if attrs.get("salary_effective_from") is None:
                errors["salary_effective_from"] = "Salary effective date is required when payroll eligible."
            if attrs.get("payment_mode") == "BANK" and not (attrs.get("bank_account_number") or "").strip():
                errors["bank_account_number"] = "Bank account number is required for bank payment mode."
            if attrs.get("payment_mode") == "UPI" and not (attrs.get("upi_id") or "").strip():
                errors["upi_id"] = "UPI ID is required for UPI payment mode."

        if attrs.get("create_login_account"):
            effective_role = attrs.get("user_role") or attrs.get("role")
            if effective_role != UserRole.STAFF:
                errors["user_role"] = "Staff login creation supports STAFF role only. Create ADMIN/CASHIER users from internal-user settings."
            if not (attrs.get("username") or "").strip():
                errors["username"] = "Username is required to create a staff login account."

        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class AdminHrStaffListCreateView(_AdminBase):
    def get(self, request):
        qs = EmployeeProfile.objects.select_related("branch", "staff_identity").all().order_by("name", "id")
        is_active = request.query_params.get("is_active")
        status_value = (request.query_params.get("status") or request.query_params.get("employment_status") or "").strip().upper()
        branch_id = request.query_params.get("branch")
        department = (request.query_params.get("department") or "").strip()
        employment_type = (request.query_params.get("employment_type") or "").strip().upper()
        payroll_ready = request.query_params.get("payroll_ready")
        payroll_eligible = request.query_params.get("payroll_eligible")
        kyc_verified = request.query_params.get("kyc_verified")
        q = (request.query_params.get("q") or "").strip()
        if is_active in {"true", "false"}:
            qs = qs.filter(is_active=is_active == "true")
        if status_value and status_value != ONBOARDING_STATUS:
            qs = qs.filter(employment_status=status_value)
        if status_value == ONBOARDING_STATUS:
            qs = qs.filter(employment_status=EmployeeStatus.DRAFT).exclude(designation="").exclude(branch_id__isnull=True).exclude(department="")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if department:
            qs = qs.filter(department__iexact=department)
        if employment_type:
            qs = qs.filter(employment_type=employment_type)
        if payroll_eligible in {"true", "false"}:
            qs = qs.filter(payroll_eligible=payroll_eligible == "true")
        if kyc_verified in {"true", "false"}:
            qs = qs.filter(kyc_verified=kyc_verified == "true")
        if q:
            qs = qs.filter(
                Q(name__icontains=q)
                | Q(phone__icontains=q)
                | Q(employee_code__icontains=q)
                | Q(department__icontains=q)
                | Q(designation__icontains=q)
            )
        if payroll_ready in {"true", "false"}:
            serializer_for_filter = EmployeeProfileSerializer(context={"request": request})
            wanted = payroll_ready == "true"
            qs = [employee for employee in qs[:200] if serializer_for_filter.get_payroll_ready(employee) is wanted]
            return Response({"count": len(qs), "results": EmployeeProfileSerializer(qs, many=True, context={"request": request}).data})
        qs = qs[:200]
        return Response({"count": qs.count(), "results": EmployeeProfileSerializer(qs, many=True, context={"request": request}).data})

    def post(self, request):
        serializer = HrStaffCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data

        requested_status = vd.get("employment_status") or EmployeeStatus.DRAFT
        stored_status = EmployeeStatus.DRAFT if requested_status == ONBOARDING_STATUS else requested_status
        is_active = stored_status == EmployeeStatus.ACTIVE
        cleaned_phone = (vd.get("phone") or "").strip()
        cleaned_name = (vd.get("name") or "").strip()
        cleaned_email = (vd.get("email") or "").strip().lower()
        username = (vd.get("username") or "").strip()
        login_user = None
        temporary_password = None
        identity = None

        if EmployeeProfile.objects.filter(phone=cleaned_phone).exists():
            raise serializers.ValidationError({"phone": "A staff profile already exists with this phone number."})
        if vd.get("create_login_account"):
            if User.objects.filter(phone=cleaned_phone).exists():
                raise serializers.ValidationError({"phone": "A login user already exists with this phone number."})
            if cleaned_email and User.objects.filter(email__iexact=cleaned_email).exists():
                raise serializers.ValidationError({"email": "A login user already exists with this email."})
            if User.objects.filter(username__iexact=username).exists():
                raise serializers.ValidationError({"username": "Username already exists."})

        try:
            with transaction.atomic():
                note_parts = []
                if vd.get("notes"):
                    note_parts.append(vd.get("notes") or "")
                if requested_status == ONBOARDING_STATUS:
                    note_parts.append("Workflow: ONBOARDING saved without activating payroll or accounting.")
                if vd.get("weekly_off"):
                    note_parts.append(f"Weekly off: {vd.get('weekly_off')}")
                if vd.get("emergency_contact_relation"):
                    note_parts.append(f"Emergency relation: {vd.get('emergency_contact_relation')}")
                if vd.get("salary_type"):
                    note_parts.append(f"Salary type: {vd.get('salary_type')}")
                profile_data = {
                    "name": cleaned_name,
                    "phone": cleaned_phone,
                    "branch": vd.get("branch"),
                    "joining_date": vd.get("joining_date") or timezone.localdate().isoformat(),
                    "is_active": is_active,
                    "employment_status": stored_status,
                    "employment_type": vd.get("employment_type") or EmploymentType.PERMANENT_MONTHLY,
                    "designation": vd.get("designation") or "",
                    "department": vd.get("department") or "",
                    "reporting_manager": vd.get("reporting_manager") or "",
                    "work_location": vd.get("work_location") or "",
                    "probation_end_date": vd.get("probation_end_date"),
                    "attendance_policy": vd.get("attendance_policy") or "",
                    "shift_name": vd.get("shift_name") or "",
                    "salary_effective_from": vd.get("salary_effective_from"),
                    "temporary_contract_end_date": vd.get("temporary_contract_end_date"),
                    "base_salary": vd.get("base_salary"),
                    "daily_wage_rate": vd.get("daily_wage_rate"),
                    "hourly_wage_rate": vd.get("hourly_wage_rate"),
                    "piece_rate_amount": vd.get("piece_rate_amount"),
                    "piece_rate_unit_label": vd.get("piece_rate_unit_label") or "",
                    "payroll_eligible": vd.get("payroll_eligible", False),
                    "payment_mode": vd.get("payment_mode") or "CASH",
                    "bank_account_name": vd.get("bank_account_name") or "",
                    "bank_account_number": vd.get("bank_account_number") or "",
                    "bank_ifsc": vd.get("bank_ifsc") or "",
                    "upi_id": vd.get("upi_id") or "",
                    "kyc_id_type": vd.get("kyc_id_type") or "",
                    "kyc_id_number": vd.get("kyc_id_number") or "",
                    "kyc_verified": vd.get("kyc_status") == "VERIFIED" or vd.get("kyc_verified", False),
                    "address": vd.get("address") or "",
                    "emergency_contact_name": vd.get("emergency_contact_name") or "",
                    "emergency_contact_phone": vd.get("emergency_contact_phone") or "",
                    "cost_center_code": vd.get("cost_center_code") or "",
                    "payroll_expense_account": vd.get("payroll_expense_account"),
                    "notes": "\n".join(part.strip() for part in note_parts if part and part.strip()),
                }
                profile_serializer = EmployeeProfileSerializer(data=profile_data, context={"request": request})
                profile_serializer.is_valid(raise_exception=True)
                employee = profile_serializer.save()

                if vd.get("create_login_account"):
                    temporary_password = (vd.get("temporary_password") or "").strip() or get_random_string(length=12)
                    login_user = User.objects.create_user(
                        username=username,
                        password=temporary_password,
                        phone=cleaned_phone,
                        email=cleaned_email,
                        first_name=cleaned_name,
                        role=UserRole.STAFF,
                        is_active=True,
                        is_staff=False,
                        is_superuser=False,
                    )
                    identity = StaffIdentity.objects.create(
                        user=login_user,
                        employee=employee,
                        login_enabled=True,
                        temporary_password_last_set_at=timezone.now(),
                        created_by=request.user,
                    )
                    _write_audit(actor=request.user, action_type="HR_STAFF_LOGIN_CREATED", model_name="StaffIdentity", object_id=identity.id, metadata={"employee_id": employee.id, "user_id": login_user.id})

                _write_audit(
                    actor=request.user,
                    action_type="HR_STAFF_PROFILE_CREATED",
                    model_name="EmployeeProfile",
                    object_id=employee.id,
                    metadata={"employee_code": employee.employee_code, "phone": cleaned_phone, "employment_status": requested_status, "stored_status": stored_status, "user_id": getattr(login_user, "id", None)},
                )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc
        except IntegrityError as exc:
            raise serializers.ValidationError({"detail": "A staff, login, or staff identity record with these identifiers already exists."}) from exc
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

        return Response({"employee": EmployeeProfileSerializer(employee, context={"request": request}).data, "workflow_status": requested_status, "user_id": getattr(login_user, "id", None), "staff_identity_id": getattr(identity, "id", None), "temporary_password": temporary_password}, status=status.HTTP_201_CREATED)


class AdminHrStaffPatchView(_AdminBase):
    def get(self, request, staff_id: int):
        employee = get_object_or_404(EmployeeProfile, pk=staff_id)
        return Response(EmployeeProfileSerializer(employee, context={"request": request}).data)

    def patch(self, request, staff_id: int):
        employee = get_object_or_404(EmployeeProfile, pk=staff_id)
        next_phone = (request.data.get("phone") or "").strip()
        if next_phone and EmployeeProfile.objects.filter(phone=next_phone).exclude(pk=employee.id).exists():
            raise serializers.ValidationError({"phone": "A staff profile already exists with this phone number."})
        serializer = EmployeeProfileSerializer(employee, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        try:
            updated = serializer.save()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc
        return Response(EmployeeProfileSerializer(updated, context={"request": request}).data)


class HrStaffStatusSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=[("DEACTIVATE", "DEACTIVATE"), ("REACTIVATE", "REACTIVATE")])
    reason = serializers.CharField(required=False, allow_blank=True)


class AdminHrStaffStatusView(_AdminBase):
    def post(self, request, staff_id: int):
        employee = get_object_or_404(EmployeeProfile, pk=staff_id)
        serializer = HrStaffStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data["action"]
        employee.is_active = action == "REACTIVATE"
        if action == "DEACTIVATE":
            employee.employment_status = EmployeeStatus.INACTIVE
            employee.deactivation_reason = serializer.validated_data.get("reason") or ""
            employee.deactivated_at = timezone.now()
            employee.deactivated_by = request.user
            employee.save(update_fields=["is_active", "employment_status", "deactivation_reason", "deactivated_at", "deactivated_by", "updated_at"])
        else:
            validation = EmployeeProfileSerializer(employee, data={"is_active": True, "employment_status": EmployeeStatus.ACTIVE}, partial=True, context={"request": request})
            validation.is_valid(raise_exception=True)
            employee.employment_status = EmployeeStatus.ACTIVE
            employee.save(update_fields=["is_active", "employment_status", "updated_at"])
        return Response(EmployeeProfileSerializer(employee, context={"request": request}).data)


class AdminHrStaffProfilePdfView(_AdminBase):
    def get(self, request, staff_id: int):
        employee = get_object_or_404(EmployeeProfile, pk=staff_id)
        pdf_bytes = render_staff_profile_pdf(employee=employee)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="staff-profile-{employee.employee_code or employee.id}.pdf"'
        return response


class AdminHrSalaryAgreementPdfView(_AdminBase):
    def get(self, request, staff_id: int):
        employee = get_object_or_404(EmployeeProfile, pk=staff_id)
        pdf_bytes = render_salary_agreement_pdf(employee=employee)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="salary-agreement-{employee.employee_code or employee.id}.pdf"'
        return response


class AdminHrStaffDocumentsListCreateView(_AdminBase):
    def get(self, request):
        qs = EmployeeDocument.objects.select_related("employee", "uploaded_by").order_by("-created_at", "-id")
        staff_id = request.query_params.get("staff") or request.query_params.get("employee")
        document_type = (request.query_params.get("document_type") or "").strip().upper()
        status_value = (request.query_params.get("status") or "").strip().upper()
        if staff_id:
            qs = qs.filter(employee_id=staff_id)
        if document_type:
            qs = qs.filter(document_type=document_type)
        if status_value:
            qs = qs.filter(status=status_value)
        results = list(qs[:200])
        return Response({"count": qs.count(), "results": EmployeeDocumentSerializer(results, many=True, context={"request": request}).data})

    def post(self, request):
        serializer = EmployeeDocumentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        document = serializer.save(uploaded_by=request.user)
        return Response(EmployeeDocumentSerializer(document, context={"request": request}).data)


class AdminHrStaffDocumentPatchView(_AdminBase):
    def patch(self, request, document_id: int):
        document = get_object_or_404(EmployeeDocument, pk=document_id)
        serializer = EmployeeDocumentSerializer(document, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return Response(EmployeeDocumentSerializer(updated, context={"request": request}).data)


class AdminHrStaffDocumentReviewView(_AdminBase):
    """POST /admin/hr/staff-documents/<document_id>/review/
    action='verify' sets status ACTIVE; action='reject' sets status INACTIVE.
    Notes are appended to the document notes field for audit trail."""

    def post(self, request, document_id: int):
        document = get_object_or_404(EmployeeDocument, pk=document_id)
        action = (request.data.get("action") or "").strip().lower()
        notes = (request.data.get("notes") or "").strip()

        if action not in ("verify", "reject"):
            return Response(
                {"detail": "action must be 'verify' or 'reject'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.utils import timezone
        actor = request.user.get_username() if request.user else "admin"
        timestamp = timezone.now().strftime("%Y-%m-%d %H:%M")

        new_status = "ACTIVE" if action == "verify" else "INACTIVE"
        audit_note = f"[{timestamp}] {actor} marked {action}."
        if notes:
            audit_note += f" Notes: {notes}"

        document.status = new_status
        if document.notes:
            document.notes = f"{document.notes}\n{audit_note}"
        else:
            document.notes = audit_note
        document.save(update_fields=["status", "notes"])

        return Response(EmployeeDocumentSerializer(document, context={"request": request}).data)


class HrAttendanceCreateSerializer(serializers.Serializer):
    employee = serializers.IntegerField()
    attendance_date = serializers.DateField(required=False)
    status = serializers.ChoiceField(choices=AttendanceStatus.choices)
    notes = serializers.CharField(required=False, allow_blank=True)
    worked_hours = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    overtime_hours = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)


class AdminHrAttendanceListCreateView(_AdminBase):
    def get(self, request):
        qs = EmployeeAttendance.objects.select_related("employee").all().order_by("-attendance_date", "-id")
        from_date = request.query_params.get("from")
        to_date = request.query_params.get("to")
        employee_id = request.query_params.get("employee")
        status_value = request.query_params.get("status")
        if from_date:
            qs = qs.filter(attendance_date__gte=from_date)
        if to_date:
            qs = qs.filter(attendance_date__lte=to_date)
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        if status_value:
            qs = qs.filter(status=status_value.strip().upper())
        results = list(qs[:200])
        return Response({"count": qs.count(), "results": EmployeeAttendanceSerializer(results, many=True, context={"request": request}).data})

    def post(self, request):
        serializer = HrAttendanceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee = get_object_or_404(EmployeeProfile, pk=serializer.validated_data["employee"])
        attendance_date = serializer.validated_data.get("attendance_date") or timezone.localdate()
        attendance = mark_attendance(performed_by=request.user, employee=employee, attendance_date=attendance_date, status=serializer.validated_data["status"], notes=serializer.validated_data.get("notes") or "", worked_hours=serializer.validated_data.get("worked_hours"), overtime_hours=serializer.validated_data.get("overtime_hours"))
        return Response(EmployeeAttendanceSerializer(attendance, context={"request": request}).data)


class HrLeavePatchSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=[("APPROVE", "APPROVE"), ("REJECT", "REJECT")])
    reason = serializers.CharField(required=False, allow_blank=True)


class AdminHrLeaveRequestsListCreateView(_AdminBase):
    def get(self, request):
        qs = LeaveRequest.objects.select_related("employee", "leave_type").all().order_by("-created_at", "-id")
        status_value = request.query_params.get("status")
        employee_id = request.query_params.get("employee")
        if status_value:
            qs = qs.filter(status=status_value.strip().upper())
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        results = list(qs[:200])
        return Response({"count": qs.count(), "results": LeaveRequestSerializer(results, many=True, context={"request": request}).data})

    def post(self, request):
        raise serializers.ValidationError({"detail": "Create leave requests via the leave request module."})


class AdminHrLeaveRequestPatchView(_AdminBase):
    def patch(self, request, leave_request_id: int):
        serializer = HrLeavePatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data["action"]
        if action == "APPROVE":
            updated = approve_leave_request_action(performed_by=request.user, leave_request_id=leave_request_id)
        else:
            updated = reject_leave_request_action(performed_by=request.user, leave_request_id=leave_request_id, reason=serializer.validated_data.get("reason") or "")
        return Response(LeaveRequestSerializer(updated, context={"request": request}).data)


class HrExpensePatchSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=[("APPROVE", "APPROVE"), ("REJECT", "REJECT")])
    reason = serializers.CharField(required=False, allow_blank=True)


class AdminHrExpenseClaimsListCreateView(_AdminBase):
    def get(self, request):
        qs = EmployeeExpenseClaim.objects.select_related("employee").all().order_by("-created_at", "-id")
        status_value = request.query_params.get("status")
        employee_id = request.query_params.get("employee")
        if status_value:
            qs = qs.filter(status=status_value.strip().upper())
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        results = list(qs[:200])
        return Response({"count": qs.count(), "results": EmployeeExpenseClaimSerializer(results, many=True, context={"request": request}).data})

    def post(self, request):
        raise serializers.ValidationError({"detail": "Create expense claims via the expense claim module."})


class AdminHrExpenseClaimPatchView(_AdminBase):
    def patch(self, request, expense_claim_id: int):
        serializer = HrExpensePatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data["action"]
        if action == "APPROVE":
            updated = approve_expense_claim_action(performed_by=request.user, expense_claim_id=expense_claim_id)
        else:
            updated = reject_expense_claim_action(performed_by=request.user, expense_claim_id=expense_claim_id, reason=serializer.validated_data.get("reason") or "")
        return Response(EmployeeExpenseClaimSerializer(updated, context={"request": request}).data)


class AdminHrPayrollView(_AdminBase):
    def get(self, request):
        period = PayrollPeriod.objects.order_by("-year", "-month", "-id").first()
        sheets_qs = SalarySheet.objects.select_related("employee", "payroll_period").order_by("-created_at", "-id")
        employee_id = request.query_params.get("employee")
        if employee_id:
            sheets_qs = sheets_qs.filter(employee_id=employee_id)
        sheets = sheets_qs[:50]
        return Response({"current_period": None if period is None else {"id": period.id, "code": period.code, "status": period.status}, "salary_sheets": SalarySheetSerializer(sheets, many=True, context={"request": request}).data})


class AdminHrSalaryPaymentsListCreateView(_AdminBase):
    def get(self, request):
        qs = SalaryPayment.objects.select_related("salary_sheet", "branch", "finance_account").order_by("-payment_date", "-id")
        employee_id = request.query_params.get("employee")
        if employee_id:
            qs = qs.filter(salary_sheet__employee_id=employee_id)
        results = list(qs[:200])
        return Response({"count": qs.count(), "results": SalaryPaymentSerializer(results, many=True, context={"request": request}).data})

    def post(self, request):
        serializer = SalaryPaymentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        payment = serializer.save()
        record_salary_payment(performed_by=request.user, salary_payment=payment)
        return Response(SalaryPaymentSerializer(payment, context={"request": request}).data)
