from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from billing.models import BillingActivationState
from billing.services.billing_sync_service import (
    sync_payment_into_billing,
    sync_subscription_billing_profile,
)
from subscriptions.models import DeliveryStatus, FulfillmentStatus
from subscriptions.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_delivery,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
    ensure_document_numbering_profile_for_date,
    ensure_test_accounting_posting_prerequisites,
)


class BillingProfileSyncServiceTests(TestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(
            username="billing_sync_admin",
            phone="9387000001",
        )
        ensure_test_accounting_posting_prerequisites(self.today, performed_by=self.admin)
        ensure_document_numbering_profile_for_date("JOURNAL_ENTRY", self.today, performed_by=self.admin)
        self.customer = create_customer_profile(
            name="Billing Sync Customer",
            phone="7387000001",
        )
        product = create_product(
            name="Billing Sync Product",
            product_code="BILL-SYNC-001",
            base_price=Decimal("3600.00"),
        )
        batch = create_batch(
            batch_code="BILLSYNC2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=30),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=12)
        self.subscription = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("3600.00"),
            monthly_amount=Decimal("1200.00"),
            tenure_months=3,
            start_date=self.today - timedelta(days=30),
        )
        self.emi_one = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1200.00"),
            due_date=self.today - timedelta(days=5),
        )
        self.emi_two = create_emi(
            subscription=self.subscription,
            month_no=2,
            amount=Decimal("1200.00"),
            due_date=self.today + timedelta(days=20),
        )

    def test_sync_profile_respects_delivery_gate_and_mirrors_installments(self):
        profile, event, created = sync_subscription_billing_profile(
            subscription_id=self.subscription.id,
            performed_by=self.admin,
        )

        self.assertTrue(created)
        self.assertEqual(profile.activation_state, BillingActivationState.PENDING_DELIVERY)
        self.assertFalse(profile.invoice_eligible)
        self.assertEqual(profile.installments.count(), 2)
        self.assertEqual(event.event_type, "PROFILE_REFRESH")

        create_delivery(
            subscription=self.subscription,
            status=DeliveryStatus.DELIVERED,
            created_by=self.admin,
            updated_by=self.admin,
        )
        self.subscription.fulfillment_status = FulfillmentStatus.DELIVERED
        self.subscription.save(update_fields=["fulfillment_status"])

        payment_result = record_emi_payment(
            emi_id=self.emi_one.id,
            amount=Decimal("1200.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="BILL-SYNC-PAY-001",
            payment_date=self.today,
        )
        payment = payment_result["payment"]

        profile, payment_event, payment_created = sync_payment_into_billing(
            payment_id=payment.id,
            performed_by=self.admin,
            event_type="PAYMENT_SYNC",
        )
        self.assertTrue(payment_created)
        self.assertEqual(profile.activation_state, BillingActivationState.ACTIVE)
        self.assertTrue(profile.invoice_eligible)
        self.assertEqual(profile.paid_amount_snapshot, Decimal("1200.00"))
        self.assertEqual(profile.next_due_amount, Decimal("1200.00"))
        self.assertEqual(profile.installments.count(), 2)

        first_mirror = profile.installments.get(emi_id=self.emi_one.id)
        self.assertEqual(first_mirror.paid_amount_snapshot, Decimal("1200.00"))
        self.assertEqual(first_mirror.outstanding_amount_snapshot, Decimal("0.00"))
        self.assertEqual(first_mirror.payment_count_snapshot, 1)
        self.assertEqual(payment_event.source_model, "Payment")
        self.assertEqual(payment_event.event_type, "PAYMENT_SYNC")

        _, second_event, second_created = sync_payment_into_billing(
            payment_id=payment.id,
            performed_by=self.admin,
            event_type="PAYMENT_SYNC",
        )
        self.assertFalse(second_created)
        self.assertEqual(second_event.id, payment_event.id)
