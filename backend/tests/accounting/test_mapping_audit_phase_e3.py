from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingPeriodStatus, DocumentSequence, JournalEntry
from accounting.services.setup_defaults_service import apply_accounting_setup_defaults
from tests.helpers import create_admin_user, create_customer_user, ensure_test_accounting_posting_prerequisites


class AccountingMappingAuditPhaseE3Tests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="phase_e3_mapping_admin", phone="9304000921")
        self.client.force_authenticate(user=self.admin)

    def test_mapping_audit_returns_required_event_keys(self):
        response = self.client.get("/api/v1/admin/accounting/mapping-audit/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        keys = {row["event_key"] for row in response.data["events"]}
        for key in {
            "direct_sale_invoice",
            "direct_sale_receipt",
            "tax_invoice",
            "credit_note",
            "debit_note",
            "advance_emi_collection",
            "subscription_emi_payment",
            "subscription_emi_waiver_loss",
            "customer_advance",
            "rent_monthly_collection",
            "lease_monthly_collection",
            "rent_security_deposit",
            "lease_security_deposit",
            "security_deposit_refund",
            "damage_recovery",
            "commission_accrual",
            "commission_approval",
            "commission_payout",
            "payout_batch_payment",
            "purchase_inventory_receive",
            "inventory_delivery_out",
            "stock_adjustment_gain",
            "stock_adjustment_loss",
            "production_material_consume",
            "production_output_receive",
            "manufacturing_wastage",
            "cashier_collection",
            "bank_deposit",
            "settlement_allocation",
            "payment_reversal",
            "receipt_void",
            "staff_advance",
        }:
            self.assertIn(key, keys)

    def test_staff_advance_remains_unsupported_and_non_postable(self):
        response = self.client.get("/api/v1/admin/accounting/mapping-audit/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        rows = {row["event_key"]: row for row in response.data["events"]}
        self.assertIn("staff_advance", rows)
        self.assertFalse(rows["staff_advance"]["supported"])
        self.assertFalse(rows["staff_advance"]["can_post"])
        self.assertEqual(rows["staff_advance"]["blocker_code"], "UNSUPPORTED_SOURCE")
        self.assertEqual(rows["staff_advance"]["severity"], "UNSUPPORTED")
        self.assertEqual(rows["staff_advance"]["blocker_category"], "unsupported_source")
        self.assertEqual(rows["staff_advance"]["remediation_route"], "/admin/accounting/setup/mapping-audit")
        self.assertIsInstance(rows["staff_advance"]["missing_fields"], list)
        self.assertTrue(rows["staff_advance"]["is_close_blocker"])
        self.assertTrue(rows["staff_advance"]["is_posting_blocker"])

    def test_validate_all_is_read_only(self):
        journal_before = JournalEntry.objects.count()
        sequence_before = DocumentSequence.objects.count()
        response = self.client.post("/api/v1/admin/accounting/mapping-audit/validate/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["read_only"])
        self.assertEqual(JournalEntry.objects.count(), journal_before)
        self.assertEqual(DocumentSequence.objects.count(), sequence_before)

    def test_seed_safe_defaults_creates_no_journal_and_may_seed_journal_numbering_metadata(self):
        ensure_test_accounting_posting_prerequisites(performed_by=self.admin)
        journal_before = JournalEntry.objects.count()
        response = self.client.post("/api/v1/admin/accounting/mapping-audit/seed-safe-defaults/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["journal_entries_created"], 0)
        self.assertEqual(JournalEntry.objects.count(), journal_before)
        self.assertTrue(DocumentSequence.objects.filter(document_type="JOURNAL_ENTRY", is_active=True).exists())

    def test_mapping_audit_does_not_mark_open_period_as_period_blocked(self):
        ensure_test_accounting_posting_prerequisites(performed_by=self.admin)
        apply_accounting_setup_defaults(performed_by=self.admin)

        response = self.client.get("/api/v1/admin/accounting/mapping-audit/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["summary"]["blocked_by_period"], 0)
        self.assertFalse(
            any(row["status"] == "BLOCKED_BY_PERIOD" and row["period_readiness"] == "READY" for row in response.data["events"])
        )

    def test_mapping_audit_marks_locked_period_as_period_blocked(self):
        prereqs = ensure_test_accounting_posting_prerequisites(performed_by=self.admin)
        period = prereqs["accounting_period"]
        apply_accounting_setup_defaults(performed_by=self.admin)
        period.status = AccountingPeriodStatus.LOCKED
        period.is_locked = True
        period.save(update_fields=["status", "is_locked", "updated_at"])

        response = self.client.get("/api/v1/admin/accounting/mapping-audit/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertGreater(response.data["summary"]["blocked_by_period"], 0)

    def test_mapping_audit_marks_closed_period_as_period_blocked(self):
        prereqs = ensure_test_accounting_posting_prerequisites(performed_by=self.admin)
        period = prereqs["accounting_period"]
        apply_accounting_setup_defaults(performed_by=self.admin)
        period.status = AccountingPeriodStatus.CLOSED
        period.is_locked = True
        period.save(update_fields=["status", "is_locked", "updated_at"])

        response = self.client.get("/api/v1/admin/accounting/mapping-audit/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertGreater(response.data["summary"]["blocked_by_period"], 0)

    def test_fix_staff_advance_is_blocked(self):
        response = self.client.post(
            "/api/v1/admin/accounting/mapping-audit/fix-event/",
            {"event_key": "staff_advance", "action": "apply_mapping"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

    def test_customer_cannot_call_mapping_audit_setup_actions(self):
        customer = create_customer_user(username="phase_e3_customer", phone="9304000922")
        self.client.force_authenticate(user=customer)
        response = self.client.post("/api/v1/admin/accounting/mapping-audit/seed-safe-defaults/", {}, format="json")
        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})
