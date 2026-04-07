import random
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from accounts.models import (
    PasswordResetChannel,
    PasswordResetRequest,
    PasswordResetStatus,
    UserRole,
)
from accounts.services.otp_delivery_service import (
    OTPDeliveryError,
    send_password_reset_otp,
)
from subscriptions.models import AuditLog


User = get_user_model()

ALLOWED_PUBLIC_RESET_ROLES = {
    UserRole.CUSTOMER,
    UserRole.PARTNER,
}

MISSING_RESET_EMAIL_DETAIL = (
    "Email is required before password reset. Ask support or an admin to add a valid email address to this account."
)
RESET_DELIVERY_FAILURE_DETAIL = (
    "Password reset is temporarily unavailable. Please contact support or try again later."
)


class PasswordResetServiceError(Exception):
    def __init__(self, detail: str, *, status_code: int):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def generate_numeric_otp(length: int = 6) -> str:
    return "".join(str(random.randint(0, 9)) for _ in range(length))


def resolve_user_by_identifier(identifier: str):
    identifier = (identifier or "").strip()
    if not identifier:
        return None

    user = User.objects.filter(phone=identifier).first()
    if user:
        return user

    user = User.objects.filter(email__iexact=identifier).first()
    if user:
        return user

    user = User.objects.filter(username=identifier).first()
    return user


def blacklist_all_outstanding_tokens_for_user(user):
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


def _resolve_identifier_snapshot(user) -> str:
    return (user.email or user.username or user.phone or "").strip()


def _resolve_delivery_channel(delivered_via: str) -> str:
    if delivered_via == "EMAIL_OTP":
        return PasswordResetChannel.EMAIL_OTP
    return PasswordResetChannel.EMAIL_OTP


def _create_audit(*, action_type: str, object_id: int, performed_by=None, metadata=None):
    AuditLog.objects.create(
        action_type=action_type,
        model_name="PasswordResetRequest",
        object_id=object_id,
        performed_by=performed_by,
        metadata=metadata or {},
    )


def _resolved_public_reset_email(user) -> str:
    email = (getattr(user, "email", "") or "").strip()
    if not email:
        raise PasswordResetServiceError(
            MISSING_RESET_EMAIL_DETAIL,
            status_code=400,
        )
    return email


def _send_otp_and_update_request(
    reset_request: PasswordResetRequest,
    otp: str,
    *,
    email_only: bool = False,
) -> str:
    try:
        delivered_via = send_password_reset_otp(
            user=reset_request.user,
            otp=otp,
            email_only=email_only,
        )
    except OTPDeliveryError as exc:
        raise PasswordResetServiceError(
            RESET_DELIVERY_FAILURE_DETAIL,
            status_code=503,
        ) from exc

    reset_request.channel = _resolve_delivery_channel(delivered_via)
    reset_request.last_sent_at = timezone.now()
    reset_request.save(update_fields=["channel", "last_sent_at", "updated_at"])
    return delivered_via


def get_latest_active_reset_request_for_user(user):
    return (
        PasswordResetRequest.objects.filter(
            user=user,
            status=PasswordResetStatus.PENDING,
        )
        .order_by("-created_at")
        .first()
    )


def create_password_reset_request(
    *,
    identifier: str,
    requested_by_ip: str = "",
    requested_user_agent: str = "",
):
    user = resolve_user_by_identifier(identifier)

    generic_response = {
        "detail": "If an eligible account exists, a reset code has been sent."
    }

    if not user:
        return generic_response, None

    if not user.is_active or user.role not in ALLOWED_PUBLIC_RESET_ROLES:
        return generic_response, None

    resolved_identifier = _resolved_public_reset_email(user)

    otp = generate_numeric_otp()
    expires_at = timezone.now() + timedelta(
        minutes=getattr(settings, "PASSWORD_RESET_OTP_EXPIRY_MINUTES", 10)
    )

    with transaction.atomic():
        PasswordResetRequest.objects.filter(
            user=user,
            status=PasswordResetStatus.PENDING,
        ).update(status=PasswordResetStatus.CANCELLED)

        reset_request = PasswordResetRequest.objects.create(
            user=user,
            role_snapshot=user.role,
            channel=PasswordResetChannel.EMAIL_OTP,
            identifier_snapshot=resolved_identifier,
            otp_hash=make_password(otp),
            expires_at=expires_at,
            max_attempts=getattr(settings, "PASSWORD_RESET_OTP_MAX_ATTEMPTS", 5),
            requested_by_ip=requested_by_ip or None,
            requested_user_agent=(requested_user_agent or "")[:1000],
            resend_count=0,
            last_sent_at=None,
        )

        delivered_via = _send_otp_and_update_request(
            reset_request,
            otp,
            email_only=True,
        )

        _create_audit(
            action_type=AuditLog.ActionType.PASSWORD_RESET_REQUESTED,
            object_id=reset_request.id,
            metadata={
                "user_id": user.id,
                "role": user.role,
                "channel": reset_request.channel,
                "delivery_backend": delivered_via or "UNAVAILABLE",
            },
        )

    return generic_response, {
        "reset_request_id": reset_request.id,
        "user_id": user.id,
    }


