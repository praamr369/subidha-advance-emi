from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from accounts.models import StaffIdentity, UserRole
from accounting.models import EmployeeAttendance, EmployeeProfile, SalaryPayment, SalarySheet
from api.v1.serializers.accounting import EmployeeAttendanceSerializer, EmployeeProfileSerializer, SalaryPaymentSerializer, SalarySheetSerializer
from crm.models import PartyLink, PartyLinkRole
from crm.services.party_service import sync_party_for_employee

User = get_user_model()


class StaffIdentitySerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)

    class Meta:
        model = StaffIdentity
        fields = [
            "id",
            "user_id",
            "username",
            "employee",
            "employee_name",
            "employee_code",
            "login_enabled",
            "temporary_password_last_set_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AdminStaffCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=20)
    email = serializers.EmailField(required=False, allow_blank=True)
    username = serializers.CharField(max_length=150)
    temporary_password = serializers.CharField(required=False, allow_blank=True, write_only=True, min_length=8)
    designation = serializers.CharField(required=False, allow_blank=True, max_length=80)
    department = serializers.CharField(required=False, allow_blank=True, max_length=80)
    branch = serializers.IntegerField(required=False, allow_null=True)
    joining_date = serializers.DateField()
    base_salary = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    login_enabled = serializers.BooleanField(default=True)

    def validate_username(self, value):
        username = (value or "").strip()
        if not username:
            raise serializers.ValidationError("Username is required.")
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError("Username already exists.")
        return username

    def validate_phone(self, value):
        phone = (value or "").strip()
        if not phone:
            raise serializers.ValidationError("Phone is required.")
        if User.objects.filter(phone=phone).exists():
            raise serializers.ValidationError("A user with this phone already exists.")
        return phone

    @transaction.atomic
    def create(self, validated_data):
        request = self.context.get("request")
        temporary_password = validated_data.pop("temporary_password", "") or User.objects.make_random_password(length=12)
        branch_id = validated_data.pop("branch", None)
        login_enabled = validated_data.pop("login_enabled", True)
        email = (validated_data.pop("email", "") or "").strip().lower()
        username = validated_data.pop("username")
        phone = validated_data["phone"]
        name = validated_data["name"]

        user = User.objects.create_user(
            username=username,
            password=temporary_password,
            email=email,
            phone=phone,
            first_name=name,
            role=UserRole.STAFF,
            is_active=login_enabled,
            is_staff=False,
        )
        employee = EmployeeProfile.objects.create(
            name=name,
            phone=phone,
            designation=validated_data.get("designation", ""),
            department=validated_data.get("department", ""),
            branch_id=branch_id,
            joining_date=validated_data["joining_date"],
            base_salary=validated_data.get("base_salary"),
            is_active=True,
        )
        identity = StaffIdentity.objects.create(
            user=user,
            employee=employee,
            login_enabled=login_enabled,
            temporary_password_last_set_at=timezone.now(),
            created_by=getattr(request, "user", None),
        )
        sync_party_for_employee(employee, performed_by=getattr(request, "user", None))
        identity.generated_password = temporary_password
        return identity

    def to_representation(self, instance):
        payload = StaffIdentitySerializer(instance).data
        payload["temporary_password"] = getattr(instance, "generated_password", None)
        return payload


class AdminStaffLoginToggleSerializer(serializers.Serializer):
    login_enabled = serializers.BooleanField()


class StaffProfilePayloadSerializer(serializers.Serializer):
    user = serializers.DictField()
    profile = serializers.DictField()
    crm_party = serializers.DictField(required=False, allow_null=True)


def staff_profile_payload(identity: StaffIdentity) -> dict:
    user = identity.user
    employee = identity.employee
    party_link = PartyLink.objects.select_related("party").filter(
        role_type=PartyLinkRole.STAFF,
        source_app_label="accounting",
        source_model="EmployeeProfile",
        source_pk=employee.id,
    ).first()
    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "phone": user.phone,
            "email": user.email,
            "display_name": employee.name,
            "staff_profile_id": employee.id,
            "login_enabled": identity.login_enabled and user.is_active,
        },
        "profile": EmployeeProfileSerializer(employee).data,
        "crm_party": {
            "party_id": party_link.party_id,
            "party_no": party_link.party.party_no,
            "display_name": party_link.party.display_name,
        } if party_link else None,
    }


def salary_summary_payload(employee: EmployeeProfile) -> dict:
    latest_sheet = employee.salary_sheets.order_by("-year", "-month", "-id").first()
    sheets = employee.salary_sheets.order_by("-year", "-month", "-id")[:12]
    total_paid = SalaryPayment.objects.filter(salary_sheet__employee=employee).count()
    return {
        "base_salary": str(employee.base_salary or "0.00"),
        "employment_type": employee.employment_type,
        "salary_effective_from": employee.salary_effective_from.isoformat() if employee.salary_effective_from else None,
        "latest_payslip": SalarySheetSerializer(latest_sheet).data if latest_sheet else None,
        "recent_payslips": SalarySheetSerializer(sheets, many=True).data,
        "salary_payment_count": total_paid,
    }


def attendance_payload(employee: EmployeeProfile, year: int | None = None, month: int | None = None) -> dict:
    today = timezone.localdate()
    queryset = EmployeeAttendance.objects.filter(employee=employee)
    if year:
        queryset = queryset.filter(attendance_date__year=year)
    if month:
        queryset = queryset.filter(attendance_date__month=month)
    queryset = queryset.order_by("-attendance_date", "-id")
    today_entry = EmployeeAttendance.objects.filter(employee=employee, attendance_date=today).first()
    counts = {}
    for status in queryset.values_list("status", flat=True):
        counts[status] = counts.get(status, 0) + 1
    return {
        "today": EmployeeAttendanceSerializer(today_entry).data if today_entry else None,
        "counts": counts,
        "results": EmployeeAttendanceSerializer(queryset[:62], many=True).data,
    }
