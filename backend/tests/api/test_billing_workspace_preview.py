from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from subscriptions.models import Payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
    ensure_default_payment_collection_accounts,
)
from subscriptions.services.rent_lease_contract_service import create_rent_contract


class BillingWorkspacePreviewApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = create_admin_user(username="billing_preview_admin", phone="9800010001")
        self.cashier = create_cashier_user(
            username="billing_preview_cashier", phone="9800010002"
        )
        self.customer = create_customer_profile(name="Billing Preview Customer", phone="9800010003")
        self.product = create_product(name="Billing Preview Product", product_code="BP-001")
        self.batch = create_batch(batch_code="BP-BATCH-001")
        self.lucky = create_lucky_id(batch=self.batch, lucky_number=9)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky,
            partner=self.admin,
            monthly_amount=Decimal("1000.00"),
            total_amount=Decimal("3000.00"),
            tenure_months=self.batch.duration_months,
            start_date=date(2099, 1, 1),
        )
        self.emi_one = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2099, 1, 5),
        )
        self.emi_two = create_emi(
            subscription=self.subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=date(2099, 2, 5),
        )
        accounts = ensure_default_payment_collection_accounts()
        self.finance_account_id = accounts["CASH"].id

    def test_preview_does_not_mutate_data(self):
        self.client.force_authenticate(self.admin)
        before_count = Payment.objects.count()
        response = self.client.post(
            "/api/v1/admin/receivables/preview/",
            {
                "source_type": "ADVANCE_EMI",
                "source_id": self.subscription.id,
                "amount": "1500.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Payment.objects.count(), before_count)
        self.assertEqual(response.data["mutates_data"], False)
        self.assertEqual(len(response.data["allocation_preview"]), 2)

    def test_duplicate_submit_blocked_by_idempotency(self):
        self.client.force_authenticate(self.admin)
        payload = {
            "source_type": "ADVANCE_EMI",
            "source_id": self.subscription.id,
            "amount": "200.00",
            "payment_method": "CASH",
            "finance_account": self.finance_account_id,
            "idempotency_key": "billing-workspace-idem-1",
            "reference": "BILLING-IDEM-REF-1",
        }
        first = self.client.post("/api/v1/admin/receivables/collect/", payload, format="json")
        second = self.client.post("/api/v1/admin/receivables/collect/", payload, format="json")
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(first.data.get("payment_id"), second.data.get("payment_id"))

    def test_cashier_cannot_access_admin_preview(self):
        self.client.force_authenticate(self.cashier)
        response = self.client.post(
            "/api/v1/admin/receivables/preview/",
            {
                "source_type": "ADVANCE_EMI",
                "source_id": self.subscription.id,
                "amount": "100.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_rent_preview_is_view_only_with_disabled_reason(self):
        self.product.is_rent_enabled = True
        self.product.save(update_fields=["is_rent_enabled"])
        rent_subscription = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=6,
            start_date=date(2099, 1, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/admin/receivables/preview/",
            {
                "source_type": "RENT",
                "source_id": rent_subscription.id,
                "amount": "1000.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["mutates_data"], False)
        self.assertEqual(response.data["allocation_preview"], [])
        self.assertIn("not exposed", str(response.data.get("disabled_reason", "")))

    def test_cashier_rent_collect_is_rejected(self):
        self.product.is_rent_enabled = True
        self.product.save(update_fields=["is_rent_enabled"])
        rent_subscription = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=6,
            start_date=date(2099, 1, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        self.client.force_authenticate(self.cashier)
        response = self.client.post(
            "/api/v1/cashier/receivables/collect/",
            {
                "source_type": "RENT",
                "source_id": rent_subscription.id,
                "amount": "500.00",
                "payment_method": "CASH",
                "finance_account": self.finance_account_id,
                "reference": "RENT-BLOCK-001",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("disabled", str(response.data).lower())
