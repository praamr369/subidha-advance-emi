from decimal import Decimal

from django.apps import apps
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from subscriptions.models import (
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionType,
)
from subscriptions.models_rent_lease_collection import RentLeaseCollection
from subscriptions.services.rent_lease_billing_service import (
    generate_monthly_demands_for_subscription,
    record_deposit_refund,
)
from subscriptions.services.rent_lease_collection_workflow_service import (
    collect_rent_lease_monthly_demand,
    collect_security_deposit_with_metadata,
)
from subscriptions.services.rent_lease_contract_service import create_rent_contract
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_payment_collection_finance_account,
    create_product,
    ensure_test_collection_purpose_mapping,
)


def model_count(app_label: str, model_name: str) -> int:
    try:
        model = apps.get_model(app_label, model_name)
    except LookupError:
        return 0
    return model.objects.count()


class RentLeaseSecurityDepositSourceContractPhaseF16Tests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="f16_admin", phone="9161600001")
        self.customer = create_customer_profile(name="F16 Customer", phone="9161600002")
        self.finance_account = create_payment_collection_finance_account(
            code="F16-CASH",
            name="F16 Cash Desk",
            kind="CASH",
        )
        ensure_test_collection_purpose_mapping(finance_account=self.finance_account)
        self.today = timezone.localdate()
        self.product = create_product(
            name="F16 Rent Product",
            product_code="F16-RENT",
            base_price=Decimal("12000.00"),
        )
        self.product.is_rent_enabled = True
        self.product.save(update_fields=["is_rent_enabled"])

    def _subscription(self):
        return create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=6,
            start_date=self.today.replace(day=1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )

    def _assert_no_posting_side_effects(self):
        self.assertEqual(model_count("accounting", "JournalEntry"), 0)
        self.assertEqual(model_count("accounting", "AccountingBridgePosting"), 0)
        self.assertEqual(model_count("accounting", "ReconciliationItem"), 0)
        self.assertEqual(model_count("reconciliation", "ReconciliationItem"), 0)

    def test_deposit_receipt_creates_concrete_source_evidence(self):
        subscription = self._subscription()

        demand = collect_security_deposit_with_metadata(
            subscription=subscription,
            amount=Decimal("1000.00"),
            performed_by=self.admin,
            reference_no="DEP-F16-001",
            finance_account_id=self.finance_account.id,
            payment_method="CASH",
            payment_date=self.today,
            idempotency_key="deposit-f16-key-001",
        )

        tx = RentLeaseDepositTransaction.objects.get(transaction_type=RentLeaseDepositTransactionType.DEPOSIT_RECEIPT)
        self.assertEqual(tx.demand_id, demand.id)
        self.assertEqual(tx.subscription_id, subscription.id)
        self.assertEqual(tx.customer_id, self.customer.id)
        self.assertEqual(tx.plan_type, PlanType.RENT)
        self.assertEqual(tx.amount, Decimal("1000.00"))
        self.assertEqual(tx.transaction_date, self.today)
        self.assertEqual(tx.payment_method, "CASH")
        self.assertEqual(tx.finance_account_id, self.finance_account.id)
        self.assertEqual(tx.external_reference_no, "DEP-F16-001")
        self.assertEqual(tx.idempotency_key, "deposit-f16-key-001")
        self.assertEqual(tx.created_by_id, self.admin.id)
        self.assertTrue(tx.transaction_number.startswith("RLD-"))
        self.assertEqual(getattr(demand, "_deposit_source_transaction").id, tx.id)
        self.assertEqual(RentLeaseCollection.objects.count(), 0)
        self._assert_no_posting_side_effects()

    def test_deposit_refund_creates_concrete_source_evidence_when_finance_evidence_is_provided(self):
        subscription = self._subscription()
        collect_security_deposit_with_metadata(
            subscription=subscription,
            amount=Decimal("1000.00"),
            performed_by=self.admin,
            reference_no="DEP-F16-REFUND-RECEIPT",
            finance_account_id=self.finance_account.id,
            payment_method="CASH",
            payment_date=self.today,
            idempotency_key="deposit-refund-receipt-key",
        )

        demand = record_deposit_refund(
            subscription=subscription,
            amount=Decimal("400.00"),
            performed_by=self.admin,
            reference_no="DEP-F16-REFUND-001",
            finance_account_id=self.finance_account.id,
            payment_method="BANK",
            payment_date=self.today,
            idempotency_key="deposit-refund-key-001",
        )

        tx = RentLeaseDepositTransaction.objects.get(transaction_type=RentLeaseDepositTransactionType.DEPOSIT_REFUND)
        self.assertEqual(tx.demand_id, demand.id)
        self.assertEqual(tx.subscription_id, subscription.id)
        self.assertEqual(tx.customer_id, self.customer.id)
        self.assertEqual(tx.plan_type, PlanType.RENT)
        self.assertEqual(tx.amount, Decimal("400.00"))
        self.assertEqual(tx.payment_method, "BANK")
        self.assertEqual(tx.finance_account_id, self.finance_account.id)
        self.assertEqual(tx.transaction_date, self.today)
        self.assertEqual(tx.external_reference_no, "DEP-F16-REFUND-001")
        self.assertEqual(tx.idempotency_key, "deposit-refund-key-001")
        self._assert_no_posting_side_effects()

    def test_idempotency_reuses_matching_deposit_receipt_and_rejects_mismatch(self):
        subscription = self._subscription()
        first = collect_security_deposit_with_metadata(
            subscription=subscription,
            amount=Decimal("1000.00"),
            performed_by=self.admin,
            reference_no="DEP-F16-IDEM",
            finance_account_id=self.finance_account.id,
            payment_method="CASH",
            payment_date=self.today,
            idempotency_key="deposit-idem-key",
        )
        second = collect_security_deposit_with_metadata(
            subscription=subscription,
            amount=Decimal("1000.00"),
            performed_by=self.admin,
            reference_no="DEP-F16-IDEM",
            finance_account_id=self.finance_account.id,
            payment_method="CASH",
            payment_date=self.today,
            idempotency_key="deposit-idem-key",
        )

        self.assertEqual(RentLeaseDepositTransaction.objects.filter(transaction_type=RentLeaseDepositTransactionType.DEPOSIT_RECEIPT).count(), 1)
        self.assertEqual(getattr(second, "_deposit_source_transaction_created"), False)
        first.refresh_from_db()
        self.assertEqual(first.collected_amount, Decimal("1000.00"))

        with self.assertRaises(ValidationError):
            collect_security_deposit_with_metadata(
                subscription=subscription,
                amount=Decimal("900.00"),
                performed_by=self.admin,
                reference_no="DEP-F16-IDEM",
                finance_account_id=self.finance_account.id,
                payment_method="CASH",
                payment_date=self.today,
                idempotency_key="deposit-idem-key",
            )

    def test_monthly_collection_and_customer_advance_do_not_create_deposit_source(self):
        subscription = self._subscription()
        collect_security_deposit_with_metadata(
            subscription=subscription,
            amount=Decimal("2400.00"),
            performed_by=self.admin,
            reference_no="DEP-F16-PAID",
            finance_account_id=self.finance_account.id,
            payment_method="CASH",
            payment_date=self.today,
            idempotency_key="deposit-paid-key",
        )
        generate_monthly_demands_for_subscription(subscription=subscription, through_date=self.today, performed_by=self.admin)
        monthly = RentLeaseBillingDemand.objects.filter(
            subscription=subscription,
            demand_type=RentLeaseDemandType.RENT_MONTHLY,
        ).order_by("id").first()

        collect_rent_lease_monthly_demand(
            subscription=subscription,
            demand_id=monthly.id,
            amount=Decimal("1000.00"),
            performed_by=self.admin,
            reference_no="MONTHLY-F16-001",
            finance_account_id=self.finance_account.id,
            payment_method="CASH",
            payment_date=self.today,
            idempotency_key="monthly-f16-key",
        )
        CustomerAdvance = apps.get_model("subscriptions", "CustomerAdvance")
        CustomerAdvance.objects.create(
            customer=self.customer,
            finance_account=self.finance_account,
            amount=Decimal("500.00"),
            unapplied_amount=Decimal("500.00"),
            method="CASH",
            reference_no="ADV-F16-001",
            payment_date=self.today,
        )

        self.assertEqual(RentLeaseCollection.objects.count(), 1)
        self.assertEqual(RentLeaseDepositTransaction.objects.filter(transaction_type=RentLeaseDepositTransactionType.DEPOSIT_RECEIPT).count(), 1)
        self.assertFalse(
            RentLeaseDepositTransaction.objects.filter(
                metadata__reference_no="MONTHLY-F16-001",
                transaction_type__in=[
                    RentLeaseDepositTransactionType.DEPOSIT_RECEIPT,
                    RentLeaseDepositTransactionType.DEPOSIT_REFUND,
                ],
            ).exists()
        )
        self._assert_no_posting_side_effects()

    def test_deposit_source_evidence_is_immutable_after_creation(self):
        subscription = self._subscription()
        collect_security_deposit_with_metadata(
            subscription=subscription,
            amount=Decimal("1000.00"),
            performed_by=self.admin,
            reference_no="DEP-F16-IMMUTABLE",
            finance_account_id=self.finance_account.id,
            payment_method="CASH",
            payment_date=self.today,
            idempotency_key="deposit-immutable-key",
        )
        tx = RentLeaseDepositTransaction.objects.get(transaction_type=RentLeaseDepositTransactionType.DEPOSIT_RECEIPT)
        tx.amount = Decimal("999.00")

        with self.assertRaises(ValidationError):
            tx.save()
