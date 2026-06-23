"""
Procurement service and API flow tests.

Covers:
- P0: Duplicate-post idempotency for GR, VendorBill, VendorPayment
- P0: Stock ledger created exactly once from posted GR
- P0: Vendor payment overpay protection
- P1: Purchase request approve action
- P1: Purchase request convert-to-PO action
- P1: API endpoints for approve / convert-to-po
"""
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import Vendor
from inventory.models import (
    GoodsReceipt,
    GoodsReceiptLine,
    GoodsReceiptStatus,
    InventoryItem,
    InventoryItemType,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseOrderStatus,
    PurchaseRequest,
    PurchaseRequestLine,
    PurchaseRequestStatus,
    StockLedger,
    StockLocation,
    VendorBill,
    VendorBillLine,
    VendorBillStatus,
    VendorPayment,
    VendorPaymentStatus,
)
from inventory.services.procurement_service import (
    approve_purchase_request,
    convert_purchase_request_to_po,
    post_goods_receipt,
    post_vendor_payment,
)
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_product

_BASE = "/api/v1"


def _make_vendor(name="Test Vendor", phone="9111000001"):
    return Vendor.objects.create(name=name, phone=phone)


def _make_item(vendor, sku="TST-SKU", name="Test Item"):
    product = create_product(name=name, product_code=sku, base_price=Decimal("500.00"))
    return InventoryItem.objects.create(
        product=product,
        sku=sku,
        stock_item_type=InventoryItemType.RAW_MATERIAL,
        stock_tracking_enabled=True,
        opening_stock_qty=Decimal("0.000"),
        reorder_level_qty=Decimal("0.000"),
        standard_unit_cost=Decimal("500.00"),
    )


def _make_po(vendor, item, qty=Decimal("10.000"), unit_cost=Decimal("500.00")):
    po = PurchaseOrder.objects.create(
        po_date=timezone.localdate(),
        vendor=vendor,
        status=PurchaseOrderStatus.DRAFT,
    )
    PurchaseOrderLine.objects.create(
        purchase_order=po,
        inventory_item=item,
        quantity=qty,
        unit_cost=unit_cost,
    )
    return po


def _make_gr(po, item, qty_received=Decimal("5.000")):
    gr = GoodsReceipt.objects.create(
        receipt_date=timezone.localdate(),
        purchase_order=po,
        status=GoodsReceiptStatus.DRAFT,
    )
    po_line = po.lines.first()
    GoodsReceiptLine.objects.create(
        goods_receipt=gr,
        inventory_item=item,
        purchase_order_line=po_line,
        quantity_received=qty_received,
        unit_cost=Decimal("500.00"),
    )
    return gr


# ── P0: Duplicate post protection ─────────────────────────────────────────────

class GoodsReceiptIdempotencyTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="gr_admin", phone="9200100001")
        self.vendor = _make_vendor("GR Vendor", "9200100002")
        self.item = _make_item(self.vendor, "GR-SKU")
        self.po = _make_po(self.vendor, self.item)

    def test_post_gr_is_idempotent(self):
        gr = _make_gr(self.po, self.item)
        _, created1 = post_goods_receipt(goods_receipt_id=gr.id, posted_by=self.admin)
        _, created2 = post_goods_receipt(goods_receipt_id=gr.id, posted_by=self.admin)
        self.assertTrue(created1)
        self.assertFalse(created2)  # idempotent second call

    def test_stock_ledger_created_exactly_once(self):
        gr = _make_gr(self.po, self.item)
        post_goods_receipt(goods_receipt_id=gr.id, posted_by=self.admin)
        post_goods_receipt(goods_receipt_id=gr.id, posted_by=self.admin)  # idempotent
        count = StockLedger.objects.filter(reference_model="GoodsReceiptLine").count()
        self.assertEqual(count, 1)

    def test_post_gr_wrong_status_raises(self):
        gr = _make_gr(self.po, self.item)
        gr.status = GoodsReceiptStatus.CANCELLED
        gr.save(update_fields=["status", "updated_at"])
        with self.assertRaises(ValueError):
            post_goods_receipt(goods_receipt_id=gr.id, posted_by=self.admin)

    def test_over_receive_blocked_by_default(self):
        gr = _make_gr(self.po, self.item, qty_received=Decimal("20.000"))  # ordered only 10
        with self.assertRaises(ValueError) as ctx:
            post_goods_receipt(goods_receipt_id=gr.id, posted_by=self.admin)
        self.assertIn("Over-receive", str(ctx.exception))


