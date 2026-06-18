"""P0 regression: one customer may hold multiple Lucky IDs in the same batch.

The customer-per-batch EMI restriction was removed. Uniqueness is still enforced
at the Lucky ID level:
* one EMI subscription per Lucky ID (``uq_subscription_per_lucky_id``)
* Lucky ID unique per batch (``uq_lucky_id_per_batch``)
"""
from __future__ import annotations

from datetime import date

from django.test import TestCase
from rest_framework import serializers
from rest_framework.test import APIClient

from api.v1.services.subscription_service import create_partner_emi_subscription
from api.v1.selectors.subscription_selector import (
    customer_emi_count_in_batch,
    customer_has_emi_in_batch,
)
from subscriptions.models import PlanType, Subscription
from subscriptions.services.subscription_service import create_emi_subscription
from tests.helpers import (
    create_batch,
    create_admin_user,
    create_customer_profile,
    create_lucky_id,
    create_partner_user,
    create_product,
)


class CustomerMultipleLuckyIdsSameBatchTests(TestCase):
    def setUp(self):
        super().setUp()
        self.partner = create_partner_user(phone="7710000009")
        self.customer = create_customer_profile(
            name="Multi Lucky Cust", phone="7710000001"
        )
        self.product = create_product(product_code="MULTI-EMI-1")
        self.batch = create_batch(batch_code="MULTI2026", duration_months=15)
        self.lucky_a = create_lucky_id(batch=self.batch, lucky_number=11)
        self.lucky_b = create_lucky_id(batch=self.batch, lucky_number=12)

    def test_partner_api_allows_same_customer_two_lucky_ids_same_batch(self):
        sub1 = create_partner_emi_subscription(
            partner=self.partner,
            customer_id=self.customer.id,
            product_id=self.product.id,
            batch_id=self.batch.id,
            lucky_id=self.lucky_a.id,
            tenure_months=15,
            start_date=date(2026, 3, 1),
        )
        sub2 = create_partner_emi_subscription(
            partner=self.partner,
            customer_id=self.customer.id,
            product_id=self.product.id,
            batch_id=self.batch.id,
            lucky_id=self.lucky_b.id,
            tenure_months=15,
            start_date=date(2026, 3, 1),
        )

        self.assertNotEqual(sub1.id, sub2.id)
        self.assertEqual(sub1.customer_id, sub2.customer_id)
        self.assertEqual(sub1.batch_id, sub2.batch_id)
        self.assertEqual(
            customer_emi_count_in_batch(customer=self.customer, batch=self.batch), 2
        )
        self.assertTrue(
            customer_has_emi_in_batch(customer=self.customer, batch=self.batch)
        )

    def test_canonical_service_allows_same_customer_two_lucky_ids_same_batch(self):
        create_emi_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_number=self.lucky_a.lucky_number,
            tenure_months=15,
            partner=self.partner,
        )
        create_emi_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_number=self.lucky_b.lucky_number,
            tenure_months=15,
            partner=self.partner,
        )
        self.assertEqual(
            Subscription.objects.filter(
                customer=self.customer, batch=self.batch, plan_type=PlanType.EMI
            ).count(),
            2,
        )

    def test_lucky_id_still_unique_per_emi_subscription(self):
        create_partner_emi_subscription(
            partner=self.partner,
            customer_id=self.customer.id,
            product_id=self.product.id,
            batch_id=self.batch.id,
            lucky_id=self.lucky_a.id,
            tenure_months=15,
            start_date=date(2026, 3, 1),
        )
        # The same Lucky ID cannot be reused for a second EMI subscription.
        with self.assertRaises(serializers.ValidationError):
            create_partner_emi_subscription(
                partner=self.partner,
                customer_id=self.customer.id,
                product_id=self.product.id,
                batch_id=self.batch.id,
                lucky_id=self.lucky_a.id,
                tenure_months=15,
                start_date=date(2026, 3, 1),
            )

    def test_admin_list_and_detail_payload_keep_multiple_subscriptions_visible(self):
        first = create_partner_emi_subscription(
            partner=self.partner,
            customer_id=self.customer.id,
            product_id=self.product.id,
            batch_id=self.batch.id,
            lucky_id=self.lucky_a.id,
            tenure_months=15,
            start_date=date(2026, 3, 1),
        )
        second = create_partner_emi_subscription(
            partner=self.partner,
            customer_id=self.customer.id,
            product_id=self.product.id,
            batch_id=self.batch.id,
            lucky_id=self.lucky_b.id,
            tenure_months=15,
            start_date=date(2026, 3, 1),
        )
        admin = create_admin_user(
            username="multi_lucky_admin",
            phone="9710000001",
        )
        client = APIClient()
        client.force_authenticate(user=admin)

        list_response = client.get(
            "/api/v1/admin/subscriptions/",
            {"customer_id": self.customer.id, "plan_type": PlanType.EMI},
        )
        self.assertEqual(list_response.status_code, 200)
        rows = list_response.data["results"]
        self.assertEqual({row["id"] for row in rows}, {first.id, second.id})
        for row in rows:
            self.assertEqual(row["customer"], self.customer.id)
            self.assertEqual(row["batch"], self.batch.id)
            self.assertIsNotNone(row["lucky_id"])
            self.assertIsNotNone(row["lucky_number"])

        detail_response = client.get(
            f"/api/v1/admin/subscriptions/{first.id}/"
        )
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.data["customer"], self.customer.id)
        self.assertEqual(detail_response.data["batch"], self.batch.id)
        self.assertEqual(detail_response.data["lucky_id"], self.lucky_a.id)
