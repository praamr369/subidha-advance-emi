from __future__ import annotations

from django.conf import settings

from accounts.services.password_reset_service import ALLOWED_PUBLIC_RESET_ROLES


def _normalize_text(value: object) -> str:
    return str(value or "").strip()


def _email_status(*, email_backend: str, from_email: str) -> tuple[str, str]:
    if not from_email:
        return (
            "INCOMPLETE",
            "DEFAULT_FROM_EMAIL is not configured for customer-facing password reset delivery.",
        )

    if not email_backend:
        return (
            "INCOMPLETE",
            "EMAIL_BACKEND is not configured, so email OTP delivery cannot be verified.",
        )

    if email_backend == "django.core.mail.backends.console.EmailBackend":
        return (
            "DEV_ONLY",
            "Email OTPs are routed to the console backend. This is suitable only for local or test environments.",
        )

    return (
        "READY",
        "Email OTP delivery is configured, but ops should still run a live reset test before promising access.",
    )


def get_otp_delivery_readiness() -> dict[str, object]:
    delivery_backend = _normalize_text(
        getattr(settings, "OTP_DELIVERY_BACKEND", "auto")
    ).lower()
    allow_email_fallback = bool(
        getattr(settings, "OTP_ALLOW_EMAIL_FALLBACK", True)
    )
    email_backend = _normalize_text(getattr(settings, "EMAIL_BACKEND", ""))
    from_email = _normalize_text(getattr(settings, "DEFAULT_FROM_EMAIL", ""))
    debug_enabled = bool(getattr(settings, "DEBUG", False))

    email_status, email_detail = _email_status(
        email_backend=email_backend,
        from_email=from_email,
    )

    if delivery_backend == "console":
        overall_status = "DEV_ONLY"
        summary = (
            "Console OTP delivery is suitable only for development or smoke environments."
        )
    elif email_status == "READY":
        overall_status = "READY"
        summary = (
            "Customer and partner public password reset now depends on email delivery only."
        )
    elif email_status == "DEV_ONLY":
        overall_status = "DEV_ONLY"
        summary = (
            "Public password reset can only use console email delivery in this environment."
        )
    else:
        overall_status = "NOT_READY"
        summary = (
            "No live email delivery channel is currently ready. Do not promise self-service reset until email delivery is configured and tested."
        )

    return {
        "overall_status": overall_status,
        "summary": summary,
        "delivery_backend": delivery_backend.upper(),
        "public_reset_roles": sorted(ALLOWED_PUBLIC_RESET_ROLES),
        "public_reset_identifiers": ["phone", "email", "username"],
        "sms": {
            "status": "NOT_SUPPORTED",
            "detail": "SMS delivery is not used for public customer or partner password reset in the current codebase.",
        },
        "email": {
            "status": email_status,
            "fallback_enabled": allow_email_fallback,
            "backend": email_backend or "UNSET",
            "from_email_configured": bool(from_email),
            "detail": email_detail,
        },
        "console": {
            "status": "DEV_ONLY" if debug_enabled else "DISABLED",
            "detail": (
                "Console OTP logging is available while DEBUG is enabled."
                if debug_enabled
                else "Console OTP logging is disabled outside debug environments."
            ),
        },
        "admin_visibility": {
            "status": "API_ONLY",
            "detail": (
                "Admin password reset request list/detail/resend/invalidate APIs exist, "
                "but there is still no dedicated admin page for that workflow."
            ),
            "list_endpoint": "/api/v1/admin/password-reset-requests/",
        },
    }
