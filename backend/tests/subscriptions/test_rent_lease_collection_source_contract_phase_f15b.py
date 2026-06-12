from decimal import Decimal

from django.apps import apps
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from subscriptions.models import (
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandStatus,
    RentLeaseDemandType,
    RentLeaseDepositTransaction,
)
from subscriptions.models_rent_lease_collection import (
    RentLeaseCollection,
    RentLeaseCollectionStatus,
)
from subscriptions.services.rent_lease_billing_service import (
    collect_security_deposit,
    generate_monthly_demands_for_subscription,
    record_deposit_refund,
)
from subscriptions.services.rent_lease_collection_workflow_service import (
    collect_rent_lease_monthly_demand,
)
from subscriptions.services.rent_lease_contract_service import (
    create_lease_contract,
    create_rent_contract,
)
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


class RentLeaseCollectionSourceContractPhaseF15BTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="f15b_admin", phone="9111110001")
        self.customer = create_customer_profile(name="F15B Customer", phone="9111110002")
        self.finance_account = create_payment_collection_finance_account(
            code="F15B-CASH",
            name="F15B Cash Desk",
            kind="CASH",
        )
        ensure_test_collection_purpose_mapping(finance_account=self.finance_account)
        self.today = timezone.localdate()
        self.month_start = self.today.replace(day=1)

        self.rent_product = create_product(
            name="F15B Rent Product",
            product_code="F15B-RENT",
            base_price=Decimal("12000.00"),
        )
        self.rent_product.is_rent_enabled = True
        self.rent_product.save(update_fields=["is_rent_enabled"])

        self.lease_product = create_product(
            name="F15B Lease Product",
            product_code="F15B-LEASE",
            base_price=Decimal("24000.00"),
        )
        self.lease_product.is_lease_enabled = True
        self.lease_product.save(update_fields=["is_lease_enabled"])

    def _rent_subscription(self):
        subscription = create_rent_contract(
            customer=self.customer,
            product=self.rent_product,
            tenure_months=6,
            start_date=self.month_start,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        generate_monthly_demands_for_subscription(subscription=subscription, performed_by=self.admin)
        return subscription

    def _lease_subscription(self):
        subscription = create_lease_contract(
            customer=self.customer,
            product=self.lease_product,
            tenure_months=6,
            start_date=self.month_start,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        generate_monthly_demands_for_subscription(subscription=subscription, performed_by=self.admin)
        return subscription

    def _first_monthly_demand(self, subscription):
        return RentLeaseBillingDemand.objects.filter(
            subscription=subscription,
            demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY],
        ).order_by("due_date", "id").first()

    def _assert_no_posting_side_effects(self):
        self.assertEqual(model_count("accounting", "JournalEntry"), 0)
        self.assertEqual(model_count("accounting", "AccountingBridgePosting"), 0)
        self.assertEqual(model_count("accounting", "ReconciliationItem"), 0)
        self.assertEqual(model_count("reconciliation", "ReconciliationItem"), 0)

    def test_rent_collection_creates_concrete_evidence_row(self):
        subscription = self._rent_subscription()
        demand = self._first_monthly_demand(subscription)

        returned = collect_rent_lease_monthly_demand(
            subscription=subscription,
            demand_id=demand.id,
            amount=Decimal("1000.00"),
            performed_by=self.admin,
            reference_no="RENT-F15B-001",
            finance_account_id=self.finance_account.id,
            payment_method="CASH",
            payment_date=self.today,
            idempotency_key="rent-f15b-key-001",
        )

        evidence = RentLeaseCollection.objects.get()
        self.assertEqual(returned.id, demand.id)
        self.assertEqual(evidence.demand_id, demand.id)
        self.assertEqual(evidence.subscription_id, subscription.id)
        self.assertEqual(evidence.contract_reference.subscription_id, subscription.id)
        self.assertEqual(evidence.customer_id, self.customer.id)
        self.assertEqual(evidence.plan_type, PlanType.RENT)
        self.assertEqual(evidence.amount, Decimal("1000.00"))
        self.assertEqual(evidence.payment_date, self.today)
        self.assertEqual(evidence.payment_method, "CASH")
        self.assertEqual(evidence.finance_account_id, self.finance_account.id)
        self.assertEqual(evidence.status, RentLeaseCollectionStatus.ACTIVE)
        self.assertEqual(evidence.created_by_id, self.admin.id)
        self.assertEqual(evidence.external_reference_no, "RENT-F15B-001")
        self.assertEqual(evidence.idempotency_key, "rent-f15b-key-001")
        self.assertTrue(evidence.collection_number.startswith("RLC-"))
        returned.refresh_from_db()
        self.assertEqual(returned.collected_amount, Decimal("1000.00"))
        self.assertIn(returned.status, {RentLeaseDemandStatus.PARTIAL, RentLeaseDemandStatus.PAID})
        self._assert_no_posting_side_effects()

    def test_lease_collection_creates_concrete_evidence_row(self):
        subscription = self._lease_subscription()
        demand = self._first_monthly_demand(subscription)

        collect_rent_lease_monthly_demand(
            subscription=subscription,
            demand_id=demand.id,
            amount=Decimal("1000.00"),
            performed_by=self.admin,
            reference_no="LEASE-F15B-001",
            finance_account_id=self.finance_account.id,
            payment_method="UPI",
            payment_date=self.today,
            idempotency_key="lease-f15b-key-001",
        )

        evidence = RentLeaseCollection.objects.get()
        self.assertEqual(evidence.plan_type, PlanType.LEASE)
        self.assertEqual(evidence.demand_id, demand.id)
        self.assertEqual(evidence.subscription_id, subscription.id)
        self.assertEqual(evidence.customer_id, self.customer.id)
        self.assertEqual(evidence.amount, Decimal("1000.00"))
        self.assertEqual(evidence.payment_method, "UPI")
        self.assertEqual(evidence.finance_account_id, self.finance_account.id)
        self._assert_no_posting_side_effects()

    def test_idempotency_prevents_duplicate_source_rows_and_preserves_demand_total(self):
        subscription = self._rent_subscription()
        demand = self._first_monthly_demand(subscription)

        first = collect_rent_lease_monthly_demand(
            subscription=subscription,
            demand_id=demand.id,
            amount=Decimal("1000.00"),
            performed_by=self.admin,
            reference_no="RENT-IDEM-001",
            finance_account_id=self.finance_account.id,
            payment_method="CASH",
            payment_date=self.today,
            idempotency_key="rent-idem-key",
        )
        second = collect_rent_lease_monthly_demand(
            subscription=subscription,
            demand_id=demand.id,
            amount=Decimal("1000.00"),
            performed_by=self.admin,
            reference_no="RENT-IDEM-001",
            finance_account_id=self.finance_account.id,
            payment_method="CASH",
            payment_date=self.today,
            idempotency_key="rent-idem-key",
        )

        self.assertEqual(RentLeaseCollection.objects.count(), 1)
        self.assertEqual(getattr(second, "_rent_lease_collection_created"), False)
        first.refresh_from_db()
        self.assertEqual(first.collected_amount, Decimal("1000.00"))
        self._assert_no_posting_side_effects()

    def test_duplicate_reference_with_different_amount_is_rejected(self):
        subscription = self._rent_subscription()
        demand = self._first_monthly_demand(subscription)
        collect_rent_lease_monthly_demand(
            subscription=subscription,
            demand_id=demand.id,
            amount=Decimal("1000.00"),
            performed_by=self.admin,
            reference_no="RENT-DUP-001",
            finance_account_id=self.finance_account.id,
            payment_method="CASH",
            payment_date=self.today,
        )
        with self.assertRaises(ValidationError):
            collect_rent_lease_monthly_demand(
                subscription=subscription,
                demand_id=demand.id,
                amount=Decimal("900.00"),
                performed_by=self.admin,
                reference_no="RENT-DUP-001",
                finance_account_id=self.finance_account.id,
                payment_method="CASH",
                payment_date=self.today,
            )
        self.assertEqual(RentLeaseCollection.objects.count(), 1)

    def test_security_deposit_and_refund_are_not_classified_as_rent_lease_collection(self):
        subscription = self._lease_subscription()
        collect_security_deposit(
            subscription=subscription,
            amount=Decimal("3000.00"),
            performed_by=self.admin,
            reference_no="DEP-F15B-001",
        )
        record_deposit_refund(
            subscription=subscription,
            amount=Decimal("1000.00"),
            performed_by=self.admin,
            reference_no="REF-F15B-001",
        )
        self.assertEqual(RentLeaseCollection.objects.count(), 0)
        self.assertGreaterEqual(RentLeaseDepositTransaction.objects.count(), 2)

    def test_customer_advance_is_not_classified_as_rent_lease_collection(self):
        CustomerAdvance = apps.get_model("subscriptions", "CustomerAdvance")
        CustomerAdvance.objects.create(
            customer=self.customer,
            finance_account=self.finance_account,
            amount=Decimal("500.00"),
            unapplied_amount=Decimal("500.00"),
            method="CASH",
            reference_no="ADV-F15B-001",
            payment_date=self.today,
            notes="Advance source should stay separate.",
            allocation_metadata={"phase": "F15B"},
            collected_by=self.admin,
        )
        self.assertEqual(RentLeaseCollection.objects.count(), 0)

    def test_source_evidence_survives_normal_demand_status_updates(self):
        subscription = self._rent_subscription()
        demand = self._first_monthly_demand(subscription)
        collect_rent_lease_monthly_demand(
            subscription=subscription,
            demand_id=demand.id,
            amount=Decimal("1000.00"),
            performed_by=self.admin,
            reference_no="RENT-SURVIVE-001",
            finance_account_id=self.finance_account.id,
            payment_method="BANK",
            payment_date=self.today,
        )
        evidence_id = RentLeaseCollection.objects.get().id
        demand.refresh_from_db()
        demand.metadata = {**(demand.metadata or {}), "status_note": "normal update"}
        demand.save(update_fields=["metadata", "updated_at"])
        self.assertTrue(RentLeaseCollection.objects.filter(pk=evidence_id).exists())

    def test_source_evidence_is_immutable_but_void_status_is_explicit(self):
        subscription = self._rent_subscription()
        demand = self._first_monthly_demand(subscription)
        collect_rent_lease_monthly_demand(
            subscription=subscription,
            demand_id=demand.id,
            amount=Decimal("1000.00"),
            performed_by=self.admin,
            reference_no="RENT-VOID-001",
            finance_account_id=self.finance_account.id,
            payment_method="CASH",
            payment_date=self.today,
        )
        evidence = RentLeaseCollection.objects.get()
        evidence.amount = Decimal("999.00")
        with self.assertRaises(ValidationError):
            evidence.save()

        evidence.refresh_from_db()
        evidence.status = RentLeaseCollectionStatus.VOIDED
        evidence.voided_at = timezone.now()
        evidence.voided_by = self.admin
        evidence.void_reason = "Operator void evidence marker; financial reversal remains separate."
        evidence.save()
        evidence.refresh_from_db()
        self.assertEqual(evidence.status, RentLeaseCollectionStatus.VOIDED)
