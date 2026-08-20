from datetime import date, timedelta
from decimal import Decimal

from rest_framework.test import APITestCase

from privacy.dpdp_compliance_models import DataErasureGuard, ErasureRequestStatus
from privacy.services.anonymization_service import (
    execute_erasure,
    get_erasure_preview,
    reject_erasure,
)
from tests.helpers import create_admin_user, create_customer_profile


class AnonymizationServiceTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="anon_admin", phone="9400300001")
        self.customer = create_customer_profile(name="Erase Me", phone="7400300001")

    def _create_guard(self):
        return DataErasureGuard.objects.create(
            customer=self.customer,
            request_reference="DPDP-TEST0001",
            due_date=date.today() + timedelta(days=30),
            fields_to_erase=["name", "phone", "address"],
        )

    def test_erasure_preview(self):
        preview = get_erasure_preview(customer_id=self.customer.id)
        self.assertEqual(preview["customer_id"], self.customer.id)
        field_names = [f["field"] for f in preview["fields_to_erase"]]
        self.assertIn("name", field_names)
        self.assertIn("phone", field_names)
        retained_fields = [f["field"] for f in preview["fields_retained"]]
        self.assertIn("payments", retained_fields)

    def test_execute_erasure(self):
        guard = self._create_guard()
        result = execute_erasure(erasure_guard_id=guard.id, actor=self.admin)
        self.assertEqual(result["status"], ErasureRequestStatus.COMPLETED)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.name, f"REDACTED-{self.customer.id}")
        self.assertEqual(self.customer.phone, "0000000000")
        self.assertEqual(self.customer.address, "")
        self.customer.user.refresh_from_db()
        self.assertFalse(self.customer.user.is_active)

    def test_execute_erasure_idempotent(self):
        guard = self._create_guard()
        execute_erasure(erasure_guard_id=guard.id, actor=self.admin)
        with self.assertRaises(ValueError):
            execute_erasure(erasure_guard_id=guard.id, actor=self.admin)

    def test_reject_erasure(self):
        guard = self._create_guard()
        result = reject_erasure(
            erasure_guard_id=guard.id, reason="Incomplete verification", actor=self.admin,
        )
        self.assertEqual(result["status"], ErasureRequestStatus.REJECTED)
        guard.refresh_from_db()
        self.assertEqual(guard.rejection_reason, "Incomplete verification")

    def test_reject_then_execute_blocked(self):
        guard = self._create_guard()
        reject_erasure(erasure_guard_id=guard.id, reason="test", actor=self.admin)
        with self.assertRaises(ValueError):
            execute_erasure(erasure_guard_id=guard.id, actor=self.admin)

    def test_financial_records_retained(self):
        guard = self._create_guard()
        result = execute_erasure(erasure_guard_id=guard.id, actor=self.admin)
        self.assertGreater(result["fields_retained_count"], 0)
        guard.refresh_from_db()
        retained = guard.fields_retained
        self.assertTrue(any("Companies Act" in r.get("reason", "") for r in retained))
