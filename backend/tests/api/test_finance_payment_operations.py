from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    AccountingBridgePosting,
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
    MoneyMovement,
    MoneyMovementStatus,
)
from subscriptions.models import (
    AuditLog,
    CustomerAdvance,
    CustomerAdvanceAllocation,
    Payment,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class FinancePaymentOperationsApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="finance_ops_admin",
            phone="9390000001",
        )
        self.client.force_authenticate(user=self.admin)

        self.customer = create_customer_profile(name="Finance Ops Customer", phone="7390000001")
        self.product = create_product(
            name="Finance Ops Product",
            product_code="FIN-OPS-001",
            base_price=Decimal("2400.00"),
        )
        self.batch = create_batch(batch_code="FINOPS1", duration_months=3, total_slots=100)
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=8)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("2400.00"),
            monthly_amount=Decimal("800.00"),
            tenure_months=3,
        )
        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("800.00"),
            due_date=date(2026, 4, 20),
        )

        self.cash_finance = FinanceAccount.objects.create(
            name="Finance Cash Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=ChartOfAccount.objects.create(
                code="FIN-CASH-001",
                name="Finance Cash Chart",
                account_type=ChartOfAccountType.ASSET,
            ),
            opening_balance=Decimal("0.00"),
        )
        self.upi_finance = FinanceAccount.objects.create(
            name="Finance UPI Clearing",
            kind=FinanceAccountKind.UPI,
            chart_account=ChartOfAccount.objects.create(
                code="FIN-UPI-001",
                name="Finance UPI Chart",
                account_type=ChartOfAccountType.ASSET,
            ),
            opening_balance=Decimal("0.00"),
        )
        self.bank_finance = FinanceAccount.objects.create(
            name="Finance Main Bank",
            kind=FinanceAccountKind.BANK,
            chart_account=ChartOfAccount.objects.create(
                code="FIN-BANK-001",
                name="Finance Bank Chart",
                account_type=ChartOfAccountType.ASSET,
            ),
            opening_balance=Decimal("0.00"),
        )
        self.inactive_finance = FinanceAccount.objects.create(
            name="Inactive Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=ChartOfAccount.objects.create(
                code="FIN-INACTIVE-001",
                name="Inactive Cash Chart",
                account_type=ChartOfAccountType.ASSET,
            ),
            opening_balance=Decimal("0.00"),
            is_active=False,
        )
        self.non_posting_finance = FinanceAccount.objects.create(
            name="Blocked Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=ChartOfAccount.objects.create(
                code="FIN-BLOCK-001",
                name="Blocked Cash Chart",
                account_type=ChartOfAccountType.ASSET,
                allow_manual_posting=False,
            ),
            opening_balance=Decimal("0.00"),
        )

    def test_collect_payment_with_finance_account_creates_posting(self):
        response = self.client.post(
            "/api/v1/cashier/collect-payment/",
            {
                "emi_id": self.emi.id,
                "amount": "800.00",
                "method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "reference_no": "FIN-COLLECT-001",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        payment_id = response.data["payment"]["id"]
        payment = Payment.objects.get(pk=payment_id)
        self.assertEqual(payment.finance_account_id, self.cash_finance.id)
        self.assertTrue(
            AccountingBridgePosting.objects.filter(
                source_model="Payment",
                source_id=str(payment.id),
                purpose="PAYMENT_COLLECTION",
            ).exists()
        )

    def test_collect_payment_blocks_inactive_finance_account(self):
        response = self.client.post(
            "/api/v1/cashier/collect-payment/",
            {
                "emi_id": self.emi.id,
                "amount": "800.00",
                "method": "CASH",
                "finance_account_id": self.inactive_finance.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertEqual(response.data["detail"], "Selected finance account is not active.")

    def test_collect_payment_blocks_non_posting_chart_account(self):
        response = self.client.post(
            "/api/v1/cashier/collect-payment/",
            {
                "emi_id": self.emi.id,
                "amount": "800.00",
                "method": "CASH",
                "finance_account_id": self.non_posting_finance.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertEqual(
            response.data["detail"],
            "Selected finance account is linked to a non-posting chart account.",
        )

    def test_collect_unapplied_advance_and_allocate_successfully(self):
        collect_response = self.client.post(
            "/api/v1/cashier/collect-advance/",
            {
                "customer_id": self.customer.id,
                "amount": "500.00",
                "method": "UPI",
                "finance_account_id": self.upi_finance.id,
                "reference_no": "ADV-001",
                "payment_date": "2026-04-22",
            },
            format="json",
        )
        self.assertEqual(collect_response.status_code, status.HTTP_201_CREATED, collect_response.data)
        advance_id = collect_response.data["data"]["customer_advance_id"]

        allocate_response = self.client.post(
            "/api/v1/admin/payments/allocate-advance/",
            {
                "customer_advance_id": advance_id,
                "emi_id": self.emi.id,
                "amount": "500.00",
                "reference_no": "ADV-ALLOC-001",
            },
            format="json",
        )
        self.assertEqual(allocate_response.status_code, status.HTTP_201_CREATED, allocate_response.data)

        advance = CustomerAdvance.objects.get(pk=advance_id)
        allocation = CustomerAdvanceAllocation.objects.get(advance_id=advance_id)
        self.assertEqual(str(advance.unapplied_amount), "0.00")
        self.assertEqual(str(allocation.amount), "500.00")
        self.assertTrue(
            AccountingBridgePosting.objects.filter(
                source_model="CustomerAdvanceAllocation",
                source_id=str(allocation.id),
                purpose="CUSTOMER_ADVANCE_ALLOCATION",
            ).exists()
        )

    def test_allocate_advance_blocks_over_allocation(self):
        collect_response = self.client.post(
            "/api/v1/cashier/collect-advance/",
            {
                "customer_id": self.customer.id,
                "amount": "300.00",
                "method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "reference_no": "ADV-002",
                "payment_date": "2026-04-22",
            },
            format="json",
        )
        advance_id = collect_response.data["data"]["customer_advance_id"]

        allocate_response = self.client.post(
            "/api/v1/admin/payments/allocate-advance/",
            {
                "customer_advance_id": advance_id,
                "emi_id": self.emi.id,
                "amount": "400.00",
            },
            format="json",
        )
        self.assertEqual(allocate_response.status_code, status.HTTP_400_BAD_REQUEST, allocate_response.data)
        self.assertEqual(
            allocate_response.data["detail"],
            "Allocation amount cannot exceed the unapplied advance balance.",
        )

    def test_finance_transfer_success(self):
        response = self.client.post(
            "/api/v1/admin/finance-transfers/",
            {
                "movement_date": "2026-04-22",
                "from_finance_account_id": self.upi_finance.id,
                "to_finance_account_id": self.bank_finance.id,
                "amount": "250.00",
                "reference_no": "MOVE-001",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        movement = MoneyMovement.objects.get(pk=response.data["data"]["transfer_id"])
        self.assertEqual(movement.status, MoneyMovementStatus.POSTED)
        self.assertIsNotNone(movement.posted_journal_entry_id)

    def test_finance_transfer_same_account_blocked(self):
        response = self.client.post(
            "/api/v1/admin/finance-transfers/",
            {
                "movement_date": "2026-04-22",
                "from_finance_account_id": self.bank_finance.id,
                "to_finance_account_id": self.bank_finance.id,
                "amount": "250.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("to_finance_account_id", response.data)

    def test_reconciliation_overview_returns_pending_items(self):
        self.client.post(
            "/api/v1/cashier/collect-advance/",
            {
                "customer_id": self.customer.id,
                "amount": "500.00",
                "method": "UPI",
                "finance_account_id": self.upi_finance.id,
                "reference_no": "ADV-003",
                "payment_date": "2026-04-22",
            },
            format="json",
        )

        response = self.client.get("/api/v1/admin/reconciliation/overview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertGreaterEqual(response.data["pending_finance_accounts"], 1)
        self.assertEqual(response.data["pending_accounts"][0]["reconciliation_status"], "PENDING")

    def test_successful_collection_writes_audit_log(self):
        self.client.post(
            "/api/v1/cashier/collect-advance/",
            {
                "customer_id": self.customer.id,
                "amount": "200.00",
                "method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "reference_no": "ADV-004",
                "payment_date": "2026-04-22",
            },
            format="json",
        )

        self.assertTrue(
            AuditLog.objects.filter(metadata__event="CUSTOMER_ADVANCE_COLLECTED").exists()
        )

    def test_failed_validation_does_not_create_success_audit_log(self):
        response = self.client.post(
            "/api/v1/cashier/collect-advance/",
            {
                "customer_id": self.customer.id,
                "amount": "200.00",
                "method": "CASH",
                "finance_account_id": self.inactive_finance.id,
                "reference_no": "ADV-005",
                "payment_date": "2026-04-22",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertFalse(
            AuditLog.objects.filter(
                metadata__event="CUSTOMER_ADVANCE_COLLECTED",
                metadata__reference_no="ADV-005",
            ).exists()
        )

    def test_admin_customer_credits_alias_round_trip(self):
        response = self.client.post(
            "/api/v1/admin/finance/customer-credits/",
            {
                "customer_id": self.customer.id,
                "amount": "275.00",
                "transaction_type": "COLLECTION",
                "payment_method": "UPI",
                "finance_account_id": self.upi_finance.id,
                "reference_no": "CR-001",
                "notes": "Customer credit alias smoke test",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        record_id = response.data["id"]
        self.assertEqual(response.data["transaction_type"], "COLLECTION")
        self.assertEqual(response.data["amount"], "275.00")

        detail = self.client.get(f"/api/v1/admin/finance/customer-credits/{record_id}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.data)
        self.assertEqual(detail.data["id"], record_id)
        self.assertEqual(detail.data["reference_no"], "CR-001")
