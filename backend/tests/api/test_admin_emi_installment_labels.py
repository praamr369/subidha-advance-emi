from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import Emi
from subscriptions.services.emi_label_service import installment_label, ordinal
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class EmiInstallmentLabelServiceTests(APITestCase):
    def test_ordinal_handles_common_and_teen_cases(self):
        self.assertEqual(ordinal(1), "1st")
        self.assertEqual(ordinal(2), "2nd")
        self.assertEqual(ordinal(3), "3rd")
        self.assertEqual(ordinal(4), "4th")
        self.assertEqual(ordinal(11), "11th")
        self.assertEqual(ordinal(12), "12th")
        self.assertEqual(ordinal(13), "13th")
        self.assertEqual(ordinal(15), "15th")

    def test_installment_label_format(self):
        self.assertEqual(installment_label(1, 15), "1st EMI of 15")
        self.assertEqual(installment_label(15, 15), "15th EMI of 15")
        self.assertEqual(installment_label(2, None), "2nd EMI")


class AdminEmiInstallmentApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="emi_label_admin", phone="9400000001")
        self.client.force_authenticate(user=self.admin)
        self.batch = create_batch(batch_code="LABELBATCH", duration_months=15)
        self.product = create_product(
            name="Label Product",
            product_code="EMI-LABEL-001",
            base_price=Decimal("15000.00"),
        )
        self.customer = create_customer_profile(name="Label Cust", phone="9400000002")
        self.lucky_a = create_lucky_id(batch=self.batch, lucky_number=1)
        self.lucky_b = create_lucky_id(batch=self.batch, lucky_number=2)

    def _make_subscription_with_emis(self, *, customer, lucky_id):
        subscription = create_subscription(
            customer=customer,
            product=self.product,
            batch=self.batch,
            lucky_id=lucky_id,
            tenure_months=15,
        )
        for month in range(1, 16):
            create_emi(
                subscription=subscription,
                month_no=month,
                amount=Decimal("190.00"),
                due_date=date(2026, 6, 14),
            )
        return subscription

    def test_emi_payload_exposes_subscription_local_installment_no(self):
        # First subscription consumes EMI db ids 1..15.
        self._make_subscription_with_emis(customer=self.customer, lucky_id=self.lucky_a)
        # Second subscription's EMIs get db ids 16..30 but month_no 1..15.
        subscription_b = self._make_subscription_with_emis(
            customer=self.customer, lucky_id=self.lucky_b
        )

        resp = self.client.get(
            f"/api/v1/admin/emis/?subscription={subscription_b.id}&ordering=due_date"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        results = resp.data["results"] if isinstance(resp.data, dict) else resp.data
        self.assertEqual(len(results), 15)

        # The real database ids are well above 15 (proves we are not deriving
        # the installment number from the global db id).
        min_db_id = min(row["id"] for row in results)
        self.assertGreaterEqual(min_db_id, 16)

        by_installment = {row["installment_no"]: row for row in results}
        self.assertEqual(sorted(by_installment.keys()), list(range(1, 16)))
        first = by_installment[1]
        self.assertEqual(first["total_installments"], 15)
        self.assertEqual(first["installment_label"], "1st EMI of 15")
        self.assertEqual(by_installment[15]["installment_label"], "15th EMI of 15")
        # Real emi_id is still present for payment posting.
        self.assertTrue(Emi.objects.filter(pk=first["id"]).exists())
        self.assertEqual(first["outstanding_amount"], "190.00")
