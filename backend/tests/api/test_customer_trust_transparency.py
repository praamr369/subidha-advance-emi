from __future__ import annotations

from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import Payment, PaymentMethod
from subscriptions.services.lucky_draw_service import create_lucky_draw_commit, reveal_and_execute_draw
from subscriptions.services.rent_lease_contract_service import create_rent_contract
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_payment_collection_finance_account,
    create_product,
    create_subscription,
)


class CustomerTrustTransparencyApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="trust_admin", phone="9328000001")
        self.finance_account = create_payment_collection_finance_account(
            code="TRUST-FIN-001",
            name="Trust Test Cash Desk",
        )

        self.customer_one = create_customer_profile(
            user=create_customer_user(
                username="trust_customer_one",
                phone="9328000002",
                email="trust-customer-one@example.com",
            ),
            name="Rahim Karim",
            phone="9328000002",
        )
        self.customer_two = create_customer_profile(
            user=create_customer_user(
                username="trust_customer_two",
                phone="9328000003",
                email="trust-customer-two@example.com",
            ),
            name="Other Customer",
            phone="9328000003",
        )

        product = create_product(name="Trust EMI Product", product_code="TRUST-EMI-001")
        batch = create_batch(batch_code="TRUST-BATCH-001", duration_months=3, total_slots=100, draw_day=5)
        lucky_one = create_lucky_id(batch=batch, lucky_number=9)
        lucky_two = create_lucky_id(batch=batch, lucky_number=12)

        self.sub_one = create_subscription(
            customer=self.customer_one,
            product=product,
            batch=batch,
            lucky_id=lucky_one,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
            start_date=date(2026, 1, 1),
        )
        self.sub_two = create_subscription(
            customer=self.customer_two,
            product=product,
            batch=batch,
            lucky_id=lucky_two,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
            start_date=date(2026, 1, 1),
        )
        self.emi_one = create_emi(
            subscription=self.sub_one,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 1, 10),
        )
        self.emi_two = create_emi(
            subscription=self.sub_two,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 1, 10),
        )
        self.payment_two = Payment.objects.create(
            customer=self.customer_two,
            subscription=self.sub_two,
            emi=self.emi_two,
            amount=Decimal("1000.00"),
            method=PaymentMethod.CASH,
            payment_date=date(2026, 1, 11),
            collected_by=self.admin,
            finance_account=self.finance_account,
            reference_no="TRUST-OTHER-PAY-001",
        )

        draw, seed = create_lucky_draw_commit(batch=batch)
        reveal_and_execute_draw(draw_id=draw.id, revealed_seed=seed, performed_by=self.admin)

        rent_product = create_product(
            name="Trust Rent Product",
            product_code="TRUST-RENT-001",
            base_price=Decimal("24000.00"),
        )
        rent_product.is_rent_enabled = True
        rent_product.save(update_fields=["is_rent_enabled"])
        self.rent_subscription = create_rent_contract(
            customer=self.customer_one,
            product=rent_product,
            tenure_months=6,
            start_date=date(2026, 1, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )

    def test_customer_cannot_view_other_customer_data(self):
        self.client.force_authenticate(user=self.customer_one.user)

        payment_detail = self.client.get(f"/api/v1/customer/payments/{self.payment_two.id}/")
        self.assertEqual(payment_detail.status_code, status.HTTP_404_NOT_FOUND)

        sub_detail = self.client.get(f"/api/v1/customer/subscriptions/{self.sub_two.id}/")
        self.assertEqual(sub_detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_winner_api_hides_sensitive_fields(self):
        response = self.client.get("/api/v1/public/winners/?limit=1")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertGreaterEqual(response.data["count"], 1)
        row = response.data["results"][0]

        self.assertIn("winner_name_masked", row)
        self.assertNotIn("customer_name", row)
        self.assertNotIn("winner_lucky_id", row)
        self.assertNotIn("winner_subscription_id", row)
        self.assertTrue("*" in (row.get("winner_name_masked") or ""))

    def test_receipts_load_for_customer_scope(self):
        self.client.force_authenticate(user=self.customer_one.user)
        response = self.client.get("/api/v1/customer/receipts/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("count", response.data)
        self.assertIn("results", response.data)

    def test_contract_download_works_for_owner(self):
        self.client.force_authenticate(user=self.customer_one.user)
        response = self.client.get(f"/api/v1/customer/rent-contracts/{self.rent_subscription.id}/pdf/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("application/pdf", response["Content-Type"])

    def test_public_page_data_smoke_endpoints(self):
        paths = [
            "/api/v1/public/stats/",
            "/api/v1/public/products/",
            "/api/v1/public/latest-winner/",
            "/api/v1/public/winners/",
            "/api/v1/public/winner-history/",
            "/api/v1/public/business-profile/",
        ]
        for path in paths:
            response = self.client.get(path)
            self.assertEqual(
                response.status_code,
                status.HTTP_200_OK,
                msg=f"{path} returned {response.status_code}",
            )
