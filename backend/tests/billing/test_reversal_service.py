from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import TestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind, Vendor as AccountingVendor
from billing.models import BillingDocumentStatus, CustomerCreditLedger, DirectSale, DirectSaleReturnKind, DirectSaleReturnStatus, PurchaseReturn
from billing.services.billing_service import approve_billing_invoice, create_direct_sale, post_billing_invoice
from billing.services.reversal_service import (
    cancel_direct_sale_before_invoice,
    create_customer_refund,
    create_direct_sale_exchange,
    create_direct_sale_return,
    create_purchase_return,
    get_direct_sale_return_eligibility,
    post_direct_sale_return,
    post_purchase_return,
    void_receipt_with_reason,
)
from inventory.models import InventoryItem, PurchaseBill, PurchaseBillLine, StockLedger, StockLocation, StockMovementType, Vendor
from subscriptions.models import Emi, LuckyDraw, Payment
from tests.helpers import create_admin_user, create_customer_profile, create_product


class ReversalServiceTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="rv_admin", phone="9386111111")
        self.customer = create_customer_profile(name="RV Customer", phone="7386111111")
        self.product = create_product(name="RV Product", product_code="RV-P-001", base_price=Decimal("1000.00"))
        self.sellable_location = StockLocation.objects.create(code="RV-SELL", name="RV Sellable")
        self.inspection_location = StockLocation.objects.create(code="RV-INSP", name="RV Inspection")
        self.damaged_location = StockLocation.objects.create(code="RV-DMG", name="RV Damaged")
        self.inventory_item = InventoryItem.objects.create(product=self.product, sku="RV-SKU-001", default_stock_location=self.sellable_location, opening_stock_qty=Decimal("20.000"), reorder_level_qty=Decimal("1.000"), standard_unit_cost=Decimal("700.00"))
        cash_chart = ChartOfAccount.objects.create(code="RV-CASH-001", name="RV Cash", account_type=ChartOfAccountType.ASSET)
        self.cash_account = FinanceAccount.objects.create(name="RV Counter", kind=FinanceAccountKind.CASH, chart_account=cash_chart, opening_balance=Decimal("0.00"))

    def _sale_payload(self):
        return {
            "sale_date": date(2026, 4, 15),
            "customer": self.customer,
            "tax_mode": "NON_GST",
            "finance_account": self.cash_account,
            "delivery_required": False,
            "received_total": Decimal("0.00"),
            "customer_name_snapshot": self.customer.name,
            "customer_phone_snapshot": self.customer.phone,
            "lines": [{"product": self.product, "inventory_item": self.inventory_item, "description": "RV line", "quantity": Decimal("2.000"), "unit_price": Decimal("1000.00"), "discount_amount": Decimal("0.00"), "taxable_value": Decimal("2000.00"), "gst_rate": None, "cgst_amount": Decimal("0.00"), "sgst_amount": Decimal("0.00"), "igst_amount": Decimal("0.00"), "line_total": Decimal("2000.00"), "hsn_sac_code": ""}],
        }

    def test_cancel_direct_sale_before_invoice_requires_reason_and_works(self):
        sale = create_direct_sale(payload=self._sale_payload(), created_by=self.admin)
        sale, updated = cancel_direct_sale_before_invoice(direct_sale_id=sale.id, reason="Customer requested stop", performed_by=self.admin)
        self.assertTrue(updated)
        self.assertEqual(sale.status, "CANCELLED_PRE_INVOICE")

    def test_invoiced_sale_cannot_be_cancelled(self):
        sale = create_direct_sale(payload=self._sale_payload(), created_by=self.admin)
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        sale_out_count_before = StockLedger.objects.filter(
            movement_type=StockMovementType.SALE_OUT,
            reference_model="BillingInvoiceLine",
        ).count()
        with self.assertRaises((ValueError, DjangoValidationError)):
            cancel_direct_sale_before_invoice(direct_sale_id=sale.id, reason="Too late", performed_by=self.admin)

    def test_sale_return_posts_credit_note_and_stock_return_in(self):
        payment_count_before = Payment.objects.count()
        emi_count_before = Emi.objects.count()
        draw_count_before = LuckyDraw.objects.count()
        sale = create_direct_sale(payload=self._sale_payload(), created_by=self.admin)
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        sale_out_count_before = StockLedger.objects.filter(
            movement_type=StockMovementType.SALE_OUT,
            reference_model="BillingInvoiceLine",
        ).count()

        ret = create_direct_sale_return(
            direct_sale_id=sale.id,
            reason="Damaged edge",
            stock_destination="INSPECTION",
            stock_location_id=self.inspection_location.id,
            lines=[{"direct_sale_line_id": sale.lines.first().id, "quantity": "1.000"}],
            performed_by=self.admin,
        )
        ret.status = DirectSaleReturnStatus.APPROVED
        ret.save(update_fields=["status", "updated_at"])
        ret, _ = post_direct_sale_return(return_id=ret.id, posted_by=self.admin)

        self.assertEqual(ret.status, DirectSaleReturnStatus.POSTED)
        self.assertIsNotNone(ret.credit_note_id)
        self.assertTrue(StockLedger.objects.filter(movement_type=StockMovementType.SALE_RETURN_IN, reference_model="DirectSaleReturnLine").exists())
        self.assertEqual(
            StockLedger.objects.filter(movement_type=StockMovementType.SALE_RETURN_IN, reference_model="DirectSaleReturnLine").count(),
            1,
        )
        self.assertEqual(
            StockLedger.objects.filter(movement_type=StockMovementType.SALE_OUT, reference_model="BillingInvoiceLine").count(),
            sale_out_count_before,
        )
        self.assertEqual(Payment.objects.count(), payment_count_before)
        self.assertEqual(Emi.objects.count(), emi_count_before)
        self.assertEqual(LuckyDraw.objects.count(), draw_count_before)

    def test_return_cannot_exceed_sold_quantity(self):
        sale = create_direct_sale(payload=self._sale_payload(), created_by=self.admin)
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        with self.assertRaises((ValueError, DjangoValidationError)):
            create_direct_sale_return(
                direct_sale_id=sale.id,
                reason="Invalid qty",
                stock_destination="INSPECTION",
                stock_location_id=self.inspection_location.id,
                lines=[{"direct_sale_line_id": sale.lines.first().id, "quantity": "3.000"}],
                performed_by=self.admin,
            )

    def test_damaged_return_does_not_go_to_sellable_location(self):
        sale = create_direct_sale(payload=self._sale_payload(), created_by=self.admin)
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        ret = create_direct_sale_return(
            direct_sale_id=sale.id,
            reason="Damaged during customer use",
            return_kind="DAMAGED_RETURN",
            stock_destination="DAMAGED",
            stock_location_id=self.damaged_location.id,
            lines=[{"direct_sale_line_id": sale.lines.first().id, "quantity": "1.000"}],
            performed_by=self.admin,
        )
        ret.status = DirectSaleReturnStatus.APPROVED
        ret.save(update_fields=["status", "updated_at"])
        ret, _ = post_direct_sale_return(return_id=ret.id, posted_by=self.admin)

        self.assertTrue(
            StockLedger.objects.filter(
                movement_type=StockMovementType.SALE_RETURN_IN,
                reference_model="DirectSaleReturnLine",
                stock_location=self.damaged_location,
            ).exists()
        )
        self.assertFalse(
            StockLedger.objects.filter(
                movement_type=StockMovementType.SALE_RETURN_IN,
                reference_model="DirectSaleReturnLine",
                stock_location=self.sellable_location,
            ).exists()
        )

    def test_exchange_posts_return_in_and_replacement_out_with_amount_due(self):
        replacement_product = create_product(name="RV Replacement", product_code="RV-P-002", base_price=Decimal("1300.00"))
        replacement_item = InventoryItem.objects.create(product=replacement_product, sku="RV-SKU-002", default_stock_location=self.sellable_location, opening_stock_qty=Decimal("5.000"), reorder_level_qty=Decimal("1.000"), standard_unit_cost=Decimal("900.00"))
        sale = create_direct_sale(payload=self._sale_payload(), created_by=self.admin)
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        ret = create_direct_sale_exchange(
            direct_sale_id=sale.id,
            returned_lines=[{"direct_sale_line_id": sale.lines.first().id, "quantity": "1.000"}],
            replacement_lines=[{"inventory_item_id": replacement_item.id, "quantity": "1.000", "unit_price": "1300.00"}],
            reason="Customer selected higher model",
            stock_destination="INSPECTION",
            stock_location_id=self.damaged_location.id,
            performed_by=self.admin,
        )
        self.assertEqual(ret.exchange_amount_due, Decimal("300.00"))
        self.assertEqual(ret.exchange_customer_credit, Decimal("0.00"))
        self.assertFalse(StockLedger.objects.filter(movement_type=StockMovementType.SALE_OUT, reference_model="DirectSaleExchangeReplacement").exists())

        ret.status = DirectSaleReturnStatus.APPROVED
        ret.save(update_fields=["status", "updated_at"])
        ret, _ = post_direct_sale_return(return_id=ret.id, posted_by=self.admin)
        self.assertTrue(StockLedger.objects.filter(movement_type=StockMovementType.SALE_RETURN_IN, reference_model="DirectSaleReturnLine").exists())
        self.assertTrue(StockLedger.objects.filter(movement_type=StockMovementType.SALE_OUT, reference_model="DirectSaleExchangeReplacement").exists())
        self.assertTrue(
            StockLedger.objects.filter(
                movement_type=StockMovementType.SALE_OUT,
                reference_model="DirectSaleExchangeReplacement",
                reference_id=f"{ret.id}:1",
            ).exists()
        )
        self.assertFalse(CustomerCreditLedger.objects.filter(direct_sale_return=ret).exists())

    def test_exchange_lower_value_creates_customer_credit_on_post(self):
        replacement_product = create_product(name="RV Lower Replacement", product_code="RV-P-003", base_price=Decimal("800.00"))
        replacement_item = InventoryItem.objects.create(product=replacement_product, sku="RV-SKU-003", default_stock_location=self.sellable_location, opening_stock_qty=Decimal("5.000"), reorder_level_qty=Decimal("1.000"), standard_unit_cost=Decimal("500.00"))
        sale = create_direct_sale(payload=self._sale_payload(), created_by=self.admin)
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        ret = create_direct_sale_exchange(
            direct_sale_id=sale.id,
            returned_lines=[{"direct_sale_line_id": sale.lines.first().id, "quantity": "1.000"}],
            replacement_lines=[{"inventory_item_id": replacement_item.id, "quantity": "1.000", "unit_price": "800.00"}],
            reason="Customer selected lower model",
            stock_destination="INSPECTION",
            stock_location_id=self.damaged_location.id,
            performed_by=self.admin,
        )
        self.assertEqual(ret.exchange_amount_due, Decimal("0.00"))
        self.assertEqual(ret.exchange_customer_credit, Decimal("200.00"))
        ret.status = DirectSaleReturnStatus.APPROVED
        ret.save(update_fields=["status", "updated_at"])
        ret, _ = post_direct_sale_return(return_id=ret.id, posted_by=self.admin)
        self.assertTrue(CustomerCreditLedger.objects.filter(direct_sale_return=ret, credit_amount=Decimal("200.00")).exists())

    def test_return_eligibility_reports_remaining_quantities_and_actions(self):
        sale = create_direct_sale(payload=self._sale_payload(), created_by=self.admin)
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        DirectSale.objects.filter(pk=sale.id).update(delivered_at=invoice.created_at)

        eligibility = get_direct_sale_return_eligibility(direct_sale_id=sale.id)
        self.assertIn("RETURN_PRODUCT", eligibility["allowed_actions"])
        self.assertIn("EXCHANGE_PRODUCT", eligibility["allowed_actions"])
        self.assertEqual(eligibility["sold_lines"][0]["max_returnable_quantity"], "2.000")
        self.assertEqual(eligibility["sold_lines"][0]["returnable_quantity"], "2.000")
        self.assertEqual(eligibility["active_receipt_total"], "0.00")
        self.assertEqual(eligibility["void_receipt_total"], "0.00")
        self.assertEqual(eligibility["return_lines"][0]["default_return_quantity"], "2.000")
        self.assertIn("customer_name", eligibility)
        self.assertIn("stock_destinations", eligibility)

    def test_returnable_quantity_uses_sale_out_even_when_invoice_void(self):
        payload = self._sale_payload()
        payload["received_total"] = Decimal("2000.00")
        sale = create_direct_sale(payload=payload, created_by=self.admin)
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        receipt = invoice.receipts.first()
        void_receipt_with_reason(receipt_id=receipt.id, reason="Void for test", performed_by=self.admin)
        from subscriptions.services.operational_cancellation_service import cancel_billing_invoice
        cancel_billing_invoice(invoice_id=invoice.id, actor=self.admin, reason="Cancel for returnability test")
        eligibility = get_direct_sale_return_eligibility(direct_sale_id=sale.id)
        self.assertEqual(eligibility["invoice_status"], BillingDocumentStatus.VOID)
        self.assertEqual(eligibility["return_lines"][0]["sale_out_quantity"], "2.000")
        self.assertEqual(eligibility["return_lines"][0]["already_returned_quantity"], "0.000")
        self.assertEqual(eligibility["return_lines"][0]["returnable_quantity"], "2.000")

    def test_delivered_return_allows_void_invoice_when_sale_out_exists(self):
        payload = self._sale_payload()
        payload["received_total"] = Decimal("2000.00")
        sale = create_direct_sale(payload=payload, created_by=self.admin)
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        DirectSale.objects.filter(pk=sale.id).update(delivered_at=invoice.created_at)
        receipt = invoice.receipts.first()
        void_receipt_with_reason(receipt_id=receipt.id, reason="Void for delivered return", performed_by=self.admin)
        from subscriptions.services.operational_cancellation_service import cancel_billing_invoice
        cancel_billing_invoice(invoice_id=invoice.id, actor=self.admin, reason="Void invoice")

        ret = create_direct_sale_return(
            direct_sale_id=sale.id,
            reason="Delivered return after invoice void",
            return_kind=DirectSaleReturnKind.DELIVERED_RETURN,
            stock_destination="INSPECTION",
            stock_location_id=self.inspection_location.id,
            lines=[{"direct_sale_line_id": sale.lines.first().id, "quantity": "1.000"}],
            performed_by=self.admin,
        )
        self.assertEqual(ret.metadata.get("financial_mode"), "NO_ACTIVE_CUSTOMER_VALUE")
        ret.status = DirectSaleReturnStatus.APPROVED
        ret.save(update_fields=["status", "updated_at"])
        ret, _ = post_direct_sale_return(return_id=ret.id, posted_by=self.admin)
        self.assertEqual(ret.status, DirectSaleReturnStatus.POSTED)
        self.assertIsNone(ret.credit_note_id)
        self.assertTrue(
            StockLedger.objects.filter(
                movement_type=StockMovementType.SALE_RETURN_IN,
                reference_model="DirectSaleReturnLine",
                reference_id=f"{ret.id}:{ret.lines.first().id}",
            ).exists()
        )

    def test_returnable_quantity_becomes_zero_after_full_void_invoice_return(self):
        payload = self._sale_payload()
        payload["received_total"] = Decimal("2000.00")
        sale = create_direct_sale(payload=payload, created_by=self.admin)
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        DirectSale.objects.filter(pk=sale.id).update(delivered_at=invoice.created_at)
        receipt = invoice.receipts.first()
        void_receipt_with_reason(receipt_id=receipt.id, reason="Void for delivered return", performed_by=self.admin)
        from subscriptions.services.operational_cancellation_service import cancel_billing_invoice
        cancel_billing_invoice(invoice_id=invoice.id, actor=self.admin, reason="Void invoice")
        ret = create_direct_sale_return(
            direct_sale_id=sale.id,
            reason="Full delivered return",
            return_kind=DirectSaleReturnKind.DELIVERED_RETURN,
            stock_destination="INSPECTION",
            stock_location_id=self.inspection_location.id,
            lines=[{"direct_sale_line_id": sale.lines.first().id, "quantity": "2.000"}],
            performed_by=self.admin,
        )
        ret.status = DirectSaleReturnStatus.APPROVED
        ret.save(update_fields=["status", "updated_at"])
        post_direct_sale_return(return_id=ret.id, posted_by=self.admin)
        eligibility = get_direct_sale_return_eligibility(direct_sale_id=sale.id)
        self.assertEqual(eligibility["return_lines"][0]["returnable_quantity"], "0.000")

    def test_return_rejects_line_not_belonging_to_sale(self):
        sale = create_direct_sale(payload=self._sale_payload(), created_by=self.admin)
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        other_sale = create_direct_sale(payload=self._sale_payload(), created_by=self.admin)
        with self.assertRaises((ValueError, DjangoValidationError)):
            create_direct_sale_return(
                direct_sale_id=sale.id,
                reason="Invalid line",
                stock_destination="INSPECTION",
                stock_location_id=self.inspection_location.id,
                lines=[{"direct_sale_line_id": other_sale.lines.first().id, "quantity": "1.000"}],
                performed_by=self.admin,
            )

    def test_sellable_destination_requires_explicit_confirmation(self):
        sale = create_direct_sale(payload=self._sale_payload(), created_by=self.admin)
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        with self.assertRaises((ValueError, DjangoValidationError)):
            create_direct_sale_return(
                direct_sale_id=sale.id,
                reason="Try sellable without confirmation",
                stock_destination="SELLABLE",
                lines=[{"direct_sale_line_id": sale.lines.first().id, "quantity": "1.000"}],
                performed_by=self.admin,
            )

    def test_void_receipt_keeps_trace(self):
        payload = self._sale_payload()
        payload["received_total"] = Decimal("2000.00")
        sale = create_direct_sale(payload=payload, created_by=self.admin)
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        receipt = invoice.receipts.first()
        receipt, updated = void_receipt_with_reason(receipt_id=receipt.id, reason="Wrong customer", performed_by=self.admin)
        invoice.refresh_from_db()
        sale.refresh_from_db()
        receipt.refresh_from_db()
        self.assertTrue(updated)
        self.assertEqual(receipt.status, BillingDocumentStatus.VOID)
        self.assertEqual(invoice.received_total, Decimal("0.00"))
        self.assertEqual(invoice.balance_total, invoice.grand_total)
        self.assertEqual(sale.received_total, Decimal("0.00"))
        self.assertEqual(sale.balance_total, sale.grand_total)
        self.assertFalse(StockLedger.objects.filter(reference_model="ReceiptDocument", reference_id=str(receipt.id)).exists())

    def test_refund_cannot_exceed_customer_credit(self):
        with self.assertRaises((ValueError, DjangoValidationError)):
            create_customer_refund(customer_id=self.customer.id, amount="1.00", method="CASH_REFUND", finance_account_id=self.cash_account.id, reason="No credit")

    def test_purchase_return_creates_purchase_return_out(self):
        vendor = Vendor.objects.create(name="RV Vendor")
        pb = PurchaseBill.objects.create(
            bill_no="PB-RV-001",
            bill_date=date(2026, 4, 10),
            vendor=vendor,
            status="POSTED",
            subtotal=Decimal("1400.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("1400.00"),
            finance_account=self.cash_account,
        )
        line = PurchaseBillLine.objects.create(
            purchase_bill=pb,
            inventory_item=self.inventory_item,
            description="Purchase",
            quantity=Decimal("2.000"),
            unit_cost=Decimal("700.00"),
            taxable_value=Decimal("1400.00"),
            tax_amount=Decimal("0.00"),
            line_total=Decimal("1400.00"),
        )
        purchase_return = create_purchase_return(
            purchase_bill_id=pb.id,
            reason="Vendor defect",
            stock_location_id=self.sellable_location.id,
            lines=[{"purchase_bill_line_id": line.id, "quantity": "1.000"}],
            performed_by=self.admin,
        )
        purchase_return, _ = post_purchase_return(purchase_return_id=purchase_return.id, posted_by=self.admin)
        self.assertEqual(purchase_return.status, "POSTED")
        self.assertTrue(
            StockLedger.objects.filter(
                movement_type=StockMovementType.PURCHASE_RETURN_OUT,
                reference_model="PurchaseReturnLine",
                reference_id__startswith=f"{purchase_return.id}:",
            ).exists()
        )

    def test_purchase_return_vendor_uses_accounting_vendor_model(self):
        self.assertIs(PurchaseReturn._meta.get_field("vendor").remote_field.model, AccountingVendor)

    def test_post_invoice_cancel_without_sale_out_does_not_create_sale_return_in(self):
        sale = create_direct_sale(payload=self._sale_payload(), created_by=self.admin)
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        StockLedger.objects.filter(
            movement_type=StockMovementType.SALE_OUT,
            reference_model="BillingInvoiceLine",
        ).delete()

        ret = create_direct_sale_return(
            direct_sale_id=sale.id,
            reason="Cancel before stock issue",
            return_kind="POST_INVOICE_CANCEL",
            stock_destination="INSPECTION",
            stock_location_id=self.inspection_location.id,
            lines=[{"direct_sale_line_id": sale.lines.first().id, "quantity": "1.000"}],
            performed_by=self.admin,
        )
        ret.status = DirectSaleReturnStatus.APPROVED
        ret.save(update_fields=["status", "updated_at"])
        ret, _ = post_direct_sale_return(return_id=ret.id, posted_by=self.admin)

        self.assertEqual(ret.status, DirectSaleReturnStatus.POSTED)
        self.assertFalse(
            StockLedger.objects.filter(
                movement_type=StockMovementType.SALE_RETURN_IN,
                reference_model="DirectSaleReturnLine",
                reference_id=f"{ret.id}:{ret.lines.first().id}",
            ).exists()
        )

    def test_return_cannot_be_posted_twice_for_same_quantity(self):
        sale = create_direct_sale(payload=self._sale_payload(), created_by=self.admin)
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        ret = create_direct_sale_return(
            direct_sale_id=sale.id,
            reason="First return",
            stock_destination="INSPECTION",
            stock_location_id=self.inspection_location.id,
            lines=[{"direct_sale_line_id": sale.lines.first().id, "quantity": "2.000"}],
            performed_by=self.admin,
        )
        ret.status = DirectSaleReturnStatus.APPROVED
        ret.save(update_fields=["status", "updated_at"])
        post_direct_sale_return(return_id=ret.id, posted_by=self.admin)

        with self.assertRaises((ValueError, DjangoValidationError)):
            create_direct_sale_return(
                direct_sale_id=sale.id,
                reason="Duplicate return",
                stock_destination="INSPECTION",
                stock_location_id=self.inspection_location.id,
                lines=[{"direct_sale_line_id": sale.lines.first().id, "quantity": "0.001"}],
                performed_by=self.admin,
            )

    def test_exchange_fails_if_replacement_stock_is_insufficient(self):
        replacement_product = create_product(name="RV Replacement Low Stock", product_code="RV-P-004", base_price=Decimal("1300.00"))
        replacement_item = InventoryItem.objects.create(
            product=replacement_product,
            sku="RV-SKU-004",
            default_stock_location=self.sellable_location,
            opening_stock_qty=Decimal("0.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("900.00"),
        )
        sale = create_direct_sale(payload=self._sale_payload(), created_by=self.admin)
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        with self.assertRaises(ValueError):
            create_direct_sale_exchange(
                direct_sale_id=sale.id,
                returned_lines=[{"direct_sale_line_id": sale.lines.first().id, "quantity": "1.000"}],
                replacement_lines=[{"inventory_item_id": replacement_item.id, "quantity": "1.000", "unit_price": "1300.00"}],
                reason="Insufficient replacement stock",
                stock_destination="INSPECTION",
                stock_location_id=self.inspection_location.id,
                performed_by=self.admin,
            )
