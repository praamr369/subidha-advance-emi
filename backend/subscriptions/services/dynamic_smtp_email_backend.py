from django.conf import settings as django_settings
from django.core.mail import get_connection
from django.core.mail.backends.base import BaseEmailBackend


class DynamicSMTPEmailBackend(BaseEmailBackend):
    """
    Routes outbound email through the admin-configured EmailSMTPSettings row
    when one exists and is enabled; otherwise falls back to the static
    EMAIL_BACKEND_FALLBACK configured from environment variables (console
    backend in local dev). This lets an admin turn on real Gmail SMTP from
    the settings UI without a process restart, and never breaks existing
    behavior when no SMTP settings have been configured yet.
    """

    def send_messages(self, email_messages):
        from subscriptions.services.email_smtp_settings_service import get_active_email_smtp_settings

        settings_obj = get_active_email_smtp_settings()
        if settings_obj is not None:
            connection = get_connection(
                backend="django.core.mail.backends.smtp.EmailBackend",
                host=settings_obj.smtp_host,
                port=settings_obj.smtp_port,
                username=settings_obj.smtp_username,
                password=settings_obj.get_app_password(),
                use_tls=settings_obj.use_tls,
                use_ssl=settings_obj.use_ssl,
                fail_silently=self.fail_silently,
            )
            for message in email_messages:
                if not message.from_email:
                    message.from_email = settings_obj.effective_from_email
            return connection.send_messages(email_messages)

        fallback_backend = getattr(
            django_settings,
            "EMAIL_BACKEND_FALLBACK",
            "django.core.mail.backends.console.EmailBackend",
        )
        connection = get_connection(backend=fallback_backend, fail_silently=self.fail_silently)
        return connection.send_messages(email_messages)
