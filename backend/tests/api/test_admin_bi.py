from rest_framework import status
from rest_framework.test import APITestCase

from tests.helpers import create_admin_user, create_user


class AdminBiApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="bi_admin", phone="919100000111")
        self.partner_user = create_user(
            username="bi_partner",
            role="PARTNER",
            phone="919100000112",
            password="PartnerPass123!",
        )

    def test_admin_can_access_bi_summary_with_empty_db(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/bi/summary/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("as_of", response.data)
        self.assertIn("finance", response.data)
        self.assertIn("hr", response.data)

        finance = response.data["finance"]
        self.assertIn("collection_trend", finance)
        self.assertIn("overdue_aging", finance)
        self.assertIn("payment_method_split", finance)

    def test_non_admin_forbidden(self):
        self.client.force_authenticate(self.partner_user)
        response = self.client.get("/api/v1/admin/bi/summary/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