def resend_password_reset_otp(
    *,
    identifier: str,
    requested_by_ip: str = "",
    requested_user_agent: str = "",
):
    user = resolve_user_by_identifier(identifier)

    generic_response = {
        "detail": "If an eligible account exists, a new reset code has been sent."
    }

    if not user:
        return generic_response

    if not user.is_active or user.role not in ALLOWED_PUBLIC_RESET_ROLES:
        return generic_response

    _resolved_public_reset_email(user)

    reset_request = get_latest_active_reset_request_for_user(user)

    if not reset_request:
        create_password_reset_request(
            identifier=identifier,
            requested_by_ip=requested_by_ip,
            requested_user_agent=requested_user_agent,
        )
        return generic_response

    if reset_request.is_expired:
        reset_request.mark_expired(save=True)
        create_password_reset_request(
            identifier=identifier,
            requested_by_ip=requested_by_ip,
            requested_user_agent=requested_user_agent,
        )
        return generic_response

    if reset_request.status != PasswordResetStatus.PENDING:
        raise ValueError("No active reset request found.")

    cooldown_seconds = getattr(settings, "PASSWORD_RESET_RESEND_COOLDOWN_SECONDS", 60)
    max_resends = getattr(settings, "PASSWORD_RESET_MAX_RESENDS", 3)
    now = timezone.now()

    if reset_request.last_sent_at:
        elapsed = int((now - reset_request.last_sent_at).total_seconds())
        if elapsed < cooldown_seconds:
            remaining = cooldown_seconds - elapsed
            raise ValueError(f"Please wait {remaining} seconds before requesting another OTP.")

    if reset_request.resend_count >= max_resends:
        raise ValueError("Maximum OTP resend limit reached. Please request a new reset later.")

    with transaction.atomic():
        otp = generate_numeric_otp()
        reset_request.otp_hash = make_password(otp)
        reset_request.expires_at = now + timedelta(
            minutes=getattr(settings, "PASSWORD_RESET_OTP_EXPIRY_MINUTES", 10)
        )
        reset_request.resend_count += 1
        reset_request.requested_by_ip = requested_by_ip or reset_request.requested_by_ip
        reset_request.requested_user_agent = (
            (requested_user_agent or "").strip()[:1000] or reset_request.requested_user_agent
        )

        delivered_via = _send_otp_and_update_request(
            reset_request,
            otp,
            email_only=True,
        )
        reset_request.save(
            update_fields=[
                "otp_hash",
                "expires_at",
                "resend_count",
                "requested_by_ip",
                "requested_user_agent",
                "updated_at",
            ]
        )

        _create_audit(
            action_type=AuditLog.ActionType.PASSWORD_RESET_RESENT,
            object_id=reset_request.id,
            metadata={
                "user_id": user.id,
                "role": user.role,
                "channel": reset_request.channel,
                "delivery_backend": delivered_via or "UNAVAILABLE",
                "resend_count": reset_request.resend_count,
            },
        )

    return generic_response


def admin_list_password_reset_requests(
    *,
    q: str = "",
    status: str = "",
    role: str = "",
):
    queryset = PasswordResetRequest.objects.select_related("user").all()

    q = (q or "").strip()
    if q:
        queryset = queryset.filter(
            Q(user__username__icontains=q)
            | Q(user__phone__icontains=q)
            | Q(user__email__icontains=q)
            | Q(identifier_snapshot__icontains=q)
        )

    status = (status or "").strip().upper()
    if status:
        queryset = queryset.filter(status=status)

    role = (role or "").strip().upper()
    if role:
        queryset = queryset.filter(role_snapshot=role)

    return queryset.order_by("-created_at")


def admin_get_password_reset_request(request_id: int):
    return PasswordResetRequest.objects.select_related("user").get(id=request_id)


def admin_invalidate_password_reset_request(*, request_id: int, performed_by):
    reset_request = admin_get_password_reset_request(request_id)

    if reset_request.status in {
        PasswordResetStatus.USED,
        PasswordResetStatus.CANCELLED,
    }:
        return {
            "detail": "Password reset request is already closed.",
            "request_id": reset_request.id,
            "status": reset_request.status,
        }

    reset_request.mark_cancelled(save=True)

    _create_audit(
        action_type=AuditLog.ActionType.PASSWORD_RESET_INVALIDATED,
        object_id=reset_request.id,
        performed_by=performed_by,
        metadata={
            "user_id": reset_request.user_id,
            "invalidated_by_user_id": getattr(performed_by, "id", None),
        },
    )

    return {
        "detail": "Password reset request invalidated successfully.",
        "request_id": reset_request.id,
        "status": reset_request.status,
    }


