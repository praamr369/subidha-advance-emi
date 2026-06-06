from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import DocumentSequence, JournalEntry
from accounting.services.accounting_postability_service import evaluate_accounting_postability
from tests.helpers import create_admin_user, create_customer_user


class AccountingPostabilityPhaseE4Tests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="phase_e4_admin", phone="9304000941")
        self.client.force_authenticate(user=self.admin)

    def test_evaluator_returns_postable_for_ready_supported_event(self):
        result = evaluate_accounting_postability(
            event_key="direct_sale_receipt",
            event_label="Direct sale receipt",
            module="Sales / Billing",
            source_model="ReceiptDocument",
            bridge_row={"event_key": "direct_sale_receipt", "status": "READY", "label": "Direct sale receipt"},
            period_readiness={"financial_year_ready": True, "accounting_period_ready": True, "journal_numbering_ready": True},
            source_workflow_exists=True,
        )
        self.assertEqual(result["status"], "POSTABLE")
        self.assertTrue(result["can_preview"])
        self.assertTrue(result["can_post"])

    def test_evaluator_blocks_mapping_when_bridge_not_ready(self):
        result = evaluate_accounting_postability(
            event_key="direct_sale_receipt",
            bridge_row={"event_key": "direct_sale_receipt", "status": "NOT_CONFIGURED", "blocking_reasons": ["Missing mapping."]},
            period_readiness={"financial_year_ready": True, "accounting_period_ready": True, "journal_numbering_ready": True},
            source_workflow_exists=True,
        )
        self.assertEqual(result["status"], "BLOCKED_BY_MAPPING")
        self.assertFalse(result["can_post"])

    def test_evaluator_blocks_period_when_current_period_missing(self):
        result = evaluate_accounting_postability(
            event_key="direct_sale_receipt",
            bridge_row={"event_key": "direct_sale_receipt", "status": "READY"},
            period_readiness={"financial_year_ready": True, "accounting_period_ready": False, "journal_numbering_ready": True},
            source_workflow_exists=True,
        )
        self.assertEqual(result["status"], "BLOCKED_BY_PERIOD")

    def test_evaluator_blocks_numbering_when_journal_sequence_missing(self):
        result = evaluate_accounting_postability(
            event_key="direct_sale_receipt",
            bridge_row={"event_key": "direct_sale_receipt", "status": "READY"},
            period_readiness={"financial_year_ready": True, "accounting_period_ready": True, "journal_numbering_ready": False},
            source_workflow_exists=True,
        )
        self.assertEqual(result["status"], "BLOCKED_BY_NUMBERING")

    def test_evaluator_blocks_approval_gate(self):
        result = evaluate_accounting_postability(
            event_key="commission_payout",
            bridge_row={"event_key": "commission_payout", "status": "READY"},
            period_readiness={"financial_year_ready": True, "accounting_period_ready": True, "journal_numbering_ready": True},
            source_workflow_exists=True,
        )
        self.assertEqual(result["status"], "BLOCKED_BY_APPROVAL")
        self.assertFalse(result["can_post"])

    def test_evaluator_returns_unsupported_for_staff_advance(self):
        result = evaluate_accounting_postability(
            event_key="staff_advance",
            bridge_row={"event_key": "staff_advance", "status": "READY"},
            period_readiness={"financial_year_ready": True, "accounting_period_ready": True, "journal_numbering_ready": True},
            source_workflow_exists=True,
        )
        self.assertEqual(result["status"], "UNSUPPORTED_SOURCE")
        self.assertFalse(result["can_post"])

    def test_reconciliation_run_creates_no_journal_or_document_sequence(self):
        journal_before = JournalEntry.objects.count()
        sequence_before = DocumentSequence.objects.count()
        response = self.client.post(
            "/api/v1/admin/reconciliation/runs/",
            {"scope": "PHASE_F", "module": "CONTROL_TOWER"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(JournalEntry.objects.count(), journal_before)
        self.assertEqual(DocumentSequence.objects.count(), sequence_before)

    def test_reconciliation_run_returns_context_fields(self):
        response = self.client.post(
            "/api/v1/admin/reconciliation/runs/",
            {"scope": "PHASE_F", "module": "CONTROL_TOWER", "financial_year": "FY-TEST", "accounting_period": "APR"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["financial_year"], "FY-TEST")
        self.assertEqual(response.data["accounting_period"], "APR")

    def test_customer_cannot_call_reconciliation_run(self):
        customer = create_customer_user(username="phase_e4_customer", phone="9304000942")
        self.client.force_authenticate(user=customer)
        response = self.client.post("/api/v1/admin/reconciliation/runs/", {"scope": "PHASE_F"}, format="json")
        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})
