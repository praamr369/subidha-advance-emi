from datetime import date, timedelta
from decimal import Decimal

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from subscriptions.models import (
    AuditLog,
    Batch,
    BatchStatus,
    ContractAmendment,
    ContractRecontractEvent,
    Customer,
    Emi,
    EmiStatus,
    FinancialLedger,
    LedgerDirection,
    LedgerEntryType,
    LuckyId,
    Payment,
    PaymentMethod,
    PlanType,
    Product,
    Subscription,
    SubscriptionStatus,
)


class ContractRecontractPreviewPersistenceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(username="phase6a_admin", password="x", role="ADMIN", phone="9820000100")
        self.customer_user = User.objects.create_user(username="phase6a_customer", password="x", role="CUSTOMER", phone="9820000101")
        self.partner_user = User.objects.create_user(username="phase6a_partner", password="x", role="PARTNER", phone="9820000102")
        self.cashier = User.objects.create_user(username="phase6a_cashier", password="x", role="CASHIER", phone="9820000103")

        self.customer = Customer.objects.create(user=self.customer_user, name="Phase6A Customer", phone="9820000101")
        self.product = Product.objects.create(product_code="P6A-OLD", name="Original Product", base_price=Decimal("20000.00"), is_active=True)
        self.batch = Batch.objects.create(batch_code="P6A-BATCH", total_slots=100, duration_months=10, draw_day=5, start_date=date(2026, 1, 1), status=BatchStatus.OPEN)
        self.lucky_id = LuckyId.objects.filter(batch=self.batch, lucky_number=1).first() or LuckyId.objects.create(batch=self.batch, lucky_number=1)
        self.subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            partner=self.partner_user,
            batch=self.batch,
            lucky_id=self.lucky_id,
            plan_type=PlanType.EMI,
            tenure_months=10,
            start_date=date(2026, 1, 1),
            total_amount=Decimal("20000.00"),
            monthly_amount=Decimal("2000.00"),
            status=SubscriptionStatus.ACTIVE,
        )
        self.emis = [
            Emi.objects.create(
                subscription=self.subscription,
                month_no=month,
                due_date=date(2026, 1, 1) + timedelta(days=30 * (month - 1)),
                amount=Decimal("2000.00"),
                status=EmiStatus.PAID if month <= 2 else EmiStatus.PENDING,
            )
            for month in range(1, 11)
        ]
        for index, emi in enumerate(self.emis[:2], start=1):
            payment = Payment.objects.create(
                customer=self.customer,
                subscription=self.subscription,
                emi=emi,
                amount=Decimal("2000.00"),
                method=PaymentMethod.CASH,
                reference_no=f"P6A-PAY-{index}",
                payment_date=date(2026, 1, index),
                collected_by=self.admin,
            )
            FinancialLedger.objects.create(
                payment=payment,
                emi=emi,
                amount=Decimal("2000.00"),
                entry_type=LedgerEntryType.EMI_PAYMENT,
                entry_direction=LedgerDirection.CREDIT,
            )

    def replacement_product(self, code: str, price: Decimal) -> Product:
        return Product.objects.create(product_code=code, name=code, base_price=price, is_active=True)

    def product_amendment(self, target_product: Product, **overrides) -> ContractAmendment:
        payload = {
            "subscription": self.subscription,
            "contract_type": "EMI_SUBSCRIPTION",
            "customer": self.customer,
            "partner": self.partner_user,
            "requested_by": self.customer_user,
            "requested_role": "CUSTOMER",
            "amendment_type": "PRODUCT_CHANGE",
            "status": "APPROVED",
            "requested_values": {"approved_product_id": target_product.id},
            "approved_values": {"approved_product_id": target_product.id, "approved_product_name": target_product.name},
            "reason": "Persist recontract preview snapshot.",
            "approved_by": self.admin,
        }
        payload.update(overrides)
        return ContractAmendment.objects.create(**payload)

    def counts(self):
        receipt_model = apps.get_model("billing", "ReceiptDocument", require_ready=False)
        journal_model = apps.get_model("accounting", "JournalEntry", require_ready=False)
        reconciliation_model = apps.get_model("reconciliation", "ReconciliationItem", require_ready=False)
        return {
            "emis": Emi.objects.count(),
            "payments": Payment.objects.count(),
            "receipts": receipt_model.objects.count(),
            "journals": journal_model.objects.count(),
            "reconciliation_items": reconciliation_model.objects.count(),
        }

    def assert_source_records_unchanged(self, counts):
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.product_id, self.product.id)
        self.assertEqual(self.subscription.total_amount, Decimal("20000.00"))
        self.assertEqual(self.subscription.monthly_amount, Decimal("2000.00"))
        self.assertEqual(self.subscription.tenure_months, 10)
        self.assertEqual(self.counts(), counts)

    def post_save(self, amendment):
        return self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/product-recontract-preview/save/", {}, format="json")

    def test_admin_can_persist_upgrade_preview_snapshot_without_source_mutation(self):
        target = self.replacement_product("P6A-UPGRADE", Decimal("25000.00"))
        amendment = self.product_amendment(target)
        counts = self.counts()

        self.client.force_authenticate(self.admin)
        response = self.post_save(amendment)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["impact_type"], "UPGRADE_EXTRA_PAYABLE")
        self.assertEqual(response.data["old_product"], self.product.id)
        self.assertEqual(response.data["new_product"], target.id)
        self.assertEqual(response.data["old_contract_total"], "20000.00")
        self.assertEqual(response.data["new_contract_total"], "25000.00")
        self.assertEqual(response.data["price_difference"], "5000.00")
        self.assertEqual(response.data["amount_already_paid"], "4000.00")
        self.assertEqual(response.data["old_remaining_balance"], "16000.00")
        self.assertEqual(response.data["new_remaining_balance"], "21000.00")
        self.assertEqual(response.data["proposed_monthly_amount"], "2500.00")
        self.assertEqual(response.data["pending_emi_count"], 8)
        self.assertFalse(response.data["source_record_mutation"])
        self.assert_source_records_unchanged(counts)
        self.assertTrue(
            AuditLog.objects.filter(metadata__event="CONTRACT_RECONTRACT_PREVIEW_CREATED", metadata__source_record_mutation=False).exists()
        )

    def test_admin_can_persist_downgrade_preview_snapshot_without_source_mutation(self):
        target = self.replacement_product("P6A-DOWNGRADE", Decimal("15000.00"))
        amendment = self.product_amendment(target)
        counts = self.counts()

        self.client.force_authenticate(self.admin)
        response = self.post_save(amendment)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["impact_type"], "DOWNGRADE_CREDIT_REQUIRED")
        self.assertEqual(response.data["price_difference"], "-5000.00")
        self.assertEqual(response.data["new_remaining_balance"], "11000.00")
        self.assertEqual(response.data["proposed_monthly_amount"], "1500.00")
        self.assertFalse(response.data["source_record_mutation"])
        self.assert_source_records_unchanged(counts)

    def test_non_admin_roles_cannot_persist_preview(self):
        target = self.replacement_product("P6A-ROLE", Decimal("25000.00"))
        amendment = self.product_amendment(target)
        for user in [self.customer_user, self.partner_user, self.cashier]:
            with self.subTest(role=user.role):
                self.client.force_authenticate(user)
                response = self.post_save(amendment)
                self.assertEqual(response.status_code, 403)
        self.assertFalse(ContractRecontractEvent.objects.exists())

    def test_unsupported_amendment_type_and_missing_target_are_rejected(self):
        unsupported = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="CONTACT_CORRECTION",
            status="APPROVED",
            approved_values={"phone": "9820000199"},
            reason="Wrong type.",
            approved_by=self.admin,
        )
        missing_target = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="PRODUCT_CHANGE",
            status="APPROVED",
            approved_values={},
            reason="Missing target.",
            approved_by=self.admin,
        )

        self.client.force_authenticate(self.admin)
        unsupported_response = self.post_save(unsupported)
        missing_response = self.post_save(missing_target)

        self.assertEqual(unsupported_response.status_code, 400, unsupported_response.data)
        self.assertIn("product_change", str(unsupported_response.data).lower())
        self.assertEqual(missing_response.status_code, 400, missing_response.data)
        self.assertIn("approved_product_id", str(missing_response.data).lower())
        self.assertFalse(ContractRecontractEvent.objects.exists())

    def test_prior_preview_is_superseded_when_new_snapshot_is_saved(self):
        target = self.replacement_product("P6A-SUPERSEDE", Decimal("25000.00"))
        amendment = self.product_amendment(target)

        self.client.force_authenticate(self.admin)
        first = self.post_save(amendment)
        second = self.post_save(amendment)

        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 201, second.data)
        self.assertEqual(ContractRecontractEvent.objects.filter(amendment=amendment, status="PREVIEWED").count(), 1)
        self.assertEqual(ContractRecontractEvent.objects.filter(amendment=amendment, status="SUPERSEDED").count(), 1)
        amendment.refresh_from_db()
        self.assertEqual(amendment.metadata["latest_product_recontract_event_id"], second.data["id"])
