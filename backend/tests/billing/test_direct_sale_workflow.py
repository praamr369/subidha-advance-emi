from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountCoaMapping, FinanceAccountKind, FinanceAccountMappingPurpose
from billing.models import BillingDocumentStatus, BillingInvoice, BillingSourceType, DirectSaleStatus, ReceiptDocument
from billing.services.billing_service import (
    approve_billing_invoice,
    create_direct_sale,
    post_billing_invoice,
)
from billing.services.direct_sale_collection_service import collect_direct_sale_payment
from billing.services.direct_sale_operational_state import get_direct_sale_operational_state
from inventory.models import InventoryItem, StockLedger, StockMovementType
from tests.helpers import create_admin_user, create_customer_profile, create_product, ensure_document_numbering_profile_for_date, ensure_test_accounting_posting_prerequisites

_SALE_DATE = date(2026, 4, 15)


class DirectSaleWorkflowTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="direct_sale_admin",
            phone="9388000001",
        )
        _today = timezone.localdate()
        ensure_test_accounting_posting_prerequisites(_SALE_DATE, performed_by=self.admin)
        if _today != _SALE_DATE:
            ensure_test_accounting_posting_prerequisites(_today, performed_by=self.admin)
        for doc_type in ("DIRECT_SALE", "TAX_INVOICE", "DIRECT_SALE_RECEIPT", "JOURNAL_ENTRY"):
            ensure_document_numbering_profile_for_date(doc_type, _SALE_DATE, performed_by=self.admin)
            if _today != _SALE_DATE:
                ensure_document_numbering_profile_for_date(doc_type, _today, performed_by=self.admin)
        self.customer = create_customer_profile(
            name="Direct Sale Customer",
            phone="7388000001",
        )
        self.product = create_product(
            name="Direct Sale Sofa",
            product_code="DIR-SALE-001",
            base_price=Decimal("18000.00"),
        )
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="DIR-SALE-SKU-001",
            opening_stock_qty=Decimal("5.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("12000.00"),
        )
        cash_chart = ChartOfAccount.objects.create(
            code="DIRSALE-CASH-001",
            name="Direct Sale Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_account = FinanceAccount.objects.create(
            name="Retail Counter Cash",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )
        FinanceAccountCoaMapping.objects.create(
            finance_account=self.cash_account,
            chart_account=cash_chart,
            purpose=FinanceAccountMappingPurpose.CASH_COLLECTION,
            is_active=True,
        )

    def _direct_sale_payload(self, *, delivery_required: bool) -> dict:
        return {
            "sale_date": date(2026, 4, 15),
            "customer": self.customer,
            "tax_mode": "NON_GST",
            "finance_account": self.cash_account,
            "delivery_required": delivery_required,
            "delivery_reference": "DS-DLV-001" if delivery_required else "",
            "received_total": Decimal("18000.00"),
            "customer_name_snapshot": self.customer.name,
            "customer_phone_snapshot": self.customer.phone,
            "notes": "Direct retail furniture sale.",
            "lines": [
                {
                    "product": self.product,
                    "inventory_item": self.inventory_item,
                    "description": "Retail sofa line",
                    "quantity": Decimal("1.000"),
                    "unit_price": Decimal("18000.00"),
                    "discount_amount": Decimal("0.00"),
                    "taxable_value": Decimal("18000.00"),
                    "gst_rate": None,
                    "cgst_amount": Decimal("0.00"),
                    "sgst_amount": Decimal("0.00"),
                    "igst_amount": Decimal("0.00"),
                    "line_total": Decimal("18000.00"),
                    "hsn_sac_code": "",
                }
            ],
        }

    def test_create_direct_sale_creates_linked_draft_invoice(self):
        sale = create_direct_sale(
            payload=self._direct_sale_payload(delivery_required=False),
            created_by=self.admin,
        )

        self.assertEqual(sale.status, DirectSaleStatus.DRAFT)
        self.assertTrue(sale.sale_no)
        self.assertEqual(sale.grand_total, Decimal("18000.00"))

        invoice = BillingInvoice.objects.get(direct_sale=sale)
        self.assertEqual(invoice.status, BillingDocumentStatus.DRAFT)
        self.assertEqual(invoice.source_type, BillingSourceType.DIRECT_SALE)
        self.assertEqual(invoice.source_reference, sale.sale_no)
        self.assertEqual(invoice.billing_channel, "RETAIL")
        self.assertEqual(invoice.lines.count(), 1)

    def test_delivery_required_direct_sale_allows_invoice_posting_and_keeps_delivery_separate(self):
        sale = create_direct_sale(
            payload=self._direct_sale_payload(delivery_required=True),
            created_by=self.admin,
        )
        invoice = BillingInvoice.objects.get(direct_sale=sale)

        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        sale.refresh_from_db()
        invoice.refresh_from_db()
        state = get_direct_sale_operational_state(sale)

        self.assertEqual(sale.status, DirectSaleStatus.INVOICED)
        self.assertIsNone(sale.delivered_at)
        self.assertEqual(invoice.status, BillingDocumentStatus.POSTED)
        self.assertEqual(state["delivery_state"], "READY_FOR_DELIVERY")
        self.assertEqual(state["operational_state"], "PAID_READY_FOR_DELIVERY")
        self.assertTrue(
            StockLedger.objects.filter(
                inventory_item=self.inventory_item,
                movement_type=StockMovementType.SALE_OUT,
                reference_model="BillingInvoiceLine",
            ).exists()
        )
        self.assertTrue(ReceiptDocument.objects.filter(billing_invoice=invoice).exists())

    def test_collect_direct_sale_payment_updates_receivable_and_receipt_history(self):
        payload = self._direct_sale_payload(delivery_required=False)
        payload["received_total"] = Decimal("5000.00")
        sale = create_direct_sale(payload=payload, created_by=self.admin)
        invoice = BillingInvoice.objects.get(direct_sale=sale)

        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        result = collect_direct_sale_payment(
            direct_sale_id=sale.id,
            amount=Decimal("4000.00"),
            collected_by=self.admin,
            finance_account_id=self.cash_account.id,
            reference_no="DIRSALE-COLLECT-001",
            notes="Second collection pass",
        )

        self.assertTrue(result["created"])
        sale.refresh_from_db()
        invoice.refresh_from_db()

        self.assertEqual(sale.received_total, Decimal("9000.00"))
        self.assertEqual(sale.balance_total, Decimal("9000.00"))
        self.assertEqual(invoice.received_total, Decimal("9000.00"))
        self.assertEqual(invoice.balance_total, Decimal("9000.00"))

        self.assertEqual(
            ReceiptDocument.objects.filter(
                direct_sale=sale,
                receipt_type="RETAIL_RECEIPT",
                status=BillingDocumentStatus.POSTED,
            ).count(),
            2,
        )
        self.assertIn("[collection-ref:DIRSALE-COLLECT-001]", result["receipt"].notes)

    def test_collect_direct_sale_payment_is_duplicate_safe_with_reference(self):
        payload = self._direct_sale_payload(delivery_required=False)
        payload["received_total"] = Decimal("8000.00")
        sale = create_direct_sale(payload=payload, created_by=self.admin)
        invoice = BillingInvoice.objects.get(direct_sale=sale)

        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        first = collect_direct_sale_payment(
            direct_sale_id=sale.id,
            amount=Decimal("3000.00"),
            collected_by=self.admin,
            finance_account_id=self.cash_account.id,
            reference_no="DIRSALE-DUP-001",
        )
        second = collect_direct_sale_payment(
            direct_sale_id=sale.id,
            amount=Decimal("3000.00"),
            collected_by=self.admin,
            finance_account_id=self.cash_account.id,
            reference_no="DIRSALE-DUP-001",
        )

        self.assertTrue(first["created"])
        self.assertFalse(second["created"])
        self.assertEqual(first["receipt"].id, second["receipt"].id)

    def test_direct_sale_transport_and_van_fare_is_off_ledger_and_inherited_by_delivery_challan(self):
        from accounting.models import JournalEntry
        from billing.services.direct_sale_delivery_actions import (
            schedule_direct_sale_delivery,
            update_direct_sale_delivery_metadata,
        )
        from billing.services.direct_sale_delivery_queue import serialize_direct_sale_delivery_case
        from deliveries.models import TransportFareEntry, TransportFareSourceType
        from service_desk.models import ServiceDeskCase, ServiceDeskCaseType

        je_before = JournalEntry.objects.count()
        payload = self._direct_sale_payload(delivery_required=True)
        payload["van_number"] = "wb-02-tr-9988"
        payload["transport_boy_name"] = "Raju Driver"
        payload["transport_boy_phone"] = "9830011223"
        payload["van_fare"] = Decimal("450.00")
        payload["transport_notes"] = "Evening tempo trip"

        sale = create_direct_sale(payload=payload, created_by=self.admin)
        invoice = BillingInvoice.objects.get(direct_sale=sale)

        # Van fare MUST NOT alter sale totals, invoice totals, or company journal entries
        self.assertEqual(sale.grand_total, Decimal("18000.00"))
        self.assertEqual(invoice.grand_total, Decimal("18000.00"))
        self.assertEqual(sale.van_number, "WB-02-TR-9988")
        self.assertEqual(sale.van_fare, Decimal("450.00"))
        self.assertEqual(JournalEntry.objects.count(), je_before)

        tf_sale = TransportFareEntry.objects.get(
            direct_sale=sale,
            service_case__isnull=True,
            source_type=TransportFareSourceType.DIRECT_SALE,
        )
        self.assertEqual(tf_sale.van_fare, Decimal("450.00"))
        self.assertEqual(tf_sale.transport_boy_phone, "9830011223")

        # Delivery case inherits transport fields cleanly and updates them on challan actions
        case = ServiceDeskCase.objects.get(
            direct_sale=sale,
            case_type=ServiceDeskCaseType.DIRECT_SALE_DELIVERY,
        )
        self.assertEqual(case.van_number, "WB-02-TR-9988")
        self.assertEqual(case.van_fare, Decimal("450.00"))

        update_direct_sale_delivery_metadata(
            case_id=case.id,
            actor=self.admin,
            van_fare=Decimal("525.00"),
            transport_boy_phone="9830099999",
        )
        case.refresh_from_db()
        serialized = serialize_direct_sale_delivery_case(case)
        self.assertEqual(serialized["van_fare"], "525.00")
        self.assertEqual(serialized["transport_boy_phone"], "9830099999")
        tf_case = TransportFareEntry.objects.get(
            service_case=case,
            source_type=TransportFareSourceType.DIRECT_SALE_DELIVERY,
        )
        self.assertEqual(tf_case.van_fare, Decimal("525.00"))
        self.assertEqual(JournalEntry.objects.count(), je_before)

        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        je_after_invoice = JournalEntry.objects.count()

        schedule_direct_sale_delivery(
            case_id=case.id,
            actor=self.admin,
            scheduled_date=date(2026, 4, 16),
            van_fare=Decimal("550.00"),
        )
        tf_case.refresh_from_db()
        self.assertEqual(tf_case.van_fare, Decimal("550.00"))
        self.assertEqual(JournalEntry.objects.count(), je_after_invoice)
