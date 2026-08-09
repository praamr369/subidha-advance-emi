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
