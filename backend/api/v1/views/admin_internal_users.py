from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import UserRole
from api.v1.permissions import IsAdmin
from subscriptions.models import AuditLog

User = get_user_model()


INTERNAL_MANAGED_ROLES = [
    UserRole.ADMIN,
    UserRole.CASHIER,
    UserRole.PARTNER,
]


def _internal_user_queryset():
    return User.objects.filter(role__in=INTERNAL_MANAGED_ROLES)


def _write_audit(*, actor, target_user, action_type, metadata=None):
    AuditLog.objects.create(
        action_type=action_type,
        performed_by=actor,
        model_name="User",
        object_id=target_user.id,
        metadata=metadata or {},
    )


def _assert_not_self_deactivate(actor, target_user):
    if actor and actor.id == target_user.id:
        raise serializers.ValidationError(
            {"detail": "You cannot deactivate your own account."}
        )


def _assert_not_self_role_demotion(actor, target_user, next_role):
    if actor and actor.id == target_user.id:
        if target_user.role == UserRole.ADMIN and next_role != UserRole.ADMIN:
            raise serializers.ValidationError(
                {"detail": "You cannot remove your own admin role."}
            )


def _assert_not_last_active_admin(target_user, next_role=None, next_is_active=None):
    current_role = target_user.role
    current_is_active = bool(target_user.is_active)

    resulting_role = next_role if next_role is not None else current_role
    resulting_is_active = (
        bool(next_is_active) if next_is_active is not None else current_is_active
    )

    if current_role != UserRole.ADMIN or not current_is_active:
        return

    if resulting_role == UserRole.ADMIN and resulting_is_active:
        return

    active_admin_count = _internal_user_queryset().filter(
        role=UserRole.ADMIN,
        is_active=True,
    ).count()

    if active_admin_count <= 1:
        raise serializers.ValidationError(
            {"detail": "Cannot deactivate or demote the last active admin."}
        )


def _compute_staff_flag(role: str) -> bool:
    return role in [UserRole.ADMIN, UserRole.CASHIER]


class InternalUserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "phone",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "commission_rate",
            "is_active",
            "is_staff",
            "is_superuser",
            "date_joined",
            "last_login",
        )

    def get_full_name(self, obj):
        full_name = f"{obj.first_name or ''} {obj.last_name or ''}".strip()
        return full_name or obj.username


class AdminInternalUserCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=8)
    phone = serializers.CharField(required=True, allow_blank=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    commission_rate = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
    )
    role = serializers.ChoiceField(
        choices=(
            (UserRole.ADMIN, UserRole.ADMIN),
            (UserRole.CASHIER, UserRole.CASHIER),
            (UserRole.PARTNER, UserRole.PARTNER),
        )
    )
    is_active = serializers.BooleanField(required=False, default=True)

    def validate_username(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Username is required.")
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already exists.")
        return value

    def validate_phone(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Phone is required.")
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError("Phone already exists.")
        return value

    def validate_email(self, value):
        value = (value or "").strip()
        if not value:
            return ""
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email already exists.")
        return value

    def validate(self, attrs):
        role = attrs.get("role")
        rate = attrs.get("commission_rate", None)
        email = (attrs.get("email") or "").strip()

        if rate is not None:
            if rate < Decimal("0.00"):
                raise serializers.ValidationError(
                    {"commission_rate": "Commission rate cannot be negative."}
                )
            if rate > Decimal("100.00"):
                raise serializers.ValidationError(
                    {"commission_rate": "Commission rate cannot exceed 100.00."}
                )

        if role == UserRole.PARTNER:
            if not email:
                raise serializers.ValidationError(
                    {"email": "Email is required for managed partner access and password reset."}
                )
            if rate is None:
                raise serializers.ValidationError(
                    {"commission_rate": "Commission rate is required for partner users."}
                )
            return attrs

        attrs["commission_rate"] = Decimal("0.00")
        return attrs

    def create(self, validated_data):
        role = validated_data["role"]

        user = User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
            phone=validated_data["phone"],
            email=validated_data.get("email", ""),
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            role=role,
            commission_rate=validated_data.get("commission_rate", Decimal("0.00")),
            is_active=validated_data.get("is_active", True),
            is_staff=_compute_staff_flag(role),
            is_superuser=False,
        )
        return user


class AdminInternalUserUpdateSerializer(serializers.Serializer):
    phone = serializers.CharField(required=False, allow_blank=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    commission_rate = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
    )
    role = serializers.ChoiceField(
        choices=(
            (UserRole.ADMIN, UserRole.ADMIN),
            (UserRole.CASHIER, UserRole.CASHIER),
            (UserRole.PARTNER, UserRole.PARTNER),
        ),
        required=False,
    )
    is_active = serializers.BooleanField(required=False)

    def validate_phone(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Phone is required.")

        exists = User.objects.filter(phone=value)
        if self.instance:
            exists = exists.exclude(id=self.instance.id)

        if exists.exists():
            raise serializers.ValidationError("Phone already exists.")
        return value

    def validate_email(self, value):
        value = (value or "").strip()
        if not value:
            return ""

        exists = User.objects.filter(email__iexact=value)
        if self.instance:
            exists = exists.exclude(id=self.instance.id)

        if exists.exists():
            raise serializers.ValidationError("Email already exists.")
        return value

    def validate(self, attrs):
        role = attrs.get("role", self.instance.role if self.instance else None)
        rate = attrs.get("commission_rate", None)
        final_email = (
            (attrs.get("email") or "").strip()
            if "email" in attrs
            else (getattr(self.instance, "email", "") or "").strip()
        )

        if rate is not None:
            if rate < Decimal("0.00"):
                raise serializers.ValidationError(
                    {"commission_rate": "Commission rate cannot be negative."}
                )
            if rate > Decimal("100.00"):
                raise serializers.ValidationError(
                    {"commission_rate": "Commission rate cannot exceed 100.00."}
                )

        if role == UserRole.PARTNER:
            if not final_email:
                raise serializers.ValidationError(
                    {"email": "Email is required for managed partner access and password reset."}
                )
            return attrs

        attrs["commission_rate"] = Decimal("0.00")
        return attrs

    def update(self, instance, validated_data):
        for field in [
            "phone",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "commission_rate",
        ]:
            if field in validated_data:
                setattr(instance, field, validated_data[field])

        instance.is_staff = _compute_staff_flag(instance.role)
        instance.save()
        return instance


class AdminInternalUserPasswordResetSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "Password confirmation does not match."}
            )
        return attrs


class AdminInternalUserListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = _internal_user_queryset().order_by("-date_joined", "-id")

        role = (request.query_params.get("role") or "").strip().upper()
        q = (request.query_params.get("q") or "").strip()
        is_active = (request.query_params.get("is_active") or "").strip().lower()

        if role in INTERNAL_MANAGED_ROLES:
            queryset = queryset.filter(role=role)

        if is_active in {"true", "false"}:
            queryset = queryset.filter(is_active=(is_active == "true"))

        if q:
            queryset = queryset.filter(
                Q(username__icontains=q)
                | Q(phone__icontains=q)
                | Q(email__icontains=q)
                | Q(first_name__icontains=q)
                | Q(last_name__icontains=q)
            )

        serializer = InternalUserSerializer(queryset[:200], many=True)
        return Response(
            {
                "count": queryset.count(),
                "results": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class AdminInternalUserCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = AdminInternalUserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.save()

        _write_audit(
            actor=request.user,
            target_user=user,
            action_type=AuditLog.ActionType.USER_CREATED,
            metadata={
                "username": user.username,
                "role": user.role,
                "is_active": bool(user.is_active),
                "is_staff": bool(user.is_staff),
                "commission_rate": str(user.commission_rate),
            },
        )

        if user.role == UserRole.PARTNER:
            _write_audit(
                actor=request.user,
                target_user=user,
                action_type=AuditLog.ActionType.PARTNER_COMMISSION_SET,
                metadata={
                    "user_id": user.id,
                    "username": user.username,
                    "commission_rate": str(user.commission_rate),
                    "actor_id": getattr(request.user, "id", None),
                },
            )

        return Response(
            InternalUserSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class AdminInternalUserDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get_object(self, pk):
        return get_object_or_404(_internal_user_queryset(), pk=pk)

    def get(self, request, pk):
        user = self.get_object(pk)
        return Response(InternalUserSerializer(user).data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        user = self.get_object(pk)

        old_data = {
            "phone": user.phone,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": user.role,
            "is_active": bool(user.is_active),
            "is_staff": bool(user.is_staff),
            "commission_rate": str(user.commission_rate),
        }

        serializer = AdminInternalUserUpdateSerializer(
            instance=user,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)

        next_role = serializer.validated_data.get("role", user.role)
        next_is_active = serializer.validated_data.get("is_active", user.is_active)

        _assert_not_last_active_admin(
            user,
            next_role=next_role,
            next_is_active=next_is_active,
        )
        _assert_not_self_role_demotion(request.user, user, next_role)

        updated_user = serializer.save()

        _write_audit(
            actor=request.user,
            target_user=updated_user,
            action_type=AuditLog.ActionType.USER_UPDATED,
            metadata={
                "old": old_data,
                "new": {
                    "phone": updated_user.phone,
                    "email": updated_user.email,
                    "first_name": updated_user.first_name,
                    "last_name": updated_user.last_name,
                    "role": updated_user.role,
                    "is_active": bool(updated_user.is_active),
                    "is_staff": bool(updated_user.is_staff),
                    "commission_rate": str(updated_user.commission_rate),
                },
            },
        )

        old_rate = Decimal(str(old_data.get("commission_rate", "0.00")))
        new_rate = updated_user.commission_rate
        if old_rate != new_rate:
            _write_audit(
                actor=request.user,
                target_user=updated_user,
                action_type=AuditLog.ActionType.PARTNER_COMMISSION_UPDATED,
                metadata={
                    "user_id": updated_user.id,
                    "username": updated_user.username,
                    "old_commission_rate": str(old_rate),
                    "new_commission_rate": str(new_rate),
                    "actor_id": getattr(request.user, "id", None),
                    "role_before": old_data.get("role"),
                    "role_after": updated_user.role,
                },
            )

        return Response(
            InternalUserSerializer(updated_user).data,
            status=status.HTTP_200_OK,
        )


class AdminInternalUserActivateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        user = get_object_or_404(_internal_user_queryset(), pk=pk)

        if user.is_active:
            return Response(
                {"detail": "User is already active."},
                status=status.HTTP_200_OK,
            )

        user.is_active = True
        user.is_staff = _compute_staff_flag(user.role)
        user.save(update_fields=["is_active", "is_staff"])

        _write_audit(
            actor=request.user,
            target_user=user,
            action_type=AuditLog.ActionType.USER_ACTIVATED,
            metadata={"is_active": True, "is_staff": bool(user.is_staff)},
        )

        return Response(
            InternalUserSerializer(user).data,
            status=status.HTTP_200_OK,
        )


class AdminInternalUserDeactivateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        user = get_object_or_404(_internal_user_queryset(), pk=pk)

        _assert_not_self_deactivate(request.user, user)
        _assert_not_last_active_admin(user, next_is_active=False)

        if not user.is_active:
            return Response(
                {"detail": "User is already inactive."},
                status=status.HTTP_200_OK,
            )

        user.is_active = False
        user.save(update_fields=["is_active"])

        _write_audit(
            actor=request.user,
            target_user=user,
            action_type=AuditLog.ActionType.USER_DEACTIVATED,
            metadata={"is_active": False},
        )

        return Response(
            InternalUserSerializer(user).data,
            status=status.HTTP_200_OK,
        )


class AdminInternalUserPasswordResetView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        user = get_object_or_404(_internal_user_queryset(), pk=pk)

        serializer = AdminInternalUserPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])

        _write_audit(
            actor=request.user,
            target_user=user,
            action_type=AuditLog.ActionType.USER_PASSWORD_RESET,
            metadata={"password_reset": True},
        )

        return Response(
            {"detail": "Password reset successfully."},
            status=status.HTTP_200_OK,
        )


class AdminInternalUserAuditView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        user = get_object_or_404(_internal_user_queryset(), pk=pk)

        logs = (
            AuditLog.objects.select_related("performed_by")
            .filter(model_name="User", object_id=user.id)
            .order_by("-created_at", "-id")
        )

        results = [
            {
                "id": log.id,
                "action_type": log.action_type,
                "performed_by": log.performed_by.username if log.performed_by else None,
                "metadata": log.metadata or {},
                "created_at": log.created_at,
            }
            for log in logs[:200]
        ]

        return Response(
            {
                "count": logs.count(),
                "results": results,
            },
            status=status.HTTP_200_OK,
        )