def admin_resend_password_reset_request(*, request_id: int, performed_by):
    reset_request = admin_get_password_reset_request(request_id)
    user = reset_request.user

    if not user.is_active or user.role not in ALLOWED_PUBLIC_RESET_ROLES:
        raise ValueError("Reset request user is not eligible for public password reset.")

    _resolved_public_reset_email(user)

    if reset_request.status == PasswordResetStatus.USED:
        raise ValueError("Cannot resend OTP for a used reset request.")

    if reset_request.status in {
        PasswordResetStatus.EXPIRED,
        PasswordResetStatus.CANCELLED,
        PasswordResetStatus.LOCKED,
    }:
        response, meta = create_password_reset_request(
            identifier=_resolve_identifier_snapshot(user),
            requested_by_ip="",
            requested_user_agent=f"admin-resend:{getattr(performed_by, 'id', '')}",
        )
        return {
            "detail": "A new password reset request was created and OTP was sent.",
            "request_id": meta["reset_request_id"] if meta else None,
            "status": PasswordResetStatus.PENDING,
        }

    cooldown_seconds = getattr(settings, "PASSWORD_RESET_RESEND_COOLDOWN_SECONDS", 60)
    max_resends = getattr(settings, "PASSWORD_RESET_MAX_RESENDS", 3)
    now = timezone.now()

    if reset_request.last_sent_at:
        elapsed = int((now - reset_request.last_sent_at).total_seconds())
        if elapsed < cooldown_seconds:
            remaining = cooldown_seconds - elapsed
            raise ValueError(f"Please wait {remaining} seconds before resending another OTP.")

    if reset_request.resend_count >= max_resends:
        raise ValueError("Maximum OTP resend limit reached for this reset request.")

    with transaction.atomic():
        otp = generate_numeric_otp()
        reset_request.otp_hash = make_password(otp)
        reset_request.expires_at = now + timedelta(
            minutes=getattr(settings, "PASSWORD_RESET_OTP_EXPIRY_MINUTES", 10)
        )
        reset_request.resend_count += 1

        delivered_via = _send_otp_and_update_request(
            reset_request,
            otp,
            email_only=True,
        )
        reset_request.save(
            update_fields=["otp_hash", "expires_at", "resend_count", "updated_at"]
        )

        _create_audit(
            action_type=AuditLog.ActionType.PASSWORD_RESET_RESENT,
            object_id=reset_request.id,
            performed_by=performed_by,
            metadata={
                "user_id": user.id,
                "channel": reset_request.channel,
                "delivery_backend": delivered_via or "UNAVAILABLE",
                "resend_count": reset_request.resend_count,
                "resent_by_user_id": getattr(performed_by, "id", None),
            },
        )

    return {
        "detail": "OTP resent successfully.",
        "request_id": reset_request.id,
        "status": reset_request.status,
        "resend_count": reset_request.resend_count,
    }


def confirm_password_reset(
    *,
    identifier: str,
    otp: str,
    new_password: str,
):
    user = resolve_user_by_identifier(identifier)

    if not user or not user.is_active or user.role not in ALLOWED_PUBLIC_RESET_ROLES:
        raise ValueError("Invalid reset request.")

    reset_request = (
        PasswordResetRequest.objects.filter(
            user=user,
            status=PasswordResetStatus.PENDING,
        )
        .order_by("-created_at")
        .first()
    )

    if not reset_request:
        raise ValueError("No active reset request found.")

    if reset_request.is_expired:
        reset_request.mark_expired(save=True)

        _create_audit(
            action_type=AuditLog.ActionType.PASSWORD_RESET_EXPIRED,
            object_id=reset_request.id,
            metadata={"user_id": user.id},
        )
        raise ValueError("Reset code has expired.")

    if not reset_request.is_usable():
        reset_request.mark_locked(save=True)

        _create_audit(
            action_type=AuditLog.ActionType.PASSWORD_RESET_LOCKED,
            object_id=reset_request.id,
            metadata={"user_id": user.id},
        )
        raise ValueError("Reset request is no longer usable.")

    if not check_password(otp, reset_request.otp_hash):
        reset_request.increment_failed_attempt(save=True)

        if reset_request.status == PasswordResetStatus.LOCKED:
            _create_audit(
                action_type=AuditLog.ActionType.PASSWORD_RESET_LOCKED,
                object_id=reset_request.id,
                metadata={
                    "user_id": user.id,
                    "failed_attempt_count": reset_request.failed_attempt_count,
                },
            )
        else:
            _create_audit(
                action_type=AuditLog.ActionType.PASSWORD_RESET_FAILED,
                object_id=reset_request.id,
                metadata={
                    "user_id": user.id,
                    "failed_attempt_count": reset_request.failed_attempt_count,
                },
            )

        raise ValueError("Invalid reset code.")

    with transaction.atomic():
        reset_request.mark_verified(save=True)

        _create_audit(
            action_type=AuditLog.ActionType.PASSWORD_RESET_VERIFIED,
            object_id=reset_request.id,
            metadata={"user_id": user.id},
        )

        user.set_password(new_password)
        user.save(update_fields=["password"])

        reset_request.mark_used(save=True)

        _create_audit(
            action_type=AuditLog.ActionType.PASSWORD_RESET_COMPLETED,
            object_id=reset_request.id,
            metadata={"user_id": user.id},
        )

        blacklist_all_outstanding_tokens_for_user(user)

    return {"detail": "Password has been reset successfully."}