class VendorPaymentProtectionTests(TestCase):
    """Vendor payment overpay and duplicate-post protection."""

    def setUp(self):
        self.admin = create_admin_user(username="vp_admin", phone="9200200001")
        self.env = seed_bridge_ready_environment(timezone.localdate(), performed_by=self.admin)
        self.vendor = _make_vendor("Payment Vendor", "9200200002")
        self.item = _make_item(self.vendor, "VP-SKU")

    def _make_bill_and_payment(self, bill_amount=Decimal("1000.00"), pay_amount=Decimal("1000.00")):
        bill = VendorBill.objects.create(
            bill_date=timezone.localdate(),
            vendor=self.vendor,
            status=VendorBillStatus.DRAFT,
            subtotal=bill_amount,
            tax_total=Decimal("0.00"),
            grand_total=bill_amount,
        )
        VendorBillLine.objects.create(
            vendor_bill=bill,
            inventory_item=self.item,
            quantity=Decimal("2.000"),
            unit_cost=bill_amount / 2,
            taxable_value=bill_amount,
            tax_amount=Decimal("0.00"),
            line_total=bill_amount,
        )
        from inventory.services.procurement_service import post_vendor_bill
        post_vendor_bill(vendor_bill_id=bill.id, posted_by=self.admin)
        bill.refresh_from_db()

        fin_account = self.env["cash_account"]
        payment = VendorPayment.objects.create(
            payment_date=timezone.localdate(),
            vendor=self.vendor,
            vendor_bill=bill,
            amount=pay_amount,
            finance_account=fin_account,
            status=VendorPaymentStatus.DRAFT,
        )
        return bill, payment

    def test_overpay_raises_value_error(self):
        bill, payment = self._make_bill_and_payment(
            bill_amount=Decimal("1000.00"),
            pay_amount=Decimal("1500.00"),
        )
        with self.assertRaises(ValueError) as ctx:
            post_vendor_payment(vendor_payment_id=payment.id, posted_by=self.admin)
        self.assertIn("exceed", str(ctx.exception).lower())

    def test_duplicate_post_is_idempotent(self):
        bill, payment = self._make_bill_and_payment()
        _, created1 = post_vendor_payment(vendor_payment_id=payment.id, posted_by=self.admin)
        _, created2 = post_vendor_payment(vendor_payment_id=payment.id, posted_by=self.admin)
        self.assertTrue(created1)
        self.assertFalse(created2)


# ── P1: Purchase request approve / convert-to-PO ─────────────────────────────

class PurchaseRequestApproveTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="pr_approve_admin", phone="9200300001")
        self.vendor = _make_vendor("PR Vendor", "9200300002")
        self.item = _make_item(self.vendor, "PR-SKU")

    def _make_pr(self, qty=Decimal("5.000")):
        pr = PurchaseRequest.objects.create(
            request_date=timezone.localdate(),
            vendor=self.vendor,
            status=PurchaseRequestStatus.DRAFT,
        )
        PurchaseRequestLine.objects.create(
            purchase_request=pr,
            inventory_item=self.item,
            quantity_requested=qty,
        )
        return pr

    def test_approve_draft_request(self):
        pr = self._make_pr()
        updated_pr, created = approve_purchase_request(purchase_request_id=pr.id, performed_by=self.admin)
        self.assertEqual(updated_pr.status, PurchaseRequestStatus.APPROVED)
        self.assertTrue(created)

    def test_approve_already_approved_is_idempotent(self):
        pr = self._make_pr()
        approve_purchase_request(purchase_request_id=pr.id, performed_by=self.admin)
        _, created2 = approve_purchase_request(purchase_request_id=pr.id, performed_by=self.admin)
        self.assertFalse(created2)

    def test_approve_cancelled_raises(self):
        pr = self._make_pr()
        pr.status = PurchaseRequestStatus.CANCELLED
        pr.save(update_fields=["status", "updated_at"])
        with self.assertRaises(ValueError):
            approve_purchase_request(purchase_request_id=pr.id, performed_by=self.admin)

    def test_convert_approved_request_to_po(self):
        pr = self._make_pr()
        approve_purchase_request(purchase_request_id=pr.id, performed_by=self.admin)
        po, updated_pr = convert_purchase_request_to_po(purchase_request_id=pr.id, performed_by=self.admin)
        self.assertEqual(updated_pr.status, PurchaseRequestStatus.ORDERED)
        self.assertEqual(po.vendor_id, self.vendor.id)
        self.assertEqual(po.lines.count(), 1)
        self.assertEqual(po.lines.first().quantity, Decimal("5.000"))
        self.assertIn(pr.request_no, po.notes)

    def test_convert_draft_request_to_po_also_works(self):
        pr = self._make_pr()
        po, updated_pr = convert_purchase_request_to_po(purchase_request_id=pr.id, performed_by=self.admin)
        self.assertEqual(updated_pr.status, PurchaseRequestStatus.ORDERED)
        self.assertIsNotNone(po.id)

    def test_convert_without_vendor_raises(self):
        pr = PurchaseRequest.objects.create(
            request_date=timezone.localdate(),
            status=PurchaseRequestStatus.DRAFT,
        )
        PurchaseRequestLine.objects.create(purchase_request=pr, inventory_item=self.item, quantity_requested=Decimal("1.000"))
        with self.assertRaises(ValueError) as ctx:
            convert_purchase_request_to_po(purchase_request_id=pr.id, performed_by=self.admin)
        self.assertIn("vendor", str(ctx.exception).lower())

    def test_convert_ordered_request_raises(self):
        pr = self._make_pr()
        convert_purchase_request_to_po(purchase_request_id=pr.id, performed_by=self.admin)
        with self.assertRaises(ValueError):
            convert_purchase_request_to_po(purchase_request_id=pr.id, performed_by=self.admin)


