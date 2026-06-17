"""P3B tests: Rental Asset Lifecycle.

Covers:
* Create rental asset from inventory / product
* asset_code uniqueness
* Reserve asset for RENT subscription
* Reserve asset for LEASE subscription
* Reject reservation for EMI subscription
* Reject double reservation (same asset, different subscription)
* Reject handover without prior reservation (AVAILABLE → HANDED_OVER blocked)
* Handover sets status, current_customer, current_subscription
* RETIRED asset cannot be handed over
* BEFORE_HANDOVER snapshot satisfies lease condition proof in readiness
* Document-based condition proof fallback still works (legacy)
* AFTER_RETURN snapshot records correctly
* mark_asset_returned clears current_customer / current_subscription
* Physical stock (InventoryItem) is NOT mutated by asset lifecycle service
* Audit log written for reserve / handover / return / snapshot
* Condition score out-of-range validation
* Unknown stage validation
"""
from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from subscriptions.models import (
    AssetConditionGrade,
    AssetConditionSnapshot,
    AssetConditionSnapshotStage,
    AuditLog,
    CustomerKycDocument,
    CustomerKycDocumentStatus,
    CustomerKycDocumentType,
    KycStatus,
    PlanType,
    Product,
    RentalAsset,
    RentalAssetStatus,
    SubscriptionDocument,
    SubscriptionDocumentType,
)
from subscriptions.services.contract_activation_readiness_service import (
    evaluate_contract_activation_readiness,
)
from subscriptions.services.rent_lease_contract_service import (
    create_lease_contract,
    create_rent_contract,
)
from subscriptions.services.rental_asset_lifecycle_service import (
    create_rental_asset_from_inventory,
    mark_asset_handed_over,
    mark_asset_returned,
    mark_asset_under_repair,
    record_asset_condition_snapshot,
    reserve_asset_for_subscription,
    retire_asset,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_lucky_id,
    create_product,
    create_subscription,
)

from django.core.files.uploadedfile import SimpleUploadedFile


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _small_file(name="doc.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 test", content_type="application/pdf")


def _rent_product(code="P3B-RENT-1"):
    product = create_product(name="P3B Table", product_code=code)
    Product.objects.filter(pk=product.pk).update(
        is_rent_enabled=True,
        is_lease_enabled=True,
    )
    product.refresh_from_db()
    return product


def _approve_kyc(customer):
    customer.kyc_status = KycStatus.VERIFIED
    customer.save(update_fields=["kyc_status"])
    CustomerKycDocument.objects.create(
        customer=customer,
        document_type=CustomerKycDocumentType.AADHAAR,
        file=_small_file("aadhaar.pdf"),
        status=CustomerKycDocumentStatus.APPROVED,
    )


def _make_asset(product, code="ASSET-001", admin=None):
    return create_rental_asset_from_inventory(
        product=product,
        asset_code=code,
        purchase_cost=Decimal("12000.00"),
        performed_by=admin,
    )


def _make_rent_sub(customer, product, admin):
    return create_rent_contract(
        customer=customer,
        product=product,
        tenure_months=12,
        security_deposit_percent=Decimal("20.00"),
        performed_by=admin,
        save_as_draft=True,
    )


def _make_lease_sub(customer, product, admin):
    return create_lease_contract(
        customer=customer,
        product=product,
        tenure_months=12,
        security_deposit_percent=Decimal("25.00"),
        performed_by=admin,
        save_as_draft=True,
    )


# ---------------------------------------------------------------------------
# 1. Create / asset_code uniqueness
# ---------------------------------------------------------------------------

class RentalAssetCreationTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="p3b_admin", phone="9700000001")
        self.product = _rent_product()

    def test_create_rental_asset_from_product(self):
        asset = _make_asset(self.product, admin=self.admin)
        self.assertIsNotNone(asset.pk)
        self.assertEqual(asset.status, RentalAssetStatus.AVAILABLE)
        self.assertEqual(asset.asset_code, "ASSET-001")
        self.assertEqual(asset.product, self.product)

    def test_asset_code_is_uppercased(self):
        asset = create_rental_asset_from_inventory(
            product=self.product,
            asset_code="lower-code",
        )
        self.assertEqual(asset.asset_code, "LOWER-CODE")

    def test_asset_code_unique_constraint(self):
        _make_asset(self.product, code="UNIQ-001")
        with self.assertRaises(ValidationError):
            _make_asset(self.product, code="UNIQ-001")

    def test_create_asset_blank_code_raises(self):
        with self.assertRaises(ValidationError):
            create_rental_asset_from_inventory(product=self.product, asset_code="")

    def test_create_with_inventory_item_link(self):
        from inventory.models import InventoryItem, StockLocation
        # Create a minimal InventoryItem stub if possible; skip if schema differs.
        try:
            loc = StockLocation.objects.filter(is_active=True).first()
            inv_item = self.product.inventory_profile
        except Exception:
            inv_item = None

        asset = create_rental_asset_from_inventory(
            product=self.product,
            asset_code="INV-LINK-001",
            inventory_item=inv_item,
        )
        self.assertEqual(asset.inventory_item, inv_item)


# ---------------------------------------------------------------------------
# 2. Reserve asset
# ---------------------------------------------------------------------------

class ReserveAssetTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="p3b_rsv_admin", phone="9700000002")
        self.product = _rent_product(code="P3B-RENT-2")
        self.customer = create_customer_profile(name="P3B Cust1", phone="9700000010")

    def test_reserve_for_rent_subscription(self):
        asset = _make_asset(self.product, code="RSV-RENT-001", admin=self.admin)
        sub = _make_rent_sub(self.customer, self.product, self.admin)

        asset = reserve_asset_for_subscription(asset, sub, performed_by=self.admin)

        self.assertEqual(asset.status, RentalAssetStatus.RESERVED)
        self.assertEqual(asset.current_subscription, sub)
        self.assertEqual(asset.current_customer, self.customer)

    def test_reserve_for_lease_subscription(self):
        asset = _make_asset(self.product, code="RSV-LEASE-001", admin=self.admin)
        sub = _make_lease_sub(self.customer, self.product, self.admin)

        asset = reserve_asset_for_subscription(asset, sub, performed_by=self.admin)

        self.assertEqual(asset.status, RentalAssetStatus.RESERVED)

    def test_reserve_rejected_for_emi_subscription(self):
        product_emi = create_product(product_code="P3B-EMI-1")
        batch = create_batch(batch_code="P3BEMI2026")
        lucky = create_lucky_id(batch=batch, lucky_number=5)
        emi_sub = create_subscription(
            customer=self.customer,
            product=product_emi,
            batch=batch,
            lucky_id=lucky,
        )
        asset = _make_asset(self.product, code="RSV-EMI-001", admin=self.admin)

        with self.assertRaises(ValidationError):
            reserve_asset_for_subscription(asset, emi_sub, performed_by=self.admin)

    def test_double_reservation_same_asset_different_sub_rejected(self):
        user2 = create_customer_user(username="p3b_cust2", phone="9700000011")
        customer2 = create_customer_profile(user=user2, name="P3B Cust2", phone="9700000011")
        asset = _make_asset(self.product, code="RSV-DBL-001", admin=self.admin)
        sub1 = _make_rent_sub(self.customer, self.product, self.admin)
        sub2 = _make_rent_sub(customer2, self.product, self.admin)

        reserve_asset_for_subscription(asset, sub1, performed_by=self.admin)

        with self.assertRaises(ValidationError):
            reserve_asset_for_subscription(asset, sub2, performed_by=self.admin)

    def test_reserve_from_non_available_state_rejected(self):
        asset = _make_asset(self.product, code="RSV-BAD-001", admin=self.admin)
        sub1 = _make_rent_sub(self.customer, self.product, self.admin)
        user3 = create_customer_user(username="p3b_cust3", phone="9700000012")
        sub2 = _make_rent_sub(
            create_customer_profile(user=user3, name="P3B Cust3", phone="9700000012"),
            self.product,
            self.admin,
        )
        reserve_asset_for_subscription(asset, sub1, performed_by=self.admin)
        mark_asset_handed_over(asset, sub1, performed_by=self.admin)

        with self.assertRaises(ValidationError):
            reserve_asset_for_subscription(asset, sub2, performed_by=self.admin)


