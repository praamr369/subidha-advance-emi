from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal

from django.db.models import Q

from billing.models import (
    BillingDocumentStatus,
    BillingInvoice,
    DirectSaleReturn,
    DirectSaleReturnStatus,
    PurchaseReturn,
    PurchaseReturnLine,
    PurchaseReturnStatus,
)
from inventory.models import (
    GoodsReceipt,
    GoodsReceiptStatus,
    InventoryItem,
    PurchaseBill,
    PurchaseBillStatus,
    QUANTITY_ZERO,
    SOFT_HOLD_MOVEMENT_TYPES,
    StockAdjustment,
    StockAdjustmentStatus,
    StockLedger,
    StockMovementType,
)
from manufacturing.models import (
    ProductionJob,
    ProductionJobStatus,
    ProductionMaterialEntryKind,
)
from subscriptions.models import DeliveryStatus, SubscriptionDelivery
from reconciliation.models import (
    ReconciliationEvidence,
    ReconciliationItem,
    ReconciliationItemStatus,
    ReconciliationSeverity,
)


MODULE_INVENTORY = "inventory"
MODULE_MANUFACTURING = "manufacturing"
MODULE_PURCHASE = "purchase"
MODULE_DELIVERY = "delivery"
MODULE_EXCHANGE = "exchange"


def _qty(value) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.001"))


def _date_range_filter(prefix: str, date_from, date_to) -> Q:
    q = Q()
    if date_from:
        q &= Q(**{f"{prefix}__gte": date_from})
    if date_to:
        q &= Q(**{f"{prefix}__lte": date_to})
    return q


@dataclass(frozen=True)
class StockLedgerReferenceSpec:
    reference_model: str
    allowed_source_model: str
    reference_id_regex: str
    allowed_movement_types: frozenset[str]
    expected_direction: str  # "IN" | "OUT"
    evidence_label: str

    def reference_id_is_valid(self, reference_id: str) -> bool:
        try:
            return re.match(self.reference_id_regex, str(reference_id or "").strip()) is not None
        except re.error:
            return False


# ---------------------------------------------------------------------------
# Phase I strict allowlist for StockLedger.reference_model/reference_id patterns
#
# IMPORTANT:
# - Only include patterns confirmed in current code paths and formatted consistently.
# - Do not use broad dynamic inference; Phase I is detection-only and must be low-noise.
# ---------------------------------------------------------------------------

STOCK_LEDGER_REFERENCE_ALLOWLIST: dict[str, StockLedgerReferenceSpec] = {
    # Evidence: inventory.services.stock_service.post_invoice_stock_movements(...)
    "BillingInvoiceLine": StockLedgerReferenceSpec(
        reference_model="BillingInvoiceLine",
        allowed_source_model="BillingInvoiceLine",
        reference_id_regex=r"^\d+:\d+$",
        allowed_movement_types=frozenset([StockMovementType.SALE_OUT]),
        expected_direction="OUT",
        evidence_label="inventory.services.stock_service.post_invoice_stock_movements",
    ),
    # Evidence: billing.services.reversal_service.post_sale_return_stock_movement(...)
    "DirectSaleReturnLine": StockLedgerReferenceSpec(
        reference_model="DirectSaleReturnLine",
        allowed_source_model="DirectSaleReturnLine",
        reference_id_regex=r"^\d+:\d+$",
        allowed_movement_types=frozenset([StockMovementType.SALE_RETURN_IN]),
        expected_direction="IN",
        evidence_label="billing.services.reversal_service.post_sale_return_stock_movement",
    ),
    # Evidence: manufacturing.services.production_service.post_production_material_movement(...)
    "ProductionMaterialIssueLine": StockLedgerReferenceSpec(
        reference_model="ProductionMaterialIssueLine",
        allowed_source_model="ProductionMaterialIssueLine",
        reference_id_regex=r"^\d+$",
        allowed_movement_types=frozenset([StockMovementType.PRODUCTION_ISSUE_OUT, StockMovementType.PRODUCTION_RETURN_IN]),
        expected_direction="MIXED",
        evidence_label="manufacturing.services.production_service.post_production_material_movement",
    ),
    # Evidence: manufacturing.services.production_service.post_production_output(...)
    "ProductionReceiptLine": StockLedgerReferenceSpec(
        reference_model="ProductionReceiptLine",
        allowed_source_model="ProductionReceiptLine",
        reference_id_regex=r"^\d+$",
        allowed_movement_types=frozenset([StockMovementType.PRODUCTION_RECEIPT_IN]),
        expected_direction="IN",
        evidence_label="manufacturing.services.production_service.post_production_output",
    ),
    # Evidence: inventory.services.procurement_service.post_goods_receipt(...)
    "GoodsReceiptLine": StockLedgerReferenceSpec(
        reference_model="GoodsReceiptLine",
        allowed_source_model="GoodsReceiptLine",
        reference_id_regex=r"^\d+:\d+$",
        allowed_movement_types=frozenset([StockMovementType.PURCHASE_IN]),
        expected_direction="IN",
        evidence_label="inventory.services.procurement_service.post_goods_receipt",
    ),
    # Evidence: inventory.services.stock_service.post_purchase_bill(...)
    "PurchaseBillLine": StockLedgerReferenceSpec(
        reference_model="PurchaseBillLine",
        allowed_source_model="PurchaseBillLine",
        reference_id_regex=r"^\d+:\d+$",
        allowed_movement_types=frozenset([StockMovementType.PURCHASE_IN]),
        expected_direction="IN",
        evidence_label="inventory.services.stock_service.post_purchase_bill",
    ),
    # Evidence: billing.services.reversal_service.post_purchase_return(...)
    "PurchaseReturnLine": StockLedgerReferenceSpec(
        reference_model="PurchaseReturnLine",
        allowed_source_model="PurchaseReturnLine",
        reference_id_regex=r"^\d+:\d+$",
        allowed_movement_types=frozenset([StockMovementType.PURCHASE_RETURN_OUT]),
        expected_direction="OUT",
        evidence_label="billing.services.reversal_service.post_purchase_return",
    ),
    # Evidence: inventory.services.stock_service.post_stock_adjustment(...)
    "StockAdjustmentLine": StockLedgerReferenceSpec(
        reference_model="StockAdjustmentLine",
        allowed_source_model="StockAdjustmentLine",
        reference_id_regex=r"^\d+:\d+$",
        allowed_movement_types=frozenset([StockMovementType.ADJUSTMENT_IN, StockMovementType.ADJUSTMENT_OUT]),
        expected_direction="MIXED",
        evidence_label="inventory.services.stock_service.post_stock_adjustment",
    ),
    # Evidence: inventory.services.opening_stock_entry_service.post_opening_stock_entry(...)
    "OpeningStockEntry": StockLedgerReferenceSpec(
        reference_model="OpeningStockEntry",
        allowed_source_model="OpeningStockEntry",
        reference_id_regex=r"^\d+$",
        allowed_movement_types=frozenset([StockMovementType.OPENING_BALANCE_IN]),
        expected_direction="IN",
        evidence_label="inventory.services.opening_stock_entry_service.post_opening_stock_entry",
    ),
    # Evidence: inventory.services.opening_stock_import_service.post_opening_stock_import(...)
    "OpeningStockImport": StockLedgerReferenceSpec(
        reference_model="OpeningStockImport",
        allowed_source_model="OpeningStockImport",
        reference_id_regex=r"^[0-9a-f]{16}:\d+:[A-Z0-9\\-]{1,30}$",
        allowed_movement_types=frozenset([StockMovementType.OPENING_BALANCE_IN]),
        expected_direction="IN",
        evidence_label="inventory.services.opening_stock_import_service.post_opening_stock_import",
    ),
    # Evidence: inventory.services.delivery_bridge_service.sync_delivery_inventory_bridge(...)
    "SubscriptionDelivery": StockLedgerReferenceSpec(
        reference_model="SubscriptionDelivery",
        allowed_source_model="SubscriptionDelivery",
        reference_id_regex=r"^\d+$",
        allowed_movement_types=frozenset(
            [
                StockMovementType.EMI_DELIVERY_OUT,
                StockMovementType.EMI_RETURN_IN,
                StockMovementType.DELIVERY_OUT,
            ]
        ),
        expected_direction="MIXED",
        evidence_label="inventory.services.delivery_bridge_service.sync_delivery_inventory_bridge",
    ),
    # Evidence: billing.services.reversal_service.post_exchange_replacement_stock_movement(...)
    "DirectSaleExchangeReplacement": StockLedgerReferenceSpec(
        reference_model="DirectSaleExchangeReplacement",
        allowed_source_model="DirectSaleExchangeReplacement",
        reference_id_regex=r"^\d+:\d+$",
        allowed_movement_types=frozenset([StockMovementType.SALE_OUT]),
        expected_direction="OUT",
        evidence_label="billing.services.reversal_service.post_exchange_replacement_stock_movement",
    ),
}


