"""
Tests for OTP email delivery flows.

Covers:
- send_password_reset_otp_via_email success
- send_password_reset_otp_via_email failure: missing email
- send_password_reset_otp_via_email failure: missing DEFAULT_FROM_EMAIL
- OTP_EMAIL_ENABLED=true forces email backend
- OTP expiry detection via PasswordResetRequest.is_expired
- max attempts triggers LOCKED status
- resend cooldown via last_sent_at
"""
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import PasswordResetRequest, PasswordResetChannel, PasswordResetStatus
from accounts.services.otp_delivery_service import (
    OTPDeliveryError,
    send_password_reset_otp_via_email,
    send_password_reset_otp,
)
from tests.helpers import create_admin_user, create_customer_user


class OTPEmailDeliveryServiceTests(TestCase):
    def setUp(self):
        self.user_with_email = create_admin_user(
            username="otp_email_admin",
            phone="9400000001",
            email="admin@example.com",
        )
        self.user_no_email = create_admin_user(
            username="otp_noemail_admin",
            phone="9400000002",
            email="",
        )

    @override_settings(
        DEFAULT_FROM_EMAIL="SUBIDHA CORE <no-reply@example.com>",
    )
    def test_email_otp_sent_successfully(self):
        with patch("accounts.services.otp_delivery_service.send_mail") as mock_send:
            result = send_password_reset_otp_via_email(
                user=self.user_with_email, otp="123456"
            )
        self.assertEqual(result, "EMAIL_OTP")
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args
        self.assertIn("123456", call_kwargs.args[1] if call_kwargs.args else call_kwargs.kwargs.get("message", ""))

    @override_settings(DEFAULT_FROM_EMAIL="SUBIDHA CORE <no-reply@example.com>")
    def test_email_otp_raises_when_no_email(self):
        with self.assertRaises(OTPDeliveryError) as ctx:
            send_password_reset_otp_via_email(user=self.user_no_email, otp="123456")
        self.assertIn("email", str(ctx.exception).lower())

    def test_email_otp_raises_when_no_from_email(self):
        with override_settings(DEFAULT_FROM_EMAIL=""):
            with self.assertRaises(OTPDeliveryError) as ctx:
                send_password_reset_otp_via_email(user=self.user_with_email, otp="123456")
        self.assertIn("DEFAULT_FROM_EMAIL", str(ctx.exception))

    @override_settings(
        OTP_EMAIL_ENABLED=True,
        DEFAULT_FROM_EMAIL="SUBIDHA CORE <no-reply@example.com>",
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    )
    def test_otp_email_enabled_flag_forces_email_backend(self):
        with patch("accounts.services.otp_delivery_service.send_mail") as mock_send:
            result = send_password_reset_otp(user=self.user_with_email, otp="654321")
        self.assertEqual(result, "EMAIL_OTP")
        mock_send.assert_called_once()

    @override_settings(
        OTP_EMAIL_ENABLED=False,
        OTP_DELIVERY_BACKEND="console",
        DEBUG=True,
    )
    def test_otp_email_enabled_false_does_not_force_email(self):
        # Should use console mode when OTP_EMAIL_ENABLED is False
        result = send_password_reset_otp(user=self.user_with_email, otp="000000")
        self.assertEqual(result, "CONSOLE")

    @override_settings(
        OTP_EMAIL_ENABLED="true",
        DEFAULT_FROM_EMAIL="SUBIDHA CORE <no-reply@example.com>",
    )
    def test_otp_email_enabled_accepts_string_true(self):
        with patch("accounts.services.otp_delivery_service.send_mail") as mock_send:
            result = send_password_reset_otp(user=self.user_with_email, otp="999888")
        self.assertEqual(result, "EMAIL_OTP")
        mock_send.assert_called_once()

    @override_settings(
        OTP_DELIVERY_BACKEND="auto",
        OTP_ALLOW_EMAIL_FALLBACK=True,
        DEFAULT_FROM_EMAIL="SUBIDHA CORE <no-reply@example.com>",
    )
    def test_auto_mode_falls_back_to_email_when_sms_not_configured(self):
        # SMS always fails (not configured); email fallback should succeed
        with patch("accounts.services.otp_delivery_service.send_mail") as mock_send:
            result = send_password_reset_otp(user=self.user_with_email, otp="111222")
        self.assertEqual(result, "EMAIL_OTP")
        mock_send.assert_called_once()

    @override_settings(
        OTP_DELIVERY_BACKEND="sms",
    )
    def test_sms_backend_raises_otp_delivery_error(self):
        with self.assertRaises(OTPDeliveryError):
            send_password_reset_otp(user=self.user_with_email, otp="333444")


class PasswordResetRequestLifecycleTests(TestCase):
    """Test PasswordResetRequest model lifecycle: expiry, max attempts, locking."""

    def setUp(self):
        self.user = create_customer_user(
            username="otp_customer",
            phone="9400000003",
            email="customer@example.com",
        )

    def _make_request(self, *, minutes_until_expiry=10, status=PasswordResetStatus.PENDING):
        return PasswordResetRequest.objects.create(
            user=self.user,
            role_snapshot=self.user.role,
            channel=PasswordResetChannel.EMAIL_OTP,
            identifier_snapshot=self.user.email,
            otp_hash="hashed-value",
            expires_at=timezone.now() + timedelta(minutes=minutes_until_expiry),
            status=status,
            max_attempts=5,
        )

    def test_not_expired_when_within_window(self):
        req = self._make_request(minutes_until_expiry=10)
        self.assertFalse(req.is_expired)
        self.assertTrue(req.is_usable())

    def test_expired_when_past_expiry(self):
        req = self._make_request(minutes_until_expiry=-1)
        self.assertTrue(req.is_expired)
        self.assertFalse(req.is_usable())

    def test_max_attempts_triggers_locked_status(self):
        req = self._make_request()
        for _ in range(req.max_attempts):
            req.increment_failed_attempt(save=True)
        req.refresh_from_db()
        self.assertEqual(req.status, PasswordResetStatus.LOCKED)
        self.assertFalse(req.is_usable())

    def test_single_failed_attempt_does_not_lock(self):
        req = self._make_request()
        req.increment_failed_attempt(save=True)
        req.refresh_from_db()
        self.assertEqual(req.status, PasswordResetStatus.PENDING)
        self.assertEqual(req.failed_attempt_count, 1)

    def test_mark_verified_sets_status_and_timestamp(self):
        req = self._make_request()
        req.mark_verified(save=True)
        req.refresh_from_db()
        self.assertEqual(req.status, PasswordResetStatus.VERIFIED)
        self.assertIsNotNone(req.verified_at)

    def test_mark_used_sets_status_and_timestamp(self):
        req = self._make_request()
        req.mark_used(save=True)
        req.refresh_from_db()
        self.assertEqual(req.status, PasswordResetStatus.USED)
        self.assertIsNotNone(req.used_at)

    def test_used_request_is_not_usable(self):
        req = self._make_request(status=PasswordResetStatus.USED)
        self.assertFalse(req.is_usable())

    def test_cancelled_request_is_not_usable(self):
        req = self._make_request()
        req.mark_cancelled(save=True)
        self.assertFalse(req.is_usable())

    def test_resend_count_tracked(self):
        req = self._make_request()
        req.resend_count += 1
        req.last_sent_at = timezone.now()
        req.save(update_fields=["resend_count", "last_sent_at", "updated_at"])
        req.refresh_from_db()
        self.assertEqual(req.resend_count, 1)
        self.assertIsNotNone(req.last_sent_at)
