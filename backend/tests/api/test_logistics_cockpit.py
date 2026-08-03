from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status

from subscriptions.models import SubscriptionDelivery, DeliveryStatus
from billing.models import DirectSale, DirectSaleStatus
from billing.services.billing_service import create_direct_sale
from service_desk.models import ServiceDeskCase, ServiceDeskCaseType, ServiceDeskCaseStatus, ServiceDeskStockStatus
from tests.helpers import (
    create_subscription,
    create_customer_profile,
    create_product,
    create_admin_user,
    create_user,
    create_batch,
    create_lucky_id,
)
from inventory.models import StockLocation, StockLocationType, InventoryItem


class AdminLogisticsCockpitViewTests(APITestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()  # cockpit response is cached; isolate each test's query counts
        self.admin_user = create_admin_user(username="admin_test123")
        self.staff_user = create_user(username="staff_test123", is_staff=True, is_superuser=False)
        # DirectSale creation needs document numbering (financial_year/doc_series).
        from tests.helpers import ensure_test_accounting_posting_prerequisites
        from accounting.services.setup_defaults_service import apply_accounting_setup_defaults
        apply_accounting_setup_defaults(performed_by=self.admin_user)
        ensure_test_accounting_posting_prerequisites(performed_by=self.admin_user)
        self.customer = create_customer_profile()
        self.product = create_product()

        self.stock_location = StockLocation.objects.create(name="Test Warehouse", code="WH-1", location_type=StockLocationType.WAREHOUSE)
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="TEST-SKU-1",
            default_stock_location=self.stock_location,
            reorder_level_qty=Decimal("5.000")
        )
        
        # One active delivery per subscription is enforced by
        # uq_active_subscription_delivery_per_subscription, so each delivery
        # below needs its own subscription (same batch, distinct lucky IDs).
        self.batch = create_batch(batch_code="LOGI-BATCH-1")

        def _make_subscription(lucky_number):
            lucky_id = create_lucky_id(batch=self.batch, lucky_number=lucky_number)
            return create_subscription(
                customer=self.customer, product=self.product,
                batch=self.batch, lucky_id=lucky_id,
            )

        self.subscription = _make_subscription(1)
        self.sub_delivery_today = SubscriptionDelivery.objects.create(
            subscription=self.subscription,
            status=DeliveryStatus.PENDING,
            scheduled_date=timezone.localdate(),
            delivery_reference="SUB-DEL-1"
        )
        self.sub_delivery_overdue = SubscriptionDelivery.objects.create(
            subscription=_make_subscription(2),
            status=DeliveryStatus.PENDING,
            scheduled_date=timezone.localdate() - timedelta(days=2),
            delivery_reference="SUB-DEL-2"
        )
        self.sub_delivery_future = SubscriptionDelivery.objects.create(
            subscription=_make_subscription(3),
            status=DeliveryStatus.SCHEDULED,
            scheduled_date=timezone.localdate() + timedelta(days=2),
            delivery_reference="SUB-DEL-3"
        )
        self.sub_delivery_delivered = SubscriptionDelivery.objects.create(
            subscription=self.subscription,
            status=DeliveryStatus.DELIVERED,
            scheduled_date=timezone.localdate(),
            delivered_at=timezone.now(),
            delivery_reference="SUB-DEL-4"
        )

        # Build the direct sale via the service so document numbering
        # (financial_year/doc_series) is assigned; then pin the status the
        # cockpit assertions expect without re-running save() validation.
        self.direct_sale = create_direct_sale(
            payload={
                "sale_date": timezone.localdate(),
                "customer": self.customer,
                "delivery_required": True,
                "customer_name_snapshot": self.customer.name,
                "customer_phone_snapshot": self.customer.phone,
                "lines": [
                    {
                        "product": self.product,
                        "inventory_item": self.inventory_item,
                        "description": "Logistics test line",
                        "quantity": "1.000",
                        "unit_price": "1000.00",
                        "discount_amount": "0.00",
                        "taxable_value": "1000.00",
                        "gst_rate": None,
                        "cgst_amount": "0.00",
                        "sgst_amount": "0.00",
                        "igst_amount": "0.00",
                        "line_total": "1000.00",
                        "hsn_sac_code": "",
                    }
                ],
            },
            created_by=self.admin_user,
        )
        DirectSale.objects.filter(pk=self.direct_sale.pk).update(
            status=DirectSaleStatus.CONFIRMED
        )
        self.direct_sale.refresh_from_db()
        # create_direct_sale(delivery_required=True) already opens the
        # DIRECT_SALE_DELIVERY service-desk case; use that one rather than a dup.
        self.ds_case = ServiceDeskCase.objects.get(
            direct_sale=self.direct_sale,
            case_type=ServiceDeskCaseType.DIRECT_SALE_DELIVERY,
        )

        self.return_case = ServiceDeskCase.objects.create(
            case_type=ServiceDeskCaseType.SALES_RETURN,
            status=ServiceDeskCaseStatus.OPEN,
            issue_summary="Logistics cockpit test case",
            stock_status=ServiceDeskStockStatus.PENDING,
            direct_sale=self.direct_sale,
        )
        self.return_case_closed = ServiceDeskCase.objects.create(
            case_type=ServiceDeskCaseType.SALES_RETURN,
            status=ServiceDeskCaseStatus.CLOSED,
            issue_summary="Logistics cockpit test case",
            stock_status=ServiceDeskStockStatus.PENDING,
            direct_sale=self.direct_sale,
        )

    def test_authentication(self):
        url = "/api/v1/admin/logistics/cockpit/"
        
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_logistics_cockpit_data(self):
        self.client.force_authenticate(user=self.admin_user)
        url = "/api/v1/admin/logistics/cockpit/"
        
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.json()
        
        deliveries = data["deliveries_today"]
        self.assertEqual(len(deliveries), 3) # today, overdue, direct_sale
        
        sub_delivery_ids = [d["id"] for d in deliveries if d["type"] == "SUBSCRIPTION"]
        self.assertIn(self.sub_delivery_today.id, sub_delivery_ids)
        self.assertIn(self.sub_delivery_overdue.id, sub_delivery_ids)
        self.assertNotIn(self.sub_delivery_future.id, sub_delivery_ids)
        self.assertNotIn(self.sub_delivery_delivered.id, sub_delivery_ids)
        
        overdue_delivery = next(d for d in deliveries if d["id"] == self.sub_delivery_overdue.id)
        self.assertTrue(overdue_delivery["is_overdue"])
        
        ds_deliveries = [d for d in deliveries if d["type"] == "DIRECT_SALE"]
        self.assertEqual(len(ds_deliveries), 1)
        self.assertEqual(ds_deliveries[0]["id"], self.ds_case.id)
        
        returns = data["returns_in_flight"]
        self.assertEqual(len(returns), 1)
        self.assertEqual(returns[0]["id"], self.return_case.id)

    def test_cache_hit(self):
        self.client.force_authenticate(user=self.admin_user)
        url = "/api/v1/admin/logistics/cockpit/"
        
        with self.assertNumQueries(11): # initial queries
            self.client.get(url)
            
        with self.assertNumQueries(0): # cache hit
            self.client.get(url)
