from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from inventory.models import InventoryItem, InventoryLot, StockLocation
from reminders.models import PaymentReminder, ReminderChannel, ReminderStatus, ReminderType
from tests.helpers import create_admin_user, create_customer_profile, create_product


class InventoryTraceabilityApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="trace_admin", phone="9100000101")
        self.client.force_authenticate(self.admin)
        self.product = create_product(
            name="Traceable Chair",
            product_code="TRACE-CHAIR-1",
            base_price=Decimal("12000.00"),
        )
        self.item = InventoryItem.objects.create(
            product=self.product,
            sku="TRACE-CHAIR-1",
            lot_tracking_enabled=True,
            expiry_tracking_enabled=True,
            barcode="BAR-TRACE-1",
            qr_code="QR-TRACE-1",
        )
        self.location = StockLocation.objects.create(code="TRACE-WH", name="Trace Warehouse")

    def test_admin_can_create_and_filter_inventory_lot_with_expiry(self):
        expiry_date = timezone.localdate() + timedelta(days=10)
        response = self.client.post(
            "/api/v1/inventory/lots/",
            {
                "inventory_item": self.item.id,
                "stock_location": self.location.id,
                "lot_code": "LOT-2026-001",
                "barcode": "LOT-BAR-001",
                "qr_code": "LOT-QR-001",
                "received_date": date(2026, 6, 24).isoformat(),
                "expiry_date": expiry_date.isoformat(),
                "quantity_on_hand": "3.000",
                "notes": "Opening traceability lot",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(InventoryLot.objects.filter(inventory_item=self.item).count(), 1)
        self.assertEqual(response.data["lot_code"], "LOT-2026-001")
        self.assertEqual(response.data["barcode"], "LOT-BAR-001")

        list_response = self.client.get("/api/v1/inventory/lots/?expiring=1")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data["count"], 1)

    def test_lot_requires_item_tracking_enabled(self):
        product = create_product(name="Plain Stool", product_code="PLAIN-STOOL-1", base_price=Decimal("1000.00"))
        item = InventoryItem.objects.create(product=product, sku="PLAIN-STOOL-1")

        response = self.client.post(
            "/api/v1/inventory/lots/",
            {
                "inventory_item": item.id,
                "lot_code": "BLOCKED-LOT",
                "quantity_on_hand": "1.000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("lot tracking", str(response.data).lower())


class ReminderGatewayApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="gateway_admin", phone="9100000201")
        self.client.force_authenticate(self.admin)
        self.customer = create_customer_profile(name="Gateway Customer", phone="9100000202")

    def test_payment_reminder_list_get_does_not_shadow_dispatch(self):
        PaymentReminder.objects.create(
            channel=ReminderChannel.SMS,
            reminder_type=ReminderType.FOLLOWUP,
            target_customer=self.customer,
            due_date=timezone.localdate(),
            amount_due=Decimal("500.00"),
            status=ReminderStatus.PENDING,
            customer_contact="9100000202",
        )

        response = self.client.get("/api/v1/reminders/payment-reminders/?status=PENDING&page_size=1")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data["count"], 1)
        self.assertTrue(response.data["results"])

    @override_settings(REMINDER_GATEWAY_PROVIDER="console")
    def test_sms_reminder_dispatch_uses_gateway_and_marks_sent(self):
        reminder = PaymentReminder.objects.create(
            channel=ReminderChannel.SMS,
            reminder_type=ReminderType.FOLLOWUP,
            target_customer=self.customer,
            due_date=timezone.localdate(),
            amount_due=Decimal("500.00"),
            status=ReminderStatus.PENDING,
            customer_contact="9100000202",
        )

        status_response = self.client.get("/api/v1/reminders/gateway/status/")
        self.assertEqual(status_response.status_code, status.HTTP_200_OK)
        self.assertTrue(status_response.data["channels"]["SMS"]["configured"])

        response = self.client.post(
            f"/api/v1/reminders/payment-reminders/{reminder.id}/dispatch/",
            {"notes": "Gateway dispatch test"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reminder.refresh_from_db()
        self.assertEqual(reminder.status, ReminderStatus.SENT)
        self.assertEqual(reminder.attempts, 1)
        self.assertIn("Gateway:", reminder.notes)

    @override_settings(REMINDER_GATEWAY_PROVIDER="disabled")
    def test_sms_dispatch_fails_cleanly_when_gateway_disabled(self):
        reminder = PaymentReminder.objects.create(
            channel=ReminderChannel.SMS,
            reminder_type=ReminderType.FOLLOWUP,
            target_customer=self.customer,
            due_date=timezone.localdate(),
            amount_due=Decimal("500.00"),
            status=ReminderStatus.PENDING,
            customer_contact="9100000202",
        )

        response = self.client.post(
            f"/api/v1/reminders/payment-reminders/{reminder.id}/dispatch/",
            {"notes": "Gateway dispatch test"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        reminder.refresh_from_db()
        self.assertEqual(reminder.status, ReminderStatus.FAILED)
        self.assertIn("disabled", reminder.last_error.lower())