def _allowlisted(reference_model: str) -> bool:
    return str(reference_model or "").strip() in STOCK_LEDGER_REFERENCE_ALLOWLIST


def run_inventory_stock_checks(*, run, totals: dict) -> dict:
    """Phase I: deterministic inventory/stock/manufacturing reconciliation checks.

    Constraints:
    - Detection only (no mutation of StockLedger/InventoryItem/source rows).
    - Use only strict allowlisted StockLedger.reference_model/reference_id patterns.
    - Do not infer links from ambiguous strings.
    """

    date_from = run.date_from
    date_to = run.date_to
    branch_id = run.branch_id

    # I0) Allowlisted StockLedger rows with invalid reference_id format (deterministic signal; no inferred joins).
    allowlisted_models = list(STOCK_LEDGER_REFERENCE_ALLOWLIST.keys())
    bad_refs = StockLedger.objects.filter(reference_model__in=allowlisted_models)
    if branch_id:
        bad_refs = bad_refs.filter(stock_location__branch_id=branch_id)
    if date_from or date_to:
        bad_refs = bad_refs.filter(_date_range_filter("movement_date", date_from, date_to))
    totals["checked"] += bad_refs.count()
    for row in bad_refs.only(
        "id",
        "reference_model",
        "reference_id",
        "movement_type",
        "quantity_in",
        "quantity_out",
        "movement_date",
    ):
        spec = STOCK_LEDGER_REFERENCE_ALLOWLIST.get(row.reference_model)
        if not spec:
            continue
        if spec.reference_id_is_valid(row.reference_id):
            continue
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE_INVENTORY,
            source_type="StockLedger",
            source_id=str(row.id),
            source_label=f"StockLedger-{row.id}",
            severity=ReconciliationSeverity.HIGH,
            status=ReconciliationItemStatus.NEEDS_REVIEW,
            exception_code="STOCK_LEDGER_REFERENCE_FORMAT_INVALID",
            exception_message="StockLedger reference_model is allowlisted but reference_id format is invalid for the allowlist spec.",
            recommended_action="Investigate StockLedger reference integrity. Do not infer or relink; correct only via explicit operational workflows (no auto-correction).",
            metadata={
                "stock_ledger_id": row.id,
                "movement_type": row.movement_type,
                "reference_model": row.reference_model,
                "reference_id": row.reference_id,
                "allowlist_evidence": spec.evidence_label,
                "expected_reference_id_regex": spec.reference_id_regex,
            },
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="StockLedger",
            object_id=str(row.id),
            label=f"StockLedger-{row.id}",
            quantity=_qty(row.quantity_in) if _qty(row.quantity_in) > QUANTITY_ZERO else _qty(row.quantity_out),
            status=row.movement_type,
            metadata={
                "reference_model": row.reference_model,
                "reference_id": row.reference_id,
                "movement_date": str(row.movement_date),
            },
        )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    # I1/I2) GRN / GoodsReceipt stock evidence (receipt is RECEIVED -> PURCHASE_IN ledger expected).
    receipts = GoodsReceipt.objects.select_related("purchase_order", "stock_location").prefetch_related(
        "lines",
        "lines__inventory_item",
    )
    if branch_id:
        receipts = receipts.filter(branch_id=branch_id)
    if date_from or date_to:
        receipts = receipts.filter(_date_range_filter("receipt_date", date_from, date_to))
    receipts = receipts.filter(status=GoodsReceiptStatus.RECEIVED)
    totals["checked"] += receipts.count()

    for receipt in receipts:
        for line in receipt.lines.all():
            if not line.inventory_item_id:
                continue
            if not line.inventory_item.stock_tracking_enabled:
                continue

            expected_ref_model = "GoodsReceiptLine"
            expected_ref_id = f"{receipt.id}:{line.id}"
            if not _allowlisted(expected_ref_model):
                continue

            entry = (
                StockLedger.objects.filter(
                    inventory_item_id=line.inventory_item_id,
                    movement_type=StockMovementType.PURCHASE_IN,
                    reference_model=expected_ref_model,
                    reference_id=expected_ref_id,
                )
                .only("id", "quantity_in", "quantity_out", "movement_date")
                .first()
            )
            expected_qty = _qty(getattr(line, "quantity_received", None))
            if entry is None:
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_PURCHASE,
                    source_type="GoodsReceiptLine",
                    source_id=str(line.id),
                    source_label=f"{receipt.receipt_no or f'GRN-{receipt.id}'} line {line.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.MISSING_LEDGER,
                    exception_code="GOODS_RECEIPT_STOCK_IN_MISSING",
                    exception_message="GoodsReceipt is RECEIVED but expected PURCHASE_IN StockLedger entry is missing (allowlisted reference_model/reference_id).",
                    recommended_action="Re-post the goods receipt stock movement via the standard GRN workflow. Do not create StockLedger rows manually (no auto-correction).",
                    expected_quantity=expected_qty,
                    actual_quantity=QUANTITY_ZERO,
                    quantity_delta=expected_qty * Decimal("-1"),
                    metadata={
                        "goods_receipt_id": receipt.id,
                        "goods_receipt_line_id": line.id,
                        "reference_model": expected_ref_model,
                        "reference_id": expected_ref_id,
                        "allowlist_evidence": STOCK_LEDGER_REFERENCE_ALLOWLIST[expected_ref_model].evidence_label,
                    },
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="GoodsReceipt",
                    object_id=str(receipt.id),
                    label=receipt.receipt_no or f"GRN-{receipt.id}",
                    status=receipt.status,
                    metadata={"receipt_date": str(receipt.receipt_date), "purchase_order_id": receipt.purchase_order_id},
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="GoodsReceiptLine",
                    object_id=str(line.id),
                    label=f"GRN-LINE-{line.id}",
                    quantity=expected_qty,
                    metadata={"inventory_item_id": line.inventory_item_id},
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1
                continue

            actual_qty = _qty(entry.quantity_in)
            if expected_qty != actual_qty:
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_PURCHASE,
                    source_type="GoodsReceiptLine",
                    source_id=str(line.id),
                    source_label=f"{receipt.receipt_no or f'GRN-{receipt.id}'} line {line.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.QUANTITY_MISMATCH,
                    exception_code="GOODS_RECEIPT_STOCK_IN_QUANTITY_MISMATCH",
                    exception_message="GoodsReceiptLine.quantity_received does not match allowlisted StockLedger.quantity_in for PURCHASE_IN.",
                    recommended_action="Investigate goods receipt stock posting integrity (no auto-correction).",
                    expected_quantity=expected_qty,
                    actual_quantity=actual_qty,
                    quantity_delta=_qty(actual_qty - expected_qty),
                    metadata={
                        "goods_receipt_id": receipt.id,
                        "goods_receipt_line_id": line.id,
                        "stock_ledger_id": entry.id,
                        "reference_model": expected_ref_model,
                        "reference_id": expected_ref_id,
                    },
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1

    # I3/I4) Purchase bill stock evidence (bill is POSTED -> PURCHASE_IN ledger expected).
    purchase_bills = PurchaseBill.objects.select_related("vendor", "stock_location").prefetch_related(
        "lines",
        "lines__inventory_item",
    )
    if branch_id:
        purchase_bills = purchase_bills.filter(branch_id=branch_id)
    if date_from or date_to:
        purchase_bills = purchase_bills.filter(_date_range_filter("bill_date", date_from, date_to))
    purchase_bills = purchase_bills.filter(status=PurchaseBillStatus.POSTED)
    totals["checked"] += purchase_bills.count()

    for bill in purchase_bills:
        for line in bill.lines.all():
            if not line.inventory_item_id:
                continue
            if not line.inventory_item.stock_tracking_enabled:
                continue

            expected_ref_model = "PurchaseBillLine"
            expected_ref_id = f"{bill.id}:{line.id}"
            if not _allowlisted(expected_ref_model):
                continue

            entry = (
                StockLedger.objects.filter(
                    inventory_item_id=line.inventory_item_id,
                    movement_type=StockMovementType.PURCHASE_IN,
                    reference_model=expected_ref_model,
                    reference_id=expected_ref_id,
                )
                .only("id", "quantity_in", "quantity_out", "movement_date")
                .first()
            )
            expected_qty = _qty(line.quantity)
            if entry is None:
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_PURCHASE,
                    source_type="PurchaseBillLine",
                    source_id=str(line.id),
                    source_label=f"{bill.bill_no or f'PB-{bill.id}'} line {line.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.MISSING_LEDGER,
                    exception_code="PURCHASE_BILL_STOCK_IN_MISSING",
                    exception_message="PurchaseBill is POSTED but expected PURCHASE_IN StockLedger entry is missing (allowlisted reference_model/reference_id).",
                    recommended_action="Post the purchase bill via the standard purchase bill workflow (which posts stock). Do not create StockLedger rows manually (no auto-correction).",
                    expected_quantity=expected_qty,
                    actual_quantity=QUANTITY_ZERO,
                    quantity_delta=expected_qty * Decimal("-1"),
                    metadata={
                        "purchase_bill_id": bill.id,
                        "purchase_bill_line_id": line.id,
                        "reference_model": expected_ref_model,
                        "reference_id": expected_ref_id,
                        "allowlist_evidence": STOCK_LEDGER_REFERENCE_ALLOWLIST[expected_ref_model].evidence_label,
                    },
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="PurchaseBill",
                    object_id=str(bill.id),
                    label=bill.bill_no or f"PB-{bill.id}",
                    status=bill.status,
                    metadata={"bill_date": str(bill.bill_date), "vendor_id": bill.vendor_id},
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="PurchaseBillLine",
                    object_id=str(line.id),
                    label=f"PB-LINE-{line.id}",
                    quantity=expected_qty,
                    metadata={"inventory_item_id": line.inventory_item_id},
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1
                continue

            actual_qty = _qty(entry.quantity_in)
            if expected_qty != actual_qty:
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_PURCHASE,
                    source_type="PurchaseBillLine",
                    source_id=str(line.id),
                    source_label=f"{bill.bill_no or f'PB-{bill.id}'} line {line.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.QUANTITY_MISMATCH,
                    exception_code="PURCHASE_BILL_STOCK_IN_QUANTITY_MISMATCH",
                    exception_message="PurchaseBillLine.quantity does not match allowlisted StockLedger.quantity_in for PURCHASE_IN.",
                    recommended_action="Investigate purchase bill stock posting integrity (no auto-correction).",
                    expected_quantity=expected_qty,
                    actual_quantity=actual_qty,
                    quantity_delta=_qty(actual_qty - expected_qty),
                    metadata={
                        "purchase_bill_id": bill.id,
                        "purchase_bill_line_id": line.id,
                        "stock_ledger_id": entry.id,
                        "reference_model": expected_ref_model,
                        "reference_id": expected_ref_id,
                    },
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1

    # I5/I6) Purchase return stock evidence (return is POSTED -> PURCHASE_RETURN_OUT ledger expected).
    purchase_returns = PurchaseReturn.objects.select_related("purchase_bill").prefetch_related(
        "lines",
        "lines__inventory_item",
    )
    if branch_id:
        purchase_returns = purchase_returns.filter(purchase_bill__branch_id=branch_id)
    if date_from or date_to:
        purchase_returns = purchase_returns.filter(_date_range_filter("return_date", date_from, date_to))
    purchase_returns = purchase_returns.filter(status=PurchaseReturnStatus.POSTED)
    totals["checked"] += purchase_returns.count()

    for purchase_return in purchase_returns:
        for line in purchase_return.lines.all():
            if not line.inventory_item_id:
                continue
            if not line.inventory_item.stock_tracking_enabled:
                continue

            expected_ref_model = "PurchaseReturnLine"
            expected_ref_id = f"{purchase_return.id}:{line.id}"
            if not _allowlisted(expected_ref_model):
                continue

            entry = (
                StockLedger.objects.filter(
                    inventory_item_id=line.inventory_item_id,
                    movement_type=StockMovementType.PURCHASE_RETURN_OUT,
                    reference_model=expected_ref_model,
                    reference_id=expected_ref_id,
                )
                .only("id", "quantity_in", "quantity_out", "movement_date")
                .first()
            )
            expected_qty = _qty(line.quantity)
            if entry is None:
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_PURCHASE,
                    source_type="PurchaseReturnLine",
                    source_id=str(line.id),
                    source_label=f"{purchase_return.return_no or f'PR-{purchase_return.id}'} line {line.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.MISSING_LEDGER,
                    exception_code="PURCHASE_RETURN_STOCK_OUT_MISSING",
                    exception_message="PurchaseReturn is POSTED but expected PURCHASE_RETURN_OUT StockLedger entry is missing (allowlisted reference_model/reference_id).",
                    recommended_action="Post the purchase return stock movement via the standard purchase return workflow. Do not create StockLedger rows manually (no auto-correction).",
                    expected_quantity=expected_qty,
                    actual_quantity=QUANTITY_ZERO,
                    quantity_delta=expected_qty * Decimal("-1"),
                    metadata={
                        "purchase_return_id": purchase_return.id,
                        "purchase_return_line_id": line.id,
                        "reference_model": expected_ref_model,
                        "reference_id": expected_ref_id,
                        "allowlist_evidence": STOCK_LEDGER_REFERENCE_ALLOWLIST[expected_ref_model].evidence_label,
                    },
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="PurchaseReturn",
                    object_id=str(purchase_return.id),
                    label=purchase_return.return_no or f"PR-{purchase_return.id}",
                    status=purchase_return.status,
                    metadata={"return_date": str(purchase_return.return_date), "purchase_bill_id": purchase_return.purchase_bill_id},
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="PurchaseReturnLine",
                    object_id=str(line.id),
                    label=f"PR-LINE-{line.id}",
                    quantity=expected_qty,
                    metadata={"inventory_item_id": line.inventory_item_id, "purchase_bill_line_id": line.purchase_bill_line_id},
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1
                continue

            actual_qty = _qty(entry.quantity_out)
            if expected_qty != actual_qty:
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_PURCHASE,
                    source_type="PurchaseReturnLine",
                    source_id=str(line.id),
                    source_label=f"{purchase_return.return_no or f'PR-{purchase_return.id}'} line {line.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.QUANTITY_MISMATCH,
                    exception_code="PURCHASE_RETURN_STOCK_OUT_QUANTITY_MISMATCH",
                    exception_message="PurchaseReturnLine.quantity does not match allowlisted StockLedger.quantity_out for PURCHASE_RETURN_OUT.",
                    recommended_action="Investigate purchase return stock posting integrity (no auto-correction).",
                    expected_quantity=expected_qty,
                    actual_quantity=actual_qty,
                    quantity_delta=_qty(actual_qty - expected_qty),
                    metadata={
                        "purchase_return_id": purchase_return.id,
                        "purchase_return_line_id": line.id,
                        "stock_ledger_id": entry.id,
                        "reference_model": expected_ref_model,
                        "reference_id": expected_ref_id,
                    },
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1

    # I7/I8) Delivery bridge stock evidence (DELIVERED/RETURNED + bridge enabled -> allowlisted ledger expected).
    deliveries = SubscriptionDelivery.objects.select_related(
        "subscription",
        "subscription__product",
        "subscription__product__inventory_profile",
    )
    if branch_id:
        deliveries = deliveries.filter(subscription__branch_id=branch_id)
    delivered_q = _date_range_filter("delivered_at__date", date_from, date_to)
    returned_q = _date_range_filter("returned_at__date", date_from, date_to)
    created_q = _date_range_filter("created_at__date", date_from, date_to)
    if date_from or date_to:
        deliveries = deliveries.filter(delivered_q | returned_q | created_q)
    deliveries = deliveries.filter(status__in=[DeliveryStatus.DELIVERED, DeliveryStatus.RETURNED])
    totals["checked"] += deliveries.count()

    for delivery in deliveries:
        subscription = delivery.subscription
        product = getattr(subscription, "product", None)
        inventory_item = getattr(product, "inventory_profile", None) if product else None
        if inventory_item is None or not inventory_item.stock_tracking_enabled:
            continue
        if not inventory_item.delivery_stock_bridge_enabled:
            continue

        expected_ref_model = "SubscriptionDelivery"
        expected_ref_id = str(delivery.id)
        if not _allowlisted(expected_ref_model):
            continue

        expected_movement_type = (
            StockMovementType.EMI_DELIVERY_OUT if delivery.status == DeliveryStatus.DELIVERED else StockMovementType.EMI_RETURN_IN
        )
        entry = (
            StockLedger.objects.filter(
                inventory_item_id=inventory_item.id,
                movement_type=expected_movement_type,
                reference_model=expected_ref_model,
                reference_id=expected_ref_id,
            )
            .only("id", "quantity_in", "quantity_out", "movement_date")
            .first()
        )
        expected_qty = Decimal("1.000")
        if entry is None:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_DELIVERY,
                source_type="SubscriptionDelivery",
                source_id=str(delivery.id),
                source_label=delivery.delivery_reference or f"DLV-{delivery.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.MISSING_LEDGER,
                exception_code="SUBSCRIPTION_DELIVERY_STOCK_BRIDGE_MISSING",
                exception_message="SubscriptionDelivery is in a stock-relevant terminal status but expected allowlisted StockLedger bridge entry is missing.",
                recommended_action="Sync the delivery inventory bridge via the standard delivery workflow (no auto-correction).",
                expected_quantity=_qty(expected_qty),
                actual_quantity=QUANTITY_ZERO,
                quantity_delta=_qty(expected_qty) * Decimal("-1"),
                metadata={
                    "subscription_delivery_id": delivery.id,
                    "subscription_id": delivery.subscription_id,
                    "delivery_status": delivery.status,
                    "inventory_item_id": inventory_item.id,
                    "movement_type": expected_movement_type,
                    "reference_model": expected_ref_model,
                    "reference_id": expected_ref_id,
                    "allowlist_evidence": STOCK_LEDGER_REFERENCE_ALLOWLIST[expected_ref_model].evidence_label,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="SubscriptionDelivery",
                object_id=str(delivery.id),
                label=delivery.delivery_reference or f"DLV-{delivery.id}",
                status=delivery.status,
                metadata={"subscription_id": delivery.subscription_id},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1
            continue

        actual_qty = _qty(entry.quantity_out if expected_movement_type == StockMovementType.EMI_DELIVERY_OUT else entry.quantity_in)
        if _qty(expected_qty) != actual_qty:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_DELIVERY,
                source_type="SubscriptionDelivery",
                source_id=str(delivery.id),
                source_label=delivery.delivery_reference or f"DLV-{delivery.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.QUANTITY_MISMATCH,
                exception_code="SUBSCRIPTION_DELIVERY_STOCK_BRIDGE_QUANTITY_MISMATCH",
                exception_message="SubscriptionDelivery bridge expects a deterministic quantity of 1.000 but StockLedger quantity differs.",
                recommended_action="Investigate delivery bridge stock posting integrity (no auto-correction).",
                expected_quantity=_qty(expected_qty),
                actual_quantity=actual_qty,
                quantity_delta=_qty(actual_qty - _qty(expected_qty)),
                metadata={
                    "subscription_delivery_id": delivery.id,
                    "inventory_item_id": inventory_item.id,
                    "stock_ledger_id": entry.id,
                    "movement_type": expected_movement_type,
                    "reference_model": expected_ref_model,
                    "reference_id": expected_ref_id,
                },
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

    # I9) Direct sale exchange replacement stock evidence (POSTED + persisted replacement list -> allowlisted ledger expected).
    exchange_returns = DirectSaleReturn.objects.select_related("direct_sale").filter(status=DirectSaleReturnStatus.POSTED)
    if branch_id:
        exchange_returns = exchange_returns.filter(direct_sale__branch_id=branch_id)
    if date_from or date_to:
        exchange_returns = exchange_returns.filter(_date_range_filter("posted_at__date", date_from, date_to) | created_q)
    totals["checked"] += exchange_returns.count()

    for ret in exchange_returns:
        replacement_lines = list((ret.metadata or {}).get("exchange_replacement_lines") or [])
        if not replacement_lines:
            continue
        expected_ref_model = "DirectSaleExchangeReplacement"
        if not _allowlisted(expected_ref_model):
            continue
        for index, row in enumerate(replacement_lines, start=1):
            try:
                inventory_item_id = int(row.get("inventory_item_id") or 0)
            except Exception:
                inventory_item_id = 0
            if inventory_item_id <= 0:
                continue
            item = InventoryItem.objects.filter(pk=inventory_item_id).only("id", "stock_tracking_enabled").first()
            if item is None or not item.stock_tracking_enabled:
                continue
            expected_ref_id = f"{ret.id}:{index}"
            entry = StockLedger.objects.filter(
                inventory_item_id=item.id,
                movement_type=StockMovementType.SALE_OUT,
                reference_model=expected_ref_model,
                reference_id=expected_ref_id,
            ).only("id", "quantity_out", "movement_date").first()
            if entry is None:
                item_row = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_EXCHANGE,
                    source_type="DirectSaleExchangeReplacement",
                    source_id=f"{ret.id}:{index}",
                    source_label=f"{ret.return_no or f'DSRET-{ret.id}'} replacement {index}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.MISSING_LEDGER,
                    exception_code="DIRECT_SALE_EXCHANGE_REPLACEMENT_STOCK_OUT_MISSING",
                    exception_message="DirectSaleReturn has exchange replacement lines but expected allowlisted SALE_OUT StockLedger entry is missing.",
                    recommended_action="Post exchange replacement stock movement via the standard exchange workflow. Do not create StockLedger rows manually (no auto-correction).",
                    metadata={
                        "direct_sale_return_id": ret.id,
                        "reference_model": expected_ref_model,
                        "reference_id": expected_ref_id,
                        "allowlist_evidence": STOCK_LEDGER_REFERENCE_ALLOWLIST[expected_ref_model].evidence_label,
                        "replacement_index": index,
                        "inventory_item_id": item.id,
                    },
                )
                ReconciliationEvidence.objects.create(
                    item=item_row,
                    evidence_type="DirectSaleReturn",
                    object_id=str(ret.id),
                    label=ret.return_no or f"DSRET-{ret.id}",
                    status=ret.status,
                    metadata={"has_exchange_replacements": True},
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1

    # I10/I11) Stock adjustment stock evidence (POSTED -> allowlisted ADJUSTMENT_IN/OUT ledger expected).
    adjustments = StockAdjustment.objects.select_related("stock_location").prefetch_related(
        "lines",
        "lines__inventory_item",
    )
    if branch_id:
        adjustments = adjustments.filter(stock_location__branch_id=branch_id)
    if date_from or date_to:
        adjustments = adjustments.filter(_date_range_filter("adjustment_date", date_from, date_to))
    adjustments = adjustments.filter(status=StockAdjustmentStatus.POSTED)
    totals["checked"] += adjustments.count()

    for adjustment in adjustments:
        for line in adjustment.lines.all():
            if not line.inventory_item_id:
                continue
            if not line.inventory_item.stock_tracking_enabled:
                continue
            expected_ref_model = "StockAdjustmentLine"
            expected_ref_id = f"{adjustment.id}:{line.id}"
            if not _allowlisted(expected_ref_model):
                continue
            movement_type = (
                StockMovementType.ADJUSTMENT_IN if _qty(line.quantity_delta) > QUANTITY_ZERO else StockMovementType.ADJUSTMENT_OUT
            )
            entry = StockLedger.objects.filter(
                inventory_item_id=line.inventory_item_id,
                movement_type=movement_type,
                reference_model=expected_ref_model,
                reference_id=expected_ref_id,
            ).only("id", "quantity_in", "quantity_out", "movement_date").first()
            expected_qty = _qty(abs(_qty(line.quantity_delta)))
            if entry is None:
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_INVENTORY,
                    source_type="StockAdjustmentLine",
                    source_id=str(line.id),
                    source_label=f"{adjustment.adjustment_no or f'ADJ-{adjustment.id}'} line {line.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.MISSING_LEDGER,
                    exception_code="STOCK_ADJUSTMENT_STOCK_MOVEMENT_MISSING",
                    exception_message="StockAdjustment is POSTED but expected allowlisted StockLedger adjustment movement is missing.",
                    recommended_action="Post the stock adjustment via the standard adjustment workflow. Do not create StockLedger rows manually (no auto-correction).",
                    expected_quantity=expected_qty,
                    actual_quantity=QUANTITY_ZERO,
                    quantity_delta=expected_qty * Decimal("-1"),
                    metadata={
                        "stock_adjustment_id": adjustment.id,
                        "stock_adjustment_line_id": line.id,
                        "movement_type": movement_type,
                        "reference_model": expected_ref_model,
                        "reference_id": expected_ref_id,
                        "allowlist_evidence": STOCK_LEDGER_REFERENCE_ALLOWLIST[expected_ref_model].evidence_label,
                    },
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1
                continue

            actual_qty = _qty(entry.quantity_in if movement_type == StockMovementType.ADJUSTMENT_IN else entry.quantity_out)
            if expected_qty != actual_qty:
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_INVENTORY,
                    source_type="StockAdjustmentLine",
                    source_id=str(line.id),
                    source_label=f"{adjustment.adjustment_no or f'ADJ-{adjustment.id}'} line {line.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.QUANTITY_MISMATCH,
                    exception_code="STOCK_ADJUSTMENT_STOCK_QUANTITY_MISMATCH",
                    exception_message="StockAdjustmentLine.quantity_delta does not match allowlisted StockLedger quantity for adjustment movement.",
                    recommended_action="Investigate stock adjustment posting integrity (no auto-correction).",
                    expected_quantity=expected_qty,
                    actual_quantity=actual_qty,
                    quantity_delta=_qty(actual_qty - expected_qty),
                    metadata={
                        "stock_adjustment_id": adjustment.id,
                        "stock_adjustment_line_id": line.id,
                        "stock_ledger_id": entry.id,
                        "movement_type": movement_type,
                        "reference_model": expected_ref_model,
                        "reference_id": expected_ref_id,
                    },
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1

    # I1/I2) DirectSaleReturn stock restoration (only when deterministic: stock_effect + allowlisted DirectSaleReturnLine refs).
    returns = DirectSaleReturn.objects.select_related("direct_sale").prefetch_related(
        "lines",
        "lines__inventory_item",
    )
    if branch_id:
        returns = returns.filter(direct_sale__branch_id=branch_id)
    posted_q = _date_range_filter("posted_at__date", date_from, date_to)
    created_q = _date_range_filter("created_at__date", date_from, date_to)
    returns = returns.filter(posted_q | created_q).filter(status=DirectSaleReturnStatus.POSTED, stock_effect=True)
    totals["checked"] += returns.count()

    for ret in returns:
        for line in ret.lines.all():
            if not line.inventory_item_id:
                continue
            if not line.inventory_item.stock_tracking_enabled:
                continue

            expected_ref_model = "DirectSaleReturnLine"
            expected_ref_id = f"{ret.id}:{line.id}"
            if not _allowlisted(expected_ref_model):
                continue

            entry = (
                StockLedger.objects.filter(
                    inventory_item_id=line.inventory_item_id,
                    movement_type=StockMovementType.SALE_RETURN_IN,
                    reference_model=expected_ref_model,
                    reference_id=expected_ref_id,
                )
                .only("id", "quantity_in", "quantity_out", "movement_date")
                .first()
            )
            if entry is None:
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_INVENTORY,
                    source_type="DirectSaleReturnLine",
                    source_id=str(line.id),
                    source_label=f"{ret.return_no or f'DSRET-{ret.id}'} line {line.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.MISSING_SOURCE,
                    exception_code="DIRECT_SALE_RETURN_STOCK_RESTORATION_MISSING",
                    exception_message="DirectSaleReturn is POSTED and stock_effect=True, but expected SALE_RETURN_IN StockLedger entry is missing (allowlisted reference_model/reference_id).",
                    recommended_action="Post the return stock movement via the standard return workflow. Do not create StockLedger rows manually (no auto-correction).",
                    expected_quantity=_qty(line.quantity),
                    actual_quantity=QUANTITY_ZERO,
                    quantity_delta=_qty(line.quantity) * Decimal("-1"),
                    metadata={
                        "direct_sale_return_id": ret.id,
                        "direct_sale_return_line_id": line.id,
                        "reference_model": expected_ref_model,
                        "reference_id": expected_ref_id,
                        "allowlist_evidence": STOCK_LEDGER_REFERENCE_ALLOWLIST[expected_ref_model].evidence_label,
                    },
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="DirectSaleReturn",
                    object_id=str(ret.id),
                    label=ret.return_no or f"DSRET-{ret.id}",
                    status=ret.status,
                    metadata={"stock_effect": ret.stock_effect},
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="DirectSaleReturnLine",
                    object_id=str(line.id),
                    label=f"DSRET-LINE-{line.id}",
                    quantity=_qty(line.quantity),
                    metadata={
                        "inventory_item_id": line.inventory_item_id,
                        "direct_sale_line_id": line.direct_sale_line_id,
                    },
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1
                continue

            expected_qty = _qty(line.quantity)
            actual_qty = _qty(entry.quantity_in)
            if expected_qty != actual_qty:
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_INVENTORY,
                    source_type="DirectSaleReturnLine",
                    source_id=str(line.id),
                    source_label=f"{ret.return_no or f'DSRET-{ret.id}'} line {line.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.QUANTITY_MISMATCH,
                    exception_code="DIRECT_SALE_RETURN_STOCK_QUANTITY_MISMATCH",
                    exception_message="DirectSaleReturnLine.quantity does not match allowlisted StockLedger.quantity_in for SALE_RETURN_IN restoration.",
                    recommended_action="Investigate return stock posting integrity; correct only through standard return workflows (no auto-correction).",
                    expected_quantity=expected_qty,
                    actual_quantity=actual_qty,
                    quantity_delta=_qty(actual_qty - expected_qty),
                    metadata={
                        "direct_sale_return_id": ret.id,
                        "direct_sale_return_line_id": line.id,
                        "stock_ledger_id": entry.id,
                        "reference_model": expected_ref_model,
                        "reference_id": expected_ref_id,
                    },
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="DirectSaleReturnLine",
                    object_id=str(line.id),
                    label=f"DSRET-LINE-{line.id}",
                    quantity=expected_qty,
                    metadata={"inventory_item_id": line.inventory_item_id},
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="StockLedger",
                    object_id=str(entry.id),
                    label=f"StockLedger-{entry.id}",
                    quantity=actual_qty,
                    status=entry.movement_date.isoformat(),
                    metadata={
                        "movement_type": StockMovementType.SALE_RETURN_IN,
                        "reference_model": expected_ref_model,
                        "reference_id": expected_ref_id,
                    },
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1

    # I3) Direct-sale invoice stock deduction check (BillingInvoiceLine allowlisted refs only).
    invoices = BillingInvoice.objects.prefetch_related("lines", "lines__inventory_item").all()
    if branch_id:
        invoices = invoices.filter(branch_id=branch_id)
    invoices = invoices.filter(_date_range_filter("invoice_date", date_from, date_to)).filter(
        status=BillingDocumentStatus.POSTED
    )
    totals["checked"] += invoices.count()

    for inv in invoices:
        for line in inv.lines.all():
            if not line.inventory_item_id:
                continue
            if not line.inventory_item.stock_tracking_enabled:
                continue

            expected_ref_model = "BillingInvoiceLine"
            expected_ref_id = f"{inv.id}:{line.id}"
            if not _allowlisted(expected_ref_model):
                continue

            exists = StockLedger.objects.filter(
                inventory_item_id=line.inventory_item_id,
                movement_type=StockMovementType.SALE_OUT,
                reference_model=expected_ref_model,
                reference_id=expected_ref_id,
            )
            if branch_id:
                exists = exists.filter(stock_location__branch_id=branch_id)

            if not exists.exists():
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_INVENTORY,
                    source_type="BillingInvoiceLine",
                    source_id=str(line.id),
                    source_label=f"{inv.document_no or f'INV-{inv.id}'} line {line.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.MISSING_SOURCE,
                    exception_code="BILLING_INVOICE_STOCK_DEDUCTION_MISSING",
                    exception_message="BillingInvoice is POSTED but expected SALE_OUT StockLedger entry is missing for an allowlisted BillingInvoiceLine reference.",
                    recommended_action="Post invoice stock movements via the standard invoice posting workflow. Do not infer or backfill from ambiguous references (no auto-correction).",
                    expected_quantity=_qty(line.quantity),
                    actual_quantity=QUANTITY_ZERO,
                    quantity_delta=_qty(line.quantity) * Decimal("-1"),
                    metadata={
                        "billing_invoice_id": inv.id,
                        "billing_invoice_line_id": line.id,
                        "reference_model": expected_ref_model,
                        "reference_id": expected_ref_id,
                        "allowlist_evidence": STOCK_LEDGER_REFERENCE_ALLOWLIST[expected_ref_model].evidence_label,
                    },
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="BillingInvoice",
                    object_id=str(inv.id),
                    label=inv.document_no or f"INV-{inv.id}",
                    amount=inv.grand_total,
                    status=inv.status,
                    metadata={"invoice_date": str(inv.invoice_date)},
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="BillingInvoiceLine",
                    object_id=str(line.id),
                    label=f"INV-LINE-{line.id}",
                    quantity=_qty(line.quantity),
                    metadata={"inventory_item_id": line.inventory_item_id},
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1

    # I4/I5) Manufacturing job stock receipts/issues (deterministic: explicit FK from lines -> job; allowlisted refs).
    jobs = ProductionJob.objects.prefetch_related("receipt_lines", "material_issue_lines").all()
    if branch_id:
        jobs = jobs.filter(Q(stock_location__branch_id=branch_id) | Q(finished_good_inventory_item__default_stock_location__branch_id=branch_id))
    jobs = jobs.filter(_date_range_filter("job_date", date_from, date_to)).filter(status=ProductionJobStatus.COMPLETED)
    totals["checked"] += jobs.count()

    for job in jobs:
        # Finished goods receipts
        receipt_lines = [line for line in job.receipt_lines.all() if line.is_posted]
        for line in receipt_lines:
            expected_ref_model = "ProductionReceiptLine"
            if not _allowlisted(expected_ref_model):
                continue
            entry = StockLedger.objects.filter(
                inventory_item_id=line.inventory_item_id,
                movement_type=StockMovementType.PRODUCTION_RECEIPT_IN,
                reference_model=expected_ref_model,
                reference_id=str(line.id),
            ).only("id", "quantity_in").first()
            if entry is None:
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_MANUFACTURING,
                    source_type="ProductionReceiptLine",
                    source_id=str(line.id),
                    source_label=f"{job.job_no} receipt line {line.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.MISSING_SOURCE,
                    exception_code="PRODUCTION_JOB_FINISHED_GOOD_RECEIPT_STOCK_MISSING",
                    exception_message="ProductionJob is COMPLETED but an is_posted ProductionReceiptLine is missing its allowlisted StockLedger receipt entry.",
                    recommended_action="Investigate production receipt posting. Do not create StockLedger rows manually (no auto-correction).",
                    expected_quantity=_qty(line.quantity),
                    actual_quantity=QUANTITY_ZERO,
                    quantity_delta=_qty(line.quantity) * Decimal("-1"),
                    metadata={
                        "production_job_id": job.id,
                        "job_no": job.job_no,
                        "production_receipt_line_id": line.id,
                        "reference_model": expected_ref_model,
                        "reference_id": str(line.id),
                        "allowlist_evidence": STOCK_LEDGER_REFERENCE_ALLOWLIST[expected_ref_model].evidence_label,
                    },
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="ProductionJob",
                    object_id=str(job.id),
                    label=job.job_no,
                    status=job.status,
                    metadata={},
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="ProductionReceiptLine",
                    object_id=str(line.id),
                    label=f"PRCPT-{line.id}",
                    quantity=_qty(line.quantity),
                    metadata={"inventory_item_id": line.inventory_item_id},
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1
                continue
            expected_qty = _qty(line.quantity)
            actual_qty = _qty(entry.quantity_in)
            if expected_qty != actual_qty:
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_MANUFACTURING,
                    source_type="ProductionReceiptLine",
                    source_id=str(line.id),
                    source_label=f"{job.job_no} receipt line {line.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.QUANTITY_MISMATCH,
                    exception_code="PRODUCTION_JOB_FINISHED_GOOD_RECEIPT_STOCK_QUANTITY_MISMATCH",
                    exception_message="ProductionReceiptLine.quantity does not match allowlisted StockLedger.quantity_in for finished-good receipt.",
                    recommended_action="Investigate production receipt stock posting integrity (no auto-correction).",
                    expected_quantity=expected_qty,
                    actual_quantity=actual_qty,
                    quantity_delta=_qty(actual_qty - expected_qty),
                    metadata={
                        "production_job_id": job.id,
                        "production_receipt_line_id": line.id,
                        "stock_ledger_id": entry.id,
                    },
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1

        # Raw material issues/returns
        material_lines = [line for line in job.material_issue_lines.all() if line.is_posted]
        for line in material_lines:
            expected_ref_model = "ProductionMaterialIssueLine"
            if not _allowlisted(expected_ref_model):
                continue
            movement_type = (
                StockMovementType.PRODUCTION_ISSUE_OUT
                if line.entry_kind == ProductionMaterialEntryKind.ISSUE
                else StockMovementType.PRODUCTION_RETURN_IN
            )
            entry = StockLedger.objects.filter(
                inventory_item_id=line.inventory_item_id,
                movement_type=movement_type,
                reference_model=expected_ref_model,
                reference_id=str(line.id),
            ).only("id", "quantity_in", "quantity_out").first()
            if entry is None:
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_MANUFACTURING,
                    source_type="ProductionMaterialIssueLine",
                    source_id=str(line.id),
                    source_label=f"{job.job_no} material line {line.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.MISSING_SOURCE,
                    exception_code="PRODUCTION_JOB_RAW_MATERIAL_STOCK_MOVEMENT_MISSING",
                    exception_message="ProductionJob has an is_posted material movement line but its allowlisted StockLedger movement is missing.",
                    recommended_action="Investigate production material posting. Do not infer or backfill from ambiguous references (no auto-correction).",
                    expected_quantity=_qty(line.quantity),
                    actual_quantity=QUANTITY_ZERO,
                    quantity_delta=_qty(line.quantity) * Decimal("-1"),
                    metadata={
                        "production_job_id": job.id,
                        "job_no": job.job_no,
                        "production_material_issue_line_id": line.id,
                        "entry_kind": line.entry_kind,
                        "reference_model": expected_ref_model,
                        "reference_id": str(line.id),
                    },
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1
                continue

            expected_qty = _qty(line.quantity)
            actual_qty = _qty(entry.quantity_out if movement_type == StockMovementType.PRODUCTION_ISSUE_OUT else entry.quantity_in)
            if expected_qty != actual_qty:
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_MANUFACTURING,
                    source_type="ProductionMaterialIssueLine",
                    source_id=str(line.id),
                    source_label=f"{job.job_no} material line {line.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.QUANTITY_MISMATCH,
                    exception_code="PRODUCTION_JOB_RAW_MATERIAL_STOCK_QUANTITY_MISMATCH",
                    exception_message="Production material line quantity does not match allowlisted StockLedger quantity for the expected movement direction.",
                    recommended_action="Investigate production material stock posting integrity (no auto-correction).",
                    expected_quantity=expected_qty,
                    actual_quantity=actual_qty,
                    quantity_delta=_qty(actual_qty - expected_qty),
                    metadata={
                        "production_job_id": job.id,
                        "production_material_issue_line_id": line.id,
                        "stock_ledger_id": entry.id,
                        "movement_type": movement_type,
                    },
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1

    # I6) Negative stock check (only if deterministic: InventoryItem.current_stock_quantity() exists).
    items = InventoryItem.objects.filter(stock_tracking_enabled=True, is_active=True).select_related("product")
    if branch_id:
        items = items.filter(
            Q(default_stock_location__branch_id=branch_id) | Q(stock_ledger__stock_location__branch_id=branch_id)
        ).distinct()
    totals["checked"] += items.count()

    for item in items:
        # Use the existing deterministic calculation, but avoid adding any inference beyond persisted ledger.
        on_hand = _qty(item.current_stock_quantity())
        if on_hand < QUANTITY_ZERO:
            item_row = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_INVENTORY,
                source_type="InventoryItem",
                source_id=str(item.id),
                source_label=getattr(item.product, "name", "") or item.sku or f"ITEM-{item.id}",
                severity=ReconciliationSeverity.CRITICAL,
                status=ReconciliationItemStatus.QUANTITY_MISMATCH,
                exception_code="INVENTORY_NEGATIVE_STOCK",
                exception_message="InventoryItem physical on-hand stock is negative (computed deterministically from StockLedger + opening_stock_qty).",
                recommended_action="Investigate outbound postings vs receipts/returns. Correct only through standard operational workflows (no auto-correction).",
                expected_quantity=QUANTITY_ZERO,
                actual_quantity=on_hand,
                quantity_delta=on_hand,
                metadata={
                    "inventory_item_id": item.id,
                    "product_id": item.product_id,
                    "opening_stock_qty": str(item.opening_stock_qty),
                    "on_hand_qty": f"{on_hand:.3f}",
                },
            )
            ReconciliationEvidence.objects.create(
                item=item_row,
                evidence_type="InventoryItem",
                object_id=str(item.id),
                label=item.sku or f"ITEM-{item.id}",
                quantity=on_hand,
                metadata={
                    "product_code": getattr(item.product, "product_code", None),
                    "product_name": getattr(item.product, "name", None),
                },
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

    return totals
