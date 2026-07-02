from django.core.mail import EmailMessage, get_connection
from django.utils import timezone

from subscriptions.models_email_smtp_settings import EmailSMTPSettings


def get_or_create_email_smtp_settings() -> EmailSMTPSettings:
    settings_obj = EmailSMTPSettings.objects.filter(is_active=True).first()
    if settings_obj:
        return settings_obj
    return EmailSMTPSettings.objects.create()


def get_active_email_smtp_settings() -> EmailSMTPSettings | None:
    """
    Used by the dynamic SMTP email backend. Must never raise -- callers fall
    back to the static/env-configured backend if this returns None.
    """
    try:
        return EmailSMTPSettings.objects.filter(is_active=True, is_enabled=True).first()
    except Exception:
        return None


def send_test_email(*, settings_obj: EmailSMTPSettings, recipient: str) -> None:
    """
    Sends a real test email using the settings currently on the instance
    (which may not yet be saved as enabled), so an admin can verify
    credentials before flipping is_enabled on.
    """
    connection = get_connection(
        backend="django.core.mail.backends.smtp.EmailBackend",
        host=settings_obj.smtp_host,
        port=settings_obj.smtp_port,
        username=settings_obj.smtp_username,
        password=settings_obj.get_app_password(),
        use_tls=settings_obj.use_tls,
        use_ssl=settings_obj.use_ssl,
        fail_silently=False,
    )
    message = EmailMessage(
        subject="Subidha Furniture -- SMTP test email",
        body=(
            "This is a test email from your Subidha Furniture admin panel.\n\n"
            "If you received this, your SMTP settings are working correctly and "
            "can be used for customer/user OTP delivery."
        ),
        from_email=settings_obj.effective_from_email,
        to=[recipient],
        connection=connection,
    )
    message.send()


def record_test_result(*, settings_obj: EmailSMTPSettings, success: bool, message: str) -> None:
    settings_obj.last_test_at = timezone.now()
    settings_obj.last_test_success = success
    settings_obj.last_test_message = message[:500]
    settings_obj.save(update_fields=["last_test_at", "last_test_success", "last_test_message", "updated_at"])
