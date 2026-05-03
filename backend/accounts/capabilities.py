from __future__ import annotations

import logging
from functools import wraps

from rest_framework.exceptions import PermissionDenied

from accounts.models import (
    Capability,
    RoleCapability,
    UserCapabilityOverride,
    UserRole,
)


ROLE_CAPABILITY_FALLBACKS: dict[str, set[str]] = {
    UserRole.ADMIN: {
        "billing.view",
        "billing.collect",
        "billing.override_allocation",
        "accounting.view",
        "accounting.reverse_entry",
        "batch.lock",
        "draw.commit",
        "draw.complete",
        "inventory.adjust",
        "inventory.opening_stock",
        "vendor.manage",
        "crm.manage",
        "reports.export",
        "business_setup.reset",
    },
    UserRole.CASHIER: {
        "billing.view",
        "billing.collect",
    },
    UserRole.PARTNER: {
        "billing.view",
        "crm.manage",
    },
    UserRole.CUSTOMER: set(),
}
security_logger = logging.getLogger("security.events")


def user_has_capability(user, capability_code: str) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True

    normalized_code = (capability_code or "").strip().lower()
    if not normalized_code:
        return False

    # Keep existing ADMIN role behavior non-breaking by default.
    role = getattr(user, "role", "")
    role_fallback = ROLE_CAPABILITY_FALLBACKS.get(role, set())
    allowed = normalized_code in role_fallback

    if Capability.objects.filter(code=normalized_code, is_active=True).exists():
        role_override = (
            RoleCapability.objects.select_related("capability")
            .filter(
                role=role,
                capability__code=normalized_code,
                capability__is_active=True,
            )
            .order_by("-updated_at", "-id")
            .first()
        )
        if role_override is not None:
            allowed = bool(role_override.is_allowed)

    user_override = (
        UserCapabilityOverride.objects.select_related("capability")
        .filter(
            user=user,
            capability__code=normalized_code,
            capability__is_active=True,
        )
        .order_by("-updated_at", "-id")
        .first()
    )
    if user_override is not None:
        return bool(user_override.is_allowed)
    return bool(allowed)


def require_capability(capability_code: str):
    normalized_code = (capability_code or "").strip().lower()

    def decorator(func):
        @wraps(func)
        def wrapper(view_self, request, *args, **kwargs):
            if not user_has_capability(request.user, normalized_code):
                security_logger.warning(
                    "security.permission_denied",
                    extra={
                        "capability_code": normalized_code,
                        "user_id": getattr(request.user, "id", None),
                        "path": getattr(request, "path", ""),
                        "method": getattr(request, "method", ""),
                    },
                )
                raise PermissionDenied(
                    detail=f"Capability '{normalized_code}' is required for this action."
                )
            return func(view_self, request, *args, **kwargs)

        return wrapper

    return decorator


class CapabilityRequiredMixin:
    required_capability_code: str | None = None

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        capability_code = (self.required_capability_code or "").strip().lower()
        if capability_code and not user_has_capability(request.user, capability_code):
            security_logger.warning(
                "security.permission_denied",
                extra={
                    "capability_code": capability_code,
                    "user_id": getattr(request.user, "id", None),
                    "path": getattr(request, "path", ""),
                    "method": getattr(request, "method", ""),
                },
            )
            raise PermissionDenied(
                detail=f"Capability '{capability_code}' is required for this action."
            )
