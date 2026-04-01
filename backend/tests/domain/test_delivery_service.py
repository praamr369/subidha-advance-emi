from datetime import date
from decimal import Decimal

from django.test import TestCase

from subscriptions.models import AuditLog, DeliveryStatus, FulfillmentStatus
from subscriptions.services.delivery_service import (
    build_delivery_report_summary,
    create_subscription_delivery,
    get_delivery_queryset,
    mark_subscription_delivery_delivered,
    mark_subscription_delivery_returned,
    request_subscription_delivery_return,
    transition_subscription_delivery_status,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_delivery,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class DeliveryServiceTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="delivery_service_admin",
            phone="9311000001",
        )
        self.partner = create_partner_user(
            username="delivery_service_partner",
            phone="9311000002",
        )
        self.partner.commission_rate = Decimal("5.00")
        self.partner.save(update_fields=["commission_rate"])

        self.customer = create_customer_profile(
            name="Delivery Service Customer",
            phone="7311000001",
        )
        self.product = create_product(
            name="Delivery Service Product",
            product_code="DLV-SVC-001",
            base_price=Decimal("3000.00"),
        )
        self.batch = create_batch(
            batch_code="DLVSVC2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=21)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            partner=self.partner,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
        )

    def test_create_delivery_enforces_single_active_record_and_keeps_summary_synced(self):
        delivery = create_subscription_delivery(
            subscription=self.subscription,
            performed_by=self.admin,
            status=DeliveryStatus.SCHEDULED,
            scheduled_date=date(2026, 3, 15),
            notes="Ready for dispatch",
        )

        self.subscription.refresh_from_db()

        self.assertEqual(delivery.status, DeliveryStatus.SCHEDULED)
        self.assertEqual(self.subscription.fulfillment_status, FulfillmentStatus.PENDING)
        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.DELIVERY_CREATED,
                model_name="SubscriptionDelivery",
                object_id=delivery.id,
            ).exists()
        )

        with self.assertRaisesMessage(ValueError, "active delivery"):
            create_subscription_delivery(
                subscription=self.subscription,
                performed_by=self.admin,
                status=DeliveryStatus.PENDING,
            )

    def test_delivery_transition_updates_subscription_summary_and_audit(self):
        delivery = create_subscription_delivery(
            subscription=self.subscription,
            performed_by=self.admin,
            status=DeliveryStatus.SCHEDULED,
            scheduled_date=date(2026, 3, 18),
        )

        delivery = transition_subscription_delivery_status(
            delivery=delivery,
            next_status=DeliveryStatus.DISPATCHED,
            performed_by=self.admin,
        )
        delivery = transition_subscription_delivery_status(
            delivery=delivery,
            next_status=DeliveryStatus.OUT_FOR_DELIVERY,
            performed_by=self.admin,
        )
        delivery = mark_subscription_delivery_delivered(
            delivery=delivery,
            performed_by=self.admin,
            receiver_name="Customer Receiver",
            receiver_phone="7311000001",
            notes="Delivered successfully",
        )

        self.subscription.refresh_from_db()
        delivery.refresh_from_db()

        self.assertEqual(delivery.status, DeliveryStatus.DELIVERED)
        self.assertIsNotNone(delivery.dispatched_at)
        self.assertIsNotNone(delivery.out_for_delivery_at)
        self.assertIsNotNone(delivery.delivered_at)
        self.assertEqual(self.subscription.fulfillment_status, FulfillmentStatus.DELIVERED)
        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.DELIVERY_COMPLETED,
                model_name="SubscriptionDelivery",
                object_id=delivery.id,
            ).exists()
        )

    def test_return_workflow_updates_subscription_fulfillment_summary(self):
        delivery = create_delivery(
            subscription=self.subscription,
            status=DeliveryStatus.DELIVERED,
            delivery_reference="DLV-RETURN-001",
            created_by=self.admin,
            updated_by=self.admin,
        )
        self.subscription.fulfillment_status = FulfillmentStatus.DELIVERED
        self.subscription.save(update_fields=["fulfillment_status"])

        request_subscription_delivery_return(
            delivery=delivery,
            performed_by=self.admin,
            notes="Customer requested return",
        )
        self.subscription.refresh_from_db()
        self.assertEqual(
            self.subscription.fulfillment_status,
            FulfillmentStatus.RETURN_REQUESTED,
        )

        delivery.refresh_from_db()
        mark_subscription_delivery_returned(
            delivery=delivery,
            performed_by=self.admin,
            notes="Return completed",
        )
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.fulfillment_status, FulfillmentStatus.RETURNED)

    def test_delivery_report_summary_counts_statuses(self):
        create_delivery(
            subscription=self.subscription,
            status=DeliveryStatus.PENDING,
            delivery_reference="DLV-RPT-001",
            created_by=self.admin,
            updated_by=self.admin,
        )

        other_lucky = create_lucky_id(batch=self.batch, lucky_number=22)
        other_subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=other_lucky,
            partner=self.partner,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
        )
        create_delivery(
            subscription=other_subscription,
            status=DeliveryStatus.DELIVERED,
            delivery_reference="DLV-RPT-002",
            created_by=self.admin,
            updated_by=self.admin,
        )

        failed_lucky = create_lucky_id(batch=self.batch, lucky_number=23)
        failed_subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=failed_lucky,
            partner=self.partner,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
        )
        create_delivery(
            subscription=failed_subscription,
            status=DeliveryStatus.FAILED,
            delivery_reference="DLV-RPT-003",
            created_by=self.admin,
            updated_by=self.admin,
            failure_reason="Address mismatch",
        )

        summary = build_delivery_report_summary(get_delivery_queryset())

        self.assertEqual(summary["total"], 3)
        self.assertEqual(summary["pending"], 1)
        self.assertEqual(summary["delivered"], 1)
        self.assertEqual(summary["failed"], 1)
