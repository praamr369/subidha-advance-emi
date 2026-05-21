from __future__ import annotations

import hashlib
from dataclasses import dataclass


@dataclass(frozen=True)
class StockLedgerReference:
    reference_model: str
    reference_id: str


class StockLedgerReferenceModel:
    BILLING_INVOICE_LINE = "BillingInvoiceLine"
    DIRECT_SALE_RETURN_LINE = "DirectSaleReturnLine"
    DIRECT_SALE_EXCHANGE_REPLACEMENT = "DirectSaleExchangeReplacement"
    PRODUCTION_MATERIAL_ISSUE_LINE = "ProductionMaterialIssueLine"
    PRODUCTION_RECEIPT_LINE = "ProductionReceiptLine"
    GOODS_RECEIPT_LINE = "GoodsReceiptLine"
    PURCHASE_BILL_LINE = "PurchaseBillLine"
    PURCHASE_RETURN_LINE = "PurchaseReturnLine"
    STOCK_ADJUSTMENT_LINE = "StockAdjustmentLine"
    OPENING_STOCK_ENTRY = "OpeningStockEntry"
    OPENING_STOCK_IMPORT = "OpeningStockImport"
    SUBSCRIPTION_DELIVERY = "SubscriptionDelivery"
    SUBSCRIPTION = "Subscription"
    BILLING_CREDIT_NOTE_LINE = "BillingCreditNoteLine"
    BILLING_DEBIT_NOTE_LINE = "BillingDebitNoteLine"

    # Present in code but currently deferred for allowlisting/reconciliation until fixed + tested.
    RENT_LEASE_RETURN_INSPECTION = "RentLeaseReturnInspection"


def ref_id_two_ints(*, left_id: int, right_id: int) -> str:
    return f"{int(left_id)}:{int(right_id)}"


def ref_id_single_int(*, object_id: int) -> str:
    return str(int(object_id))


def ref_id_opening_stock_import(*, csv_text: str, csv_row_number: int, location_code: str) -> str:
    """
    Must match `inventory.services.opening_stock_import_service.post_opening_stock_import`.

    Digest contract:
    - digest = sha256(csv_text).hexdigest()[:16]
    - row number is the CSV *data* row index (header is row 1; first data row is row 2)
    - location_code is uppercased in the import service
    """
    digest = hashlib.sha256((csv_text or "").encode("utf-8")).hexdigest()[:16]
    return f"{digest}:{int(csv_row_number)}:{str(location_code or '').strip().upper() or 'DEFAULT'}"


def ref_invoice_line(*, invoice_id: int, line_id: int) -> StockLedgerReference:
    return StockLedgerReference(
        reference_model=StockLedgerReferenceModel.BILLING_INVOICE_LINE,
        reference_id=ref_id_two_ints(left_id=invoice_id, right_id=line_id),
    )


def ref_direct_sale_return_line(*, return_id: int, line_id: int) -> StockLedgerReference:
    return StockLedgerReference(
        reference_model=StockLedgerReferenceModel.DIRECT_SALE_RETURN_LINE,
        reference_id=ref_id_two_ints(left_id=return_id, right_id=line_id),
    )


def ref_direct_sale_exchange_replacement(*, return_id: int, index: int) -> StockLedgerReference:
    return StockLedgerReference(
        reference_model=StockLedgerReferenceModel.DIRECT_SALE_EXCHANGE_REPLACEMENT,
        reference_id=ref_id_two_ints(left_id=return_id, right_id=index),
    )


def ref_production_material_issue_line(*, line_id: int) -> StockLedgerReference:
    return StockLedgerReference(
        reference_model=StockLedgerReferenceModel.PRODUCTION_MATERIAL_ISSUE_LINE,
        reference_id=ref_id_single_int(object_id=line_id),
    )


def ref_production_receipt_line(*, line_id: int) -> StockLedgerReference:
    return StockLedgerReference(
        reference_model=StockLedgerReferenceModel.PRODUCTION_RECEIPT_LINE,
        reference_id=ref_id_single_int(object_id=line_id),
    )


def ref_goods_receipt_line(*, receipt_id: int, line_id: int) -> StockLedgerReference:
    return StockLedgerReference(
        reference_model=StockLedgerReferenceModel.GOODS_RECEIPT_LINE,
        reference_id=ref_id_two_ints(left_id=receipt_id, right_id=line_id),
    )


def ref_purchase_bill_line(*, purchase_bill_id: int, line_id: int) -> StockLedgerReference:
    return StockLedgerReference(
        reference_model=StockLedgerReferenceModel.PURCHASE_BILL_LINE,
        reference_id=ref_id_two_ints(left_id=purchase_bill_id, right_id=line_id),
    )


def ref_purchase_return_line(*, purchase_return_id: int, line_id: int) -> StockLedgerReference:
    return StockLedgerReference(
        reference_model=StockLedgerReferenceModel.PURCHASE_RETURN_LINE,
        reference_id=ref_id_two_ints(left_id=purchase_return_id, right_id=line_id),
    )


def ref_stock_adjustment_line(*, adjustment_id: int, line_id: int) -> StockLedgerReference:
    return StockLedgerReference(
        reference_model=StockLedgerReferenceModel.STOCK_ADJUSTMENT_LINE,
        reference_id=ref_id_two_ints(left_id=adjustment_id, right_id=line_id),
    )


def ref_opening_stock_entry(*, entry_id: int) -> StockLedgerReference:
    return StockLedgerReference(
        reference_model=StockLedgerReferenceModel.OPENING_STOCK_ENTRY,
        reference_id=ref_id_single_int(object_id=entry_id),
    )


def ref_opening_stock_import(*, csv_text: str, csv_row_number: int, location_code: str) -> StockLedgerReference:
    return StockLedgerReference(
        reference_model=StockLedgerReferenceModel.OPENING_STOCK_IMPORT,
        reference_id=ref_id_opening_stock_import(
            csv_text=csv_text,
            csv_row_number=csv_row_number,
            location_code=location_code,
        ),
    )


def ref_subscription_delivery(*, delivery_id: int) -> StockLedgerReference:
    return StockLedgerReference(
        reference_model=StockLedgerReferenceModel.SUBSCRIPTION_DELIVERY,
        reference_id=ref_id_single_int(object_id=delivery_id),
    )


def ref_subscription(*, subscription_id: int) -> StockLedgerReference:
    return StockLedgerReference(
        reference_model=StockLedgerReferenceModel.SUBSCRIPTION,
        reference_id=ref_id_single_int(object_id=subscription_id),
    )

