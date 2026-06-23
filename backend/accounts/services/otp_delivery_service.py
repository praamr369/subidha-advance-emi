import logging

from django.conf import settings
from django.core.mail import send_mail


logger = logging.getLogger(__name__)


class OTPDeliveryError(Exception):
    pass


def _mask_phone(phone: str) -> str:
    phone = (phone or "").strip()
    if len(phone) <= 4:
        return phone
    return f"{'*' * (len(phone) - 4)}{phone[-4:]}"


def _mask_email(email: str) -> str:
    email = (email or "").strip()
    if not email or "@" not in email:
        return email

    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked_local = local[0] + "*" if local else ""
    else:
        masked_local = local[0] + ("*" * (len(local) - 2)) + local[-1]

    return f"{masked_local}@{domain}"


def send_password_reset_otp_via_console(*, user, otp: str) -> str:
    logger.warning(
        "[DEBUG OTP] user_id=%s phone=%s email=%s otp=%s",
        user.id,
        _mask_phone(user.phone or ""),
        _mask_email(user.email or ""),
        otp,
    )
    return "CONSOLE"


def send_password_reset_otp_via_sms(*, user, otp: str) -> str:
    """
    Placeholder for future paid SMS integration.
    Raise OTPDeliveryError if sending cannot proceed.
    """
    phone = (user.phone or "").strip()
    if not phone:
        raise OTPDeliveryError("User does not have a valid phone number.")

    # Future integration point:
    # send_sms(phone=phone, message=f"Your SUBIDHA CORE password reset code is {otp}")

    raise OTPDeliveryError("SMS backend is not configured.")


def send_password_reset_otp_via_email(*, user, otp: str) -> str:
    email = (user.email or "").strip()
    if not email:
        raise OTPDeliveryError("User does not have a valid email address.")

    subject = "SUBIDHA CORE password reset code"
    message = (
        f"Your SUBIDHA CORE password reset code is {otp}.\n\n"
        "This code expires in 10 minutes.\n"
        "Do not share this code with anyone."
    )

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", None)
    if not from_email:
        raise OTPDeliveryError("DEFAULT_FROM_EMAIL is not configured.")

    send_mail(
        subject=subject,
        message=message,
        from_email=from_email,
        recipient_list=[email],
        fail_silently=False,
    )

    logger.info(
        "Password reset OTP sent via email user_id=%s email=%s",
        user.id,
        _mask_email(email),
    )
    return "EMAIL_OTP"


def send_password_reset_otp(*, user, otp: str, email_only: bool = False) -> str:
    """
    Delivery priority:
    1. SMS when explicitly enabled and available
    2. Email fallback when enabled and available
    3. Console in DEBUG/local dev

    OTP_EMAIL_ENABLED=true is a shortcut that forces delivery_backend to "email",
    overriding OTP_DELIVERY_BACKEND. Set this to enable email OTP without changing
    OTP_DELIVERY_BACKEND.
    """
    otp_email_enabled = getattr(settings, "OTP_EMAIL_ENABLED", False)
    if isinstance(otp_email_enabled, str):
        otp_email_enabled = otp_email_enabled.strip().lower() in {"1", "true", "yes", "on"}

    raw_backend = getattr(settings, "OTP_DELIVERY_BACKEND", "auto").strip().lower()
    delivery_backend = "email" if otp_email_enabled else raw_backend
    allow_email_fallback = getattr(settings, "OTP_ALLOW_EMAIL_FALLBACK", True)

    if email_only:
        if delivery_backend == "email":
            return send_password_reset_otp_via_email(user=user, otp=otp)

        if delivery_backend == "auto" and allow_email_fallback:
            return send_password_reset_otp_via_email(user=user, otp=otp)

        raise OTPDeliveryError("Email OTP delivery is not configured for public password reset.")

    # Local/dev mode: console is acceptable and free
    if getattr(settings, "DEBUG", False) and delivery_backend == "console":
        return send_password_reset_otp_via_console(user=user, otp=otp)

    # Auto mode tries SMS first, then email, then console in DEBUG
    if delivery_backend == "auto":
        if (user.phone or "").strip():
            try:
                return send_password_reset_otp_via_sms(user=user, otp=otp)
            except OTPDeliveryError:
                pass

        if allow_email_fallback and (user.email or "").strip():
            try:
                return send_password_reset_otp_via_email(user=user, otp=otp)
            except OTPDeliveryError:
                pass

        if getattr(settings, "DEBUG", False):
            return send_password_reset_otp_via_console(user=user, otp=otp)

        raise OTPDeliveryError("No OTP delivery channel is available.")

    if delivery_backend == "sms":
        return send_password_reset_otp_via_sms(user=user, otp=otp)

    if delivery_backend == "email":
        return send_password_reset_otp_via_email(user=user, otp=otp)

    if delivery_backend == "sms_email":
        if (user.phone or "").strip():
            try:
                return send_password_reset_otp_via_sms(user=user, otp=otp)
            except OTPDeliveryError:
                pass
        if allow_email_fallback and (user.email or "").strip():
            return send_password_reset_otp_via_email(user=user, otp=otp)
        raise OTPDeliveryError("No OTP delivery channel is available for sms_email backend.")

    if delivery_backend == "console":
        return send_password_reset_otp_via_console(user=user, otp=otp)

    raise OTPDeliveryError(f"Unsupported OTP delivery backend: {delivery_backend}")
