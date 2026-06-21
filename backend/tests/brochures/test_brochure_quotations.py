from decimal import Decimal
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.apps import apps
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from brochures.models import (
    BrochureDocument,
    BrochureEnquiry,
    BrochureEnquiryProduct,
    BrochureQuotation,
    BrochureQuotationStatusHistory,
)
from brochures.services.brochure_enquiry_lifecycle_service import mark_enquiry_contacted
from brochures.services.brochure_quotation_service import create_quotation
from crm.models import PartyInteraction, PartyMaster
from subscriptions.models import Product
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_customer_user,
    create_user,
)


SIDE_EFFECT_MODELS = [
    ("billing", "BillingInvoice"),
    ("billing", "ReceiptDocument"),
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


class BrochureQuotationTests(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.media_dir = TemporaryDirectory()
        cls.media_override = override_settings(
            MEDIA_ROOT=cls.media_dir.name,
            ALLOWED_HOSTS=["testserver"],
        )
        cls.media_override.enable()

    @classmethod
    def tearDownClass(cls):
        cls.media_override.disable()
        cls.media_dir.cleanup()
        super().tearDownClass()

    def setUp(self):
        self.admin = create_admin_user(
            username="quotation_admin",
            phone="9400000101",
        )
        self.product = Product.objects.create(
            product_code="QUOTE-SOFA",
            name="Quotation Sofa",
            base_price=Decimal("24000.00"),
            category="Living Room",
            is_active=True,
            is_emi_enabled=True,
            is_rent_enabled=True,
            is_lease_enabled=True,
            is_direct_sale_enabled=True,
        )
        self.brochure = BrochureDocument.objects.create(
            brochure_no="BRO-20260621-Q001",
            brochure_type=BrochureDocument.BrochureType.RENT,
            title="Quotation Source",
            public_token="quotation-source-token",
            pdf_file=SimpleUploadedFile("source.pdf", b"%PDF-1.4"),
            product_snapshot=[],
            created_by=self.admin,
        )
        self.party = PartyMaster.objects.create(
            display_name="Quotation Customer",
            party_kind="PERSON",
            primary_phone="+919876543210",
        )
        self.enquiry = BrochureEnquiry.objects.create(
            enquiry_no="ENQ-BR-20260621-Q001",
            brochure=self.brochure,
            customer_name="Quotation Customer",
            phone="9876543210",
            phone_normalized="+919876543210",
            location="Asansol",
            preferred_plan=BrochureEnquiry.PreferredPlan.RENT,
            crm_party=self.party,
        )
        BrochureEnquiryProduct.objects.create(
            enquiry=self.enquiry,
            product=self.product,
            product_snapshot={
                "id": self.product.id,
                "product_code": self.product.product_code,
                "name": self.product.name,
                "monthly_rent": "1800.00",
                "security_deposit": "4000.00",
                "availability_label": "Subject to confirmation",
                "vendor_id": 999,
                "internal_cost": "1.00",
            },
            brochure_product_code=self.product.product_code,
            brochure_product_name=self.product.name,
            requested_quantity=2,
            preferred_plan=BrochureEnquiry.PreferredPlan.RENT,
        )
        self.client.force_authenticate(self.admin)

    def manual_payload(self, plan_type="DIRECT_SALE", **overrides):
        line = {
            "product_id": self.product.id,
            "product_name": self.product.name,
            "product_code": self.product.product_code,
            "plan_type": plan_type,
            "quantity": 2,
            "unit_price": "1000.00",
            "monthly_amount": "300.00",
            "tenure_months": 12,
            "security_deposit": "500.00",
            "discount_amount": "100.00",
        }
        payload = {
            "customer_name": "Manual Customer",
            "phone": "9876543210",
            "quotation_type": plan_type,
            "delivery_charge": "200.00",
            "discount_amount": "50.00",
            "terms_text": "Subject to final confirmation.",
            "lines": [line],
        }
        payload.update(overrides)
        return payload

    def create_manual(self, plan_type="DIRECT_SALE", **overrides):
        return self.client.post(
            "/api/v1/admin/brochures/quotations/",
            self.manual_payload(plan_type, **overrides),
            format="json",
        )

    def test_create_from_enquiry_snapshots_products_and_is_non_financial(self):
        mark_enquiry_contacted(self.enquiry, changed_by=self.admin)
        before = side_effect_counts()
        response = self.client.post(
            f"/api/v1/admin/brochures/quotations/from-enquiry/{self.enquiry.id}/",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        quotation = BrochureQuotation.objects.get(pk=response.data["id"])
        line = quotation.lines.get()
        self.assertEqual(quotation.status, "DRAFT")
        self.assertEqual(line.quantity, 2)
        self.assertEqual(line.monthly_amount, Decimal("1800.00"))
        self.assertNotIn("vendor_id", line.product_snapshot)
        self.assertNotIn("internal_cost", line.product_snapshot)
        self.assertTrue(
            BrochureQuotationStatusHistory.objects.filter(
                quotation=quotation,
                from_status="",
                to_status="DRAFT",
            ).exists()
        )
        self.enquiry.refresh_from_db()
        self.assertEqual(self.enquiry.status, "QUOTED")
        self.assertEqual(side_effect_counts(), before)

    def test_direct_sale_rent_lease_and_lucky_totals(self):
        direct = self.create_manual()
        self.assertEqual(direct.status_code, 201)
        self.assertEqual(direct.data["subtotal_amount"], "2000.00")
        self.assertEqual(direct.data["grand_total"], "2050.00")
        self.assertEqual(direct.data["total_payable_now"], "2050.00")

        rent = self.create_manual("RENT")
        self.assertEqual(rent.status_code, 201)
        self.assertEqual(rent.data["recurring_monthly_total"], "600.00")
        self.assertEqual(rent.data["security_deposit_total"], "1000.00")
        self.assertEqual(rent.data["total_payable_now"], "1200.00")

        lease = self.create_manual("LEASE")
        self.assertEqual(lease.status_code, 201)
        self.assertEqual(lease.data["recurring_monthly_total"], "600.00")
        self.assertEqual(lease.data["grand_total"], "8250.00")

        lucky = self.create_manual(
            "LUCKY_EMI",
            lines=[
                {
                    "product_id": self.product.id,
                    "product_name": self.product.name,
                    "plan_type": "LUCKY_EMI",
                    "quantity": 1,
                    "monthly_amount": "1000.00",
                }
            ],
            discount_amount="0.00",
            delivery_charge="0.00",
        )
        self.assertEqual(lucky.status_code, 201)
        self.assertEqual(lucky.data["lines"][0]["tenure_months"], 15)
        self.assertEqual(lucky.data["grand_total"], "15000.00")

    def test_manual_product_line_can_derive_safe_snapshot_and_sale_price(self):
        response = self.client.post(
            "/api/v1/admin/brochures/quotations/",
            {
                "customer_name": "Derived Product Customer",
                "phone": "9876543210",
                "quotation_type": "DIRECT_SALE",
                "lines": [
                    {
                        "product_id": self.product.id,
                        "plan_type": "DIRECT_SALE",
                        "quantity": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["lines"][0]["product_name"], self.product.name)
        self.assertEqual(response.data["lines"][0]["unit_price"], "24000.00")
        self.assertEqual(response.data["subtotal_amount"], "24000.00")

    def test_negative_values_and_excess_discount_are_rejected(self):
        negative = self.manual_payload()
        negative["lines"][0]["unit_price"] = "-1.00"
        response = self.client.post(
            "/api/v1/admin/brochures/quotations/",
            negative,
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        excessive = self.manual_payload()
        excessive["lines"][0]["discount_amount"] = "5000.00"
        response = self.client.post(
            "/api/v1/admin/brochures/quotations/",
            excessive,
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_status_lifecycle_history_and_terminal_acceptance(self):
        created = self.create_manual()
        quotation_id = created.data["id"]
        sent = self.client.post(
            f"/api/v1/admin/brochures/quotations/{quotation_id}/send/",
            {},
            format="json",
        )
        self.assertEqual(sent.status_code, 200)
        self.assertEqual(sent.data["status"], "SENT")
        self.assertTrue(sent.data["pdf_url"])
        accepted = self.client.post(
            f"/api/v1/admin/brochures/quotations/{quotation_id}/accept/",
            {"note": "Agreed in principle only."},
            format="json",
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.data["status"], "ACCEPTED")
        invalid = self.client.post(
            f"/api/v1/admin/brochures/quotations/{quotation_id}/cancel/",
            {},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(
            list(
                BrochureQuotationStatusHistory.objects.filter(
                    quotation_id=quotation_id
                ).values_list("to_status", flat=True)
            ),
            ["DRAFT", "SENT", "ACCEPTED"],
        )

    def test_public_endpoint_is_token_only_and_safe(self):
        created = self.create_manual()
        quotation = BrochureQuotation.objects.get(pk=created.data["id"])
        response = self.client.get(
            f"/api/v1/public/quotations/{quotation.public_token}/"
        )
        self.assertEqual(response.status_code, 200)
        text = str(response.data).lower()
        for forbidden in (
            "internal_note",
            "crm_party",
            "crm_lead",
            "vendor",
            "internal_cost",
            "ledger",
            "purchase",
        ):
            self.assertNotIn(forbidden, text)
        self.assertIn("not an invoice", response.data["disclaimer"].lower())
        self.assertEqual(
            self.client.get("/api/v1/public/quotations/not-a-token/").status_code,
            404,
        )

    @patch(
        "brochures.services.brochure_quotation_service.PartyInteraction.objects.get_or_create",
        side_effect=RuntimeError("CRM unavailable"),
    )
    def test_crm_failure_does_not_fail_creation(self, _crm):
        quotation = create_quotation(
            payload={
                "crm_party_id": self.party.id,
                "customer_name": "CRM Customer",
                "phone": "9876543210",
                "quotation_type": "DIRECT_SALE",
                "lines": [
                    {
                        "product": self.product,
                        "product_name": self.product.name,
                        "plan_type": "DIRECT_SALE",
                        "quantity": 1,
                        "unit_price": "1000.00",
                    }
                ],
            },
            created_by=self.admin,
        )
        self.assertTrue(BrochureQuotation.objects.filter(pk=quotation.pk).exists())
        quotation.refresh_from_db()
        self.assertIn("CRM interaction deferred", quotation.internal_note)

    def test_crm_interactions_are_idempotent_per_event(self):
        created = self.client.post(
            "/api/v1/admin/brochures/quotations/",
            {
                **self.manual_payload(),
                "crm_party_id": self.party.id,
            },
            format="json",
        )
        quotation = BrochureQuotation.objects.get(pk=created.data["id"])
        from brochures.services.brochure_quotation_service import (
            record_crm_quotation_event,
        )

        record_crm_quotation_event(quotation, "CREATED", changed_by=self.admin)
        record_crm_quotation_event(quotation, "CREATED", changed_by=self.admin)
        self.assertEqual(
            PartyInteraction.objects.filter(
                related_source_model="BrochureQuotation:CREATED",
                related_source_pk=quotation.pk,
            ).count(),
            1,
        )

    def test_admin_roles_and_public_permissions(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(
            self.client.get("/api/v1/admin/brochures/quotations/").status_code,
            401,
        )
        customer = create_customer_user(
            username="quotation_customer",
            phone="9400000102",
        )
        self.client.force_authenticate(customer)
        self.assertEqual(
            self.client.get("/api/v1/admin/brochures/quotations/").status_code,
            403,
        )
        for user in (
            create_cashier_user(
                username="quotation_cashier",
                phone="9400000103",
            ),
            create_user(
                username="quotation_staff",
                phone="9400000104",
                role="STAFF",
                is_staff=True,
            ),
        ):
            self.client.force_authenticate(user)
            self.assertEqual(
                self.client.get("/api/v1/admin/brochures/quotations/").status_code,
                200,
            )
