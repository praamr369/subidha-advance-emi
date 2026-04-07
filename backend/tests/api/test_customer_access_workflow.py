import re

from django.core import mail
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import (
    PasswordResetChannel,
    PasswordResetRequest,
    PasswordResetStatus,
)
from subscriptions.models import AuditLog
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_customer_user,
    create_partner_user,
)


def extract_otp_from_email_body(body: str) -> str:
    match = re.search(r"code is (\d{6})", body or "")
    if not match:
        raise AssertionError(f"Unable to extract OTP from email body: {body!r}")
    return match.group(1)


@override_settings(
    DEBUG=False,
    OTP_DELIVERY_BACKEND="email",
    OTP_ALLOW_EMAIL_FALLBACK=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="SUBIDHA CORE <no-reply@example.com>",
    PASSWORD_RESET_RESEND_COOLDOWN_SECONDS=0,
)
class CustomerAccessWorkflowApiTests(APITestCase):
    def setUp(self):
        mail.outbox = []
        self.admin = create_admin_user(
            username="phase1_admin",
            phone="9400000001",
            email="phase1-admin@example.com",
        )
        self.customer_user = create_customer_user(
            username="phase1_customer",
            phone="9400000002",
            email="phase1-customer@example.com",
        )
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Phase One Customer",
            phone="9400000002",
        )
        self.customer.address = "Old Address"
        self.customer.city = "Dhaka"
        self.customer.save(update_fields=["address", "city"])

    def test_customer_profile_get_returns_editable_fields_and_summary(self):
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.get("/api/v1/customer/profile/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["name"], "Phase One Customer")
        self.assertEqual(response.data["phone"], "9400000002")
        self.assertEqual(response.data["email"], "phase1-customer@example.com")
        self.assertEqual(response.data["address"], "Old Address")
        self.assertEqual(response.data["city"], "Dhaka")
        self.assertEqual(response.data["username"], "phase1_customer")
        self.assertEqual(response.data["summary"]["total_subscriptions"], 0)

    def test_customer_profile_patch_updates_customer_user_and_audits(self):
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.patch(
            "/api/v1/customer/profile/",
            {
                "name": "Updated Customer",
                "phone": "9400000012",
                "email": "updated-customer@example.com",
                "address": "New Address",
                "city": "Chattogram",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.customer.refresh_from_db()
        self.customer_user.refresh_from_db()
        self.assertEqual(self.customer.name, "Updated Customer")
        self.assertEqual(self.customer.phone, "9400000012")
        self.assertEqual(self.customer.address, "New Address")
        self.assertEqual(self.customer.city, "Chattogram")
        self.assertEqual(self.customer_user.phone, "9400000012")
        self.assertEqual(self.customer_user.email, "updated-customer@example.com")
        self.assertEqual(self.customer_user.first_name, "Updated Customer")

        audit = AuditLog.objects.filter(
            action_type=AuditLog.ActionType.USER_UPDATED,
            model_name="Customer",
            object_id=self.customer.id,
        ).latest("id")
        self.assertEqual(audit.performed_by_id, self.customer_user.id)
        self.assertEqual(audit.metadata.get("origin"), "CUSTOMER_SELF_SERVICE")

    def test_customer_profile_patch_requires_email_for_existing_no_email_account(self):
        no_email_user = create_customer_user(
            username="phase1_customer_no_email",
            phone="9400000003",
            email="",
        )
        create_customer_profile(
            user=no_email_user,
            name="Customer Missing Email",
            phone="9400000003",
        )
        self.client.force_authenticate(user=no_email_user)

        response = self.client.patch(
            "/api/v1/customer/profile/",
            {
                "name": "Customer Missing Email",
                "phone": "9400000003",
                "address": "Same Address",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_admin_customer_create_requires_email(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/v1/admin/customers/",
            {
                "name": "Admin Created Customer",
                "phone": "9400000004",
                "username": "admin_created_customer",
                "password": "SecurePass123!",
                "email": "",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_admin_customer_create_syncs_identity_and_audits(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/v1/admin/customers/",
            {
                "name": "Admin Created Customer",
                "phone": "9400000005",
                "username": "admin_created_customer",
                "password": "SecurePass123!",
                "email": "admin-created@example.com",
                "address": "Created Address",
                "city": "Khulna",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["email"], "admin-created@example.com")
        self.assertEqual(response.data["user_username"], "admin_created_customer")

        created_customer = self.customer.__class__.objects.get(id=response.data["id"])
        created_user = created_customer.user
        self.assertEqual(created_customer.address, "Created Address")
        self.assertEqual(created_customer.city, "Khulna")
        self.assertEqual(created_user.email, "admin-created@example.com")
        self.assertEqual(created_user.phone, "9400000005")
        self.assertEqual(created_user.first_name, "Admin Created Customer")

        audit = AuditLog.objects.filter(
            action_type=AuditLog.ActionType.USER_CREATED,
            model_name="Customer",
            object_id=created_customer.id,
        ).latest("id")
        self.assertEqual(audit.performed_by_id, self.admin.id)
        self.assertEqual(audit.metadata.get("origin"), "ADMIN_CUSTOMER_WORKFLOW")

    def test_admin_customer_update_syncs_identity_and_audits(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.put(
            f"/api/v1/admin/customers/{self.customer.id}/",
            {
                "name": "Admin Updated Customer",
                "phone": "9400000099",
                "email": "admin-updated@example.com",
                "address": "Admin Updated Address",
                "city": "Rajshahi",
                "kyc_status": "VERIFIED",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.customer.refresh_from_db()
        self.customer_user.refresh_from_db()
        self.assertEqual(self.customer.name, "Admin Updated Customer")
        self.assertEqual(self.customer.phone, "9400000099")
        self.assertEqual(self.customer.address, "Admin Updated Address")
        self.assertEqual(self.customer.city, "Rajshahi")
        self.assertEqual(self.customer.kyc_status, "VERIFIED")
        self.assertEqual(self.customer_user.email, "admin-updated@example.com")
        self.assertEqual(self.customer_user.phone, "9400000099")

        audit = AuditLog.objects.filter(
            action_type=AuditLog.ActionType.USER_UPDATED,
            model_name="Customer",
            object_id=self.customer.id,
        ).latest("id")
        self.assertEqual(audit.performed_by_id, self.admin.id)
        self.assertEqual(audit.metadata.get("origin"), "ADMIN_CUSTOMER_WORKFLOW")

    def test_admin_customer_toggle_status_accepts_explicit_state_and_audits(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            f"/api/v1/admin/customers/{self.customer.id}/toggle-user-status/",
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.customer_user.refresh_from_db()
        self.assertFalse(self.customer_user.is_active)

        audit = AuditLog.objects.filter(
            action_type=AuditLog.ActionType.USER_DEACTIVATED,
            model_name="User",
            object_id=self.customer_user.id,
        ).latest("id")
        self.assertEqual(audit.metadata.get("origin"), "ADMIN_CUSTOMER_WORKFLOW")
        self.assertEqual(audit.metadata.get("customer_id"), self.customer.id)

    def test_admin_customer_change_password_audits_without_exposing_plaintext(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            f"/api/v1/admin/customers/{self.customer.id}/change-user-password/",
            {"password": "Phase1Reset123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.customer_user.refresh_from_db()
        self.assertTrue(self.customer_user.check_password("Phase1Reset123!"))
        self.assertNotIn("Phase1Reset123!", str(response.data))

        audit = AuditLog.objects.filter(
            action_type=AuditLog.ActionType.USER_PASSWORD_RESET,
            model_name="User",
            object_id=self.customer_user.id,
        ).latest("id")
        self.assertEqual(audit.metadata.get("origin"), "ADMIN_CUSTOMER_WORKFLOW")
        self.assertEqual(audit.metadata.get("customer_id"), self.customer.id)

    def test_forgot_password_uses_email_delivery_for_customer_phone_lookup(self):
        response = self.client.post(
            "/api/v1/auth/forgot-password/",
            {"identifier": self.customer.phone},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["phase1-customer@example.com"])

        reset_request = PasswordResetRequest.objects.latest("id")
        self.assertEqual(reset_request.user_id, self.customer_user.id)
        self.assertEqual(reset_request.channel, PasswordResetChannel.EMAIL_OTP)
        self.assertEqual(
            reset_request.identifier_snapshot,
            "phase1-customer@example.com",
        )
        self.assertEqual(reset_request.status, PasswordResetStatus.PENDING)

    def test_forgot_password_requires_email_for_existing_customer_without_email(self):
        no_email_user = create_customer_user(
            username="reset_customer_without_email",
            phone="9400000010",
            email="",
        )
        create_customer_profile(
            user=no_email_user,
            name="Reset Ineligible Customer",
            phone="9400000010",
        )

        response = self.client.post(
            "/api/v1/auth/forgot-password/",
            {"identifier": "9400000010"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Email is required before password reset", response.data["detail"])
        self.assertEqual(PasswordResetRequest.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_resend_reset_otp_uses_email_for_partner_username_lookup(self):
        partner = create_partner_user(
            username="reset_partner_email",
            phone="9400000011",
            email="partner-reset@example.com",
        )

        forgot = self.client.post(
            "/api/v1/auth/forgot-password/",
            {"identifier": partner.username},
            format="json",
        )
        self.assertEqual(forgot.status_code, status.HTTP_200_OK, forgot.data)
        self.assertEqual(len(mail.outbox), 1)

        response = self.client.post(
            "/api/v1/auth/resend-reset-otp/",
            {"identifier": partner.username},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(mail.outbox), 2)
        reset_request = PasswordResetRequest.objects.get(user=partner)
        self.assertEqual(reset_request.channel, PasswordResetChannel.EMAIL_OTP)
        self.assertEqual(reset_request.resend_count, 1)
        self.assertEqual(reset_request.identifier_snapshot, "partner-reset@example.com")

    def test_resend_reset_otp_requires_email_for_partner_without_email(self):
        partner = create_partner_user(
            username="reset_partner_without_email",
            phone="9400000013",
            email="",
        )

        response = self.client.post(
            "/api/v1/auth/resend-reset-otp/",
            {"identifier": partner.username},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Email is required before password reset", response.data["detail"])

    def test_reset_password_completes_using_email_delivered_otp(self):
        forgot = self.client.post(
            "/api/v1/auth/forgot-password/",
            {"identifier": self.customer_user.username},
            format="json",
        )
        self.assertEqual(forgot.status_code, status.HTTP_200_OK, forgot.data)
        otp = extract_otp_from_email_body(mail.outbox[-1].body)

        response = self.client.post(
            "/api/v1/auth/reset-password/",
            {
                "identifier": self.customer.phone,
                "otp": otp,
                "new_password": "NewResetPass123!",
                "confirm_password": "NewResetPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.customer_user.refresh_from_db()
        self.assertTrue(self.customer_user.check_password("NewResetPass123!"))

        reset_request = PasswordResetRequest.objects.get(user=self.customer_user)
        self.assertEqual(reset_request.status, PasswordResetStatus.USED)

        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.PASSWORD_RESET_COMPLETED,
                model_name="PasswordResetRequest",
                object_id=reset_request.id,
            ).exists()
        )
