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


class AccountingBridgeSalaryPaymentPhaseF13Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f13_salary_payment_admin", phone="9304901301")
        self.cashier = create_cashier_user(username="phase_f13_salary_payment_cashier", phone="9304901302")
        self.client.force_authenticate(user=self.admin)
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.payroll_period = PayrollPeriod.objects.create(
            code=f"PAY-F13-{self.today:%Y%m}",
            year=self.today.year,
            month=self.today.month,
            start_date=self.env["accounting_period"].start_date,
            end_date=self.env["accounting_period"].end_date,
        )
        self.employee_counter = 0

    def _salary_sheet(self, *, amount=Decimal("1800.00"), status_value=SalarySheetStatus.APPROVED):
        self.employee_counter += 1
        employee = EmployeeProfile.objects.create(
            employee_code=f"EMP-F13-{self.employee_counter:03d}",
            name=f"F13 Payroll Staff {self.employee_counter}",
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
            deductions_amount=Decimal("0.00"),
            net_amount=amount,
            status=status_value,
        )

    def _salary_payment(self, *, amount=Decimal("700.00"), finance_account=None):
        sheet = self._salary_sheet()
        return SalaryPayment.objects.create(
            salary_sheet=sheet,
            payment_date=self.env["accounting_period"].start_date,
            amount=amount,
            finance_account=finance_account or self.env["finance_account"],
            reference_no=f"SALPAY-F13-{self.employee_counter:03d}",
        )

    def _candidate_id(self, payment, event_key="salary_payment"):
        return f"salarypayment:{payment.id}:{event_key}"

    def _snapshot(self, payment):
        payment.refresh_from_db()
        sheet = payment.salary_sheet
        sheet.refresh_from_db()
        employee = sheet.employee
        employee.refresh_from_db()
        return {
            "payment": {
                "salary_sheet_id": payment.salary_sheet_id,
                "payment_date": payment.payment_date,
                "amount": payment.amount,
                "branch_id": payment.branch_id,
                "finance_account_id": payment.finance_account_id,
                "reference_no": payment.reference_no,
                "posted_journal_entry_id": payment.posted_journal_entry_id,
            },
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
        }

    def test_candidate_generation_for_concrete_salary_payment(self):
        payment = self._salary_payment()
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=SalaryPayment")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = next(item for item in response.data["results"] if item.get("source_pk") == payment.id)
        self.assertEqual(row["source_model"], "SalaryPayment")
        self.assertEqual(row["event_key"], "salary_payment")
        self.assertEqual(row["status"], "READY_UNPOSTED")
        self.assertEqual(row["staff_name"], payment.salary_sheet.employee.name)
        self.assertEqual(row["linked_salary_sheet_reference"], row["salary_reference"])
        self.assertEqual(row["salary_payment_amount"], "700.00")
        self.assertEqual(row["finance_account_name"], self.env["finance_account"].name)
        self.assertTrue(row["can_preview"])
        self.assertTrue(row["can_post"])
        self.assertEqual(response.data["summary"]["salary_payment_ready_unposted_count"], 1)

    def test_preview_is_read_only_balanced_and_does_not_consume_numbering(self):
        payment = self._salary_payment()
        before = {
            "source": self._snapshot(payment),
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(payment)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "SalaryPayment")
        self.assertEqual(response.data["source"]["staff_name"], payment.salary_sheet.employee.name)
        self.assertEqual(response.data["total_debit"], "700.00")
        self.assertEqual(response.data["total_credit"], "700.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertIn("does not edit salary payment, salary sheet, staff, attendance, or StaffAdvance records", response.data["safety_text"])
        after = {
            "source": self._snapshot(payment),
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        self.assertEqual(after, before)

    def test_post_creates_journal_bridge_pending_item_and_does_not_mutate_salary_sources(self):
        payment = self._salary_payment()
        before_source = self._snapshot(payment)
        candidate_id = self._candidate_id(payment)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        response = self.client.post(
            f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/",
            {"idempotency_key": preview["idempotency_key"], "confirm": True, "posting_note": "F13 salary payment test"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["posted"])
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="SalaryPayment", source_id=str(payment.id), purpose="SALARY_PAYMENT").count(), 1)
        journal = JournalEntry.objects.get(pk=response.data["journal_entry"]["id"])
        self.assertEqual(journal.source_model, "SalaryPayment")
        self.assertEqual(journal.source_id, str(payment.id))
        self.assertEqual(journal.voucher_type, "SALARY_PAYMENT")
        item = ReconciliationItem.objects.get(source_type="SalaryPayment", source_id=str(payment.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._snapshot(payment), before_source)

    def test_idempotency_mapping_numbering_non_admin_and_legacy_posted_payment_block(self):
        payment = self._salary_payment()
        candidate_id = self._candidate_id(payment)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        payload = {"idempotency_key": preview["idempotency_key"], "confirm": True}
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        duplicate = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertFalse(second.data["posted"])
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

        blocked = self._salary_payment(amount=Decimal("800.00"))
        blocked_id = self._candidate_id(blocked)
        AccountingPostingProfile.objects.filter(key="SALARY_PAYABLE").update(is_active=False)
        missing_mapping = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{blocked_id}/post/", {"idempotency_key": "x", "confirm": True}, format="json")
        self.assertEqual(missing_mapping.status_code, status.HTTP_400_BAD_REQUEST)
        AccountingPostingProfile.objects.filter(key="SALARY_PAYABLE").update(is_active=True)
        DocumentSequence.objects.filter(document_type=DocumentType.JOURNAL_ENTRY).update(is_active=False)
        blocked_preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{blocked_id}/preview/").data
        missing_numbering = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{blocked_id}/post/", {"idempotency_key": blocked_preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(missing_numbering.status_code, status.HTTP_400_BAD_REQUEST)
        DocumentSequence.objects.filter(document_type=DocumentType.JOURNAL_ENTRY).update(is_active=True)

        legacy = self._salary_payment(amount=Decimal("900.00"))
        legacy.posted_journal_entry = JournalEntry.objects.get(pk=first.data["journal_entry"]["id"])
        legacy.save(update_fields=["posted_journal_entry", "updated_at"])
        legacy_row = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=SalaryPayment").data["results"]
        legacy_candidate = next(item for item in legacy_row if item.get("source_pk") == legacy.id)
        self.assertEqual(legacy_candidate["status"], "UNSUPPORTED_SOURCE")
        self.assertFalse(legacy_candidate["can_post"])

        self.client.force_authenticate(user=self.cashier)
        non_admin = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        self.assertIn(non_admin.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_reconciliation_run_detects_unposted_and_posted_unverified_salary_payment(self):
        payment = self._salary_payment()
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F13_TEST", module="ACCOUNTING_BRIDGE", date_from=payment.payment_date, date_to=payment.payment_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run, source_type="SalaryPayment", source_id=str(payment.id), exception_code="SALARY_PAYMENT_MISSING_ACCOUNTING_BRIDGE_POSTING").exists())

        candidate_id = self._candidate_id(payment)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        response = self.client.post(
            f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/",
            {"idempotency_key": preview["idempotency_key"], "confirm": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        run2 = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F13_TEST_POSTED", module="ACCOUNTING_BRIDGE", date_from=payment.payment_date, date_to=payment.payment_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run2, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run2, source_type="SalaryPayment", source_id=str(payment.id), exception_code="POSTED_UNVERIFIED").exists())
