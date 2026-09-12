"""Rent/lease return → inspection → stock back → deposit, end to end.

Before this was wired through:
* initiating a return tried HANDED_OVER → RETURNED, which the state machine
  rejects; the error was swallowed and the contract stayed HANDED_OVER;
* approving the inspection looked for ``product.inventory_item`` (the relation
  is ``inventory_profile``), so no stock ever came back;
* the deposit refund could be approved twice (inspection + deposits page).
"""
from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from contracts.services.rent_lease_billing_service import (
    approvable_deposit_refund_amount,
    approve_deposit_refund,
    build_deposit_settlement,
    ensure_security_deposit_demand,
    record_deposit_refund,
)
from contracts.services.rent_lease_contract_service import create_rent_contract
from deliveries.services.product_possession_service import initiate_return
from deliveries.services.return_inspection_service import (
    approve_inspection,
    complete_inspected_return,
    create_return_inspection,
    record_inspection,
    release_returned_asset,
)
from inventory.models import InventoryItem, StockLedger, StockLocation, StockMovementType
from payments.models import RentLeaseBillingDemand, RentLeaseDepositTransaction
from subscriptions.models import (
    InspectionCondition,
    InspectionOutcome,
    PossessionStatus,
    Product,
    ProductPossession,
    RentalAsset,
    RentalAssetStatus,
    RentLeaseDemandStatus,
    RentLeaseDemandType,
    RentLeaseDepositTransactionType,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.subscription_financial_service import build_subscription_financial_snapshot
from tests.helpers import create_admin_user, create_customer_profile, create_product

REFUNDABLE = Decimal("3700.00")


class RentLeaseReturnFlowTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="return_flow_admin", phone="9105000001")
        self.customer = create_customer_profile(name="Return Flow Customer", phone="9105000002")
        product = create_product(
            name="Return Flow Bed",
            product_code="RETURN-FLOW",
            base_price=Decimal("12000.00"),
        )
        Product.objects.filter(pk=product.pk).update(is_rent_enabled=True)
        product.refresh_from_db()
        location = StockLocation.objects.create(code="RETFLOW", name="Return Flow Store")
        self.item = InventoryItem.objects.create(
            product=product,
            sku="RETURN-FLOW",
            unit_of_measure="PCS",
            default_stock_location=location,
            opening_stock_qty=Decimal("0.000"),
            standard_unit_cost=Decimal("9000.00"),
        )
        StockLedger.objects.create(
            inventory_item=self.item,
            movement_type=StockMovementType.OPENING_BALANCE_IN,
            movement_date=date(2026, 6, 1),
            stock_location=location,
            quantity_in=Decimal("1.000"),
            quantity_out=Decimal("0.000"),
            reference_model="OpeningStockEntry",
            reference_id="RETFLOW-1",
        )
        self.subscription = create_rent_contract(
            customer=self.customer,
            product=product,
            tenure_months=6,
            start_date=date(2026, 6, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        # Handed over: one unit out on hire, asset with the customer.
        StockLedger.objects.create(
            inventory_item=self.item,
            movement_type=StockMovementType.RENT_HANDOVER_OUT,
            movement_date=date(2026, 6, 2),
            stock_location=location,
            quantity_in=Decimal("0.000"),
            quantity_out=Decimal("1.000"),
            reference_model="SubscriptionDelivery",
            reference_id="RETFLOW-HANDOVER",
        )
        Subscription.objects.filter(pk=self.subscription.pk).update(status=SubscriptionStatus.HANDED_OVER)
        self.subscription.refresh_from_db()
        ProductPossession.objects.filter(subscription=self.subscription).update(
            status=PossessionStatus.WITH_CUSTOMER
        )
        self.asset = RentalAsset.objects.create(
            product=product,
            inventory_item=self.item,
            asset_code="RA-RETFLOW-001",
            serial_no="SN-RETFLOW-1",
            purchase_cost=Decimal("9000.00"),
            status=RentalAssetStatus.HANDED_OVER,
            current_subscription=self.subscription,
            current_customer=self.customer,
        )
        # Deposit collected and fully refundable.
        demand = ensure_security_deposit_demand(subscription=self.subscription, performed_by=self.admin)
        type(demand).objects.filter(pk=demand.pk).update(
            collected_amount=REFUNDABLE, held_amount=REFUNDABLE, refundable_amount=REFUNDABLE
        )

    def _approved_inspection(self, outcome, *, refund=REFUNDABLE):
        inspection = create_return_inspection(subscription=self.subscription, performed_by=self.admin)
        record_inspection(
            inspection=inspection,
            inspected_by=self.admin,
            condition=InspectionCondition.GOOD,
            outcome=outcome,
            deposit_refund_amount=refund,
        )
        return approve_inspection(inspection=inspection, approved_by=self.admin)

    def _movements(self):
        return list(
            StockLedger.objects.filter(inventory_item=self.item)
            .exclude(movement_type__in=[StockMovementType.OPENING_BALANCE_IN, StockMovementType.RENT_HANDOVER_OUT])
            .order_by("pk")
            .values_list("movement_type", "quantity_in", "quantity_out")
        )

    def test_initiate_return_moves_contract_to_return_pending(self):
        possession = ProductPossession.objects.get(subscription=self.subscription)

        initiate_return(possession=possession, performed_by=self.admin)

        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, SubscriptionStatus.RETURN_PENDING)

    def test_maintenance_outcome_brings_unit_back_then_holds_it(self):
        self._approved_inspection(InspectionOutcome.MAINTENANCE_REQUIRED)

        self.assertEqual(
            self._movements(),
            [
                (StockMovementType.RENT_RETURN_IN, Decimal("1.000"), Decimal("0.000")),
                (StockMovementType.MAINTENANCE_HOLD, Decimal("0.000"), Decimal("1.000")),
            ],
        )
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.status, RentalAssetStatus.UNDER_REPAIR)
        self.assertIsNone(self.asset.current_subscription_id)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, SubscriptionStatus.RETURNED)

    def test_sellable_outcome_restocks_once_and_frees_the_asset(self):
        self._approved_inspection(InspectionOutcome.SELLABLE)

        self.assertEqual(
            self._movements(),
            [(StockMovementType.RENT_RETURN_IN, Decimal("1.000"), Decimal("0.000"))],
        )
        self.item.refresh_from_db()
        self.assertEqual(self.item.current_stock_quantity(), Decimal("1.000"))
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.status, RentalAssetStatus.AVAILABLE)

    def test_asset_returned_at_delivery_desk_first_is_still_routed(self):
        # The delivery desk closed the return before the inspection: the asset
        # is RETURNED and no longer linked to the contract.
        from deliveries.services.rental_asset_lifecycle_service import mark_asset_returned

        mark_asset_returned(self.asset, performed_by=self.admin)

        self._approved_inspection(InspectionOutcome.MAINTENANCE_REQUIRED)

        self.asset.refresh_from_db()
        self.assertEqual(self.asset.status, RentalAssetStatus.UNDER_REPAIR)

    def test_returned_asset_is_found_from_its_contract(self):
        from deliveries.services.rental_asset_lifecycle_service import mark_asset_returned
        from deliveries.services.return_inspection_service import (
            returned_asset_id_for_subscription,
        )

        self.assertIsNone(returned_asset_id_for_subscription(self.subscription.pk))

        mark_asset_returned(self.asset, performed_by=self.admin)

        self.assertEqual(returned_asset_id_for_subscription(self.subscription.pk), self.asset.pk)

    def test_completing_the_return_again_posts_nothing_new(self):
        inspection = self._approved_inspection(InspectionOutcome.MAINTENANCE_REQUIRED)
        before = self._movements()

        complete_inspected_return(inspection, performed_by=self.admin)

        self.assertEqual(self._movements(), before)

    def test_release_lifts_maintenance_hold_and_frees_the_asset(self):
        self._approved_inspection(InspectionOutcome.MAINTENANCE_REQUIRED)

        release_returned_asset(self.asset, performed_by=self.admin)

        self.asset.refresh_from_db()
        self.assertEqual(self.asset.status, RentalAssetStatus.AVAILABLE)
        releases = StockLedger.objects.filter(
            inventory_item=self.item, movement_type=StockMovementType.MAINTENANCE_RELEASE
        )
        self.assertEqual(list(releases.values_list("quantity_in", flat=True)), [Decimal("1.000")])
        # Physical stock was never reduced by the soft hold.
        self.item.refresh_from_db()
        self.assertEqual(self.item.current_stock_quantity(), Decimal("1.000"))

        with self.assertRaises(ValidationError):
            release_returned_asset(self.asset, performed_by=self.admin)
        self.assertEqual(releases.count(), 1)

    def test_deposit_refund_cannot_be_approved_twice(self):
        approve_deposit_refund(subscription=self.subscription, amount=REFUNDABLE, approved_by=self.admin)

        with self.assertRaises(ValidationError):
            approve_deposit_refund(subscription=self.subscription, amount=REFUNDABLE, approved_by=self.admin)
        self.assertEqual(approvable_deposit_refund_amount(subscription=self.subscription), Decimal("0.00"))

    def test_inspection_does_not_reapprove_a_refund_already_approved(self):
        approve_deposit_refund(subscription=self.subscription, amount=REFUNDABLE, approved_by=self.admin)

        self._approved_inspection(InspectionOutcome.SELLABLE)

        approvals = RentLeaseDepositTransaction.objects.filter(
            subscription=self.subscription,
            transaction_type=RentLeaseDepositTransactionType.REFUND_APPROVED,
        )
        self.assertEqual(approvals.count(), 1)

    def _rent_demand(self, month: int, *, collected="0.00", status=RentLeaseDemandStatus.PENDING):
        start = date(2027, month, 1)
        return RentLeaseBillingDemand.objects.create(
            subscription=self.subscription,
            demand_type=RentLeaseDemandType.RENT_MONTHLY,
            status=status,
            billing_period_start=start,
            billing_period_end=date(2027, month + 1, 1),
            due_date=start,
            amount=Decimal("2000.00"),
            collected_amount=Decimal(collected),
            reference_key=f"RETFLOW-RENT-{month}",
        )

    def test_return_cancels_unbilled_future_rent_and_clears_outstanding(self):
        # Months after the return: one paid in advance, one part-paid, two untouched.
        RentLeaseBillingDemand.objects.filter(
            subscription=self.subscription, demand_type=RentLeaseDemandType.RENT_MONTHLY
        ).delete()
        paid = self._rent_demand(1, collected="2000.00", status=RentLeaseDemandStatus.PAID)
        partial = self._rent_demand(2, collected="500.00", status=RentLeaseDemandStatus.PARTIAL)
        untouched = [self._rent_demand(3), self._rent_demand(4)]

        self._approved_inspection(InspectionOutcome.SELLABLE)

        for demand in untouched:
            demand.refresh_from_db()
            self.assertEqual(demand.status, RentLeaseDemandStatus.CANCELLED)
            self.assertEqual(demand.metadata["cancelled_reason"], "GOODS_RETURNED")
        paid.refresh_from_db()
        partial.refresh_from_db()
        self.assertEqual(paid.status, RentLeaseDemandStatus.PAID)
        self.assertEqual(partial.status, RentLeaseDemandStatus.PARTIAL)

        snapshot = build_subscription_financial_snapshot(Subscription.objects.get(pk=self.subscription.pk))
        # Only the part-paid month's balance is still owed.
        self.assertEqual(snapshot["outstanding_amount"], "1500.00")

    def test_deposit_settlement_shows_received_deducted_and_refund_owed(self):
        demand = ensure_security_deposit_demand(subscription=self.subscription, performed_by=self.admin)
        # setUp marks 3,700 collected; keep the demand amount consistent with it.
        type(demand).objects.filter(pk=demand.pk).update(
            amount=REFUNDABLE,
            deducted_amount=Decimal("500.00"),
            held_amount=Decimal("3200.00"),
            refundable_amount=Decimal("3200.00"),
        )
        RentLeaseDepositTransaction.objects.create(
            subscription=self.subscription,
            demand=demand,
            customer=self.customer,
            plan_type=self.subscription.plan_type,
            transaction_type=RentLeaseDepositTransactionType.DEDUCTION,
            amount=Decimal("500.00"),
            reason="Scratched headboard",
            performed_by=self.admin,
        )
        approve_deposit_refund(subscription=self.subscription, amount=Decimal("3200.00"), approved_by=self.admin)

        statement = build_deposit_settlement(self.subscription)
        self.assertEqual(statement["received"], "3700.00")
        self.assertEqual(statement["deducted"], "500.00")
        self.assertEqual(statement["deductions"][0]["reason"], "Scratched headboard")
        self.assertEqual(statement["refund_due"], "3200.00")
        self.assertEqual(statement["refund_paid"], "0.00")
        self.assertEqual(statement["refund_balance"], "3200.00")
        self.assertEqual(statement["status"], "REFUND_PENDING")

        record_deposit_refund(subscription=self.subscription, amount=Decimal("3200.00"), performed_by=self.admin)

        statement = build_deposit_settlement(self.subscription)
        self.assertEqual(statement["refund_paid"], "3200.00")
        self.assertEqual(statement["refund_balance"], "0.00")
        self.assertEqual(statement["status"], "SETTLED")