# ---------------------------------------------------------------------------
# 3. Hand over asset
# ---------------------------------------------------------------------------

class HandOverAssetTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="p3b_ho_admin", phone="9700000003")
        self.product = _rent_product(code="P3B-RENT-3")
        self.customer = create_customer_profile(name="P3B Cust HO", phone="9700000020")

    def test_handover_without_reservation_rejected(self):
        asset = _make_asset(self.product, code="HO-NORSV-001", admin=self.admin)
        sub = _make_rent_sub(self.customer, self.product, self.admin)

        with self.assertRaises(ValidationError):
            mark_asset_handed_over(asset, sub, performed_by=self.admin)

    def test_handover_sets_status_and_links(self):
        asset = _make_asset(self.product, code="HO-OK-001", admin=self.admin)
        sub = _make_rent_sub(self.customer, self.product, self.admin)

        reserve_asset_for_subscription(asset, sub, performed_by=self.admin)
        asset.refresh_from_db()
        mark_asset_handed_over(asset, sub, performed_by=self.admin)
        asset.refresh_from_db()

        self.assertEqual(asset.status, RentalAssetStatus.HANDED_OVER)
        self.assertEqual(asset.current_subscription_id, sub.pk)
        self.assertEqual(asset.current_customer_id, self.customer.pk)

    def test_retired_asset_cannot_be_handed_over(self):
        asset = _make_asset(self.product, code="HO-RET-001", admin=self.admin)
        sub = _make_rent_sub(self.customer, self.product, self.admin)

        retire_asset(asset, performed_by=self.admin, reason="end of life")
        asset.refresh_from_db()

        with self.assertRaises(ValidationError):
            mark_asset_handed_over(asset, sub, performed_by=self.admin)


# ---------------------------------------------------------------------------
# 4. Condition snapshot + readiness integration
# ---------------------------------------------------------------------------

class AssetConditionSnapshotTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="p3b_snap_admin", phone="9700000004")
        self.product = _rent_product(code="P3B-RENT-4")
        self.customer = create_customer_profile(name="P3B Cust Snap", phone="9700000030")

    def test_before_handover_snapshot_satisfies_lease_condition_proof(self):
        sub = _make_lease_sub(self.customer, self.product, self.admin)
        asset = _make_asset(self.product, code="SNAP-LEASE-001", admin=self.admin)
        reserve_asset_for_subscription(asset, sub, performed_by=self.admin)
        asset.refresh_from_db()

        snap = record_asset_condition_snapshot(
            asset,
            stage=AssetConditionSnapshotStage.BEFORE_HANDOVER,
            subscription=sub,
            condition_grade=AssetConditionGrade.GOOD,
            condition_score=8,
            assessed_by=self.admin,
        )

        self.assertEqual(snap.stage, AssetConditionSnapshotStage.BEFORE_HANDOVER)
        self.assertTrue(
            sub.asset_condition_snapshots.filter(
                stage=AssetConditionSnapshotStage.BEFORE_HANDOVER
            ).exists()
        )

        # Readiness should now report condition proof satisfied (for LEASE).
        from subscriptions.services.contract_activation_readiness_service import _has_condition_proof
        self.assertTrue(_has_condition_proof(sub))

    def test_document_based_condition_proof_fallback_still_works(self):
        sub = _make_lease_sub(self.customer, self.product, self.admin)

        # No AssetConditionSnapshot — but a RETURN_INSPECTION_REPORT doc exists.
        SubscriptionDocument.objects.create(
            subscription=sub,
            document_type=SubscriptionDocumentType.RETURN_INSPECTION_REPORT,
            file=_small_file("inspect.pdf"),
        )

        from subscriptions.services.contract_activation_readiness_service import _has_condition_proof
        self.assertTrue(_has_condition_proof(sub))

    def test_after_return_snapshot_records_correctly(self):
        sub = _make_rent_sub(self.customer, self.product, self.admin)
        asset = _make_asset(self.product, code="SNAP-RTN-001", admin=self.admin)
        reserve_asset_for_subscription(asset, sub, performed_by=self.admin)
        asset.refresh_from_db()
        mark_asset_handed_over(asset, sub, performed_by=self.admin)
        asset.refresh_from_db()
        mark_asset_returned(asset, performed_by=self.admin)
        asset.refresh_from_db()

        snap = record_asset_condition_snapshot(
            asset,
            stage=AssetConditionSnapshotStage.AFTER_RETURN,
            subscription=sub,
            condition_grade=AssetConditionGrade.FAIR,
            condition_score=6,
            assessed_by=self.admin,
        )

        self.assertEqual(snap.stage, AssetConditionSnapshotStage.AFTER_RETURN)
        self.assertEqual(snap.condition_grade, AssetConditionGrade.FAIR)
        self.assertEqual(snap.condition_score, 6)

    def test_condition_score_out_of_range_rejected(self):
        sub = _make_rent_sub(self.customer, self.product, self.admin)
        asset = _make_asset(self.product, code="SNAP-SCORE-001", admin=self.admin)

        with self.assertRaises(ValidationError):
            record_asset_condition_snapshot(
                asset,
                stage=AssetConditionSnapshotStage.BEFORE_HANDOVER,
                subscription=sub,
                condition_score=11,  # out of range
            )

    def test_unknown_stage_rejected(self):
        asset = _make_asset(self.product, code="SNAP-STAGE-001", admin=self.admin)

        with self.assertRaises(ValidationError):
            record_asset_condition_snapshot(
                asset,
                stage="NOT_A_REAL_STAGE",
            )

    def test_snapshot_is_append_only(self):
        asset = _make_asset(self.product, code="SNAP-APPEND-001", admin=self.admin)
        snap1 = record_asset_condition_snapshot(
            asset,
            stage=AssetConditionSnapshotStage.BEFORE_HANDOVER,
            condition_grade=AssetConditionGrade.NEW,
        )
        snap2 = record_asset_condition_snapshot(
            asset,
            stage=AssetConditionSnapshotStage.BEFORE_HANDOVER,
            condition_grade=AssetConditionGrade.GOOD,
        )
        self.assertNotEqual(snap1.pk, snap2.pk)
        self.assertEqual(AssetConditionSnapshot.objects.filter(asset=asset).count(), 2)


# ---------------------------------------------------------------------------
# 5. Return asset
# ---------------------------------------------------------------------------

class ReturnAssetTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="p3b_rtn_admin", phone="9700000005")
        self.product = _rent_product(code="P3B-RENT-5")
        self.customer = create_customer_profile(name="P3B Cust Rtn", phone="9700000040")

    def test_return_clears_customer_and_subscription(self):
        asset = _make_asset(self.product, code="RTN-CLR-001", admin=self.admin)
        sub = _make_rent_sub(self.customer, self.product, self.admin)

        reserve_asset_for_subscription(asset, sub, performed_by=self.admin)
        asset.refresh_from_db()
        mark_asset_handed_over(asset, sub, performed_by=self.admin)
        asset.refresh_from_db()
        mark_asset_returned(asset, performed_by=self.admin)
        asset.refresh_from_db()

        self.assertEqual(asset.status, RentalAssetStatus.RETURNED)
        self.assertIsNone(asset.current_customer_id)
        self.assertIsNone(asset.current_subscription_id)

    def test_returned_asset_can_be_reserved_again(self):
        asset = _make_asset(self.product, code="RTN-REUSE-001", admin=self.admin)
        sub1 = _make_rent_sub(self.customer, self.product, self.admin)
        user2 = create_customer_user(username="p3b_rtn_cust2", phone="9700000041")
        customer2 = create_customer_profile(user=user2, name="P3B Cust2", phone="9700000041")
        sub2 = _make_rent_sub(customer2, self.product, self.admin)

        reserve_asset_for_subscription(asset, sub1, performed_by=self.admin)
        asset.refresh_from_db()
        mark_asset_handed_over(asset, sub1, performed_by=self.admin)
        asset.refresh_from_db()
        mark_asset_returned(asset, performed_by=self.admin)
        asset.refresh_from_db()
        # Mark RETURNED → AVAILABLE by sending to repair and back
        mark_asset_under_repair(asset, performed_by=self.admin, reason="routine check")
        asset.refresh_from_db()
        # Simulate clearance: manually set AVAILABLE to test re-reserve
        RentalAsset.objects.filter(pk=asset.pk).update(status=RentalAssetStatus.AVAILABLE)
        asset.refresh_from_db()

        reserve_asset_for_subscription(asset, sub2, performed_by=self.admin)
        asset.refresh_from_db()
        self.assertEqual(asset.status, RentalAssetStatus.RESERVED)
        self.assertEqual(asset.current_subscription, sub2)


# ---------------------------------------------------------------------------
# 6. Retire asset
# ---------------------------------------------------------------------------

class RetireAssetTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="p3b_ret_admin", phone="9700000006")
        self.product = _rent_product(code="P3B-RENT-6")

    def test_retire_available_asset(self):
        asset = _make_asset(self.product, code="RET-AVAIL-001", admin=self.admin)
        retire_asset(asset, performed_by=self.admin, reason="end of life")
        asset.refresh_from_db()

        self.assertEqual(asset.status, RentalAssetStatus.RETIRED)
        self.assertIsNone(asset.current_subscription_id)
        self.assertIsNone(asset.current_customer_id)

    def test_retire_already_retired_rejected(self):
        asset = _make_asset(self.product, code="RET-DBL-001", admin=self.admin)
        retire_asset(asset, performed_by=self.admin)
        asset.refresh_from_db()

        with self.assertRaises(ValidationError):
            retire_asset(asset, performed_by=self.admin)

    def test_retired_asset_cannot_be_reserved(self):
        customer = create_customer_profile(name="P3B Ret Cust", phone="9700000050")
        asset = _make_asset(self.product, code="RET-RSV-001", admin=self.admin)
        sub = _make_rent_sub(customer, self.product, self.admin)

        retire_asset(asset, performed_by=self.admin)
        asset.refresh_from_db()

        with self.assertRaises(ValidationError):
            reserve_asset_for_subscription(asset, sub, performed_by=self.admin)


# ---------------------------------------------------------------------------
# 7. Stock ledger / inventory isolation
# ---------------------------------------------------------------------------

class StockLedgerIsolationTests(TestCase):
    """Asset lifecycle must NOT mutate InventoryItem stock quantities."""

    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="p3b_stk_admin", phone="9700000007")
        self.product = _rent_product(code="P3B-RENT-7")
        self.customer = create_customer_profile(name="P3B Stk Cust", phone="9700000060")

    def test_create_asset_does_not_change_stock_qty(self):
        from inventory.models import InventoryItem
        try:
            inv_item = self.product.inventory_profile
            before_qty = inv_item.current_stock_quantity()
        except Exception:
            return  # No inventory item — skip

        _make_asset(self.product, code="STK-001", admin=self.admin)

        inv_item.refresh_from_db()
        self.assertEqual(inv_item.current_stock_quantity(), before_qty)

    def test_reserve_and_handover_do_not_change_stock_qty(self):
        from inventory.models import InventoryItem
        try:
            inv_item = self.product.inventory_profile
            before_qty = inv_item.current_stock_quantity()
        except Exception:
            return

        sub = _make_rent_sub(self.customer, self.product, self.admin)
        asset = _make_asset(self.product, code="STK-002", admin=self.admin)
        reserve_asset_for_subscription(asset, sub, performed_by=self.admin)
        asset.refresh_from_db()
        mark_asset_handed_over(asset, sub, performed_by=self.admin)

        inv_item.refresh_from_db()
        self.assertEqual(inv_item.current_stock_quantity(), before_qty)


