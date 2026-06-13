from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, JournalEntry
from accounting.services.accounting_bridge_reconciliation_read_service import _phase_f_control_tower
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


READY_PERIOD = {"financial_year_ready": True, "accounting_period_ready": True, "journal_numbering_ready": True, "posting_controls_ready": True}


class PhaseFControlTowerCloseoutF24Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f24_admin", phone="9305240001")
        self.client.force_authenticate(user=self.admin)

    def _tower(self, rows, period_readiness=None, blockers=None):
        return _phase_f_control_tower(rows, period_readiness or READY_PERIOD, blockers or [])

    def test_phase_f_source_inventory_contains_all_supported_models_and_events(self):
        tower = self._tower([])
        inventory = tower["source_inventory"]
        by_model = {}
        for item in inventory:
            by_model.setdefault(item["source_model"], set()).update(item["event_keys"])

        for model in [
            "Payment",
            "ReceiptDocument",
            "BillingInvoice",
            "BillingCreditNote",
            "DirectSaleReturn",
            "BillingDebitNote",
            "PurchaseBill",
            "VendorPayment",
            "StockLedger",
            "Commission",
            "CommissionPayoutBatch",
            "SalarySheet",
            "SalaryPayment",
            "RentLeaseBillingDemand",
            "RentLeaseCollection",
            "RentLeaseDepositTransaction",
            "CustomerAdvance",
            "CustomerAdvanceAllocation",
            "CustomerAdvanceRefund",
        ]:
            self.assertIn(model, by_model)

        self.assertIn("subscription_emi_payment", by_model["Payment"])
        self.assertIn("customer_advance", by_model["ReceiptDocument"])
        self.assertIn("customer_advance_receipt", by_model["CustomerAdvance"])
        self.assertIn("customer_advance_application", by_model["CustomerAdvanceAllocation"])
        self.assertIn("customer_advance_refund", by_model["CustomerAdvanceRefund"])
        self.assertIn("security_deposit_receipt", by_model["RentLeaseDepositTransaction"])
        self.assertIn("security_deposit_refund", by_model["RentLeaseDepositTransaction"])
        self.assertIn("rent_monthly_revenue", by_model["RentLeaseBillingDemand"])
        self.assertIn("rent_lease_collection_settlement", by_model["RentLeaseCollection"])

    def test_readiness_contract_states_and_group_counts_are_read_only(self):
        rows = [
            {"row_type": "bridge_candidate", "source_model": "Payment", "event_key": "subscription_emi_payment", "status": "READY_UNPOSTED"},
            {"row_type": "bridge_candidate", "source_model": "BillingInvoice", "event_key": "direct_sale_invoice", "status": "BLOCKED_BY_MAPPING", "blocker_code": "MAPPING_NOT_READY"},
            {"row_type": "bridge_candidate", "source_model": "CustomerAdvanceRefund", "event_key": "customer_advance_refund", "status": "POSTED_UNVERIFIED", "posted_unverified": True},
        ]
        tower = self._tower(rows)

        self.assertTrue(tower["guardrails"]["read_only"])
        self.assertFalse(tower["readiness"]["creates_journal_entry"])
        self.assertFalse(tower["readiness"]["creates_accounting_bridge_posting"])
        self.assertFalse(tower["readiness"]["auto_posts"])
        self.assertFalse(tower["readiness"]["auto_reconciles"])
        self.assertFalse(tower["readiness"]["auto_closes_period"])
        self.assertFalse(tower["readiness"]["mutates_sources"])
        self.assertEqual(tower["readiness"]["state"], "ACTION_REQUIRED")
        self.assertIn("POSTED_UNVERIFIED_EXISTS", tower["readiness"]["states"])
        self.assertGreater(tower["groups"]["Cash/receipt/payment"]["ready_unposted"], 0)
        self.assertGreater(tower["groups"]["Billing/invoice/returns"]["blocked"], 0)
        self.assertGreater(tower["groups"]["Customer advance"]["posted_unverified"], 0)

    def test_blocked_rows_surface_setup_action_links(self):
        rows = [
            {"row_type": "bridge_candidate", "source_model": "Payment", "event_key": "subscription_emi_payment", "status": "BLOCKED_BY_MAPPING", "blocker_code": "MAPPING_NOT_READY"},
            {"row_type": "bridge_candidate", "source_model": "Payment", "event_key": "subscription_emi_payment", "status": "BLOCKED_BY_FINANCE_ACCOUNT", "blocker_code": "FINANCE_ACCOUNT_NOT_READY"},
            {"row_type": "bridge_candidate", "source_model": "Payment", "event_key": "subscription_emi_payment", "status": "BLOCKED_BY_NUMBERING", "blocker_code": "JOURNAL_NUMBERING_NOT_READY"},
            {"row_type": "bridge_candidate", "source_model": "Payment", "event_key": "subscription_emi_payment", "status": "BLOCKED_BY_PERIOD", "blocker_code": "ACCOUNTING_PERIOD_NOT_READY"},
        ]
        payment = next(item for item in self._tower(rows)["source_inventory"] if item["phase"] == "F1" and item["source_model"] == "Payment")
        link_keys = {link["key"] for link in payment["action_links"]}
        self.assertEqual(payment["status"], "BLOCKED")
        self.assertIn("mapping_audit", link_keys)
        self.assertIn("finance_accounts", link_keys)
        self.assertIn("journal_numbering", link_keys)
        self.assertIn("accounting_periods", link_keys)

    def test_posted_unverified_unsupported_and_separation_boundaries(self):
        rows = [
            {"row_type": "bridge_candidate", "source_model": "Payment", "event_key": "payment_skipped_not_applicable", "status": "SKIPPED_NOT_APPLICABLE"},
            {"row_type": "bridge_candidate", "source_model": "ReceiptDocument", "event_key": "customer_advance", "status": "READY_UNPOSTED"},
            {"row_type": "bridge_candidate", "source_model": "CustomerAdvance", "event_key": "customer_advance_receipt", "status": "READY_UNPOSTED"},
            {"row_type": "bridge_candidate", "source_model": "CustomerAdvanceAllocation", "event_key": "customer_advance_application", "status": "READY_UNPOSTED"},
            {"row_type": "bridge_candidate", "source_model": "CustomerAdvanceRefund", "event_key": "customer_advance_refund", "status": "POSTED_UNVERIFIED", "posted_unverified": True},
            {"row_type": "bridge_candidate", "source_model": "RentLeaseDepositTransaction", "event_key": "security_deposit_receipt", "status": "READY_UNPOSTED"},
            {"row_type": "bridge_candidate", "source_model": "RentLeaseDepositTransaction", "event_key": "security_deposit_refund", "status": "READY_UNPOSTED"},
            {"row_type": "bridge_candidate", "source_model": "RentLeaseBillingDemand", "event_key": "rent_monthly_revenue", "status": "READY_UNPOSTED"},
            {"row_type": "bridge_candidate", "source_model": "RentLeaseCollection", "event_key": "rent_lease_collection_settlement", "status": "READY_UNPOSTED"},
        ]
        inventory = self._tower(rows)["source_inventory"]
        staff_advance = next(item for item in inventory if item["source_model"] == "StaffAdvance")
        f23 = next(item for item in inventory if item["phase"] == "F23")
        f2 = next(item for item in inventory if item["phase"] == "F2")
        f20 = next(item for item in inventory if item["phase"] == "F20")

        self.assertEqual(staff_advance["status"], "UNSUPPORTED")
        self.assertFalse(staff_advance["can_post"])
        self.assertEqual(f23["status"], "POSTED_UNVERIFIED")
        self.assertEqual(f23["counts"]["reconciled"], 0)
        self.assertEqual(f2["counts"]["ready_unposted"], 1)
        self.assertEqual(f20["counts"]["ready_unposted"], 1)

    def test_api_control_tower_readiness_does_not_create_accounting_rows_or_mutate_payment(self):
        ensure_test_accounting_posting_prerequisites(timezone.localdate(), performed_by=self.admin)
        finance_account = ensure_default_payment_collection_accounts()["CASH"]
        customer_user = create_customer_user(username="phase_f24_customer", phone="9305240002")
        customer = create_customer_profile(user=customer_user, phone="9305240002")
        product = create_product(product_code="PHASE-F24-PRODUCT")
        batch = create_batch(batch_code="PHASE-F24-BATCH")
        lucky_id = create_lucky_id(batch=batch, lucky_number=24)
        subscription = create_subscription(customer=customer, product=product, batch=batch, lucky_id=lucky_id)
        emi = create_emi(subscription=subscription, due_date=timezone.localdate())
        payment = Payment.objects.create(
            customer=customer,
            subscription=subscription,
            emi=emi,
            amount=Decimal("1000.00"),
            method=PaymentMethod.CASH,
            reference_no="PHASE-F24-PAY",
            payment_date=timezone.localdate(),
            finance_account=finance_account,
            collected_by=self.admin,
        )
        before = {
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "amount": payment.amount,
            "method": payment.method,
            "reference_no": payment.reference_no,
        }

        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("phase_f_control_tower", response.data)
        self.assertTrue(response.data["phase_f_control_tower"]["readiness"]["read_only"])
        payment.refresh_from_db()
        after = {
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "amount": payment.amount,
            "method": payment.method,
            "reference_no": payment.reference_no,
        }
        self.assertEqual(after, before)
