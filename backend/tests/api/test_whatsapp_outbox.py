"""Click-to-send WhatsApp outbox and the catalogue feed.

Nothing here sends a WhatsApp message: wa.me links only pre-fill a chat. What
these tests pin is that the right message is prepared for the right person, that
preparing it can never break the event that triggered it, and that staff actions
move a message through QUEUED -> OPENED -> SENT (or SKIPPED) exactly once.
"""
from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock
from urllib.parse import unquote

from django.test import TestCase
from rest_framework.test import APITestCase

from contracts.services.rent_lease_contract_service import create_rent_contract
from reminders.models import WhatsAppEventType, WhatsAppMessage, WhatsAppMessageStatus
from reminders.services.whatsapp_outbox_service import (
    mark_sent,
    normalize_phone_e164,
    open_message,
    queue_delivery_update,
    queue_draw_winner,
    queue_payment_receipt,
    queue_whatsapp_message,
    render_message,
    skip_message,
)
from subscriptions.models import Product
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_customer_user,
    create_partner_user,
    create_product,
)


class PhoneAndTemplateTests(TestCase):
    def test_ten_digit_number_gets_india_prefix(self):
        self.assertEqual(normalize_phone_e164("98765 43210"), "919876543210")

    def test_leading_zero_trunk_prefix_is_replaced(self):
        self.assertEqual(normalize_phone_e164("09876543210"), "919876543210")

    def test_international_number_is_kept(self):
        self.assertEqual(normalize_phone_e164("+91 98765-43210"), "919876543210")

    def test_unknown_placeholder_renders_dash_not_error(self):
        body = render_message(WhatsAppEventType.PAYMENT_RECEIPT, {"name": "Asha"})
        self.assertIn("Dear Asha", body)
        self.assertIn("—", body)


class QueueTests(TestCase):
    def setUp(self):
        self.customer = create_customer_profile(name="Asha Roy", phone="9800011111")

    def test_queue_creates_prefilled_message(self):
        message = queue_whatsapp_message(
            event_type=WhatsAppEventType.KYC_VERIFIED, customer=self.customer
        )
        self.assertIsNotNone(message)
        self.assertEqual(message.status, WhatsAppMessageStatus.QUEUED)
        self.assertEqual(message.phone_e164, "919800011111")
        self.assertIn("Asha Roy", message.body)

    def test_no_phone_returns_none_instead_of_raising(self):
        # create_customer_profile's default login user is always "customer_test",
        # which setUp already used, so give this customer its own user. Then blank
        # the number, since the helper also needs a phone for that user.
        no_phone = create_customer_profile(
            user=create_customer_user(username="wa_no_phone", phone="9800099999"),
            name="No Phone",
            phone="9800099999",
        )
        type(no_phone).objects.filter(pk=no_phone.pk).update(phone="")
        no_phone.refresh_from_db()
        self.assertIsNone(
            queue_whatsapp_message(event_type=WhatsAppEventType.KYC_VERIFIED, customer=no_phone)
        )

    def test_dedupe_key_prevents_duplicates(self):
        first = queue_whatsapp_message(
            event_type=WhatsAppEventType.KYC_VERIFIED, customer=self.customer, dedupe_key="k1"
        )
        second = queue_whatsapp_message(
            event_type=WhatsAppEventType.KYC_VERIFIED, customer=self.customer, dedupe_key="k1"
        )
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(WhatsAppMessage.objects.count(), 1)

    def test_payment_receipt_includes_amount_and_reference(self):
        payment = SimpleNamespace(
            pk=501,
            amount=Decimal("2333.33"),
            payment_date=date(2026, 9, 9),
            reference_no="UPI-77",
            customer=self.customer,
            subscription=None,
        )
        message = queue_payment_receipt(payment)
        self.assertIn("2,333.33", message.body)
        self.assertIn("UPI-77", message.body)
        self.assertEqual(message.source_model, "Payment")
        # A retried collection must not queue a second receipt.
        self.assertEqual(queue_payment_receipt(payment).pk, message.pk)


class EventHookTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="wa_hook_admin", phone="9381700011")
        self.customer = create_customer_profile(name="Rent Customer", phone="9800022222")
        self.product = create_product(
            name="Teak Bed", product_code="WA-BED-1", base_price=Decimal("21000.00")
        )
        Product.objects.filter(pk=self.product.pk).update(is_rent_enabled=True)
        self.product.refresh_from_db()
        self.subscription = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=9,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
            save_as_draft=True,
        )

    def _delivery(self, status, pk=1):
        return SimpleNamespace(
            pk=pk, status=status, subscription=self.subscription, scheduled_date=date(2026, 9, 12)
        )

    def test_each_delivery_status_maps_to_its_own_message(self):
        expected = {
            "SCHEDULED": WhatsAppEventType.DELIVERY_SCHEDULED,
            "OUT_FOR_DELIVERY": WhatsAppEventType.OUT_FOR_DELIVERY,
            "DELIVERED": WhatsAppEventType.DELIVERED,
            "RETURNED": WhatsAppEventType.HANDOVER_RETURNED,
        }
        for status, event_type in expected.items():
            message = queue_delivery_update(self._delivery(status))
            self.assertEqual(message.event_type, event_type, status)
            self.assertIn("Teak Bed", message.body)

    def test_intermediate_status_queues_nothing(self):
        self.assertIsNone(queue_delivery_update(self._delivery("DISPATCHED")))

    def test_rent_contract_is_described_as_rent_not_emi(self):
        message = queue_whatsapp_message(
            event_type=WhatsAppEventType.CONTRACT_ACTIVATED, subscription=self.subscription
        )
        self.assertIn("rent contract", message.body)
        self.assertNotIn("Advance EMI", message.body)

    def test_draw_winner_message(self):
        message = queue_draw_winner(subscription=self.subscription, draw_month=3)
        self.assertIn("month 3", message.body)
        self.assertEqual(queue_draw_winner(subscription=self.subscription, draw_month=3).pk, message.pk)


class StaffActionTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="wa_act_admin", phone="9381700012")
        customer = create_customer_profile(name="Action Customer", phone="9800033333")
        self.message = queue_whatsapp_message(
            event_type=WhatsAppEventType.KYC_VERIFIED, customer=customer
        )

    def test_open_returns_wa_me_link_with_prefilled_text(self):
        result = open_message(message=self.message, performed_by=self.admin)
        self.assertTrue(result["link"].startswith("https://wa.me/919800033333?text="))
        self.assertIn("Action Customer", unquote(result["link"]))
        self.message.refresh_from_db()
        self.assertEqual(self.message.status, WhatsAppMessageStatus.OPENED)
        self.assertEqual(self.message.opened_by, self.admin)

    def test_mark_sent_records_who_and_when(self):
        mark_sent(message=self.message, performed_by=self.admin)
        self.message.refresh_from_db()
        self.assertEqual(self.message.status, WhatsAppMessageStatus.SENT)
        self.assertIsNotNone(self.message.sent_at)
        self.assertEqual(self.message.sent_by, self.admin)

    def test_sent_message_cannot_be_skipped(self):
        mark_sent(message=self.message, performed_by=self.admin)
        with self.assertRaises(ValueError):
            skip_message(message=self.message, performed_by=self.admin, reason="late")

    def test_skipped_message_cannot_be_opened(self):
        skip_message(message=self.message, performed_by=self.admin, reason="duplicate")
        with self.assertRaises(ValueError):
            open_message(message=self.message, performed_by=self.admin)


class OutboxApiTests(APITestCase):
    base = "/api/v1/reminders/whatsapp/"

    def setUp(self):
        self.admin = create_admin_user(username="wa_outbox_admin", phone="9381700013")
        self.partner = create_partner_user(username="wa_outbox_partner", phone="9381700014")
        self.customer = create_customer_profile(name="API Customer", phone="9800044444")
        self.message = queue_whatsapp_message(
            event_type=WhatsAppEventType.KYC_VERIFIED, customer=self.customer
        )

    def test_admin_lists_pending_messages(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.base, {"status": "PENDING"})
        self.assertEqual(response.status_code, 200)
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        self.assertEqual([row["id"] for row in rows], [self.message.pk])

    def test_whatsapp_path_is_not_swallowed_by_reminder_router(self):
        """The reminder router is mounted at "" and would read "whatsapp" as a pk."""
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(self.client.get(f"{self.base}summary/").status_code, 200)

    def test_open_then_mark_sent_flow(self):
        self.client.force_authenticate(user=self.admin)
        opened = self.client.post(f"{self.base}{self.message.pk}/open/")
        self.assertEqual(opened.status_code, 200)
        self.assertIn("wa.me/919800044444", opened.data["link"])
        sent = self.client.post(f"{self.base}{self.message.pk}/mark-sent/")
        self.assertEqual(sent.status_code, 200)
        self.assertEqual(sent.data["status"], "SENT")

    def test_compose_queues_custom_text(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"{self.base}compose/",
            {"customer": self.customer.pk, "text": "Your sofa cover is ready."},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["body"], "Your sofa cover is ready.")

    def test_partner_cannot_access_outbox(self):
        self.client.force_authenticate(user=self.partner)
        self.assertEqual(self.client.get(self.base).status_code, 403)


class CatalogFeedTests(APITestCase):
    url = "/api/v1/public/catalog/whatsapp-feed.csv"

    def setUp(self):
        self.product = create_product(
            name="Oak Wardrobe", product_code="FEED-WR-1", base_price=Decimal("32000.00")
        )

    def _rows(self, response):
        return list(csv.DictReader(io.StringIO(response.content.decode("utf-8"))))

    def test_feed_is_public_csv_with_meta_columns(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])
        header = response.content.decode("utf-8").splitlines()[0]
        self.assertEqual(
            header, "id,title,description,availability,condition,price,link,image_link,brand"
        )

    def test_product_without_image_is_left_out(self):
        rows = self._rows(self.client.get(self.url))
        self.assertNotIn("FEED-WR-1", [row["id"] for row in rows])

    def test_product_with_image_is_listed_with_inr_price_and_absolute_links(self):
        with mock.patch(
            "api.v1.views.whatsapp_catalog.PublicProductSerializer.get_image",
            return_value="/media/products/oak.jpg",
        ):
            rows = self._rows(self.client.get(self.url))
        row = next(r for r in rows if r["id"] == "FEED-WR-1")
        self.assertEqual(row["price"], "32000.00 INR")
        self.assertTrue(row["image_link"].startswith("http"))
        self.assertTrue(row["link"].endswith("/products/FEED-WR-1"))
