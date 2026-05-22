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


class AdminSettlementAllocationApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="settlement_alloc_admin", phone="9312000001")
        self.cashier = create_cashier_user(username="settlement_alloc_cashier", phone="9312000002")
        self.partner = create_partner_user(username="settlement_alloc_partner", phone="9312000003")

        self.bank_account = create_finance_account(code="SETTLE-ALLOC-BANK-001", name="Alloc Bank", kind="BANK")
        self.upi_account = create_finance_account(code="SETTLE-ALLOC-UPI-001", name="Alloc UPI", kind="UPI")

        self.customer = create_customer_profile(name="Settlement Alloc Customer", phone="9312000010")
        self.product = create_product(name="Settlement Alloc Product", product_code="SETTLE-ALLOC-PROD-01", base_price=Decimal("1000.00"))
        self.batch = create_batch(batch_code="SETTLEALLOC2026", duration_months=1, total_slots=100, draw_day=5, start_date=date(2026, 5, 1))
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
            method="BANK",
            reference_no="SETTLE-ALLOC-PAY-001",
            payment_date=date(2026, 5, 2),
            collected_by=self.admin,
            finance_account=self.bank_account,
        )

        self.movement = MoneyMovement.objects.create(
            movement_date=date(2026, 5, 2),
            from_finance_account=self.bank_account,
            to_finance_account=self.upi_account,
            amount=Decimal("100.00"),
            reference_no="SETTLE-ALLOC-MOV-001",
            status="DRAFT",
        )

        from billing.models import ReceiptDocument

        self.receipt_bank = ReceiptDocument.objects.create(
            receipt_no="RCT-SETTLE-ALLOC-BANK-001",
            receipt_type="EMI_PAYMENT_RECEIPT",
            status="DRAFT",
            receipt_date=date(2026, 5, 2),
            amount=Decimal("1000.00"),
            payment=self.payment,
            finance_account=self.bank_account,
        )

        self.payment_upi = Payment.objects.create(
            customer=self.customer,
            subscription=self.subscription,
            emi=self.emi,
            amount=Decimal("98.00"),
            method="UPI",
            reference_no="SETTLE-ALLOC-PAY-UPI-001",
            payment_date=date(2026, 5, 2),
            collected_by=self.admin,
            finance_account=self.upi_account,
        )
        self.receipt_upi = ReceiptDocument.objects.create(
            receipt_no="RCT-SETTLE-ALLOC-UPI-001",
            receipt_type="EMI_PAYMENT_RECEIPT",
            status="DRAFT",
            receipt_date=date(2026, 5, 2),
            amount=Decimal("98.00"),
            payment=self.payment_upi,
            finance_account=self.upi_account,
        )

    def _create_bank_import_with_one_credit_line(self, amount: Decimal) -> BankStatementLine:
        self.client.force_authenticate(self.admin)
        csv_body = (
            "transaction_date,description,debit,credit,value_date,reference_no,balance\n"
            f"2026-05-02,NEFT REF 123,0.00,{amount},2026-05-02,UTR123,5000.00\n"
        )
        upload = SimpleUploadedFile("bank.csv", csv_body.encode("utf-8"), content_type="text/csv")
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
        imp = BankStatementImport.objects.get(pk=resp.data["id"])
        line = BankStatementLine.objects.get(statement_import=imp)
        return line

    def _create_upi_import_with_one_line(self, net_amount: Decimal) -> UpiSettlementLine:
        self.client.force_authenticate(self.admin)
        csv_body = (
            "transaction_ref,payment_ref,gross_amount,fee_amount,net_amount,settlement_date\n"
            f"TXN001,PAY001,{net_amount},0.00,{net_amount},2026-05-02\n"
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
        imp = UpiSettlementImport.objects.get(pk=resp.data["id"])
        line = UpiSettlementLine.objects.get(settlement_import=imp)
        return line

    def test_admin_can_create_allocation_for_bank_line_to_payment_and_does_not_mutate_payment(self):
        self.client.force_authenticate(self.admin)
        line = self._create_bank_import_with_one_credit_line(Decimal("1000.00"))

        before = Payment.objects.get(pk=self.payment.id)
        before_amount = before.amount
        before_ref = before.reference_no
        before_method = before.method
        before_finance_account_id = before.finance_account_id

        resp = self.client.post(
            "/api/v1/admin/settlements/allocations/",
            {
                "source_type": "BANK_STATEMENT_LINE",
                "source_id": str(line.id),
                "finance_account": self.bank_account.id,
                "matched_amount": "1000.00",
                "payment": self.payment.id,
                "note": "Manual allocation test",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        allocation_id = resp.data["id"]

        allocation = SettlementAllocation.objects.get(pk=allocation_id)
        self.assertEqual(allocation.status, "MATCHED")
        self.assertEqual(allocation.matched_by_id, self.admin.id)
        self.assertEqual(allocation.source_type, "BANK_STATEMENT_LINE")
        self.assertEqual(allocation.source_id, str(line.id))
        self.assertEqual(allocation.finance_account_id, self.bank_account.id)
        self.assertEqual(allocation.payment_id, self.payment.id)
        self.assertEqual(allocation.matched_amount, Decimal("1000.00"))

        line.refresh_from_db()
        self.assertEqual(line.matched_status, "MATCHED")

        after = Payment.objects.get(pk=self.payment.id)
        self.assertEqual(after.amount, before_amount)
        self.assertEqual(after.reference_no, before_ref)
        self.assertEqual(after.method, before_method)
        self.assertEqual(after.finance_account_id, before_finance_account_id)

        self.assertEqual(ReconciliationItem.objects.count(), 0)

    def test_matched_amount_cannot_exceed_available_source_amount_and_partial_allocation_allowed(self):
        self.client.force_authenticate(self.admin)
        line = self._create_bank_import_with_one_credit_line(Decimal("1000.00"))

        partial = self.client.post(
            "/api/v1/admin/settlements/allocations/",
            {
                "source_type": "BANK_STATEMENT_LINE",
                "source_id": str(line.id),
                "finance_account": self.bank_account.id,
                "matched_amount": "400.00",
                "payment": self.payment.id,
            },
            format="json",
        )
        self.assertEqual(partial.status_code, status.HTTP_201_CREATED, partial.data)

        line.refresh_from_db()
        self.assertEqual(line.matched_status, "PARTIAL")

        too_much = self.client.post(
            "/api/v1/admin/settlements/allocations/",
            {
                "source_type": "BANK_STATEMENT_LINE",
                "source_id": str(line.id),
                "finance_account": self.bank_account.id,
                "matched_amount": "700.00",
                "payment": self.payment.id,
            },
            format="json",
        )
        self.assertEqual(too_much.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_exact_active_allocation_is_rejected(self):
        self.client.force_authenticate(self.admin)
        line = self._create_bank_import_with_one_credit_line(Decimal("1000.00"))

        first = self.client.post(
            "/api/v1/admin/settlements/allocations/",
            {
                "source_type": "BANK_STATEMENT_LINE",
                "source_id": str(line.id),
                "finance_account": self.bank_account.id,
                "matched_amount": "400.00",
                "payment": self.payment.id,
            },
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)

        dup = self.client.post(
            "/api/v1/admin/settlements/allocations/",
            {
                "source_type": "BANK_STATEMENT_LINE",
                "source_id": str(line.id),
                "finance_account": self.bank_account.id,
                "matched_amount": "400.00",
                "payment": self.payment.id,
            },
            format="json",
        )
        self.assertEqual(dup.status_code, status.HTTP_400_BAD_REQUEST)

    def test_void_allocation_sets_status_voided_and_does_not_delete(self):
        self.client.force_authenticate(self.admin)
        line = self._create_bank_import_with_one_credit_line(Decimal("1000.00"))

        create = self.client.post(
            "/api/v1/admin/settlements/allocations/",
            {
                "source_type": "BANK_STATEMENT_LINE",
                "source_id": str(line.id),
                "finance_account": self.bank_account.id,
                "matched_amount": "1000.00",
                "payment": self.payment.id,
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED, create.data)
        allocation_id = create.data["id"]
        self.assertEqual(SettlementAllocation.objects.count(), 1)

        void = self.client.post(f"/api/v1/admin/settlements/allocations/{allocation_id}/void/", {"reason": "Operator mistake"}, format="json")
        self.assertEqual(void.status_code, status.HTTP_200_OK, void.data)

        self.assertEqual(SettlementAllocation.objects.count(), 1)
        alloc = SettlementAllocation.objects.get(pk=allocation_id)
        self.assertEqual(alloc.status, "VOIDED")
        self.assertIn("voided_at", alloc.metadata or {})
        self.assertEqual(alloc.metadata.get("voided_by_id"), self.admin.id)

        line.refresh_from_db()
        self.assertEqual(line.matched_status, "UNMATCHED")

    def test_non_admin_is_denied(self):
        line = self._create_bank_import_with_one_credit_line(Decimal("1000.00"))
        for actor in (self.cashier, self.partner):
            self.client.force_authenticate(actor)
            resp = self.client.post(
                "/api/v1/admin/settlements/allocations/",
                {
                    "source_type": "BANK_STATEMENT_LINE",
                    "source_id": str(line.id),
                    "finance_account": self.bank_account.id,
                    "matched_amount": "1000.00",
                    "payment": self.payment.id,
                },
                format="json",
            )
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_finance_account_mismatch_is_rejected(self):
        self.client.force_authenticate(self.admin)
        line = self._create_bank_import_with_one_credit_line(Decimal("1000.00"))

        resp = self.client.post(
            "/api/v1/admin/settlements/allocations/",
            {
                "source_type": "BANK_STATEMENT_LINE",
                "source_id": str(line.id),
                "finance_account": self.upi_account.id,
                "matched_amount": "100.00",
                "payment": self.payment.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_create_allocation_for_upi_line_to_receipt(self):
        self.client.force_authenticate(self.admin)
        line = self._create_upi_import_with_one_line(Decimal("98.00"))

        resp = self.client.post(
            "/api/v1/admin/settlements/allocations/",
            {
                "source_type": "UPI_SETTLEMENT_LINE",
                "source_id": str(line.id),
                "finance_account": self.upi_account.id,
                "matched_amount": "98.00",
                "receipt": self.receipt_upi.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        alloc = SettlementAllocation.objects.get(pk=resp.data["id"])
        self.assertEqual(alloc.source_type, "UPI_SETTLEMENT_LINE")
        self.assertEqual(alloc.receipt_id, self.receipt_upi.id)

    def test_list_and_detail_endpoints_work_and_list_is_paginated(self):
        self.client.force_authenticate(self.admin)
        line = self._create_bank_import_with_one_credit_line(Decimal("1000.00"))
        create = self.client.post(
            "/api/v1/admin/settlements/allocations/",
            {
                "source_type": "BANK_STATEMENT_LINE",
                "source_id": str(line.id),
                "finance_account": self.bank_account.id,
                "matched_amount": "1000.00",
                "payment": self.payment.id,
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED, create.data)
        allocation_id = create.data["id"]

        listing = self.client.get("/api/v1/admin/settlements/allocations/")
        self.assertEqual(listing.status_code, status.HTTP_200_OK, listing.data)
        self.assertIn("results", listing.data)

        detail = self.client.get(f"/api/v1/admin/settlements/allocations/{allocation_id}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.data)
        self.assertEqual(detail.data["id"], allocation_id)

    def test_settlement_lookup_endpoints_are_admin_only_and_bounded(self):
        # Create extra finance accounts to prove bounding (limit enforced by lookup endpoint).
        for index in range(30):
            create_finance_account(code=f"SETTLE-LOOKUP-{index:03d}", name=f"Lookup Account {index:03d}", kind="BANK")

        endpoints = [
            "/api/v1/admin/settlements/lookups/finance-accounts/?q=Lookup&kind=BANK",
            "/api/v1/admin/settlements/lookups/payments/?q=SETTLE-ALLOC-PAY",
            "/api/v1/admin/settlements/lookups/receipts/?q=RCT-SETTLE-ALLOC",
            "/api/v1/admin/settlements/lookups/money-movements/?q=SETTLE-ALLOC-MOV",
        ]

        # Non-admin denied
        for actor in (self.cashier, self.partner):
            self.client.force_authenticate(actor)
            for url in endpoints:
                resp = self.client.get(url)
                self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # Admin allowed; response shape is display-safe and bounded.
        self.client.force_authenticate(self.admin)
        for url in endpoints:
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
            self.assertIn("results", resp.data)
            self.assertIsInstance(resp.data["results"], list)

            for row in resp.data["results"]:
                self.assertIn("id", row)
                self.assertIn("label", row)
                allowed = {"id", "label", "subtitle", "amount", "status", "date", "metadata"}
                self.assertTrue(set(row.keys()).issubset(allowed))

        finance_resp = self.client.get("/api/v1/admin/settlements/lookups/finance-accounts/?q=Lookup&kind=BANK")
        self.assertLessEqual(len(finance_resp.data.get("results") or []), 20)
