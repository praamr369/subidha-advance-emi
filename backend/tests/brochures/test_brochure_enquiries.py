from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.apps import apps
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APITestCase

from brochures.models import (
    BrochureDocument,
    BrochureEnquiry,
    BrochureEnquiryProduct,
    BrochureEnquiryStatusHistory,
)
from brochures.services.brochure_crm_link_service import link_brochure_enquiry_to_crm
from crm.models import Lead, PartyInteraction, PartyMaster
from subscriptions.models import Product
from tests.helpers import create_admin_user, create_customer_user, create_user


SIDE_EFFECT_MODELS = [
    ("billing", "BillingInvoice"),
    ("billing", "DirectSale"),
    ("subscriptions", "Payment"),
    ("subscriptions", "Subscription"),
    ("subscriptions", "Emi"),
    ("accounting", "JournalEntry"),
    ("reconciliation", "ReconciliationItem"),
    ("inventory", "StockMovement"),
    ("inventory", "StockReservation"),
    ("subscriptions", "SubscriptionDelivery"),
]


def side_effect_counts():
    counts = {}
    for app_label, model_name in SIDE_EFFECT_MODELS:
        try:
            model = apps.get_model(app_label, model_name)
        except LookupError:
            continue
        counts[f"{app_label}.{model_name}"] = model.objects.count()
    return counts


class BrochureEnquiryTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="brochure_enquiry_admin",
            phone="9300000101",
        )
        self.product = Product.objects.create(
            product_code="BRO-ENQ-SOFA",
            name="Enquiry Sofa",
            base_price=Decimal("24000.00"),
            category="Living Room",
            is_active=True,
            is_emi_enabled=True,
            is_rent_enabled=True,
            is_direct_sale_enabled=True,
        )
        self.snapshot = {
            "id": self.product.id,
            "product_code": self.product.product_code,
            "name": self.product.name,
            "category": "Living Room",
            "short_description": "Public-safe description.",
            "public_badge": "Popular",
            "sale_price": "24000.00",
            "monthly_rent": "1800.00",
            "lease_monthly_amount": None,
            "security_deposit": "4000.00",
            "availability_label": "In stock",
            "public_product_url": f"/products/{self.product.id}",
            "featured": True,
            "sort_order": 1,
            "vendor_id": 999,
            "internal_cost": "10.00",
        }
        self.brochure = BrochureDocument.objects.create(
            brochure_no="BRO-20260621-ENQ001",
            brochure_type=BrochureDocument.BrochureType.RENT,
            title="Rent Collection",
            public_token="public-enquiry-token",
            pdf_file=SimpleUploadedFile("brochure.pdf", b"%PDF-1.4"),
            product_snapshot=[self.snapshot],
            status=BrochureDocument.Status.GENERATED,
            created_by=self.admin,
        )

    def payload(self, **overrides):
        payload = {
            "customer_name": "A Customer",
            "phone": "9876543210",
            "location": "Asansol",
            "preferred_plan": "RENT",
            "message": "Please call me.",
            "products": [
                {
                    "product_id": self.product.id,
                    "requested_quantity": 2,
                    "preferred_plan": "RENT",
                    "notes": "Need delivery details",
                }
            ],
        }
        payload.update(overrides)
        return payload

    def submit(self, payload=None):
        return self.client.post(
            f"/api/v1/public/brochures/{self.brochure.public_token}/enquiries/",
            payload or self.payload(),
            format="json",
        )

    def test_public_enquiry_creates_snapshots_crm_links_and_no_operational_records(self):
        before = side_effect_counts()
        response = self.submit()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "NEW")
        self.assertEqual(set(response.data), {"enquiry_no", "status", "message"})

        enquiry = BrochureEnquiry.objects.get(enquiry_no=response.data["enquiry_no"])
        item = enquiry.products.get()
        self.assertEqual(item.requested_quantity, 2)
        self.assertEqual(item.product_snapshot["name"], "Enquiry Sofa")
        self.assertNotIn("vendor_id", item.product_snapshot)
        self.assertNotIn("internal_cost", item.product_snapshot)
        self.assertIsNotNone(enquiry.crm_party_id)
        self.assertIsNotNone(enquiry.crm_interaction_id)
        self.assertIsNotNone(enquiry.crm_lead_id)
        self.assertEqual(enquiry.crm_link_status, "LINKED")
        self.assertEqual(enquiry.phone, "9876543210")
        self.assertEqual(enquiry.phone_normalized, "+919876543210")
        initial_history = enquiry.status_history.get()
        self.assertEqual(initial_history.event_type, "CREATED")
        self.assertEqual(initial_history.to_status, "NEW")
        self.assertEqual(side_effect_counts(), before)

    def test_product_must_belong_to_brochure_snapshot(self):
        response = self.submit(
            self.payload(products=[{"product_id": self.product.id + 999, "requested_quantity": 1}])
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(BrochureEnquiry.objects.exists())

    def test_expired_and_invalid_brochures_are_rejected(self):
        self.brochure.expires_at = timezone.now() - timedelta(minutes=1)
        self.brochure.save(update_fields=["expires_at", "updated_at"])
        self.assertEqual(self.submit().status_code, 410)
        invalid = self.client.post(
            "/api/v1/public/brochures/not-a-token/enquiries/",
            self.payload(),
            format="json",
        )
        self.assertEqual(invalid.status_code, 404)

    @patch(
        "brochures.services.brochure_crm_link_service.PartyMaster.objects.create",
        side_effect=RuntimeError("CRM unavailable"),
    )
    def test_crm_failure_does_not_roll_back_public_enquiry(self, _crm):
        response = self.submit()
        self.assertEqual(response.status_code, 201)
        enquiry = BrochureEnquiry.objects.get(enquiry_no=response.data["enquiry_no"])
        self.assertEqual(enquiry.crm_link_status, "FAILED")
        self.assertIn("CRM sync deferred", enquiry.crm_link_message)

    def test_duplicate_phone_reuses_party_and_active_lead_but_logs_each_interaction(self):
        first = self.submit()
        second = self.submit(
            self.payload(
                customer_name="Same Household",
                phone="+91 (98765) 43210",
            )
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(PartyMaster.objects.filter(primary_phone="+919876543210").count(), 1)
        self.assertEqual(Lead.objects.filter(phone="+919876543210", source="BROCHURE").count(), 1)
        self.assertEqual(PartyInteraction.objects.filter(related_source_model="BrochureEnquiry").count(), 2)
        duplicate = BrochureEnquiry.objects.get(enquiry_no=second.data["enquiry_no"])
        self.assertTrue(duplicate.is_possible_duplicate)
        self.assertIsNotNone(duplicate.duplicate_of_id)
        self.assertEqual(duplicate.phone_normalized, "+919876543210")

    def test_admin_permissions_list_update_assign_contact_and_close(self):
        self.submit()
        public_list = self.client.get("/api/v1/admin/brochures/enquiries/")
        self.assertEqual(public_list.status_code, 401)
        enquiry_id = BrochureEnquiry.objects.get().id
        public_detail = self.client.get(
            f"/api/v1/admin/brochures/enquiries/{enquiry_id}/"
        )
        self.assertEqual(public_detail.status_code, 401)

        customer = create_customer_user(
            username="brochure_enquiry_customer",
            phone="9300000102",
        )
        self.client.force_authenticate(customer)
        self.assertEqual(
            self.client.get("/api/v1/admin/brochures/enquiries/").status_code,
            403,
        )

        staff = create_user(
            username="brochure_enquiry_staff",
            phone="9300000103",
            role="STAFF",
            is_staff=True,
        )
        self.client.force_authenticate(staff)
        listing = self.client.get("/api/v1/admin/brochures/enquiries/")
        self.assertEqual(listing.status_code, 200)
        enquiry_id = listing.data["results"][0]["id"]

        updated = self.client.patch(
            f"/api/v1/admin/brochures/enquiries/{enquiry_id}/",
            {"priority": "HIGH"},
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        assigned = self.client.post(
            f"/api/v1/admin/brochures/enquiries/{enquiry_id}/assign/",
            {"assigned_to": staff.id},
            format="json",
        )
        self.assertEqual(assigned.status_code, 200)
        contacted = self.client.post(
            f"/api/v1/admin/brochures/enquiries/{enquiry_id}/mark-contacted/",
            {},
            format="json",
        )
        self.assertEqual(contacted.data["status"], "CONTACTED")
        self.assertIsNotNone(contacted.data["last_contacted_at"])
        quoted = self.client.patch(
            f"/api/v1/admin/brochures/enquiries/{enquiry_id}/",
            {"status": "QUOTED"},
            format="json",
        )
        self.assertEqual(quoted.status_code, 200)
        closed = self.client.post(
            f"/api/v1/admin/brochures/enquiries/{enquiry_id}/close/",
            {"status": "LOST", "internal_note": "Customer deferred purchase."},
            format="json",
        )
        self.assertEqual(closed.data["status"], "LOST")
        invalid_reopen = self.client.post(
            f"/api/v1/admin/brochures/enquiries/{enquiry_id}/mark-contacted/",
            {},
            format="json",
        )
        self.assertEqual(invalid_reopen.status_code, 400)
        self.assertGreaterEqual(
            BrochureEnquiryStatusHistory.objects.filter(enquiry_id=enquiry_id).count(),
            6,
        )

    def test_closed_enquiry_is_terminal_and_close_is_audited(self):
        response = self.submit()
        enquiry = BrochureEnquiry.objects.get(enquiry_no=response.data["enquiry_no"])
        self.client.force_authenticate(self.admin)
        closed = self.client.post(
            f"/api/v1/admin/brochures/enquiries/{enquiry.id}/close/",
            {"status": "CLOSED", "internal_note": "No longer required."},
            format="json",
        )
        self.assertEqual(closed.status_code, 200)
        self.assertEqual(closed.data["status"], "CLOSED")
        history = BrochureEnquiryStatusHistory.objects.filter(
            enquiry=enquiry,
            event_type="STATUS",
            from_status="NEW",
            to_status="CLOSED",
        )
        self.assertTrue(history.exists())
        reopen = self.client.post(
            f"/api/v1/admin/brochures/enquiries/{enquiry.id}/mark-contacted/",
            {},
            format="json",
        )
        self.assertEqual(reopen.status_code, 400)

    def test_public_products_endpoint_returns_only_frozen_brochure_products(self):
        response = self.client.get(
            f"/api/v1/public/brochures/{self.brochure.public_token}/products/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["products"][0]["name"], "Enquiry Sofa")
        self.assertNotIn("vendor_id", response.data["products"][0])
        self.assertNotIn("internal_cost", response.data["products"][0])
        self.assertFalse(BrochureEnquiryProduct.objects.exists())

    def test_public_cannot_submit_internal_follow_up_fields(self):
        response = self.submit(
            self.payload(
                internal_note="unsafe",
                follow_up_at=timezone.now().isoformat(),
                assigned_to=self.admin.id,
                crm_link_status="LINKED",
            )
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(BrochureEnquiry.objects.exists())

    def test_same_phone_different_product_is_not_flagged_as_duplicate(self):
        other_product = Product.objects.create(
            product_code="BRO-ENQ-BED",
            name="Enquiry Bed",
            base_price=Decimal("21000.00"),
            category="Bedroom",
            is_active=True,
            is_emi_enabled=True,
            is_rent_enabled=True,
            is_direct_sale_enabled=True,
        )
        other_snapshot = {
            **self.snapshot,
            "id": other_product.id,
            "product_code": other_product.product_code,
            "name": other_product.name,
        }
        self.brochure.product_snapshot = [self.snapshot, other_snapshot]
        self.brochure.save(update_fields=["product_snapshot", "updated_at"])
        first = self.submit()
        second = self.submit(
            self.payload(
                products=[
                    {
                        "product_id": other_product.id,
                        "requested_quantity": 1,
                        "preferred_plan": "RENT",
                    }
                ]
            )
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        enquiry = BrochureEnquiry.objects.get(enquiry_no=second.data["enquiry_no"])
        self.assertFalse(enquiry.is_possible_duplicate)

    def test_crm_link_service_is_idempotent(self):
        response = self.submit()
        enquiry = BrochureEnquiry.objects.get(enquiry_no=response.data["enquiry_no"])
        before = {
            "parties": PartyMaster.objects.count(),
            "leads": Lead.objects.count(),
            "interactions": PartyInteraction.objects.count(),
        }
        link_brochure_enquiry_to_crm(enquiry)
        link_brochure_enquiry_to_crm(enquiry)
        after = {
            "parties": PartyMaster.objects.count(),
            "leads": Lead.objects.count(),
            "interactions": PartyInteraction.objects.count(),
        }
        self.assertEqual(after, before)

    def test_admin_follow_up_duplicate_filters_and_detail_history(self):
        first = self.submit()
        second = self.submit(self.payload(phone="98765-43210"))
        first_enquiry = BrochureEnquiry.objects.get(enquiry_no=first.data["enquiry_no"])
        duplicate = BrochureEnquiry.objects.get(enquiry_no=second.data["enquiry_no"])
        self.client.force_authenticate(self.admin)
        follow_up = timezone.now() - timedelta(minutes=5)
        updated = self.client.patch(
            f"/api/v1/admin/brochures/enquiries/{first_enquiry.id}/",
            {
                "internal_note": "Call before lunch.",
                "follow_up_at": follow_up.isoformat(),
            },
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["internal_note"], "Call before lunch.")

        due = self.client.get(
            "/api/v1/admin/brochures/enquiries/?follow_up_due=true"
        )
        self.assertEqual(due.status_code, 200)
        self.assertIn(
            first_enquiry.id,
            {row["id"] for row in due.data["results"]},
        )
        duplicates = self.client.get(
            "/api/v1/admin/brochures/enquiries/?possible_duplicate=true"
        )
        self.assertEqual(duplicates.status_code, 200)
        self.assertEqual(
            {row["id"] for row in duplicates.data["results"]},
            {duplicate.id},
        )
        linked = self.client.get(
            "/api/v1/admin/brochures/enquiries/?crm_link_status=LINKED"
        )
        self.assertEqual(linked.status_code, 200)
        self.assertGreaterEqual(linked.data["count"], 2)

        listing = self.client.get("/api/v1/admin/brochures/enquiries/")
        listed_first = next(
            row for row in listing.data["results"] if row["id"] == first_enquiry.id
        )
        self.assertNotIn("internal_note", listed_first)
        self.assertNotIn("status_history", listed_first)
        detail = self.client.get(
            f"/api/v1/admin/brochures/enquiries/{first_enquiry.id}/"
        )
        self.assertEqual(detail.data["internal_note"], "Call before lunch.")
        self.assertTrue(detail.data["status_history"])
