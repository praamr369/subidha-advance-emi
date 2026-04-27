from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import Payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
    create_user,
)


class AdminCrmWorkspaceApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="crm_workspace_admin", phone="919200000001")
        self.partner = create_user(
            username="crm_workspace_partner",
            role="PARTNER",
            phone="919200000002",
            password="PartnerPass123!",
        )
        self.client.force_authenticate(self.admin)

    def _seed_customer_data(self):
        customer = create_customer_profile(name="CRM Workspace Customer", phone="919200000010")
        product = create_product(name="CRM Sofa", product_code="CRM-SOFA")
        batch = create_batch(batch_code="CRMWS001")
        lucky = create_lucky_id(batch=batch, lucky_number=19)
        subscription = create_subscription(customer=customer, product=product, batch=batch, lucky_id=lucky)
        Payment.objects.create(
            customer=customer,
            subscription=subscription,
            amount="1000.00",
            method="CASH",
            payment_date="2026-04-10",
        )
        return customer

    def test_admin_crm_workspace_returns_customer_360_without_duplicate_truth(self):
        customer = self._seed_customer_data()
        response = self.client.get("/api/v1/admin/crm/workspace/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("crm_pipeline", response.data)
        self.assertIn("customer_360", response.data)
        profile = next((row for row in response.data["customer_360"] if row["customer_id"] == customer.id), None)
        self.assertIsNotNone(profile)
        self.assertEqual(profile["payment_count"], Payment.objects.filter(customer=customer).count())
        self.assertEqual(profile["subscription_count"], customer.subscriptions.count())

    def test_non_admin_blocked_from_admin_crm_workspace(self):
        self.client.force_authenticate(self.partner)
        response = self.client.get("/api/v1/admin/crm/workspace/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
