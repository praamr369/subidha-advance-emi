from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from subscriptions.models import BusinessEventLog, BusinessEventType
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
    ensure_default_payment_collection_accounts,
)


class BusinessEventLogApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = create_admin_user(username="events_admin", phone="9810000001")
        self.cashier = create_cashier_user(username="events_cashier", phone="9810000002")
        self.customer = create_customer_profile(name="Events Customer", phone="9810000003")
        self.product = create_product(name="Events Product", product_code="EV-001")
        self.batch = create_batch(batch_code="EV-BATCH-001")
        self.lucky = create_lucky_id(batch=self.batch, lucky_number=8)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky,
            partner=self.admin,
            monthly_amount=Decimal("1000.00"),
            total_amount=Decimal("3000.00"),
            tenure_months=self.batch.duration_months,
            start_date=date(2099, 1, 1),
        )
        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2099, 1, 5),
        )
        self.finance_account = ensure_default_payment_collection_accounts()["CASH"]

    def _collect_payload(self):
        return {
            "source_type": "ADVANCE_EMI",
            "source_id": self.subscription.id,
            "amount": "200.00",
            "payment_method": "CASH",
            "finance_account": self.finance_account.id,
            "reference": "EVENT-REF-1",
            "idempotency_key": "event-idempotency-1",
        }

    def test_event_created_after_payment(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post("/api/v1/admin/receivables/collect/", self._collect_payload(), format="json")
        self.assertIn(response.status_code, (200, 201), response.data)
        self.assertTrue(BusinessEventLog.objects.filter(event_type=BusinessEventType.PAYMENT_RECEIVED).exists())
        self.assertTrue(BusinessEventLog.objects.filter(event_type=BusinessEventType.EMI_PAID).exists())

    def test_preview_is_optional_and_non_mutating_with_event(self):
        self.client.force_authenticate(self.admin)
        before_event_count = BusinessEventLog.objects.count()
        response = self.client.post(
            "/api/v1/admin/receivables/preview/",
            {"source_type": "ADVANCE_EMI", "source_id": self.subscription.id, "amount": "100.00"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["mutates_data"], False)
        self.assertEqual(
            BusinessEventLog.objects.filter(event_type=BusinessEventType.PAYMENT_PREVIEWED).count(),
            1,
        )
        self.assertGreater(BusinessEventLog.objects.count(), before_event_count)

    def test_event_log_is_append_only(self):
        row = BusinessEventLog.objects.create(
            event_type=BusinessEventType.CUSTOMER_CREATED,
            source_module="tests",
            customer=self.customer,
            payload={"a": 1},
        )
        row.payload = {"a": 2}
        with self.assertRaises(ValidationError):
            row.save()

    def test_cashier_sees_limited_event_view(self):
        self.client.force_authenticate(self.admin)
        self.client.post("/api/v1/admin/receivables/collect/", self._collect_payload(), format="json")
        self.client.force_authenticate(self.cashier)
        response = self.client.get("/api/v1/cashier/audit/events/")
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data.get("results", response.data)
        if rows:
            first = rows[0]
            self.assertNotIn("payload", first)
            self.assertIn("event_type", first)

    def test_admin_sees_full_event_view(self):
        self.client.force_authenticate(self.admin)
        self.client.post("/api/v1/admin/receivables/collect/", self._collect_payload(), format="json")
        response = self.client.get("/api/v1/admin/audit/events/")
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data.get("results", response.data)
        self.assertTrue(rows)
        self.assertIn("payload", rows[0])
        self.assertIn("source_module", rows[0])

    def test_event_failure_does_not_corrupt_payment_flow(self):
        self.client.force_authenticate(self.admin)
        with patch("subscriptions.services.business_event_service.BusinessEventLog.objects.create", side_effect=Exception("db down")):
            response = self.client.post("/api/v1/admin/receivables/collect/", self._collect_payload(), format="json")
        self.assertIn(response.status_code, (200, 201), response.data)

