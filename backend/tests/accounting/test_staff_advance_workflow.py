from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import EmployeeProfile, JournalEntryStatus, StaffAdvance, StaffAdvanceStatus
from accounting.services.staff_advance_service import approve_staff_advance, disburse_staff_advance, recover_staff_advance
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