# ── P1: API endpoints ─────────────────────────────────────────────────────────

class PurchaseRequestAPITests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="pr_api_admin", phone="9200400001")
        self.client.force_authenticate(user=self.admin)
        self.vendor = _make_vendor("PR API Vendor", "9200400002")
        self.item = _make_item(self.vendor, "PR-API-SKU")

    def _make_pr(self):
        pr = PurchaseRequest.objects.create(
            request_date=timezone.localdate(),
            vendor=self.vendor,
            status=PurchaseRequestStatus.DRAFT,
        )
        PurchaseRequestLine.objects.create(
            purchase_request=pr,
            inventory_item=self.item,
            quantity_requested=Decimal("3.000"),
        )
        return pr

    def test_api_approve_returns_200(self):
        pr = self._make_pr()
        url = f"{_BASE}/inventory/purchase-requests/{pr.id}/approve/"
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["updated"])
        self.assertEqual(response.data["purchase_request"]["status"], "APPROVED")

    def test_api_approve_idempotent(self):
        pr = self._make_pr()
        url = f"{_BASE}/inventory/purchase-requests/{pr.id}/approve/"
        self.client.post(url, {}, format="json")
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["updated"])

    def test_api_convert_to_po_returns_200(self):
        pr = self._make_pr()
        url = f"{_BASE}/inventory/purchase-requests/{pr.id}/convert-to-po/"
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("purchase_order", response.data)
        self.assertIn("po_no", response.data["purchase_order"])
        self.assertEqual(response.data["purchase_request"]["status"], "ORDERED")

    def test_api_convert_to_po_without_vendor_returns_400(self):
        pr = PurchaseRequest.objects.create(
            request_date=timezone.localdate(),
            status=PurchaseRequestStatus.DRAFT,
        )
        PurchaseRequestLine.objects.create(purchase_request=pr, inventory_item=self.item, quantity_requested=Decimal("1.000"))
        url = f"{_BASE}/inventory/purchase-requests/{pr.id}/convert-to-po/"
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("vendor", response.data.get("detail", "").lower())

    def test_api_post_gr_returns_200(self):
        po = _make_po(self.vendor, self.item)
        gr = _make_gr(po, self.item, qty_received=Decimal("5.000"))
        url = f"{_BASE}/inventory/goods-receipts/{gr.id}/post/"
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["updated"])
        self.assertEqual(response.data["goods_receipt"]["status"], "RECEIVED")

    def test_api_post_gr_twice_is_idempotent(self):
        po = _make_po(self.vendor, self.item)
        gr = _make_gr(po, self.item)
        url = f"{_BASE}/inventory/goods-receipts/{gr.id}/post/"
        self.client.post(url, {}, format="json")
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["updated"])

    def test_non_admin_cannot_approve_pr(self):
        from tests.helpers import create_partner_user
        partner = create_partner_user(username="pr_partner", phone="9200400099")
        self.client.force_authenticate(user=partner)
        pr = self._make_pr()
        url = f"{_BASE}/inventory/purchase-requests/{pr.id}/approve/"
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
