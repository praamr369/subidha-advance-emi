from rest_framework import status
from rest_framework.test import APITestCase

from tests.helpers import create_admin_user, create_customer_profile, create_customer_user, create_partner_user


class AdminAccountLinkApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="account_link_admin", phone="9386444001")
        self.client.force_authenticate(user=self.admin)
        self.customer_user = create_customer_user(username="acct_customer_1", phone="9386444002")
        self.customer = create_customer_profile(user=self.customer_user, name="Account Link Customer", phone="9386444002")
        self.other_user = create_customer_user(username="acct_customer_2", phone="9386444003")
        self.partner_user = create_partner_user(username="acct_partner_1", phone="9386444004")

    def test_customer_account_link_can_change_with_reason(self):
        response = self.client.patch(
            f"/api/v1/admin/customers/{self.customer.id}/account-link/",
            {"user_id": self.other_user.id, "reason": "Support handoff to new login account"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["linked_user"]["id"], self.other_user.id)

    def test_duplicate_active_user_mapping_is_blocked(self):
        other_customer = create_customer_profile(name="Other Customer", phone="9386444011")
        response = self.client.patch(
            f"/api/v1/admin/customers/{other_customer.id}/account-link/",
            {"user_id": self.customer_user.id, "reason": "Invalid duplicate link"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_partner_account_link_requires_partner_user(self):
        response = self.client.patch(
            f"/api/v1/admin/partners/{self.partner_user.id}/account-link/",
            {"user_id": self.other_user.id, "reason": "Invalid partner remap"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