# ---------------------------------------------------------------------------
# 8. Audit log
# ---------------------------------------------------------------------------

class AuditLogTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="p3b_audit_admin", phone="9700000008")
        self.product = _rent_product(code="P3B-RENT-8")
        self.customer = create_customer_profile(name="P3B Audit Cust", phone="9700000070")

    def _count_audit(self, action_type):
        return AuditLog.objects.filter(action_type=action_type).count()

    def test_create_writes_rental_asset_created_audit(self):
        before = self._count_audit(AuditLog.ActionType.RENTAL_ASSET_CREATED)
        _make_asset(self.product, code="AUDIT-CRE-001", admin=self.admin)
        self.assertEqual(
            self._count_audit(AuditLog.ActionType.RENTAL_ASSET_CREATED),
            before + 1,
        )

    def test_reserve_writes_rental_asset_reserved_audit(self):
        asset = _make_asset(self.product, code="AUDIT-RSV-001", admin=self.admin)
        sub = _make_rent_sub(self.customer, self.product, self.admin)
        before = self._count_audit(AuditLog.ActionType.RENTAL_ASSET_RESERVED)
        reserve_asset_for_subscription(asset, sub, performed_by=self.admin)
        self.assertEqual(
            self._count_audit(AuditLog.ActionType.RENTAL_ASSET_RESERVED),
            before + 1,
        )

    def test_handover_writes_rental_asset_handed_over_audit(self):
        asset = _make_asset(self.product, code="AUDIT-HO-001", admin=self.admin)
        sub = _make_rent_sub(self.customer, self.product, self.admin)
        reserve_asset_for_subscription(asset, sub, performed_by=self.admin)
        asset.refresh_from_db()
        before = self._count_audit(AuditLog.ActionType.RENTAL_ASSET_HANDED_OVER)
        mark_asset_handed_over(asset, sub, performed_by=self.admin)
        self.assertEqual(
            self._count_audit(AuditLog.ActionType.RENTAL_ASSET_HANDED_OVER),
            before + 1,
        )

    def test_return_writes_rental_asset_returned_audit(self):
        asset = _make_asset(self.product, code="AUDIT-RTN-001", admin=self.admin)
        sub = _make_rent_sub(self.customer, self.product, self.admin)
        reserve_asset_for_subscription(asset, sub, performed_by=self.admin)
        asset.refresh_from_db()
        mark_asset_handed_over(asset, sub, performed_by=self.admin)
        asset.refresh_from_db()
        before = self._count_audit(AuditLog.ActionType.RENTAL_ASSET_RETURNED)
        mark_asset_returned(asset, performed_by=self.admin)
        self.assertEqual(
            self._count_audit(AuditLog.ActionType.RENTAL_ASSET_RETURNED),
            before + 1,
        )

    def test_condition_snapshot_writes_audit(self):
        asset = _make_asset(self.product, code="AUDIT-SNAP-001", admin=self.admin)
        before = self._count_audit(AuditLog.ActionType.RENTAL_ASSET_CONDITION_SNAPSHOT)
        record_asset_condition_snapshot(
            asset,
            stage=AssetConditionSnapshotStage.BEFORE_HANDOVER,
            assessed_by=self.admin,
        )
        self.assertEqual(
            self._count_audit(AuditLog.ActionType.RENTAL_ASSET_CONDITION_SNAPSHOT),
            before + 1,
        )
