from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import BusinessTaxProfile, BusinessTaxRegistrationMode, DocumentSequence
from accounting.services.gst_document_posting_service import financial_year_for
from billing.models import DirectSale
from inventory.models import InventoryItem, StockLocation, Warehouse
from service_desk.models import ServiceDeskCase, ServiceDeskCaseStatus, ServiceDeskCaseType
from tests.helpers import create_admin_user, create_customer_profile, create_product


class DirectSaleDeliveryOutstandingReleaseTests(APITestCase):
    def setUp(self):
        BusinessTaxProfile.objects.update(is_active=False)
        BusinessTaxProfile.objects.create(
            mode=BusinessTaxRegistrationMode.GST_REGULAR,
            legal_name="Subidha Furniture",
            gstin="19ABCDE1234F1Z5",
            state_code="19",
            state_name="West Bengal",
            is_active=True,
        )
        self.admin = create_admin_user(username="ds_release_admin", phone="9377000091")
        self.client.force_authenticate(self.admin)
        self.customer = create_customer_profile(
            name="Outstanding Release Customer",
            phone="7377000091",
        )
        self.product = create_product(
            name="Outstanding Release Sofa",
            product_code="DS-REL-SOFA-001",
            base_price=Decimal("12000.00"),
        )
        self.location = StockLocation.objects.create(
            code="DS-REL-STORE",
            name="Release Store",
            location_type="STORE",
        )
        Warehouse.objects.create(
            code="DS-REL-WH",
            name="Release Warehouse",
            stock_location=self.location,
        )
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="DS-REL-SKU-001",
            default_stock_location=self.location,
            opening_stock_qty=Decimal("50.000"),
            reorder_level_qty=Decimal("1.000"),
        )
        fy = financial_year_for(date.today())
        DocumentSequence.objects.create(
            series_code="DIRECT_SALE_INVOICE",
            financial_year=fy,
            prefix=f"DSI-{fy}",
            next_number=1,
            padding=5,
            is_active=True,
        )

    def _payload(self):
        return {
            "sale_date": date(2026, 5, 1),
            "customer": self.customer.id,
            "tax_mode": "NON_GST",
            "customer_name_snapshot": self.customer.name,
            "customer_phone_snapshot": self.customer.phone,
            "delivery_required": True,
            "received_total": "1000.00",
            "balance_total": "22000.00",
            "subtotal": "24000.00",
            "discount_total": "1000.00",
            "taxable_total": "23000.00",
            "tax_total": "0.00",
            "grand_total": "23000.00",
            "lines": [
                {
                    "product": self.product.id,
                    "inventory_item": self.inventory_item.id,
                    "description": "Outstanding release direct sale",
                    "quantity": "2.000",
                    "discount_amount": "1000.00",
                    "gst_rate": None,
                    "cgst_amount": "0.00",
                    "sgst_amount": "0.00",
                    "igst_amount": "0.00",
                    "create_purchase_requirement": False,
                }
            ],
        }

    def _create_finalized_outstanding_case(self) -> ServiceDeskCase:
        created = self.client.post("/api/v1/billing/direct-sales/", self._payload(), format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        sale_id = created.data["id"]
        finalize = self.client.post(
            f"/api/v1/admin/billing/direct-sales/{sale_id}/finalize-invoice/",
            {},
            format="json",
        )
        self.assertEqual(finalize.status_code, status.HTTP_200_OK, finalize.data)
        return ServiceDeskCase.objects.get(
            direct_sale_id=sale_id,
            case_type=ServiceDeskCaseType.DIRECT_SALE_DELIVERY,
        )

    def test_outstanding_without_release_stays_payment_hold_and_blocks_schedule(self):
        case = self._create_finalized_outstanding_case()

        detail = self.client.get(f"/api/v1/admin/deliveries/direct-sale-cases/{case.id}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.data)
        self.assertEqual(detail.data["delivery_state"], "PAYMENT_HOLD")
        self.assertTrue(detail.data["blocked_by_payment"])
        self.assertIn("COLLECT_DIRECT_SALE_BALANCE", detail.data["next_actions"])
        self.assertNotIn("SCHEDULE_DELIVERY", detail.data["next_actions"])

        schedule = self.client.post(
            f"/api/v1/admin/deliveries/direct-sale-cases/{case.id}/schedule/",
            {"receiver_name": "Receiver A"},
            format="json",
        )
        self.assertEqual(schedule.status_code, status.HTTP_400_BAD_REQUEST, schedule.data)
        self.assertIn("payment is due", str(schedule.data).lower())

    def test_outstanding_release_unlocks_delivery_without_settling_receivable(self):
        case = self._create_finalized_outstanding_case()
        sale = DirectSale.objects.get(pk=case.direct_sale_id)
        before_balance = sale.balance_total
        before_received = sale.received_total

        approve = self.client.post(
            f"/api/v1/admin/deliveries/direct-sale-cases/{case.id}/approve-payment-exception/",
            {
                "reason": "Customer approved for delivery before final balance collection.",
                "acknowledgement": True,
            },
            format="json",
        )
        self.assertEqual(approve.status_code, status.HTTP_200_OK, approve.data)
        approved_delivery = approve.data["delivery"]
        self.assertEqual(approved_delivery["delivery_state"], "READY_FOR_DELIVERY")
        self.assertFalse(approved_delivery["blocked_by_payment"])
        self.assertIn("SCHEDULE_DELIVERY", approved_delivery["next_actions"])
        self.assertIn("MARK_DELIVERED", approved_delivery["next_actions"])
        self.assertEqual(approved_delivery["payment_exception_reason"], "Customer approved for delivery before final balance collection.")
        self.assertTrue(approved_delivery["payment_exception_acknowledged"])
        self.assertIsNotNone(approved_delivery["payment_exception_approved_at"])
        self.assertEqual(approved_delivery["payment_exception_outstanding_amount_snapshot"], "22000.00")

        sale.refresh_from_db()
        self.assertEqual(sale.balance_total, before_balance)
        self.assertEqual(sale.received_total, before_received)
        self.assertEqual(sale.balance_total, Decimal("22000.00"))

        schedule = self.client.post(
            f"/api/v1/admin/deliveries/direct-sale-cases/{case.id}/schedule/",
            {"receiver_name": "Receiver A", "scheduled_date": "2026-05-20"},
            format="json",
        )
        self.assertEqual(schedule.status_code, status.HTTP_200_OK, schedule.data)
        case.refresh_from_db()
        self.assertEqual(case.status, ServiceDeskCaseStatus.AUTHORIZED)
        self.assertTrue(case.payment_exception_approved)
        self.assertTrue(case.payment_exception_acknowledged)

        sale.refresh_from_db()
        self.assertEqual(sale.balance_total, Decimal("22000.00"))
        self.assertEqual(sale.received_total, Decimal("1000.00"))
