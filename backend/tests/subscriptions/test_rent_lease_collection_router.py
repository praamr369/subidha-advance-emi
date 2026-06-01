from datetime import date
from decimal import Decimal

from django.apps import apps
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, JournalEntry
from subscriptions.models import (
    AuditLog,
    Payment,
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandStatus,
    RentLeaseDemandType,
    RentLeaseDepositTransaction,
)
from subscriptions.services.rent_lease_billing_service import (
    collect_security_deposit,
    ensure_security_deposit_demand,
    generate_monthly_demands_for_subscription,
)
from subscriptions.services.rent_lease_contract_service import create_lease_contract, create_rent_contract
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_customer_profile,
    create_partner_user,
    create_payment_collection_finance_account,
    create_product,
)


def _model_count(app_label: str, model_name: str) -> int | None:
    try:
        model = apps.get_model(app_label, model_name)
    except LookupError:
        return None
    return model.objects.count()


class RentLeaseUnifiedCollectionRouterTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="rl_collect_admin", phone="9101000001")
        self.cashier = create_cashier_user(username="rl_collect_cashier", phone="9101000002")
        self.partner = create_partner_user(username="rl_collect_partner", phone="9101000003")
        self.customer = create_customer_profile(name="RL Collection Customer", phone="9101000004")
        self.finance_account = create_payment_collection_finance_account(
            code="RL-COLL-CASH",
            name="RL Collection Cash Desk",
            kind="CASH",
        )
        self.rent_product = create_product(
            name="Rent Collection Sofa",
            product_code="RL-RENT-COLLECT",
            base_price=Decimal("12000.00"),
        )
        self.rent_product.is_rent_enabled = True
        self.rent_product.save(update_fields=["is_rent_enabled"])
        self.lease_product = create_product(
            name="Lease Collection Bed",
            product_code="RL-LEASE-COLLECT",
            base_price=Decimal("18000.00"),
        )
        self.lease_product.is_lease_enabled = True
        self.lease_product.save(update_fields=["is_lease_enabled"])

    def _collect(self, subscription, amount="1000.00", reference_no="RL-COLLECT-001"):
        self.client.force_authenticate(user=self.admin)
        return self.client.post(
            "/api/v1/admin/receivables/collect/",
            {
                "source_type": subscription.plan_type,
                "source_id": subscription.id,
                "amount": amount,
                "payment_method": "CASH",
                "finance_account_id": self.finance_account.id,
                "reference_no": reference_no,
                "payment_date": "2026-06-01",
                "note": "source collection test",
            },
            format="json",
        )

    def test_admin_can_collect_rent_security_deposit_without_payment_or_journal(self):
        subscription = create_rent_contract(
            customer=self.customer,
            product=self.rent_product,
            tenure_months=6,
            start_date=date(2026, 6, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        ensure_security_deposit_demand(subscription=subscription, performed_by=self.admin)
        before = {
            "payments": Payment.objects.count(),
            "journals": JournalEntry.objects.count(),
            "receipts": _model_count("billing", "ReceiptDocument"),
            "movements": _model_count("accounting", "MoneyMovement"),
            "settlements": _model_count("settlements", "SettlementAllocation"),
            "reconciliation_items": _model_count("reconciliation", "ReconciliationItem"),
        }

        response = self._collect(subscription, amount="1000.00", reference_no="RL-DEP-COLLECT-001")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["source_type"], "RENT")
        self.assertEqual(response.data["demand_type"], RentLeaseDemandType.SECURITY_DEPOSIT)
        demand = RentLeaseBillingDemand.objects.get(pk=response.data["demand_id"])
        self.assertEqual(demand.collected_amount, Decimal("1000.00"))
        self.assertEqual(demand.status, RentLeaseDemandStatus.PARTIAL)
        tx = RentLeaseDepositTransaction.objects.filter(
            subscription=subscription,
            demand=demand,
            transaction_type="COLLECTED",
        ).latest("id")
        self.assertEqual(tx.metadata["reference_no"], "RL-DEP-COLLECT-001")
        self.assertEqual(tx.metadata["finance_account_id"], self.finance_account.id)
        self.assertEqual(Payment.objects.count(), before["payments"])
        self.assertEqual(JournalEntry.objects.count(), before["journals"])
        for key, count in before.items():
            if count is not None and key not in {"payments", "journals"}:
                app_model = {
                    "receipts": ("billing", "ReceiptDocument"),
                    "movements": ("accounting", "MoneyMovement"),
                    "settlements": ("settlements", "SettlementAllocation"),
                    "reconciliation_items": ("reconciliation", "ReconciliationItem"),
                }[key]
                self.assertEqual(_model_count(*app_model), count)

    def test_admin_can_collect_monthly_rent_after_deposit_is_paid(self):
        subscription = create_rent_contract(
            customer=self.customer,
            product=self.rent_product,
            tenure_months=6,
            start_date=date(2026, 6, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        collect_security_deposit(
            subscription=subscription,
            amount=Decimal("2400.00"),
            performed_by=self.admin,
            reference_no="RL-DEP-PAID",
        )
        generate_monthly_demands_for_subscription(
            subscription=subscription,
            through_date=date(2026, 6, 1),
            performed_by=self.admin,
        )

        response = self._collect(subscription, amount="1000.00", reference_no="RL-RENT-MONTHLY-001")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["demand_type"], RentLeaseDemandType.RENT_MONTHLY)
        demand = RentLeaseBillingDemand.objects.get(pk=response.data["demand_id"])
        self.assertEqual(demand.collected_amount, Decimal("1000.00"))
        self.assertEqual(demand.status, RentLeaseDemandStatus.PARTIAL)
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="Subscription",
                object_id=subscription.id,
                metadata__event="RENT_LEASE_MONTHLY_DEMAND_COLLECTED",
            ).exists()
        )

    def test_admin_can_collect_monthly_lease_after_deposit_is_paid(self):
        subscription = create_lease_contract(
            customer=self.customer,
            product=self.lease_product,
            tenure_months=6,
            start_date=date(2026, 6, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        collect_security_deposit(
            subscription=subscription,
            amount=Decimal("3600.00"),
            performed_by=self.admin,
            reference_no="RL-LEASE-DEP-PAID",
        )
        generate_monthly_demands_for_subscription(
            subscription=subscription,
            through_date=date(2026, 6, 1),
            performed_by=self.admin,
        )

        response = self._collect(subscription, amount="1500.00", reference_no="RL-LEASE-MONTHLY-001")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["source_type"], PlanType.LEASE)
        self.assertEqual(response.data["demand_type"], RentLeaseDemandType.LEASE_MONTHLY)
        demand = RentLeaseBillingDemand.objects.get(pk=response.data["demand_id"])
        self.assertEqual(demand.collected_amount, Decimal("1500.00"))
        self.assertEqual(demand.status, RentLeaseDemandStatus.PARTIAL)

    def test_over_collection_is_rejected(self):
        subscription = create_rent_contract(
            customer=self.customer,
            product=self.rent_product,
            tenure_months=6,
            start_date=date(2026, 6, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        ensure_security_deposit_demand(subscription=subscription, performed_by=self.admin)

        response = self._collect(subscription, amount="999999.00", reference_no="RL-OVER-COLLECT")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        demand = RentLeaseBillingDemand.objects.get(
            subscription=subscription,
            demand_type=RentLeaseDemandType.SECURITY_DEPOSIT,
        )
        self.assertEqual(demand.collected_amount, Decimal("0.00"))

    def test_partner_cannot_use_admin_rent_lease_collection_endpoint(self):
        subscription = create_rent_contract(
            customer=self.customer,
            product=self.rent_product,
            tenure_months=6,
            start_date=date(2026, 6, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        ensure_security_deposit_demand(subscription=subscription, performed_by=self.admin)
        self.client.force_authenticate(user=self.partner)

        response = self.client.post(
            "/api/v1/admin/receivables/collect/",
            {
                "source_type": "RENT",
                "source_id": subscription.id,
                "amount": "100.00",
                "payment_method": "CASH",
                "finance_account_id": self.finance_account.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
