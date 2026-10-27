from datetime import date
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import AuditLog, DeliveryStatus, FulfillmentStatus, ProofOfDelivery, SubscriptionDelivery
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_delivery,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class AdminDeliveryApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_delivery_api",
            phone="9321000001",
        )
        self.cashier = create_cashier_user(
            username="cashier_delivery_api",
            phone="9321000002",
        )
        self.partner = create_partner_user(
            username="partner_delivery_api",
            phone="9321000003",
        )
        self.partner.commission_rate = Decimal("5.00")
        self.partner.save(update_fields=["commission_rate"])
        self.customer = create_customer_profile(
            name="Delivery Admin Customer",
            phone="7321000001",
        )
        self.product = create_product(
            name="Delivery Admin Product",
            product_code="DLV-API-001",
            base_price=Decimal("2500.00"),
        )
        self.batch = create_batch(
            batch_code="DLVAPI2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=11)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            partner=self.partner,
            total_amount=Decimal("2500.00"),
            monthly_amount=Decimal("833.33"),
            tenure_months=3,
        )

    def test_admin_can_create_and_list_deliveries(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/v1/admin/deliveries/",
            {
                "subscription": self.subscription.id,
                "status": "SCHEDULED",
                "scheduled_date": "2026-03-18",
                "receiver_name": "Receiver A",
                "receiver_phone": "7321000001",
                "delivery_address_snapshot": "Dhaka Warehouse Road",
                "notes": "Pack carefully",
                "admin_override": True,
                "admin_override_reason": "Test override — no EMIs in test fixture",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["status"], DeliveryStatus.SCHEDULED)
        self.assertEqual(response.data["subscription_id"], self.subscription.id)

        list_response = self.client.get("/api/v1/admin/deliveries/")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data["count"], 1)
        self.assertEqual(list_response.data["summary"]["scheduled"], 1)

        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.fulfillment_status, FulfillmentStatus.PENDING)

    def test_admin_can_transition_delivery_and_subscription_detail_exposes_summary(self):
        self.client.force_authenticate(user=self.admin)
        delivery = create_delivery(
            subscription=self.subscription,
            status=DeliveryStatus.SCHEDULED,
            delivery_reference="DLV-DETAIL-001",
            scheduled_date=date(2026, 3, 20),
            created_by=self.admin,
            updated_by=self.admin,
        )

        dispatch_response = self.client.post(
            f"/api/v1/admin/deliveries/{delivery.id}/transition/",
            {"status": "DISPATCHED"},
            format="json",
        )
        self.assertEqual(dispatch_response.status_code, status.HTTP_200_OK, dispatch_response.data)

        out_response = self.client.post(
            f"/api/v1/admin/deliveries/{delivery.id}/transition/",
            {"status": "OUT_FOR_DELIVERY"},
            format="json",
        )
        self.assertEqual(out_response.status_code, status.HTTP_200_OK, out_response.data)

        delivered_response = self.client.post(
            f"/api/v1/admin/deliveries/{delivery.id}/mark-delivered/",
            {
                "receiver_name": "Receiver A",
                "receiver_phone": "7321000001",
                "notes": "Delivered to customer",
            },
            format="json",
        )
        self.assertEqual(delivered_response.status_code, status.HTTP_200_OK, delivered_response.data)
        self.assertEqual(delivered_response.data["status"], DeliveryStatus.DELIVERED)

        detail_response = self.client.get(f"/api/v1/admin/subscriptions/{self.subscription.id}/")
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.data["delivery_summary"]["status"], DeliveryStatus.DELIVERED)
        self.assertEqual(detail_response.data["delivery_summary"]["delivery_reference"], "DLV-DETAIL-001")
        self.assertEqual(len(detail_response.data["deliveries"]), 1)

        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.fulfillment_status, FulfillmentStatus.DELIVERED)
        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.DELIVERY_COMPLETED,
                model_name="SubscriptionDelivery",
                object_id=delivery.id,
            ).exists()
        )

    def test_admin_delivery_endpoints_block_non_admin_roles(self):
        self.client.force_authenticate(user=self.cashier)
        response = self.client.get("/api/v1/admin/deliveries/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(user=self.partner)
        response = self.client.get("/api/v1/admin/deliveries/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_delivery_summary_filters_by_subscription_and_bucket(self):
        self.client.force_authenticate(user=self.admin)
        create_delivery(
            subscription=self.subscription,
            status=DeliveryStatus.DELIVERED,
            delivery_reference="DLV-SUM-001",
            created_by=self.admin,
            updated_by=self.admin,
        )

        other_lucky_id = create_lucky_id(batch=self.batch, lucky_number=12)
        other_subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=other_lucky_id,
            partner=self.partner,
            total_amount=Decimal("2500.00"),
            monthly_amount=Decimal("833.33"),
            tenure_months=3,
        )
        create_delivery(
            subscription=other_subscription,
            status=DeliveryStatus.PENDING,
            delivery_reference="DLV-SUM-002",
            created_by=self.admin,
            updated_by=self.admin,
        )

        response = self.client.get(
            f"/api/v1/admin/deliveries/?subscription={self.subscription.id}&bucket=DELIVERED"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["summary"]["delivered"], 1)
        self.assertEqual(response.data["results"][0]["delivery_reference"], "DLV-SUM-001")

    def test_handover_link_and_public_pod_capture_workflow(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from subscriptions.models import Delivery, DeliveryOrderStatus, ProofOfDelivery

        delivery = create_delivery(
            subscription=self.subscription,
            status=DeliveryStatus.OUT_FOR_DELIVERY,
            delivery_reference="DLV-HND-001",
            created_by=self.admin,
            updated_by=self.admin,
        )

        # 1. Admin generates handover link
        self.client.force_authenticate(user=self.admin)
        link_resp = self.client.get(f"/api/v1/admin/delivery/{delivery.id}/handover-link/")
        self.assertEqual(link_resp.status_code, status.HTTP_200_OK)
        token = link_resp.data["handover_token"]
        self.assertTrue(token)
        self.assertIn("/delivery-handover/", link_resp.data["handover_url"])

        # 2. Public / Driver unauthenticated GET to inspect order
        self.client.logout()
        info_resp = self.client.get(f"/api/v1/public/delivery/handover/{token}/")
        self.assertEqual(info_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(info_resp.data["customer_name"], self.customer.name)
        self.assertFalse(info_resp.data["is_completed"])

        # 3. Public / Driver unauthenticated POST with photos + touch signature
        tiny_png = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc`\x00\x00\x00\x02"
            b"\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        photo1 = SimpleUploadedFile("product_photo.png", tiny_png, content_type="image/png")
        sig = SimpleUploadedFile("signature.png", tiny_png, content_type="image/png")

        post_data = {
            "driver_name": "Ramesh Delivery Agent",
            "driver_phone": "9876500000",
            "customer_signature_name": "Delivery Admin Customer",
            "gps_latitude": "23.6840",
            "gps_longitude": "86.9840",
            "notes": "Delivered in perfect condition at 2nd floor",
            "photo_1": photo1,
            "signature_image": sig,
        }
        submit_resp = self.client.post(
            f"/api/v1/public/delivery/handover/{token}/",
            data=post_data,
            format="multipart",
        )
        self.assertEqual(submit_resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(submit_resp.data["success"])

        # 4. Verify SubscriptionDelivery is now DELIVERED
        delivery.refresh_from_db()
        self.assertEqual(delivery.status, DeliveryStatus.DELIVERED)

        # 5. Verify Delivery model and ProofOfDelivery record exist
        pod_count = ProofOfDelivery.objects.filter(customer_signature_name="Delivery Admin Customer").count()
        self.assertEqual(pod_count, 1)

        # 6. Re-submitting on already delivered token is rejected safely
        dup_resp = self.client.post(
            f"/api/v1/public/delivery/handover/{token}/",
            data=post_data,
            format="multipart",
        )
        self.assertEqual(dup_resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_public_handover_base64_signature_high_precision_gps_and_extra_photos(self):
        import urllib.parse
        from django.utils import timezone
        from contracts.models import SubscriptionDocument
        from subscriptions.enums import SubscriptionDocumentType

        # Create a second delivery order
        delivery2 = SubscriptionDelivery.objects.create(
            subscription=self.subscription,
            status=DeliveryStatus.DISPATCHED,
            dispatched_at=timezone.now(),
            delivery_address_snapshot="Plot 42, Asansol Market Road",
            scheduled_date=date(2026, 3, 10),
            delivery_reference="DLV-TEST-POD-02",
        )

        self.client.force_authenticate(user=self.admin)
        link_resp = self.client.get(f"/api/v1/admin/delivery/{delivery2.id}/handover-link/")
        self.assertEqual(link_resp.status_code, status.HTTP_200_OK)
        token = link_resp.data["handover_token"]

        self.client.logout()

        tiny_png = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc`\x00\x00\x00\x02"
            b"\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        photo1 = SimpleUploadedFile("product_front.png", tiny_png, content_type="image/png")
        extra_photo = SimpleUploadedFile("product_assembly.png", tiny_png, content_type="image/png")

        # Base64 data URI touchscreen signature (from canvas on mobile screen)
        b64_sig = (
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        )

        # High precision 14-decimal GPS from mobile browser geolocation
        post_data = {
            "driver_name": "Suresh Delivery Agent",
            "driver_phone": "9876543210",
            "customer_signature_name": "Sunita Customer",
            "gps_latitude": "23.68713028374615",
            "gps_longitude": "86.98401928374615",
            "notes": "Assembled cleanly with extra photo",
            "photo_1": photo1,
            "signature_data": b64_sig,
            "furniture_photos": [extra_photo],
        }

        # Also test percent-encoded token as received from messaging apps
        encoded_token = urllib.parse.quote(token)
        submit_resp = self.client.post(
            f"/api/v1/public/delivery/handover/{encoded_token}/",
            data=post_data,
            format="multipart",
        )
        self.assertEqual(submit_resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(submit_resp.data["success"])

        # Check POD record saved with correctly quantized 7-decimal GPS
        pod = ProofOfDelivery.objects.filter(customer_signature_name="Sunita Customer").first()
        self.assertIsNotNone(pod)
        self.assertEqual(pod.gps_latitude, Decimal("23.6871303"))
        self.assertEqual(pod.gps_longitude, Decimal("86.9840193"))
        self.assertTrue(bool(pod.signature_image))

        # Check additional furniture photo saved as auditable SubscriptionDocument
        extra_doc = SubscriptionDocument.objects.filter(
            subscription=self.subscription,
            document_type=SubscriptionDocumentType.DELIVERY_HANDOVER_NOTE,
        ).first()
        self.assertIsNotNone(extra_doc)
        self.assertIn("Doorstep POD furniture quality photo", extra_doc.notes)

    def test_batched_partial_delivery_flow(self):
        from contracts.models import ContractItem, Subscription
        from products_core.models import Product
        from subscriptions.enums import PlanType

        rent_sub = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            partner=self.partner,
            batch=None,
            lucky_id=None,
            plan_type=PlanType.RENT,
            start_date=date(2026, 3, 1),
            tenure_months=6,
            total_amount=Decimal("7000.00"),
            monthly_amount=Decimal("700.00"),
        )

        self.product.is_rent_enabled = True
        self.product.save(update_fields=["is_rent_enabled"])

        prod_b = Product.objects.create(
            name="Delivery Admin Product B",
            product_code="DLV-API-002",
            base_price=Decimal("1500.00"),
            is_rent_enabled=True,
        )
        # Create ContractItems on the subscription: Product A (qty 2), Product B (qty 1)
        c_item_a = ContractItem.objects.create(
            subscription=rent_sub,
            product=self.product,
            quantity=2,
            unit_base_price=Decimal("2500.00"),
            total_base_price=Decimal("5000.00"),
            monthly_amount=Decimal("400.00"),
            security_deposit_percent=Decimal("20.00"),
            security_deposit_amount=Decimal("1000.00"),
        )
        c_item_b = ContractItem.objects.create(
            subscription=rent_sub,
            product=prod_b,
            quantity=1,
            unit_base_price=Decimal("1500.00"),
            total_base_price=Decimal("1500.00"),
            monthly_amount=Decimal("300.00"),
            security_deposit_percent=Decimal("20.00"),
            security_deposit_amount=Decimal("300.00"),
        )

        self.client.force_authenticate(user=self.admin)

        # 1. Prefill endpoint reports item progress and next batch #1
        prefill_resp = self.client.get(f"/api/v1/admin/deliveries/sources/subscriptions/{rent_sub.id}/prefill/")
        self.assertEqual(prefill_resp.status_code, status.HTTP_200_OK)
        progress = prefill_resp.data["progress"]
        self.assertEqual(progress["total_ordered"], 3)
        self.assertEqual(progress["total_delivered"], 0)
        self.assertEqual(progress["total_remaining"], 3)
        self.assertEqual(progress["next_batch_number"], 1)
        self.assertTrue(progress["is_multi_item"])

        # 2. Schedule Delivery Batch #1 with Product A only (quantity: 2)
        batch1_resp = self.client.post(
            "/api/v1/admin/deliveries/",
            {
                "subscription": rent_sub.id,
                "batch_number": 1,
                "status": "SCHEDULED",
                "scheduled_date": "2026-03-20",
                "admin_override": True,
                "admin_override_reason": "Partial batch #1 test",
                "items": [
                    {
                        "product_id": self.product.id,
                        "quantity": 2,
                        "contract_item_id": c_item_a.id,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(batch1_resp.status_code, status.HTTP_201_CREATED, batch1_resp.data)
        d1_id = batch1_resp.data["id"]
        self.assertEqual(batch1_resp.data["batch_number"], 1)
        self.assertEqual(len(batch1_resp.data["delivery_items"]), 1)
        self.assertEqual(batch1_resp.data["delivery_items"][0]["quantity"], 2)

        # 3. Mark Batch #1 as DELIVERED through standard transitions
        for st in [DeliveryStatus.DISPATCHED, DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.DELIVERED]:
            d1_deliv_resp = self.client.post(
                f"/api/v1/admin/deliveries/{d1_id}/transition/",
                {"status": st},
                format="json",
            )
            self.assertEqual(d1_deliv_resp.status_code, status.HTTP_200_OK)

        # Subscription fulfillment status is now PARTIALLY_DELIVERED
        rent_sub.refresh_from_db()
        self.assertEqual(rent_sub.fulfillment_status, FulfillmentStatus.PARTIALLY_DELIVERED)

        # 4. Prefill endpoint reports 2 delivered, 1 remaining, and next batch #2
        prefill_resp2 = self.client.get(f"/api/v1/admin/deliveries/sources/subscriptions/{rent_sub.id}/prefill/")
        self.assertEqual(prefill_resp2.status_code, status.HTTP_200_OK)
        progress2 = prefill_resp2.data["progress"]
        self.assertEqual(progress2["total_delivered"], 2)
        self.assertEqual(progress2["total_remaining"], 1)
        self.assertEqual(progress2["next_batch_number"], 2)
        self.assertEqual(progress2["fulfillment_status"], FulfillmentStatus.PARTIALLY_DELIVERED)

        # 5. Schedule Delivery Batch #2 with Product B (quantity: 1)
        batch2_resp = self.client.post(
            "/api/v1/admin/deliveries/",
            {
                "subscription": rent_sub.id,
                "batch_number": 2,
                "status": "SCHEDULED",
                "scheduled_date": "2026-03-22",
                "admin_override": True,
                "admin_override_reason": "Partial batch #2 test",
                "items": [
                    {
                        "product_id": prod_b.id,
                        "quantity": 1,
                        "contract_item_id": c_item_b.id,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(batch2_resp.status_code, status.HTTP_201_CREATED, batch2_resp.data)
        d2_id = batch2_resp.data["id"]
        self.assertEqual(batch2_resp.data["batch_number"], 2)

        # 6. Mark Batch #2 as DELIVERED
        for st in [DeliveryStatus.DISPATCHED, DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.DELIVERED]:
            d2_deliv_resp = self.client.post(
                f"/api/v1/admin/deliveries/{d2_id}/transition/",
                {"status": st},
                format="json",
            )
            self.assertEqual(d2_deliv_resp.status_code, status.HTTP_200_OK)

        # Subscription is now fully DELIVERED
        rent_sub.refresh_from_db()
        self.assertEqual(rent_sub.fulfillment_status, FulfillmentStatus.DELIVERED)

        # 7. Attempting to create another delivery should fail since all items are fulfilled
        batch3_resp = self.client.post(
            "/api/v1/admin/deliveries/",
            {
                "subscription": rent_sub.id,
                "status": "SCHEDULED",
                "scheduled_date": "2026-03-25",
                "admin_override": True,
                "admin_override_reason": "Batch 3 should fail",
            },
            format="json",
        )
        self.assertEqual(batch3_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already delivered", str(batch3_resp.data))

