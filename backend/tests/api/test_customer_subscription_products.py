from base64 import b64decode
from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from tests.helpers import (
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_lucky_id,
    create_product,
    create_subscription,
)


PNG_1X1 = b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9p2Vd7wAAAAASUVORK5CYII="
)


class CustomerSubscriptionProductMediaTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.media_dir = TemporaryDirectory()
        self.media_override = override_settings(MEDIA_ROOT=self.media_dir.name)
        self.media_override.enable()
        self.addCleanup(self.media_override.disable)
        self.addCleanup(self.media_dir.cleanup)

        self.customer_user = create_customer_user(
            username="product_customer",
            phone="9410000001",
            email="product-customer@example.com",
        )
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Product Customer",
            phone="9410000001",
        )
        self.product = create_product(
            name="Media Ready Product",
            product_code="MEDIA-PRODUCT-001",
        )
        self.product.image = SimpleUploadedFile(
            "media-ready-product.png",
            PNG_1X1,
            content_type="image/png",
        )
        self.product.save(update_fields=["image"])
        self.batch = create_batch(batch_code="MEDIA-BATCH-001")
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=11)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
        )

        self.client.force_authenticate(user=self.customer_user)

    def test_customer_subscription_list_exposes_product_image_and_code(self):
        response = self.client.get("/api/v1/customer/subscriptions/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["count"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["product_name"], "Media Ready Product")
        self.assertEqual(row["product_code"], "MEDIA-PRODUCT-001")
        self.assertTrue(
            row["product_image"].startswith(
                "http://testserver/media/products/media-product-001/"
            ),
            row["product_image"],
        )

    def test_customer_dashboard_exposes_product_image_and_code(self):
        response = self.client.get("/api/v1/customer/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["summary"]["subscription_count"], 1)
        row = response.data["subscriptions"][0]
        self.assertEqual(row["product_name"], "Media Ready Product")
        self.assertEqual(row["product_code"], "MEDIA-PRODUCT-001")
        self.assertTrue(
            row["product_image"].startswith(
                "http://testserver/media/products/media-product-001/"
            ),
            row["product_image"],
        )

    def test_customer_subscription_detail_exposes_product_image_and_context(self):
        response = self.client.get(
            f"/api/v1/customer/subscriptions/{self.subscription.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["product_name"], "Media Ready Product")
        self.assertEqual(response.data["product_code"], "MEDIA-PRODUCT-001")
        self.assertEqual(response.data["batch_code"], "MEDIA-BATCH-001")
        self.assertEqual(response.data["lucky_number"], 11)
        self.assertTrue(
            response.data["product_image"].startswith(
                "http://testserver/media/products/media-product-001/"
            ),
            response.data["product_image"],
        )

    def test_rent_subscription_detail_exposes_security_deposit_and_demands(self):
        from datetime import date
        from decimal import Decimal
        from contracts.models import RentSubscriptionProfile, Subscription
        from subscriptions.enums import PlanType, SubscriptionStatus
        from subscriptions.models import RentLeaseBillingDemand

        rent_sub = Subscription.objects.create(
            subscription_number="RENT-2026-TEST",
            customer=self.customer,
            product=self.product,
            plan_type=PlanType.RENT,
            status=SubscriptionStatus.ACTIVE,
            start_date=date.today(),
            monthly_amount=Decimal("1500.00"),
            total_amount=Decimal("18000.00"),
            tenure_months=12,
        )
        RentSubscriptionProfile.objects.create(
            subscription=rent_sub,
            security_deposit_percent=Decimal("20.00"),
            security_deposit_amount=Decimal("5000.00"),
            refundable_security_deposit=Decimal("5000.00"),
        )
        RentLeaseBillingDemand.objects.create(
            subscription=rent_sub,
            demand_type="RENT_MONTHLY",
            due_date=date.today(),
            billing_period_start=date.today(),
            billing_period_end=date.today(),
            amount=Decimal("1500.00"),
            collected_amount=Decimal("0.00"),
            status="PENDING",
            reference_key=f"DEMAND-{rent_sub.id}-1",
        )

        response = self.client.get(f"/api/v1/customer/subscriptions/{rent_sub.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["security_deposit_amount"], "5000.00")
        self.assertEqual(response.data["security_deposit_percent"], "20.00")
        self.assertEqual(response.data["refundable_security_deposit"], "5000.00")
        self.assertEqual(response.data["deposit_status"], "PENDING")
        self.assertEqual(len(response.data["rent_lease_demands"]), 1)
        self.assertEqual(len(response.data["emis"]), 1)
        self.assertEqual(response.data["emis"][0]["amount"], "1500.00")

        # Test deposits endpoint
        deposits_resp = self.client.get("/api/v1/subscriptions/deposits/")
        self.assertEqual(deposits_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(deposits_resp.data["count"] >= 1)
        dep_row = next((r for r in deposits_resp.data["results"] if r.get("subscription_id") == rent_sub.id), None)
        self.assertIsNotNone(dep_row)
        self.assertEqual(dep_row["deposit_amount"], 5000.0)
        self.assertEqual(dep_row["status"], "PENDING")
