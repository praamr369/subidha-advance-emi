"""Layer-C delta: delivery transitions specify a target + failures carry a reason.

The delivery lifecycle is a state machine (transition / mark-delivered / mark-failed
/ cancel / request-return / mark-returned); each action get_object_or_404's the
delivery, validates its serializer, and delegates to a delivery service. This locks
two input invariants: a status transition must name the target status, and a
failure must document a reason (both pure-serializer, no fixtures).
"""
from datetime import date
from decimal import Decimal

from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from api.v1.views.admin_deliveries import (
    AdminSubscriptionDeliveryReasonSerializer,
    AdminSubscriptionDeliveryTransitionSerializer,
)


class AdminDeliveriesDeltaTest(SimpleTestCase):
    def test_transition_requires_target_status(self):
        self.assertTrue(AdminSubscriptionDeliveryTransitionSerializer().fields["status"].required)

    def test_failure_requires_reason(self):
        self.assertTrue(AdminSubscriptionDeliveryReasonSerializer().fields["reason"].required)


class AdminTransportFinanceIsolationTests(TestCase):
    def setUp(self):
        from tests.helpers import (
            create_admin_user,
            create_batch,
            create_customer_profile,
            create_lucky_id,
            create_product,
            ensure_test_accounting_posting_prerequisites,
        )

        self.admin = create_admin_user(username="tf_iso_admin", phone="9388110001")
        ensure_test_accounting_posting_prerequisites(date.today(), performed_by=self.admin)
        self.customer = create_customer_profile(name="Transport Test Customer", phone="9388110002")
        self.customer.address = "12 Park Street"
        self.customer.city = "Kolkata"
        self.customer.save(update_fields=["address", "city"])

        self.rent_product = create_product(
            name="Transport Rent Sofa",
            product_code="TF-RENT-001",
            base_price=Decimal("24000.00"),
        )
        self.rent_product.is_rent_enabled = True
        self.rent_product.is_lease_enabled = True
        self.rent_product.is_emi_enabled = True
        self.rent_product.save(update_fields=["is_rent_enabled", "is_lease_enabled", "is_emi_enabled"])
        self.batch = create_batch(batch_code="TF-BATCH-01", duration_months=12, total_slots=100)
        create_lucky_id(batch=self.batch, lucky_number=1)

    def test_rent_lease_emi_and_delivery_challan_transport_fare_never_posts_to_accounts(self):
        from accounting.models import JournalEntry
        from contracts.services.document_pdf_service import render_delivery_handover_pdf
        from contracts.services.rent_lease_contract_service import create_lease_contract, create_rent_contract
        from contracts.services.subscription_service import create_emi_subscription
        from deliveries.models import TransportFareEntry, TransportFareSourceType
        from deliveries.services.delivery_service import (
            create_subscription_delivery,
            update_subscription_delivery_metadata,
        )

        je_before = JournalEntry.objects.count()

        rent_sub = create_rent_contract(
            customer=self.customer,
            product=self.rent_product,
            tenure_months=6,
            security_deposit_percent=Decimal("20.00"),
            monthly_yield_percent=Decimal("5.00"),
            performed_by=self.admin,
            van_number="wb-01-tf-1111",
            transport_boy_name="Bikash",
            transport_boy_phone="9800011111",
            van_fare=Decimal("400.00"),
            transport_notes="Rent dispatch van",
        )
        self.assertEqual(rent_sub.monthly_amount, Decimal("1200.00"))
        self.assertEqual(rent_sub.total_amount, Decimal("7200.00"))
        self.assertEqual(rent_sub.van_number, "WB-01-TF-1111")
        self.assertEqual(rent_sub.van_fare, Decimal("400.00"))
        self.assertTrue(
            TransportFareEntry.objects.filter(
                subscription=rent_sub,
                source_type=TransportFareSourceType.RENT_CONTRACT,
                van_fare=Decimal("400.00"),
            ).exists()
        )

        lease_sub = create_lease_contract(
            customer=self.customer,
            product=self.rent_product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            monthly_yield_percent=Decimal("5.00"),
            performed_by=self.admin,
            van_number="wb-01-tf-2222",
            transport_boy_name="Suman",
            transport_boy_phone="9800022222",
            van_fare=Decimal("600.00"),
        )
        self.assertEqual(lease_sub.total_amount, Decimal("14400.00"))
        self.assertTrue(
            TransportFareEntry.objects.filter(
                subscription=lease_sub,
                source_type=TransportFareSourceType.LEASE_CONTRACT,
                van_fare=Decimal("600.00"),
            ).exists()
        )

        emi_sub = create_emi_subscription(
            customer=self.customer,
            product=self.rent_product,
            batch=self.batch,
            lucky_number=1,
            tenure_months=12,
            performed_by=self.admin,
            van_number="wb-01-tf-3333",
            transport_boy_name="Karan",
            transport_boy_phone="9800033333",
            van_fare=Decimal("300.00"),
        )
        self.assertEqual(emi_sub.total_amount, Decimal("24000.00"))
        self.assertTrue(
            TransportFareEntry.objects.filter(
                subscription=emi_sub,
                source_type=TransportFareSourceType.EMI_CONTRACT,
                van_fare=Decimal("300.00"),
            ).exists()
        )

        # Delivery inherits from contract and allows challan update without touching company accounts
        delivery = create_subscription_delivery(
            subscription=rent_sub,
            performed_by=self.admin,
            admin_override=True,
            admin_override_reason="Test challan creation",
        )
        self.assertEqual(delivery.van_number, "WB-01-TF-1111")
        self.assertEqual(delivery.van_fare, Decimal("400.00"))

        update_subscription_delivery_metadata(
            delivery=delivery,
            performed_by=self.admin,
            van_fare=Decimal("475.00"),
            transport_notes="Revised challan fare",
        )
        delivery.refresh_from_db()
        self.assertEqual(delivery.van_fare, Decimal("475.00"))
        self.assertTrue(
            TransportFareEntry.objects.filter(
                subscription_delivery=delivery,
                source_type=TransportFareSourceType.SUBSCRIPTION_DELIVERY,
                van_fare=Decimal("475.00"),
            ).exists()
        )

        pdf_bytes = render_delivery_handover_pdf(delivery=delivery)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))

        # Zero company accounting journal entries created by any transport fare
        self.assertEqual(JournalEntry.objects.count(), je_before)

        # Logistics Transport-Only Finance API CRUD + summary
        client = APIClient()
        client.force_authenticate(user=self.admin)
        list_resp = client.get("/api/v1/admin/logistics/transport-fares/")
        self.assertEqual(list_resp.status_code, 200)
        self.assertFalse(list_resp.data["summary"]["accounting_posted"])
        self.assertGreaterEqual(list_resp.data["summary"]["count"], 4)

        create_resp = client.post(
            "/api/v1/admin/logistics/transport-fares/",
            {
                "van_number": "wb-09-zz-0001",
                "transport_boy_name": "Dipak",
                "transport_boy_phone": "9811100000",
                "van_fare": "250.00",
                "reference_no": "MAN-CHALLAN-1",
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, 201)
        entry_id = create_resp.data["id"]

        patch_resp = client.patch(
            f"/api/v1/admin/logistics/transport-fares/{entry_id}/",
            {"settlement_status": "PAID_TO_TRANSPORT"},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, 200)
        self.assertEqual(patch_resp.data["settlement_status"], "PAID_TO_TRANSPORT")
        self.assertEqual(JournalEntry.objects.count(), je_before)
