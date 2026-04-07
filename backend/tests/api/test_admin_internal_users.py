from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from subscriptions.models import AuditLog
from tests.helpers import create_admin_user, create_partner_user


class AdminInternalUserCommissionTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_users", phone="9200000001")
        self.client.force_authenticate(user=self.admin)

    def test_create_partner_with_commission_rate(self):
        payload = {
            "username": "partner_user_1",
            "password": "PartnerPass123!",
            "phone": "9200000002",
            "email": "partner1@example.com",
            "role": "PARTNER",
            "commission_rate": "6.50",
            "is_active": True,
        }

        response = self.client.post(
            "/api/v1/admin/internal-users/create/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["role"], "PARTNER")
        self.assertEqual(response.data.get("commission_rate"), "6.50")

        user = User.objects.get(id=response.data["id"])
        self.assertEqual(user.commission_rate, Decimal("6.50"))

        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.PARTNER_COMMISSION_SET,
                object_id=user.id,
            ).exists(),
            msg="Partner commission set audit log should be recorded.",
        )

    def test_update_partner_commission_rate_is_audited(self):
        partner = create_partner_user(
            username="partner_user_2",
            phone="9200000003",
            email="partner2@example.com",
        )
        partner.commission_rate = Decimal("4.00")
        partner.save(update_fields=["commission_rate"])

        response = self.client.patch(
            f"/api/v1/admin/internal-users/{partner.id}/",
            {"commission_rate": "8.25"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        partner.refresh_from_db()
        self.assertEqual(partner.commission_rate, Decimal("8.25"))

        audit = (
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.PARTNER_COMMISSION_UPDATED,
                object_id=partner.id,
            )
            .order_by("-created_at", "-id")
            .first()
        )
        self.assertIsNotNone(audit)
        self.assertEqual(audit.metadata.get("old_commission_rate"), "4.00")
        self.assertEqual(audit.metadata.get("new_commission_rate"), "8.25")

    def test_admin_commission_rate_is_normalized(self):
        payload = {
            "username": "admin_user_1",
            "password": "AdminPass123!",
            "phone": "9200000004",
            "email": "admin1@example.com",
            "role": "ADMIN",
            "commission_rate": "9.00",
            "is_active": True,
        }

        response = self.client.post(
            "/api/v1/admin/internal-users/create/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["role"], "ADMIN")
        self.assertEqual(response.data.get("commission_rate"), "0.00")

        user = User.objects.get(id=response.data["id"])
        self.assertEqual(user.commission_rate, Decimal("0.00"))

    def test_create_partner_requires_email(self):
        payload = {
            "username": "partner_missing_email",
            "password": "PartnerPass123!",
            "phone": "9200000005",
            "role": "PARTNER",
            "commission_rate": "6.50",
            "is_active": True,
        }

        response = self.client.post(
            "/api/v1/admin/internal-users/create/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_update_partner_requires_email_when_current_record_has_none(self):
        partner = create_partner_user(
            username="partner_missing_email_existing",
            phone="9200000006",
            email="",
        )

        response = self.client.patch(
            f"/api/v1/admin/internal-users/{partner.id}/",
            {
                "role": "PARTNER",
                "commission_rate": "8.25",
                "email": "",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)
