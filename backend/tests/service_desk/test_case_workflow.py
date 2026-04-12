from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from billing.models import BillingDocumentStatus, BillingInvoice
from billing.services.billing_service import approve_billing_invoice, create_direct_sale, post_billing_invoice
from inventory.models import InventoryItem, StockLedger, StockLocation, StockMovementType
from service_desk.models import ServiceDeskCaseStatus, ServiceDeskFinanceStatus, ServiceDeskStockStatus
from service_desk.services.case_service import (
    complete_service_case_delivery_return,
    create_service_desk_case,
    post_credit_note_for_service_case,
    request_service_case_delivery_return,
    transition_service_desk_case_status,
)
from subscriptions.models import AuditLog, DeliveryStatus
from subscriptions.services.delivery_service import (
    create_subscription_delivery,
    mark_subscription_delivery_delivered,
    transition_subscription_delivery_status,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
)


class ServiceDeskCaseWorkflowTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="service_desk_admin", phone="9387700001")
        self.customer = create_customer_profile(name="Service Desk Customer", phone="7387700001")
        self.product = create_product(
            name="Service Desk Sofa",
            product_code="SRV-DSK-001",
            base_price=Decimal("22000.00"),
        )
        self.location = StockLocation.objects.create(code="RET-SHOW", name="Returns Showroom")
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="SRV-DSK-001",
            default_stock_location=self.location,
            opening_stock_qty=Decimal("5.000"),
            standard_unit_cost=Decimal("15000.00"),
        )
        cash_chart = ChartOfAccount.objects.create(
            code="SRV-DSK-CASH-001",
            name="Service Desk Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_account = FinanceAccount.objects.create(
            name="Service Desk Counter Cash",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )

    def _create_posted_direct_sale_invoice(self):
        sale = create_direct_sale(
            payload={
                "sale_date": date(2026, 4, 16),
                "customer": self.customer,
                "tax_mode": "NON_GST",
                "finance_account": self.cash_account,
                "delivery_required": False,
                "received_total": Decimal("22000.00"),
                "customer_name_snapshot": self.customer.name,
                "customer_phone_snapshot": self.customer.phone,
                "notes": "Direct sale for return workflow.",
                "lines": [
                    {
                        "product": self.product,
                        "inventory_item": self.inventory_item,
                        "description": "Retail sofa line",
                        "quantity": Decimal("1.000"),
                        "unit_price": Decimal("22000.00"),
                        "discount_amount": Decimal("0.00"),
                        "taxable_value": Decimal("22000.00"),
                        "gst_rate": None,
                        "cgst_amount": Decimal("0.00"),
                        "sgst_amount": Decimal("0.00"),
                        "igst_amount": Decimal("0.00"),
                        "line_total": Decimal("22000.00"),
                        "hsn_sac_code": "",
                    }
                ],
            },
            created_by=self.admin,
        )
        invoice = BillingInvoice.objects.get(direct_sale=sale)
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, BillingDocumentStatus.POSTED)
        return sale, invoice

    def test_sales_return_case_posts_credit_note_and_stock_in(self):
        sale, invoice = self._create_posted_direct_sale_invoice()

        service_case = create_service_desk_case(
            payload={
                "case_type": "SALES_RETURN",
                "direct_sale": sale,
                "billing_invoice": invoice,
                "issue_summary": "Customer returned the sofa after inspection.",
                "issue_details": "Frame damage found after delivery.",
                "lines": [
                    {
                        "product": self.product,
                        "inventory_item": self.inventory_item,
                        "description": "Return the direct-sale sofa",
                        "quantity": Decimal("1.000"),
                        "disposition": "RESTOCK",
                        "taxable_amount": Decimal("22000.00"),
                        "tax_amount": Decimal("0.00"),
                    }
                ],
            },
            created_by=self.admin,
        )

        transition_service_desk_case_status(
            case_id=service_case.id,
            next_status=ServiceDeskCaseStatus.OPEN,
            performed_by=self.admin,
        )
        transition_service_desk_case_status(
            case_id=service_case.id,
            next_status=ServiceDeskCaseStatus.AUTHORIZED,
            performed_by=self.admin,
        )
        updated_case, note = post_credit_note_for_service_case(
            case_id=service_case.id,
            performed_by=self.admin,
        )

        updated_case.refresh_from_db()
        note.refresh_from_db()

        self.assertEqual(note.status, BillingDocumentStatus.POSTED)
        self.assertEqual(updated_case.credit_note_id, note.id)
        self.assertEqual(updated_case.finance_status, ServiceDeskFinanceStatus.POSTED)
        self.assertEqual(updated_case.stock_status, ServiceDeskStockStatus.SETTLED)
        self.assertTrue(
            StockLedger.objects.filter(
                inventory_item=self.inventory_item,
                movement_type=StockMovementType.SALE_RETURN_IN,
                reference_model="BillingCreditNoteLine",
            ).exists()
        )
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="ServiceDeskCase",
                object_id=service_case.id,
                action_type=AuditLog.ActionType.SERVICE_DESK_CASE_CREDIT_NOTE_POSTED,
            ).exists()
        )

    def test_delivery_return_case_reuses_delivery_bridge_for_stock_settlement(self):
        batch = create_batch(batch_code="SRVRTN001", duration_months=11)
        lucky_id = create_lucky_id(batch=batch, lucky_number=44)
        subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("22000.00"),
            monthly_amount=Decimal("2000.00"),
            tenure_months=11,
        )
        delivery = create_subscription_delivery(
            subscription=subscription,
            performed_by=self.admin,
            status=DeliveryStatus.SCHEDULED,
            scheduled_date=date(2026, 4, 18),
        )
        delivery = transition_subscription_delivery_status(
            delivery=delivery,
            next_status=DeliveryStatus.DISPATCHED,
            performed_by=self.admin,
        )
        delivery = transition_subscription_delivery_status(
            delivery=delivery,
            next_status=DeliveryStatus.OUT_FOR_DELIVERY,
            performed_by=self.admin,
        )
        delivery = mark_subscription_delivery_delivered(
            delivery=delivery,
            performed_by=self.admin,
            receiver_name="Receiver",
            receiver_phone=self.customer.phone,
            notes="Delivered",
        )

        service_case = create_service_desk_case(
            payload={
                "case_type": "DELIVERY_RETURN",
                "subscription": subscription,
                "delivery": delivery,
                "issue_summary": "Customer requested pickup return after delivery.",
                "issue_details": "Return required after site measurement issue.",
            },
            created_by=self.admin,
        )

        service_case, updated = request_service_case_delivery_return(
            case_id=service_case.id,
            performed_by=self.admin,
            notes="Pickup requested",
        )
        self.assertTrue(updated)
        service_case, updated = complete_service_case_delivery_return(
            case_id=service_case.id,
            performed_by=self.admin,
            notes="Returned to stock",
        )
        self.assertTrue(updated)

        service_case.refresh_from_db()
        delivery.refresh_from_db()

        self.assertEqual(delivery.status, DeliveryStatus.RETURNED)
        self.assertEqual(service_case.stock_status, ServiceDeskStockStatus.SETTLED)
        self.assertTrue(
            StockLedger.objects.filter(
                inventory_item=self.inventory_item,
                movement_type=StockMovementType.EMI_RETURN_IN,
                reference_model="SubscriptionDelivery",
                reference_id=str(delivery.id),
            ).exists()
        )
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="ServiceDeskCase",
                object_id=service_case.id,
                action_type=AuditLog.ActionType.SERVICE_DESK_CASE_DELIVERY_RETURNED,
            ).exists()
        )
