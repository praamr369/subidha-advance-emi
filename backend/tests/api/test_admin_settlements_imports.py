from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import MoneyMovement
from reconciliation.models import ReconciliationItem
from settlements.models import (
    BankStatementImport,
    BankStatementLine,
    SettlementAllocation,
    UpiSettlementImport,
    UpiSettlementLine,
)
from subscriptions.models import Payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_emi,
    create_finance_account,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class AdminSettlementImportApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="settlement_import_admin", phone="9301000001")
        self.cashier = create_cashier_user(username="settlement_import_cashier", phone="9301000002")
        self.partner = create_partner_user(username="settlement_import_partner", phone="9301000003")
        self.bank_account = create_finance_account(code="SETTLE-API-BANK-001", name="API Settlement Bank", kind="BANK")
        self.upi_account = create_finance_account(code="SETTLE-API-UPI-001", name="API Settlement UPI", kind="UPI")

        self.customer = create_customer_profile(name="Settlement Import Customer", phone="9301000010")
        self.product = create_product(name="Settlement Import Product", product_code="SETTLE-API-PROD-01", base_price=Decimal("1000.00"))
        self.batch = create_batch(batch_code="SETTLEAPI2026", duration_months=1, total_slots=100, draw_day=5, start_date=date(2026, 5, 1))
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=7)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=1,
            start_date=date(2026, 5, 1),
        )
        self.emi = create_emi(subscription=self.subscription, month_no=1, amount=Decimal("1000.00"), due_date=date(2026, 5, 5))
        self.payment = Payment.objects.create(
            customer=self.customer,
            subscription=self.subscription,
            emi=self.emi,
            amount=Decimal("1000.00"),
            method="CASH",
            reference_no="SETTLE-IMPORT-PAY-001",
            payment_date=date(2026, 5, 2),
            collected_by=self.admin,
            finance_account=self.bank_account,
        )
        self.movement = MoneyMovement.objects.create(
            movement_date=date(2026, 5, 2),
            from_finance_account=self.bank_account,
            to_finance_account=self.upi_account,
            amount=Decimal("100.00"),
            reference_no="SETTLE-IMPORT-MOV-001",
            status="DRAFT",
        )

        # ReceiptDocument is imported locally to avoid forcing import wiring in tests.
        from billing.models import ReceiptDocument

        self.receipt = ReceiptDocument.objects.create(
            receipt_no="RCT-SETTLE-IMPORT-001",
            receipt_type="EMI_PAYMENT_RECEIPT",
            status="DRAFT",
            receipt_date=date(2026, 5, 2),
            amount=Decimal("1000.00"),
            payment=self.payment,
            finance_account=self.bank_account,
        )

    def test_admin_bank_csv_upload_creates_import_and_lines_and_preserves_raw_payload(self):
        self.client.force_authenticate(self.admin)

        csv_body = (
            "transaction_date,description,debit,credit,value_date,reference_no,balance\n"
            "2026-05-02,NEFT REF 123,0.00,1000.00,2026-05-02,UTR123,5000.00\n"
        )
        upload = SimpleUploadedFile("bank.csv", csv_body.encode("utf-8"), content_type="text/csv")

        before_payment_amount = self.payment.amount
        before_payment_ref = self.payment.reference_no
        before_receipt_amount = self.receipt.amount
        before_movement_amount = self.movement.amount

        resp = self.client.post(
            "/api/v1/admin/settlements/bank-imports/",
            {
                "bank_finance_account": self.bank_account.id,
                "statement_period_from": "2026-05-01",
                "statement_period_to": "2026-05-31",
                "uploaded_file": upload,
            },
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIn("id", resp.data)
        self.assertTrue(resp.data.get("checksum"))

        imp = BankStatementImport.objects.get(pk=resp.data["id"])
        self.assertEqual(imp.bank_finance_account_id, self.bank_account.id)
        self.assertEqual(imp.status, "PARSED")
        self.assertEqual(BankStatementLine.objects.filter(statement_import=imp).count(), 1)

        line = BankStatementLine.objects.get(statement_import=imp)
        self.assertIn("transaction_date", line.raw_payload)
        self.assertEqual(line.raw_payload["reference_no"], "UTR123")

        self.assertEqual(SettlementAllocation.objects.count(), 0)
        self.assertEqual(ReconciliationItem.objects.count(), 0)

        self.payment.refresh_from_db()
        self.receipt.refresh_from_db()
        self.movement.refresh_from_db()
        self.assertEqual(self.payment.amount, before_payment_amount)
        self.assertEqual(self.payment.reference_no, before_payment_ref)
        self.assertEqual(self.receipt.amount, before_receipt_amount)
        self.assertEqual(self.movement.amount, before_movement_amount)

    def test_admin_upi_csv_upload_creates_import_and_lines(self):
        self.client.force_authenticate(self.admin)

        csv_body = (
            "transaction_ref,gross_amount,net_amount,settlement_date,payment_ref,fee_amount\n"
            "TXN001,100.00,98.00,2026-05-02,PAY001,2.00\n"
        )
        upload = SimpleUploadedFile("upi.csv", csv_body.encode("utf-8"), content_type="text/csv")

        resp = self.client.post(
            "/api/v1/admin/settlements/upi-imports/",
            {
                "upi_finance_account": self.upi_account.id,
                "settlement_date": "2026-05-02",
                "uploaded_file": upload,
            },
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertTrue(resp.data.get("checksum"))
        imp = UpiSettlementImport.objects.get(pk=resp.data["id"])
        self.assertEqual(imp.status, "PARSED")
        self.assertEqual(UpiSettlementLine.objects.filter(settlement_import=imp).count(), 1)

        line = UpiSettlementLine.objects.get(settlement_import=imp)
        self.assertEqual(line.raw_payload["transaction_ref"], "TXN001")
        self.assertEqual(line.payment_ref, "PAY001")

        self.assertEqual(SettlementAllocation.objects.count(), 0)
        self.assertEqual(ReconciliationItem.objects.count(), 0)

    def test_duplicate_bank_upload_is_rejected(self):
        self.client.force_authenticate(self.admin)

        csv_body = (
            "transaction_date,description,debit,credit\n"
            "2026-05-02,NEFT REF 123,0.00,1000.00\n"
        )
        upload1 = SimpleUploadedFile("bank.csv", csv_body.encode("utf-8"), content_type="text/csv")
        upload2 = SimpleUploadedFile("bank2.csv", csv_body.encode("utf-8"), content_type="text/csv")

        payload = {
            "bank_finance_account": self.bank_account.id,
            "statement_period_from": "2026-05-01",
            "statement_period_to": "2026-05-31",
        }

        first = self.client.post("/api/v1/admin/settlements/bank-imports/", {**payload, "uploaded_file": upload1}, format="multipart")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)

        dup = self.client.post("/api/v1/admin/settlements/bank-imports/", {**payload, "uploaded_file": upload2}, format="multipart")
        self.assertEqual(dup.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_bank_csv_marks_import_failed(self):
        self.client.force_authenticate(self.admin)

        bad_csv = "date,desc,amount\n2026-05-02,Nope,100.00\n"
        upload = SimpleUploadedFile("bad.csv", bad_csv.encode("utf-8"), content_type="text/csv")

        resp = self.client.post(
            "/api/v1/admin/settlements/bank-imports/",
            {
                "bank_finance_account": self.bank_account.id,
                "statement_period_from": "2026-05-01",
                "statement_period_to": "2026-05-31",
                "uploaded_file": upload,
            },
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(BankStatementImport.objects.count(), 1)
        imp = BankStatementImport.objects.first()
        self.assertEqual(imp.status, "FAILED")
        self.assertIn("parse_error", imp.metadata or {})
        self.assertEqual(BankStatementLine.objects.filter(statement_import=imp).count(), 0)

    def test_non_admin_is_denied(self):
        csv_body = "transaction_date,description,debit,credit\n2026-05-02,X,1.00,0.00\n"
        for actor in (self.cashier, self.partner):
            upload = SimpleUploadedFile("bank.csv", csv_body.encode("utf-8"), content_type="text/csv")
            self.client.force_authenticate(actor)
            resp = self.client.post(
                "/api/v1/admin/settlements/bank-imports/",
                {
                    "bank_finance_account": self.bank_account.id,
                    "statement_period_from": "2026-05-01",
                    "statement_period_to": "2026-05-31",
                    "uploaded_file": upload,
                },
                format="multipart",
            )
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_line_list_is_paginated_and_read_only(self):
        self.client.force_authenticate(self.admin)

        csv_body = (
            "transaction_date,description,debit,credit\n"
            "2026-05-02,A,1.00,0.00\n"
            "2026-05-03,B,0.00,2.00\n"
        )
        upload = SimpleUploadedFile("bank.csv", csv_body.encode("utf-8"), content_type="text/csv")

        create = self.client.post(
            "/api/v1/admin/settlements/bank-imports/",
            {
                "bank_finance_account": self.bank_account.id,
                "statement_period_from": "2026-05-01",
                "statement_period_to": "2026-05-31",
                "uploaded_file": upload,
            },
            format="multipart",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED, create.data)
        import_id = create.data["id"]

        lines = self.client.get(f"/api/v1/admin/settlements/bank-imports/{import_id}/lines/")
        self.assertEqual(lines.status_code, status.HTTP_200_OK, lines.data)
        self.assertIn("results", lines.data)
        self.assertGreaterEqual(len(lines.data["results"]), 1)

        # read-only: POST not allowed on lines endpoint
        denied = self.client.post(f"/api/v1/admin/settlements/bank-imports/{import_id}/lines/", {}, format="json")
        self.assertEqual(denied.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
