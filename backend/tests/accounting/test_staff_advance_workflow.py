from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import EmployeeProfile, JournalEntryStatus, StaffAdvance, StaffAdvanceStatus
from accounting.services.accounting_bridge_reconciliation_purchase_bill_read_service import (
    BridgeReconciliationFilters,
    build_accounting_bridge_reconciliation,
)
from accounting.services.staff_advance_service import approve_staff_advance, disburse_staff_advance, recover_staff_advance
from accounting.services.year_end_close_service import build_year_end_close_readiness
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user


class StaffAdvanceWorkflowTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="staff_advance_admin", phone="9000004701")
        self.env = seed_bridge_ready_environment(timezone.localdate(), performed_by=self.admin)
        self.employee = EmployeeProfile.objects.create(name="Advance Test Staff", joining_date=timezone.localdate(), payroll_eligible=True, base_salary=Decimal("10000.00"), salary_effective_from=timezone.localdate())
        self.advance = StaffAdvance.objects.create(employee=self.employee, request_date=timezone.localdate(), amount=Decimal("1000.00"), reason="Emergency advance")

    def test_approve_disburse_and_recover_posts_balanced_journals(self):
        approve_staff_advance(staff_advance_id=self.advance.id, performed_by=self.admin)
        disbursed = disburse_staff_advance(staff_advance_id=self.advance.id, finance_account=self.env["finance_account"], disbursement_date=timezone.localdate(), reference_no="ADV-1", performed_by=self.admin)
        self.assertEqual(disbursed.status, StaffAdvanceStatus.DISBURSED)
        self.assertEqual(disbursed.posted_journal_entry.status, JournalEntryStatus.POSTED)
        lines = list(disbursed.posted_journal_entry.lines.all())
        self.assertEqual(sum((line.debit_amount for line in lines), Decimal("0.00")), Decimal("1000.00"))
        self.assertEqual(sum((line.credit_amount for line in lines), Decimal("0.00")), Decimal("1000.00"))

        recovery = recover_staff_advance(staff_advance_id=self.advance.id, amount="400.00", finance_account=self.env["finance_account"], recovery_date=timezone.localdate(), reference_no="REC-1", performed_by=self.admin)
        self.assertEqual(recovery.posted_journal_entry.status, JournalEntryStatus.POSTED)
        self.advance.refresh_from_db()
        self.assertEqual(self.advance.recovered_amount, Decimal("400.00"))
        self.assertEqual(self.advance.status, StaffAdvanceStatus.PARTIALLY_RECOVERED)

    def test_recovery_cannot_exceed_outstanding(self):
        approve_staff_advance(staff_advance_id=self.advance.id, performed_by=self.admin)
        disburse_staff_advance(staff_advance_id=self.advance.id, finance_account=self.env["finance_account"], disbursement_date=timezone.localdate(), reference_no="ADV-2", performed_by=self.admin)
        with self.assertRaisesMessage(ValueError, "cannot exceed"):
            recover_staff_advance(staff_advance_id=self.advance.id, amount="1000.01", finance_account=self.env["finance_account"], recovery_date=timezone.localdate(), reference_no="REC-2", performed_by=self.admin)

    def test_bridge_reconciliation_reports_disbursed_advance_as_supported(self):
        approve_staff_advance(staff_advance_id=self.advance.id, performed_by=self.admin)
        disburse_staff_advance(
            staff_advance_id=self.advance.id,
            finance_account=self.env["finance_account"],
            disbursement_date=timezone.localdate(),
            reference_no="ADV-BRIDGE-1",
            performed_by=self.admin,
        )

        payload = build_accounting_bridge_reconciliation(
            BridgeReconciliationFilters(source_model="StaffAdvance")
        )
        staff_rows = [row for row in payload["results"] if row.get("source_model") == "StaffAdvance"]
        workflow = next(
            row
            for row in payload["production_accounting_validation"]["workflows"]
            if row.get("source_model") == "StaffAdvance"
        )

        self.assertEqual(len(staff_rows), 1)
        self.assertEqual(staff_rows[0]["status"], "POSTED")
        self.assertNotIn(staff_rows[0]["status"], {"UNSUPPORTED", "UNSUPPORTED_SOURCE"})
        self.assertEqual(workflow["workflow"], "Staff advance disbursement")
        self.assertEqual(workflow["status"], "POSTED_UNVERIFIED")
        self.assertEqual(workflow["current_row_count"], 1)
        self.assertEqual(workflow["posted_unverified_count"], 1)
        self.assertEqual(payload["summary"]["staff_advance_boundary"], 0)
        self.assertEqual(payload["summary"]["staff_advance_posted_unverified_count"], 1)
        self.assertEqual(payload["summary"]["posted_unverified_count"], 1)
        self.assertEqual(payload["summary"]["unsupported_count"], 0)

        close_readiness = build_year_end_close_readiness(self.env["financial_year"].id)
        self.assertEqual(close_readiness["staff_advance_boundary"], 0)
        self.assertEqual(close_readiness["unsupported_source_count"], 0)
