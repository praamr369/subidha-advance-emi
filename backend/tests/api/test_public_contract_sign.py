import base64
from decimal import Decimal
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from contracts.models import SubscriptionDocument
from subscriptions.enums import SubscriptionDocumentType
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
    ensure_test_accounting_posting_prerequisites,
)


class PublicContractSignApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_contract_sign_test",
            phone="9303009999",
        )
        ensure_test_accounting_posting_prerequisites(performed_by=self.admin)
        self.customer = create_customer_profile(
            name="John Doe",
            phone="9876543210",
        )
        self.product = create_product(
            name="King Size Bed",
            product_code="BED-KING-01",
            base_price=Decimal("15000.00"),
        )
        self.batch = create_batch(
            batch_code="BED-BATCH-2026",
            duration_months=12,
            total_slots=100,
        )
        self.lucky_id = create_lucky_id(
            batch=self.batch,
            lucky_number=1,
        )
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            tenure_months=12,
            monthly_amount=Decimal("1250.00"),
            total_amount=Decimal("15000.00"),
        )

    def test_admin_signing_link_action(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f"/api/v1/admin/subscriptions/{self.subscription.id}/signing-link/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertIn("token", response.data)
        self.assertIn("/sign-contract/", response.data["signing_path"])
        self.assertEqual(response.data["customer_name"], "John Doe")
        self.assertEqual(response.data["has_signature"], False)

    def test_public_sign_get_summary(self):
        # Admin gets token
        self.client.force_authenticate(user=self.admin)
        link_resp = self.client.get(f"/api/v1/admin/subscriptions/{self.subscription.id}/signing-link/")
        token = link_resp.data["token"]

        # Public user (unauthenticated) views contract summary
        self.client.logout()
        resp = self.client.get(f"/api/v1/public/contracts/sign/{token}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["customer_name"], "John Doe")
        self.assertEqual(resp.data["already_signed"], False)
        self.assertIn("monthly_amount", resp.data)

    def test_public_sign_post_base64_signature(self):
        self.client.force_authenticate(user=self.admin)
        link_resp = self.client.get(f"/api/v1/admin/subscriptions/{self.subscription.id}/signing-link/")
        token = link_resp.data["token"]

        self.client.logout()
        # 1x1 transparent png in base64
        tiny_png = (
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        )
        post_resp = self.client.post(
            f"/api/v1/public/contracts/sign/{token}/",
            data={
                "signature_data": tiny_png,
                "customer_name_confirmation": "John Doe",
            },
            format="json",
        )
        self.assertEqual(post_resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(post_resp.data["success"])
        self.assertIn("signed_at", post_resp.data)

        # Check SubscriptionDocument was created
        doc = SubscriptionDocument.objects.filter(
            subscription=self.subscription,
            document_type=SubscriptionDocumentType.CUSTOMER_SIGNATURE,
        ).first()
        self.assertIsNotNone(doc)
        self.assertIn("John Doe", doc.notes)

        # Check public GET now shows already_signed=True
        get_resp = self.client.get(f"/api/v1/public/contracts/sign/{token}/")
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(get_resp.data["already_signed"], True)

    def test_customer_receives_notifications_on_signing_request_and_completion(self):
        from system_jobs.models import Notification

        self.client.force_authenticate(user=self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            link_resp = self.client.get(f"/api/v1/admin/subscriptions/{self.subscription.id}/signing-link/")
            self.assertEqual(link_resp.status_code, status.HTTP_200_OK)

        # Signing request notification should be emitted for the registered customer
        request_notif = Notification.objects.filter(
            recipient=self.customer.user,
            payload__category="CONTRACT_SIGNING_REQUEST",
        ).first()
        self.assertIsNotNone(request_notif)
        self.assertIn("Contract Signature Required", request_notif.title)
        self.assertIn("King Size Bed", request_notif.body)

        token = link_resp.data["token"]
        self.client.logout()

        tiny_png = (
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        )
        with self.captureOnCommitCallbacks(execute=True):
            post_resp = self.client.post(
                f"/api/v1/public/contracts/sign/{token}/",
                data={
                    "signature_data": tiny_png,
                    "customer_name_confirmation": "John Doe",
                },
                format="json",
            )
            self.assertEqual(post_resp.status_code, status.HTTP_201_CREATED)

        # Contract signed notification should be emitted for the registered customer
        signed_notif = Notification.objects.filter(
            recipient=self.customer.user,
            payload__category="CONTRACT_SIGNED",
        ).first()
        self.assertIsNotNone(signed_notif)
        self.assertIn("Contract Digitally Signed", signed_notif.title)

    def test_pod_notifications_on_handover_ready_and_completion(self):
        from system_jobs.models import Notification
        from tests.helpers import create_delivery
        from django.core.files.uploadedfile import SimpleUploadedFile

        deliv = create_delivery(
            subscription=self.subscription,
            delivery_reference="DLV-NOTIF-01",
        )

        self.client.force_authenticate(user=self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            resp = self.client.get(f"/api/v1/admin/delivery/{deliv.id}/handover-link/")
            self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # Customer receives POD handover ready notification
        pod_ready_notif = Notification.objects.filter(
            recipient=self.customer.user,
            payload__category="POD_HANDOVER_READY",
        ).first()
        self.assertIsNotNone(pod_ready_notif)
        self.assertIn("Delivery Out for Handover", pod_ready_notif.title)
        self.assertIn("King Size Bed", pod_ready_notif.body)

        token = resp.data["handover_token"]
        self.client.logout()

        tiny_img = SimpleUploadedFile("photo1.jpg", b"fake_jpg_data", content_type="image/jpeg")
        tiny_sig = SimpleUploadedFile("sig.png", b"fake_png_data", content_type="image/png")

        with self.captureOnCommitCallbacks(execute=True):
            post_resp = self.client.post(
                f"/api/v1/public/delivery/handover/{token}/",
                data={
                    "customer_signature_name": "John Doe",
                    "driver_name": "Ramesh Driver",
                    "photo_1": tiny_img,
                    "signature_image": tiny_sig,
                    "notes": "Delivered in great shape",
                },
                format="multipart",
            )
            self.assertEqual(post_resp.status_code, status.HTTP_201_CREATED)

        # Customer receives POD completed notification
        pod_completed_notif = Notification.objects.filter(
            recipient=self.customer.user,
            payload__category="POD_COMPLETED",
        ).first()
        self.assertIsNotNone(pod_completed_notif)
        self.assertIn("Furniture Handover Confirmed (POD)", pod_completed_notif.title)

    def test_tampered_token_rejected(self):
        self.client.logout()
        resp = self.client.get("/api/v1/public/contracts/sign/tampered-token-12345/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("support_phone", resp.data)

    def test_percent_encoded_token_resolution(self):
        import urllib.parse
        from business_setup.models.core import PublicBusinessProfile

        # Configure custom official support phone in backend
        PublicBusinessProfile.objects.all().delete()
        PublicBusinessProfile.objects.create(
            display_name="Subidha Furniture Test Branch",
            support_phone="+91 94764 90946",
            is_active=True,
        )

        self.client.force_authenticate(user=self.admin)
        link_resp = self.client.get(f"/api/v1/admin/subscriptions/{self.subscription.id}/signing-link/")
        self.assertEqual(link_resp.status_code, status.HTTP_200_OK)
        token = link_resp.data["token"]
        self.assertEqual(link_resp.data["support_phone"], "+91 94764 90946")

        self.client.logout()
        # Test raw token
        raw_resp = self.client.get(f"/api/v1/public/contracts/sign/{token}/")
        self.assertEqual(raw_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(raw_resp.data["support_phone"], "+91 94764 90946")

        # Test percent-encoded token (%3A for colons) as sent by some browsers/clients
        encoded_token = urllib.parse.quote(token)
        encoded_resp = self.client.get(f"/api/v1/public/contracts/sign/{encoded_token}/")
        self.assertEqual(encoded_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(encoded_resp.data["customer_name"], "John Doe")
        self.assertEqual(encoded_resp.data["support_phone"], "+91 94764 90946")

    def test_public_sign_multi_product_and_security_deposit(self):
        from datetime import date
        from contracts.models import ContractItem, RentSubscriptionProfile, Subscription
        from subscriptions.enums import PlanType, SubscriptionStatus
        from payments.models import RentLeaseDepositTransaction
        from subscriptions.enums import RentLeaseDepositTransactionStatus, RentLeaseDepositTransactionType

        self.product.is_rent_enabled = True
        self.product.save(update_fields=["is_rent_enabled"])

        product2 = create_product(
            name="Wooden Wardrobe 3-Door",
            product_code="WARDROBE-001",
            base_price=Decimal("20000.00"),
        )
        product2.is_rent_enabled = True
        product2.save(update_fields=["is_rent_enabled"])

        rent_sub = Subscription.objects.create(
            subscription_number="RENT-2026-MULTI",
            customer=self.customer,
            product=self.product,
            plan_type=PlanType.RENT,
            status=SubscriptionStatus.ACTIVE,
            start_date=date.today(),
            monthly_amount=Decimal("2500.00"),
            total_amount=Decimal("30000.00"),
            tenure_months=12,
        )
        RentSubscriptionProfile.objects.create(
            subscription=rent_sub,
            security_deposit_percent=Decimal("20.00"),
            security_deposit_amount=Decimal("7000.00"),
            refundable_security_deposit=Decimal("7000.00"),
        )
        ContractItem.objects.create(
            subscription=rent_sub,
            product=self.product,
            quantity=1,
            unit_base_price=Decimal("15000.00"),
            total_base_price=Decimal("15000.00"),
            monthly_yield_percent=Decimal("5.00"),
            monthly_amount=Decimal("1000.00"),
            security_deposit_percent=Decimal("20.00"),
            security_deposit_amount=Decimal("3000.00"),
        )
        ContractItem.objects.create(
            subscription=rent_sub,
            product=product2,
            quantity=1,
            unit_base_price=Decimal("20000.00"),
            total_base_price=Decimal("20000.00"),
            monthly_yield_percent=Decimal("5.00"),
            monthly_amount=Decimal("1500.00"),
            security_deposit_percent=Decimal("20.00"),
            security_deposit_amount=Decimal("4000.00"),
        )
        # Record a deposit collection transaction of ₹7,000
        RentLeaseDepositTransaction.objects.create(
            subscription=rent_sub,
            customer=self.customer,
            plan_type=PlanType.RENT,
            transaction_type=RentLeaseDepositTransactionType.COLLECTED,
            status=RentLeaseDepositTransactionStatus.ACTIVE,
            amount=Decimal("7000.00"),
        )

        # Admin gets signing link
        self.client.force_authenticate(user=self.admin)
        link_resp = self.client.get(f"/api/v1/admin/subscriptions/{rent_sub.id}/signing-link/")
        self.assertEqual(link_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(link_resp.data["items"]), 2)
        self.assertEqual(link_resp.data["security_deposit_amount"], "7000.00")
        self.assertEqual(link_resp.data["security_deposit_paid"], "7000.00")
        self.assertEqual(link_resp.data["security_deposit_pending"], "0.00")
        self.assertEqual(link_resp.data["deposit_status"], "PAID")
        self.assertIn("King Size Bed", link_resp.data["product_name"])
        self.assertIn("1 more", link_resp.data["product_name"])

        # Public signing page
        self.client.logout()
        token = link_resp.data["token"]
        resp = self.client.get(f"/api/v1/public/contracts/sign/{token}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["items"]), 2)
        self.assertEqual(resp.data["items"][0]["name"], "King Size Bed")
        self.assertEqual(resp.data["items"][0]["security_deposit_amount"], "3000.00")
        self.assertEqual(resp.data["items"][1]["name"], "Wooden Wardrobe 3-Door")
        self.assertEqual(resp.data["items"][1]["security_deposit_amount"], "4000.00")
        self.assertEqual(resp.data["security_deposit_amount"], "7000.00")
        self.assertEqual(resp.data["security_deposit_paid"], "7000.00")
        self.assertEqual(resp.data["security_deposit_pending"], "0.00")
        self.assertEqual(resp.data["refundable_security_deposit"], "7000.00")
        self.assertEqual(resp.data["deposit_status"], "PAID")
