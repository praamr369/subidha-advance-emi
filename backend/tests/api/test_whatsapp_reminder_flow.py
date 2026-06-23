"""
Tests for manual WhatsApp EMI reminder flow.

Covers:
- generate_whatsapp_link returns correct wa.me URL with encoded message
- generate_whatsapp_link raises ValueError when no phone on reminder
- Phone normalisation (10-digit → 91-prefixed)
- GET /api/v1/reminders/payment-reminders/{id}/whatsapp-link/ returns 200
- GET returns 400 when no contact phone
- mark manually sent via POST .../send/ records audit
- Non-admin cannot access whatsapp-link endpoint
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from reminders.models import PaymentReminder, ReminderChannel, ReminderStatus, ReminderType
from reminders.services.reminder_service import generate_whatsapp_link, send_payment_reminder
from tests.helpers import create_admin_user, create_customer_profile, create_partner_user

_WA_BASE = "/api/v1/reminders/payment-reminders"


def _make_reminder(*, customer, phone="9876543210", reminder_type=ReminderType.EMI_DUE, amount=Decimal("1500.00")):
    return PaymentReminder.objects.create(
        channel=ReminderChannel.WHATSAPP,
        reminder_type=reminder_type,
        target_customer=customer,
        due_date=date(2025, 8, 1),
        amount_due=amount,
        customer_contact=phone,
    )


class WhatsAppLinkGenerationTests(TestCase):
    def setUp(self):
        self.customer = create_customer_profile(
            name="Ramesh Kumar", phone="9876543210", email=""
        )

    def test_generates_wa_me_link_with_indian_phone(self):
        reminder = _make_reminder(customer=self.customer, phone="9876543210")
        result = generate_whatsapp_link(reminder_id=reminder.id)

        self.assertIn("wa.me", result["link"])
        self.assertIn("919876543210", result["link"])
        self.assertEqual(result["phone_e164"], "919876543210")
        self.assertIn("Ramesh Kumar", result["message"])
        self.assertIn("1500.00", result["message"])
        self.assertIn("01 Aug 2025", result["message"])

    def test_phone_already_12_digits_not_double_prefixed(self):
        reminder = _make_reminder(customer=self.customer, phone="919876543210")
        result = generate_whatsapp_link(reminder_id=reminder.id)
        self.assertEqual(result["phone_e164"], "919876543210")
        self.assertNotIn("9191", result["link"])

    def test_raises_when_no_contact(self):
        reminder = _make_reminder(customer=self.customer, phone="")
        reminder.customer_contact = ""
        reminder.save(update_fields=["customer_contact", "updated_at"])
        with self.assertRaises(ValueError) as ctx:
            generate_whatsapp_link(reminder_id=reminder.id)
        self.assertIn("phone", str(ctx.exception).lower())

    def test_overdue_reminder_uses_overdue_template(self):
        reminder = _make_reminder(
            customer=self.customer,
            phone="9000000001",
            reminder_type=ReminderType.EMI_OVERDUE,
        )
        result = generate_whatsapp_link(reminder_id=reminder.id)
        self.assertIn("overdue", result["message"].lower())

    def test_result_contains_note_about_manual_send(self):
        reminder = _make_reminder(customer=self.customer)
        result = generate_whatsapp_link(reminder_id=reminder.id)
        self.assertIn("manually", result["note"].lower())

    def test_link_message_is_url_encoded(self):
        reminder = _make_reminder(customer=self.customer)
        result = generate_whatsapp_link(reminder_id=reminder.id)
        _, text_part = result["link"].split("?text=", 1)
        self.assertNotIn(" ", text_part)


class WhatsAppMarkSentTests(TestCase):
    def setUp(self):
        self.customer = create_customer_profile(name="Suresh", phone="9100000001")
        self.admin = create_admin_user(username="wa_admin", phone="9100000002")

    def test_mark_sent_records_sent_status(self):
        reminder = _make_reminder(customer=self.customer)
        result, updated = send_payment_reminder(
            reminder_id=reminder.id,
            performed_by=self.admin,
            notes="Sent via WhatsApp manually",
        )
        self.assertTrue(updated)
        self.assertEqual(result.status, ReminderStatus.SENT)
        self.assertIsNotNone(result.sent_at)
        self.assertEqual(result.sent_by_id, self.admin.id)
        self.assertIn("Sent via WhatsApp manually", result.notes)

    def test_mark_sent_twice_is_idempotent(self):
        reminder = _make_reminder(customer=self.customer)
        send_payment_reminder(reminder_id=reminder.id, performed_by=self.admin)
        result, updated = send_payment_reminder(reminder_id=reminder.id, performed_by=self.admin)
        self.assertFalse(updated)
        self.assertEqual(result.status, ReminderStatus.SENT)

    def test_cannot_send_cancelled_reminder(self):
        reminder = _make_reminder(customer=self.customer)
        reminder.status = ReminderStatus.CANCELLED
        reminder.save(update_fields=["status", "updated_at"])
        with self.assertRaises(ValueError):
            send_payment_reminder(reminder_id=reminder.id, performed_by=self.admin)


class WhatsAppLinkAPITests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="wa_api_admin", phone="9200000001")
        self.partner = create_partner_user(username="wa_api_partner", phone="9200000002")
        self.customer = create_customer_profile(name="API Test Customer", phone="9200000003")

    def _make_reminder(self, phone="9200000003"):
        return PaymentReminder.objects.create(
            channel=ReminderChannel.WHATSAPP,
            reminder_type=ReminderType.EMI_DUE,
            target_customer=self.customer,
            due_date=date(2025, 9, 1),
            amount_due=Decimal("2000.00"),
            customer_contact=phone,
        )

    def test_admin_can_get_whatsapp_link(self):
        reminder = self._make_reminder()
        self.client.force_authenticate(user=self.admin)
        url = f"{_WA_BASE}/{reminder.id}/whatsapp-link/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("link", response.data)
        self.assertIn("wa.me", response.data["link"])
        self.assertIn("message", response.data)
        self.assertIn("note", response.data)

    def test_missing_phone_returns_400(self):
        reminder = self._make_reminder(phone="")
        reminder.customer_contact = ""
        reminder.save(update_fields=["customer_contact", "updated_at"])
        self.client.force_authenticate(user=self.admin)
        url = f"{_WA_BASE}/{reminder.id}/whatsapp-link/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_admin_cannot_access_whatsapp_link(self):
        reminder = self._make_reminder()
        self.client.force_authenticate(user=self.partner)
        url = f"{_WA_BASE}/{reminder.id}/whatsapp-link/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_mark_sent_via_api(self):
        reminder = self._make_reminder()
        self.client.force_authenticate(user=self.admin)
        url = f"{_WA_BASE}/{reminder.id}/send/"
        response = self.client.post(url, {"notes": "Sent on WhatsApp manually"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["updated"])
        self.assertEqual(response.data["reminder"]["status"], "SENT")
