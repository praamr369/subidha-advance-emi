from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    AccountingBridgePosting,
    AccountingPostingProfile,
    DocumentSequence,
    EmployeeAttendance,
    EmployeeProfile,
    JournalEntry,
    PayrollPeriod,
    SalaryPayment,
    SalarySheet,
    SalarySheetStatus,
)
from accounting.services.document_sequence_service import DocumentType
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user


class AccountingBridgePayrollAccrualPhaseF12Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f12_payroll_admin", phone="9304901201")
        self.cashier = create_cashier_user(username="phase_f12_payroll_cashier", phone="9304901202")
        self.client.force_authenticate(user=self.admin)
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.payroll_period = PayrollPeriod.objects.create(
            code=f"PAY-F12-{self.today:%Y%m}",
            year=self.today.year,
            month=self.today.month,
            start_date=self.env["accounting_period"].start_date,
            end_date=self.env["accounting_period"].end_date,
        )
        self.employee_counter = 0

    def _salary_sheet(self, *, amount=Decimal("1800.00"), deductions=Decimal("0.00"), status_value=SalarySheetStatus.APPROVED, code_suffix="A"):
        self.employee_counter += 1
        employee = EmployeeProfile.objects.create(
            employee_code=f"EMP-F12-{self.employee_counter:03d}",
            name=f"F12 Payroll Staff {self.employee_counter}",
            joining_date=self.env["accounting_period"].start_date,
            base_salary=amount,
            payroll_eligible=True,
        )
        EmployeeAttendance.objects.create(
            employee=employee,
            attendance_date=self.payroll_period.start_date,
            worked_hours=Decimal("8.00"),
            recorded_by=self.admin,
        )
        return SalarySheet.objects.create(
            employee=employee,
            payroll_period=self.payroll_period,
            year=self.payroll_period.year,
            month=self.payroll_period.month,
            gross_amount=amount,
            deductions_amount=deductions,
            net_amount=amount - deductions,
            status=status_value,
        )

    def _candidate_id(self, sheet, event_key="salary_accrual"):
        return f"salarysheet:{sheet.id}:{event_key}"

    def _snapshot(self, sheet):
        sheet.refresh_from_db()
        employee = sheet.employee
        employee.refresh_from_db()
        return {
            "sheet": {
                "status": sheet.status,
                "gross_amount": sheet.gross_amount,
                "deductions_amount": sheet.deductions_amount,
                "net_amount": sheet.net_amount,
                "posted_journal_entry_id": sheet.posted_journal_entry_id,
            },
            "employee": {
                "name": employee.name,
                "payroll_eligible": employee.payroll_eligible,
                "base_salary": employee.base_salary,
                "payment_mode": employee.payment_mode,
            },
            "attendance_count": EmployeeAttendance.objects.filter(employee=employee).count(),
            "salary_payment_count": SalaryPayment.objects.filter(salary_sheet=sheet).count(),
        }

    def test_candidate_generation_for_concrete_salary_sheet(self):
        sheet = self._salary_sheet()
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=SalarySheet")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = next(item for item in response.data["results"] if item.get("source_pk") == sheet.id)
        self.assertEqual(row["source_model"], "SalarySheet")
        self.assertEqual(row["event_key"], "salary_accrual")
        self.assertEqual(row["status"], "READY_UNPOSTED")
        self.assertEqual(row["staff_name"], sheet.employee.name)
        self.assertEqual(row["payroll_period_code"], self.payroll_period.code)
        self.assertEqual(row["gross_salary"], "1800.00")
        self.assertEqual(row["payable_amount"], "1800.00")
        self.assertTrue(row["can_preview"])
        self.assertTrue(row["can_post"])
        self.assertEqual(response.data["summary"]["payroll_ready_unposted_count"], 1)

    def test_unapproved_and_deducted_salary_sheets_are_not_postable(self):
        draft = self._salary_sheet(status_value=SalarySheetStatus.DRAFT)
        deducted = self._salary_sheet(amount=Decimal("2000.00"), deductions=Decimal("200.00"))
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=SalarySheet")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        rows = {item["source_pk"]: item for item in response.data["results"] if item.get("source_model") == "SalarySheet"}
        self.assertEqual(rows[draft.id]["status"], "BLOCKED_BY_APPROVAL")
        self.assertEqual(rows[deducted.id]["status"], "UNSUPPORTED_SOURCE")
        self.assertFalse(rows[draft.id]["can_post"])
        self.assertFalse(rows[deducted.id]["can_post"])

    def test_preview_is_read_only_balanced_and_does_not_consume_numbering(self):
        sheet = self._salary_sheet()
        before = {
            "source": self._snapshot(sheet),
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(sheet)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "SalarySheet")
        self.assertEqual(response.data["source"]["staff_name"], sheet.employee.name)
        self.assertEqual(response.data["total_debit"], "1800.00")
        self.assertEqual(response.data["total_credit"], "1800.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertIn("does not edit payroll, staff, attendance, staff advance, or payment records", response.data["safety_text"])
        after = {
            "source": self._snapshot(sheet),
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        self.assertEqual(after, before)

    def test_post_creates_journal_bridge_pending_item_and_does_not_mutate_payroll_staff_attendance_or_payment(self):
        sheet = self._salary_sheet()
        before_source = self._snapshot(sheet)
        candidate_id = self._candidate_id(sheet)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        response = self.client.post(
            f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/",
            {"idempotency_key": preview["idempotency_key"], "confirm": True, "posting_note": "F12 payroll accrual test"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["posted"])
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="SalarySheet", source_id=str(sheet.id), purpose="SALARY_ACCRUAL").count(), 1)
        journal = JournalEntry.objects.get(pk=response.data["journal_entry"]["id"])
        self.assertEqual(journal.source_model, "SalarySheet")
        self.assertEqual(journal.source_id, str(sheet.id))
        self.assertEqual(journal.voucher_type, "SALARY_ACCRUAL")
        item = ReconciliationItem.objects.get(source_type="SalarySheet", source_id=str(sheet.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._snapshot(sheet), before_source)
        self.assertFalse(SalaryPayment.objects.filter(salary_sheet=sheet).exists())

    def test_idempotency_mapping_numbering_non_admin_and_verify(self):
        sheet = self._salary_sheet()
        candidate_id = self._candidate_id(sheet)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        payload = {"idempotency_key": preview["idempotency_key"], "confirm": True}
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        duplicate = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertFalse(second.data["posted"])
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

        before_verify = self._snapshot(sheet)
        item_id = first.data["reconciliation_item"]["id"]
        verify = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item_id}/verify/", {"note": "verified"}, format="json")
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        self.assertEqual(ReconciliationItem.objects.get(pk=item_id).status, ReconciliationItemStatus.MATCHED)
        self.assertEqual(self._snapshot(sheet), before_verify)

        blocked = self._salary_sheet(amount=Decimal("1900.00"))
        blocked_id = self._candidate_id(blocked)
        AccountingPostingProfile.objects.filter(key="SALARY_EXPENSE").update(is_active=False)
        missing_mapping = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{blocked_id}/post/", {"idempotency_key": "x", "confirm": True}, format="json")
        self.assertEqual(missing_mapping.status_code, status.HTTP_400_BAD_REQUEST)
        AccountingPostingProfile.objects.filter(key="SALARY_EXPENSE").update(is_active=True)
        DocumentSequence.objects.filter(document_type=DocumentType.JOURNAL_ENTRY).update(is_active=False)
        blocked_preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{blocked_id}/preview/").data
        missing_numbering = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{blocked_id}/post/", {"idempotency_key": blocked_preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(missing_numbering.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(user=self.cashier)
        non_admin = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        self.assertIn(non_admin.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_batch_preview_post_and_reconciliation_run_detects_unposted_and_posted_unverified(self):
        sheet = self._salary_sheet()
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F12_TEST", module="ACCOUNTING_BRIDGE", date_from=self.payroll_period.end_date, date_to=self.payroll_period.end_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run, source_type="SalarySheet", source_id=str(sheet.id), exception_code="SALARY_SHEET_MISSING_ACCOUNTING_BRIDGE_POSTING").exists())

        candidate_id = self._candidate_id(sheet)
        batch_preview = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-preview/", {"candidate_ids": [candidate_id]}, format="json")
        self.assertEqual(batch_preview.status_code, status.HTTP_200_OK, batch_preview.data)
        key = batch_preview.data["previews"][0]["idempotency_key"]
        batch_post = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-post/", {"candidate_ids": [candidate_id], "idempotency_keys": {candidate_id: key}, "confirm": True}, format="json")
        self.assertEqual(batch_post.status_code, status.HTTP_200_OK, batch_post.data)
        self.assertEqual(batch_post.data["posted_count"], 1)

        run2 = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F12_TEST_POSTED", module="ACCOUNTING_BRIDGE", date_from=self.payroll_period.end_date, date_to=self.payroll_period.end_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run2, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run2, source_type="SalarySheet", source_id=str(sheet.id), exception_code="POSTED_UNVERIFIED").exists())
