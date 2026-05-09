import re
from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from accounts.models import (
    ReservedUsername,
    UserRole,
    UsernameChangeAudit,
    UsernameChangeSource,
)
from subscriptions.models import AuditLog

User = get_user_model()

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")
MIN_USERNAME_LENGTH = 4
RESERVED_USERNAMES = {
    "admin",
    "root",
    "superuser",
    "support",
    "subidha",
    "subidhafurniture",
    "cashier",
    "customer",
    "partner",
    "vendor",
    "api",
    "login",
    "logout",
    "test",
    "null",
    "system",
}
SELF_CHANGE_COOLDOWN_SECONDS = 3600


class UsernameChangeError(Exception):
    def __init__(self, detail: str, *, code: str = "invalid"):
        super().__init__(detail)
        self.detail = detail
        self.code = code


@dataclass(frozen=True)
class UsernameChangeResult:
    username: str
    changed: bool
    requires_relogin: bool


def _normalize_username(value: str) -> str:
    return (value or "").strip().lower()


def _blacklist_all_outstanding_tokens(user) -> None:
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


def _validate_target_allowed(*, target_user, changed_by, source: str) -> None:
    actor_role = getattr(changed_by, "role", "")
    if source == UsernameChangeSource.SELF:
        if not changed_by or changed_by.id != target_user.id:
            raise UsernameChangeError(
                "You do not have permission to change this username.",
                code="permission_denied",
            )
        if actor_role not in {UserRole.CUSTOMER, UserRole.PARTNER}:
            raise UsernameChangeError(
                "You do not have permission to change this username.",
                code="permission_denied",
            )
        return

    if actor_role != UserRole.ADMIN:
        raise UsernameChangeError(
            "You do not have permission to change this username.",
            code="permission_denied",
        )

    if getattr(target_user, "is_superuser", False) or getattr(target_user, "is_staff", False):
        if not getattr(changed_by, "is_superuser", False):
            raise UsernameChangeError(
                "You do not have permission to change this username.",
                code="permission_denied",
            )

    if getattr(target_user, "role", "") not in {UserRole.CUSTOMER, UserRole.PARTNER}:
        raise UsernameChangeError(
            "You do not have permission to change this username.",
            code="permission_denied",
        )


def _validate_new_username(*, new_username: str, target_user_id: int) -> str:
    candidate = _normalize_username(new_username)
    if not candidate:
        raise UsernameChangeError("Username cannot be blank.", code="invalid_username")
    if " " in candidate:
        raise UsernameChangeError(
            "Username can only contain letters, numbers, dots, underscores, and hyphens.",
            code="invalid_username",
        )
    if len(candidate) < MIN_USERNAME_LENGTH:
        raise UsernameChangeError("Username is too short.", code="invalid_username")
    max_length = User._meta.get_field("username").max_length
    if len(candidate) > max_length:
        raise UsernameChangeError("Username is too long.", code="invalid_username")
    if not USERNAME_PATTERN.fullmatch(candidate):
        raise UsernameChangeError(
            "Username can only contain letters, numbers, dots, underscores, and hyphens.",
            code="invalid_username",
        )
    if candidate in RESERVED_USERNAMES:
        raise UsernameChangeError("This username is reserved.", code="reserved_username")

    duplicate_exists = User.objects.filter(username__iexact=candidate).exclude(id=target_user_id).exists()
    if duplicate_exists:
        raise UsernameChangeError("This username is already taken.", code="duplicate_username")

    if ReservedUsername.objects.filter(username__iexact=candidate).exists():
        raise UsernameChangeError("This username is reserved.", code="reserved_username")

    return candidate


def _validate_self_verification(*, changed_by, verification_context: dict | None) -> None:
    context = verification_context or {}
    current_password = (context.get("current_password") or "").strip()
    if not current_password or not check_password(current_password, changed_by.password):
        raise UsernameChangeError("Current password is incorrect.", code="invalid_verification")


def _validate_self_rate_limit(*, target_user) -> None:
    cooldown_from = timezone.now() - timezone.timedelta(seconds=SELF_CHANGE_COOLDOWN_SECONDS)
    changed_recently = UsernameChangeAudit.objects.filter(
        user=target_user,
        source=UsernameChangeSource.SELF,
        changed_at__gte=cooldown_from,
    ).exists()
    if changed_recently:
        raise UsernameChangeError(
            "Username was changed recently. Try again later.",
            code="rate_limited",
        )


@transaction.atomic
def change_username(
    *,
    target_user,
    new_username: str,
    changed_by,
    source: str,
    reason: str | None = None,
    verification_context: dict | None = None,
) -> UsernameChangeResult:
    source_value = (source or "").strip().upper()
    if source_value not in {UsernameChangeSource.SELF, UsernameChangeSource.ADMIN}:
        raise UsernameChangeError("Invalid username change source.", code="invalid_source")

    _validate_target_allowed(target_user=target_user, changed_by=changed_by, source=source_value)
    if source_value == UsernameChangeSource.SELF:
        _validate_self_verification(changed_by=changed_by, verification_context=verification_context)
        _validate_self_rate_limit(target_user=target_user)
    elif not (reason or "").strip():
        raise UsernameChangeError(
            "Reason is required for admin username changes.",
            code="missing_reason",
        )

    normalized_new = _validate_new_username(
        new_username=new_username,
        target_user_id=target_user.id,
    )
    old_username = (target_user.username or "").strip()
    if old_username.lower() == normalized_new:
        return UsernameChangeResult(
            username=old_username,
            changed=False,
            requires_relogin=False,
        )

    target_user.username = normalized_new
    target_user.save(update_fields=["username"])

    actor_role = getattr(changed_by, "role", "") if changed_by else ""
    metadata = {
        "old_username": old_username,
        "new_username": normalized_new,
        "source": source_value,
    }
    if reason:
        metadata["reason"] = reason.strip()

    UsernameChangeAudit.objects.create(
        user=target_user,
        old_username=old_username,
        new_username=normalized_new,
        changed_by=changed_by,
        changed_by_role=(actor_role or "").upper(),
        source=source_value,
        reason=(reason or "").strip(),
        ip_address=(verification_context or {}).get("ip_address") or None,
        user_agent=((verification_context or {}).get("user_agent") or "")[:1000],
    )
    ReservedUsername.objects.get_or_create(
        username=old_username.lower(),
        defaults={
            "reserved_from_user": target_user,
            "reason": "Reserved after username change",
        },
    )

    AuditLog.objects.create(
        action_type=AuditLog.ActionType.USER_UPDATED,
        model_name="User",
        object_id=target_user.id,
        performed_by=changed_by,
        metadata=metadata,
    )
    _blacklist_all_outstanding_tokens(target_user)

    return UsernameChangeResult(
        username=normalized_new,
        changed=True,
        requires_relogin=True,
    )
