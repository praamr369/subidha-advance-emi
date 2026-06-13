from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, JournalEntry
from accounting.services.accounting_bridge_reconciliation_read_service import (
    _phase_f_control_tower,
    _production_accounting_validation,
)
from reconciliation.models import ReconciliationItem
from subscriptions.models import Payment, PaymentMethod
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
    ensure_default_payment_collection_accounts,
    ensure_test_accounting_posting_prerequisites,
)


READY_PERIOD = {
    "financial_year_ready": True,
    "accounting_period_ready": True,
    "journal_numbering_ready": True,
    "posting_controls_ready": True,
}


class PhaseF25ProductionAccountingOperationalValidationTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f25_admin", phone="9306250001")
        self.client.force_authenticate(user=self.admin)

    def _validation(self, rows=None):
        rows = rows or []
        tower = _phase_f_control_tower(rows, READY_PERIOD, [])
        return _production_accounting_validation(rows, tower)

    def _by_workflow(self, validation):
        return {row["workflow"]: row for row in validation["workflows"]}

    def test_matrix_includes_all_required_operational_workflows(self):
        validation = self._validation()
        workflows = self._by_workflow(validation)

        for name in [
            "EMI payment collection",
            "EMI receipt",
            "Winner waiver remains future-EMI-only",
            "ADVANCE_ALLOCATION Payment remains excluded from F1",
            "Direct-sale invoice",
            "Direct-sale receipt",
            "Credit note",
            "Debit note",
            "Direct-sale return",
            "Purchase bill",
            "Vendor payment",
            "Stock receive",
            "Stock adjustment",
            "Stock-out / COGS",
            "Commission accrual",
            "Commission payout",
            "Salary accrual",
            "Salary payment",
            "Rent/lease revenue",
            "Rent/lease collection settlement",
            "Security deposit receipt",
            "Security deposit refund",
            "ReceiptDocument.customer_advance remains F2",
            "CustomerAdvance receipt remains F20",
            "CustomerAdvanceAllocation application remains F21",
            "CustomerAdvanceRefund refund remains F23",
            "Readiness source inventory",
            "Mapping blockers",
            "Finance-account blockers",
            "Numbering blockers",
            "Period blockers",
            "Unsupported source blockers",
            "Posted-unverified not treated as reconciled",
        ]:
            self.assertIn(name, workflows)
            row = workflows[name]
            self.assertTrue(row["source_model"])
            self.assertTrue(row["event_key"])
            self.assertTrue(row["accounting_shape"])
            self.assertTrue(row["operator"])
            self.assertTrue(row["bridge_source_ownership"])
            self.assertTrue(row["expected_candidate_status"])
            self.assertTrue(row["expected_action"]["href"])
            self.assertTrue(row["expected_no_mutation_rule"])
            self.assertTrue(row["expected_reconciliation_posture"])
            self.assertTrue(row["validation_test_name"])
            self.assertFalse(row["can_post"])
            self.assertTrue(row["read_only"])

    def test_customer_advance_phase_separation(self):
        validation = self._validation([
            {"row_type": "bridge_candidate", "source_model": "ReceiptDocument", "event_key": "customer_advance", "status": "READY_UNPOSTED"},
            {"row_type": "bridge_candidate", "source_model": "CustomerAdvance", "event_key": "customer_advance_receipt", "status": "READY_UNPOSTED"},
            {"row_type": "bridge_candidate", "source_model": "CustomerAdvanceAllocation", "event_key": "customer_advance_application", "status": "READY_UNPOSTED"},
            {"row_type": "bridge_candidate", "source_model": "CustomerAdvanceRefund", "event_key": "customer_advance_refund", "status": "READY_UNPOSTED"},
        ])
        workflows = self._by_workflow(validation)

        self.assertTrue(validation["source_event_separation_checks"]["customer_advance_f2_f20_f21_f23_separated"])
        self.assertEqual(workflows["ReceiptDocument.customer_advance remains F2"]["bridge_source_ownership"], "F2 ReceiptDocument bridge")
        self.assertEqual(workflows["CustomerAdvance receipt remains F20"]["bridge_source_ownership"], "F20 CustomerAdvance bridge")
        self.assertEqual(workflows["CustomerAdvanceAllocation application remains F21"]["bridge_source_ownership"], "F21 CustomerAdvanceAllocation bridge")
        self.assertEqual(workflows["CustomerAdvanceRefund refund remains F23"]["bridge_source_ownership"], "F23 CustomerAdvanceRefund bridge")

    def test_rent_lease_and_security_deposit_separation(self):
        validation = self._validation([
            {"row_type": "bridge_candidate", "source_model": "RentLeaseBillingDemand", "event_key": "rent_monthly_revenue", "status": "READY_UNPOSTED"},
            {"row_type": "bridge_candidate", "source_model": "RentLeaseCollection", "event_key": "rent_lease_collection_settlement", "status": "READY_UNPOSTED"},
            {"row_type": "bridge_candidate", "source_model": "RentLeaseDepositTransaction", "event_key": "security_deposit_receipt", "status": "READY_UNPOSTED"},
            {"row_type": "bridge_candidate", "source_model": "RentLeaseDepositTransaction", "event_key": "security_deposit_refund", "status": "READY_UNPOSTED"},
        ])
        workflows = self._by_workflow(validation)

        self.assertTrue(validation["source_event_separation_checks"]["rent_lease_revenue_and_collection_separated"])
        self.assertTrue(validation["source_event_separation_checks"]["security_deposit_f17_f18_separated"])
        self.assertEqual(workflows["Rent/lease revenue"]["bridge_source_ownership"], "F14 RentLeaseBillingDemand bridge")
        self.assertEqual(workflows["Rent/lease collection settlement"]["bridge_source_ownership"], "F15C RentLeaseCollection bridge")
        self.assertEqual(workflows["Security deposit receipt"]["bridge_source_ownership"], "F17 RentLeaseDepositTransaction receipt bridge")
        self.assertEqual(workflows["Security deposit refund"]["bridge_source_ownership"], "F18 RentLeaseDepositTransaction refund bridge")

    def test_emi_subscription_workflows_and_advance_allocation_boundary(self):
        validation = self._validation([
            {"row_type": "bridge_candidate", "source_model": "Payment", "event_key": "subscription_emi_payment", "status": "READY_UNPOSTED"},
            {"row_type": "bridge_candidate", "source_model": "Payment", "event_key": "ADVANCE_ALLOCATION", "status": "READY_UNPOSTED"},
        ])
        workflows = self._by_workflow(validation)

        self.assertEqual(workflows["EMI payment collection"]["status"], "READY_UNPOSTED")
        self.assertEqual(workflows["Winner waiver remains future-EMI-only"]["status"], "VALIDATION_ONLY")
        self.assertEqual(workflows["ADVANCE_ALLOCATION Payment remains excluded from F1"]["status"], "BOUNDARY_VIOLATION")

        clean_validation = self._validation([
            {"row_type": "bridge_candidate", "source_model": "Payment", "event_key": "subscription_emi_payment", "status": "READY_UNPOSTED"},
        ])
        self.assertEqual(
            self._by_workflow(clean_validation)["ADVANCE_ALLOCATION Payment remains excluded from F1"]["status"],
            "EXCLUDED",
        )
        self.assertTrue(clean_validation["source_event_separation_checks"]["advance_allocation_payment_excluded_from_f1"])

    def test_staff_advance_and_unsupported_sources_remain_non_postable(self):
        validation = self._validation([
            {"row_type": "readiness_event", "source_model": "StaffAdvance", "event_key": "staff_advance", "status": "UNSUPPORTED_SOURCE"},
            {"row_type": "readiness_event", "source_model": "AbstractSource", "event_key": "abstract_event", "status": "UNSUPPORTED_SOURCE"},
        ])
        workflows = self._by_workflow(validation)
        staff_advance = workflows["Unsupported source blockers"]

        self.assertEqual(staff_advance["source_model"], "StaffAdvance")
        self.assertEqual(staff_advance["status"], "UNSUPPORTED")
        self.assertFalse(staff_advance["can_post"])
        self.assertTrue(validation["source_event_separation_checks"]["staff_advance_unsupported"])

    def test_posted_unverified_rows_are_not_reconciled(self):
        validation = self._validation([
            {
                "row_type": "bridge_candidate",
                "source_model": "CustomerAdvanceRefund",
                "event_key": "customer_advance_refund",
                "status": "POSTED_UNVERIFIED",
                "posted_unverified": True,
                "reconciliation_state": "POSTED_UNVERIFIED",
            }
        ])
        row = self._by_workflow(validation)["Posted-unverified not treated as reconciled"]

        self.assertEqual(row["status"], "POSTED_UNVERIFIED")
        self.assertEqual(row["posted_unverified_count"], 1)
        self.assertEqual(row["reconciled_count"], 0)

    def test_control_tower_validation_surfaces_and_no_mutation_contract(self):
        validation = self._validation([
            {"row_type": "bridge_candidate", "source_model": "Payment", "event_key": "subscription_emi_payment", "status": "BLOCKED_BY_MAPPING"},
            {"row_type": "bridge_candidate", "source_model": "Payment", "event_key": "subscription_emi_payment", "status": "BLOCKED_BY_FINANCE_ACCOUNT"},
            {"row_type": "bridge_candidate", "source_model": "Payment", "event_key": "subscription_emi_payment", "status": "BLOCKED_BY_NUMBERING"},
            {"row_type": "bridge_candidate", "source_model": "Payment", "event_key": "subscription_emi_payment", "status": "BLOCKED_BY_PERIOD"},
            {"row_type": "bridge_candidate", "source_model": "Payment", "event_key": "subscription_emi_payment", "status": "READY_UNPOSTED"},
        ])
        workflows = self._by_workflow(validation)

        self.assertEqual(workflows["Mapping blockers"]["expected_action"]["key"], "mapping_audit")
        self.assertEqual(workflows["Finance-account blockers"]["expected_action"]["key"], "finance_accounts")
        self.assertEqual(workflows["Numbering blockers"]["expected_action"]["key"], "journal_numbering")
        self.assertEqual(workflows["Period blockers"]["expected_action"]["key"], "accounting_periods")
        self.assertEqual(workflows["Readiness source inventory"]["expected_action"]["key"], "bridge_posting")
        self.assertTrue(validation["read_only"])
        self.assertFalse(validation["creates_journal_entry"])
        self.assertFalse(validation["creates_accounting_bridge_posting"])
        self.assertFalse(validation["auto_posts"])
        self.assertFalse(validation["auto_reconciles"])
        self.assertFalse(validation["auto_closes_period"])
        self.assertFalse(validation["mutates_sources"])

    def test_api_validation_does_not_create_accounting_rows_or_mutate_source_records(self):
        ensure_test_accounting_posting_prerequisites(timezone.localdate(), performed_by=self.admin)
        finance_account = ensure_default_payment_collection_accounts()["CASH"]
        customer_user = create_customer_user(username="phase_f25_customer", phone="9306250002")
        customer = create_customer_profile(user=customer_user, phone="9306250002")
        product = create_product(product_code="PHASE-F25-PRODUCT")
        batch = create_batch(batch_code="PHASE-F25-BATCH")
        lucky_id = create_lucky_id(batch=batch, lucky_number=25)
        subscription = create_subscription(customer=customer, product=product, batch=batch, lucky_id=lucky_id)
        emi = create_emi(subscription=subscription, due_date=timezone.localdate())
        payment = Payment.objects.create(
            customer=customer,
            subscription=subscription,
            emi=emi,
            amount=Decimal("1000.00"),
            method=PaymentMethod.CASH,
            reference_no="PHASE-F25-PAY",
            payment_date=timezone.localdate(),
            finance_account=finance_account,
            collected_by=self.admin,
        )
        before = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
            "amount": payment.amount,
            "method": payment.method,
            "reference_no": payment.reference_no,
        }

        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("production_accounting_validation", response.data)
        validation = response.data["production_accounting_validation"]
        self.assertTrue(validation["read_only"])
        self.assertFalse(validation["creates_journal_entry"])
        self.assertFalse(validation["creates_accounting_bridge_posting"])
        self.assertFalse(validation["mutates_sources"])
        payment.refresh_from_db()
        after = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
            "amount": payment.amount,
            "method": payment.method,
            "reference_no": payment.reference_no,
        }
        self.assertEqual(after, before)
