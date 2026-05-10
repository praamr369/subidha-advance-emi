from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import CustomerPurchaseEnquiry, Vendor, VendorQuote, VendorQuoteRequest, VendorServiceArea
from inventory.models import InventoryItem, InventoryItemType, PurchaseBill, PurchaseOrder
from subscriptions.models import PublicLeadIntent
from tests.helpers import (
    create_admin_user,
    create_customer_user,
    create_partner_user,
    create_product,
)


class OnlineEnquiryPhase5ApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="online_enq_admin", phone="9399001001")
        self.partner = create_partner_user(username="online_enq_partner", phone="9399001002")
        self.vendor_user = create_customer_user(username="online_enq_vendor", phone="9399001003")
        self.vendor_user.role = "VENDOR"
        self.vendor_user.save(update_fields=["role"])
        self.vendor_near = Vendor.objects.create(name="Near Vendor", status="ACTIVE", delivery_score=Decimal("80"))
        self.vendor_far = Vendor.objects.create(name="Far Vendor", status="ACTIVE", delivery_score=Decimal("10"))
        VendorServiceArea.objects.create(vendor=self.vendor_near, pincode="411001", city="Pune", district="", state="MH")
        VendorServiceArea.objects.create(vendor=self.vendor_far, pincode="682001", city="Kochi", district="", state="KL")

    def _make_enquiry(self, **kwargs):
        defaults = dict(
            customer_name="Walk-in Buyer",
            phone="9399001099",
            product_name="Study desk",
            category_text="",
            quantity=Decimal("2.000"),
            pincode="411001",
            city="Pune",
            district="",
            state="MH",
        )
        defaults.update(kwargs)
        row = CustomerPurchaseEnquiry(**defaults)
        row.save()
        return row

    def test_suggest_prefers_same_pincode_vendor(self):
        enquiry = self._make_enquiry(pincode="411001", city="Pune", state="MH")
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(f"/api/v1/admin/online-enquiries/{enquiry.id}/suggest-vendors/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ids = [row["vendor_id"] for row in response.data.get("results") or []]
        self.assertIn(self.vendor_near.id, ids)
        self.assertNotIn(self.vendor_far.id, ids)

    def test_request_quotes_select_quote_no_purchase_bill_posting(self):
        enquiry = self._make_enquiry(pincode="411001")
        bills_before = PurchaseBill.objects.count()

        self.client.force_authenticate(user=self.admin)
        rfq_res = self.client.post(
            f"/api/v1/admin/online-enquiries/{enquiry.id}/request-vendor-quotes/",
            {"vendor_ids": [self.vendor_near.id], "send_to_vendors": False},
            format="json",
        )
        self.assertEqual(rfq_res.status_code, status.HTTP_201_CREATED, rfq_res.data)
        rq = VendorQuoteRequest.objects.get(pk=rfq_res.data["id"])
        self.assertEqual(rq.source_type, "ONLINE_ORDER")
        self.assertEqual(rq.source_id, enquiry.pk)

        stub = VendorQuote.objects.get(quote_request=rq, vendor=self.vendor_near)
        VendorQuote.objects.filter(pk=stub.pk).update(status="QUOTED", quoted_price=Decimal("12500.00"))

        sel = self.client.post(
            f"/api/v1/admin/online-enquiries/{enquiry.id}/select-vendor-quote/",
            {"vendor_quote_id": stub.pk},
            format="json",
        )
        self.assertEqual(sel.status_code, status.HTTP_200_OK, sel.data)
        enquiry.refresh_from_db()
        self.assertEqual(enquiry.status, "VENDOR_SELECTED")
        self.assertEqual(enquiry.selected_vendor_quote_id, stub.pk)
        self.assertEqual(PurchaseBill.objects.count(), bills_before)

    def test_create_draft_po_requires_confirm_and_inventory_line(self):
        product = create_product(name="PO Bridge SKU", product_code="OPE-P1")
        item = InventoryItem.objects.create(
            product=product,
            sku="OPE-SKU-1",
            stock_item_type=InventoryItemType.RAW_MATERIAL,
        )

        enquiry = self._make_enquiry(pincode="411001")
        self.client.force_authenticate(user=self.admin)
        rfq_res = self.client.post(
            f"/api/v1/admin/online-enquiries/{enquiry.id}/request-vendor-quotes/",
            {"vendor_ids": [self.vendor_near.id], "send_to_vendors": False},
            format="json",
        )
        stub = VendorQuote.objects.get(quote_request_id=rfq_res.data["id"], vendor=self.vendor_near)
        VendorQuote.objects.filter(pk=stub.pk).update(status="QUOTED", quoted_price=Decimal("5000.00"))
        self.client.post(
            f"/api/v1/admin/online-enquiries/{enquiry.id}/select-vendor-quote/",
            {"vendor_quote_id": stub.pk},
            format="json",
        )

        po_before = PurchaseOrder.objects.count()
        bad = self.client.post(
            f"/api/v1/admin/online-enquiries/{enquiry.id}/create-purchase-draft/",
            {
                "confirm": False,
                "inventory_item_id": item.id,
                "quantity": "1.000",
                "unit_cost": "100.00",
            },
            format="json",
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(PurchaseOrder.objects.count(), po_before)

        ok = self.client.post(
            f"/api/v1/admin/online-enquiries/{enquiry.id}/create-purchase-draft/",
            {
                "confirm": True,
                "inventory_item_id": item.id,
                "quantity": "1.000",
                "unit_cost": "100.00",
            },
            format="json",
        )
        self.assertIn(ok.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED), ok.data)
        self.assertEqual(PurchaseOrder.objects.count(), po_before + 1)
        enquiry.refresh_from_db()
        self.assertIsNotNone(enquiry.draft_purchase_order_id)

    def test_partner_and_vendor_blocked_from_admin_online_enquiries(self):
        self._make_enquiry()
        for user in (self.partner, self.vendor_user):
            self.client.force_authenticate(user=user)
            response = self.client.get("/api/v1/admin/online-enquiries/")
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_public_procurement_enquiry_creates_customer_purchase_enquiry(self):
        payload = {
            "name": "Site Visitor",
            "phone": "9191919191",
            "city": "Pune",
            "intent": PublicLeadIntent.DIRECT_SALE.value,
            "create_procurement_enquiry": True,
        }
        response = self.client.post("/api/v1/public/leads/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertIn("procurement_enquiry_id", response.data)
        enquiry = CustomerPurchaseEnquiry.objects.get(pk=response.data["procurement_enquiry_id"])
        self.assertEqual(enquiry.public_lead_id, response.data["lead_id"])

    def test_public_procurement_enquiry_invalid_intent_returns_400(self):
        payload = {
            "name": "Site Visitor",
            "phone": "9292929292",
            "intent": PublicLeadIntent.GENERAL.value,
            "create_procurement_enquiry": True,
        }
        response = self.client.post("/api/v1/public/leads/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
