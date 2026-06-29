from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    DocumentSequence,
    Vendor,
    VendorAddress,
    VendorCategory,
    VendorLedgerEntry,
    VendorProduct,
    VendorQuote,
    VendorQuoteRequest,
    VendorServiceArea,
)
from billing.models import CustomerCreditLedger, PurchaseReturn
from crm.models import PartyLink, PartyLinkRole
from inventory.models import PurchaseBill, PurchaseOrder
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_customer_profile,
    create_customer_user,
    create_partner_user,
)


class VendorPhase3QuotesApiTests(APITestCase):
    """Additive vendor RFQ lifecycle (quotes are not accounting documents)."""

    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="vendor_p3_admin", phone="9388001001")
        self.vendor_user = create_customer_user(username="vendor_p3_portal", phone="9388001002")
        self.vendor_user.role = "VENDOR"
        self.vendor_user.save(update_fields=["role"])
        self.vendor = Vendor.objects.create(
            name="Primary Vendor Org",
            display_name="Primary Vendor Org",
            linked_user=self.vendor_user,
            status="ACTIVE",
        )
        self.customer = create_customer_profile(name="Vendor P3 Buyer", phone="9388001099")

    def test_admin_create_quote_request_allocates_document_sequence_stub_quotes(self):
        peer = Vendor.objects.create(name="Peer Vendor Org", status="ACTIVE")
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/v1/admin/vendor-quotes/requests/",
            {
                "source_type": "MANUAL",
                "product_name": "Wardrobe",
                "category_text": "WOOD",
                "quantity": "1.500",
                "vendor_ids": [self.vendor.id, peer.id],
                "send_to_vendors": True,
                "customer": self.customer.id,
                "customer_pincode": "752001",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(DocumentSequence.objects.filter(series_code="VENDOR_QUOTE_REQUEST").exists())
        self.assertEqual(len(response.data.get("quotes") or []), 2)

    def test_vendor_portal_detail_excludes_competitors_quotes(self):
        peer = Vendor.objects.create(name="Other RFQ Participant", status="ACTIVE")
        self.client.force_authenticate(user=self.admin)
        create_response = self.client.post(
            "/api/v1/admin/vendor-quotes/requests/",
            {
                "source_type": "MANUAL",
                "product_name": "Bed frame",
                "quantity": "1.000",
                "vendor_ids": [self.vendor.id, peer.id],
                "send_to_vendors": True,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        rid = create_response.data["id"]
        self.client.force_authenticate(user=self.vendor_user)
        detail = self.client.get(f"/api/v1/vendor/quote-requests/{rid}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        qrows = detail.data.get("quotes") or []
        self.assertEqual(len(qrows), 1)
        self.assertEqual(qrows[0]["vendor"], self.vendor.id)

    def test_vendor_submit_admin_accept_rejects_other_quoted_vendor_without_posting_purchase(self):
        from inventory.models import PurchaseBill

        peer_user = create_customer_user(username="vendor_p3_peer_portal", phone="9388001003")
        peer_user.role = "VENDOR"
        peer_user.save(update_fields=["role"])
        peer = Vendor.objects.create(
            name="Competing Quote Vendor",
            display_name="Competing Quote Vendor",
            linked_user=peer_user,
            status="ACTIVE",
        )

        bills_before = PurchaseBill.objects.count()
        self.client.force_authenticate(user=self.admin)
        create_response = self.client.post(
            "/api/v1/admin/vendor-quotes/requests/",
            {
                "source_type": "MANUAL",
                "product_name": "Office desk",
                "quantity": "1.000",
                "vendor_ids": [self.vendor.id, peer.id],
                "send_to_vendors": True,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        rfq_id = create_response.data["id"]
        by_vid = {
            row["vendor"]: row["id"] for row in (VendorQuote.objects.filter(quote_request_id=rfq_id).values("id", "vendor"))
        }

        self.client.force_authenticate(user=self.vendor_user)
        winner_sub = self.client.post(
            f"/api/v1/vendor/quote-requests/{rfq_id}/quote/",
            {"quoted_price": "9100.00", "lead_time_days": 5, "warranty_months": 12},
            format="json",
        )
        self.assertEqual(winner_sub.status_code, status.HTTP_200_OK, winner_sub.data)
        self.assertEqual(winner_sub.data["status"], "QUOTED")

        self.client.force_authenticate(user=peer_user)
        loser_sub = self.client.post(
            f"/api/v1/vendor/quote-requests/{rfq_id}/quote/",
            {"quoted_price": "7900.00", "lead_time_days": 2},
            format="json",
        )
        self.assertEqual(loser_sub.status_code, status.HTTP_200_OK, loser_sub.data)

        winner_id = by_vid[self.vendor.id]

        self.client.force_authenticate(user=self.admin)
        accept = self.client.post(f"/api/v1/admin/vendor-quotes/{winner_id}/accept/", {}, format="json")
        self.assertEqual(accept.status_code, status.HTTP_200_OK, accept.data)

        loser_quote = VendorQuote.objects.get(pk=by_vid[peer.id])
        self.assertEqual(loser_quote.status, "REJECTED")
        self.assertEqual(VendorQuote.objects.get(pk=winner_id).status, "ACCEPTED")

        rq = VendorQuoteRequest.objects.get(pk=rfq_id)
        self.assertEqual(rq.status, "CLOSED")
        self.assertEqual(PurchaseBill.objects.count(), bills_before)
        self.assertIn("suggested_purchase_order_url", accept.data)

    def test_vendor_list_skips_draft_requests(self):
        peer = Vendor.objects.create(name="Draft Peer", status="ACTIVE")
        self.client.force_authenticate(user=self.admin)
        self.client.post(
            "/api/v1/admin/vendor-quotes/requests/",
            {
                "source_type": "MANUAL",
                "product_name": "Draft-only RFQ",
                "quantity": "1.000",
                "vendor_ids": [self.vendor.id, peer.id],
                "send_to_vendors": False,
            },
            format="json",
        )
        self.client.force_authenticate(user=self.vendor_user)
        listed = self.client.get("/api/v1/vendor/quote-requests/")
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        for row in listed.data.get("results") or []:
            self.assertNotEqual(row.get("status"), "DRAFT")

    def test_vendor_product_catalog_admin_and_portal(self):
        from accounting.models import VendorProduct

        self.client.force_authenticate(user=self.admin)
        create_row = self.client.post(
            f"/api/v1/admin/vendors/{self.vendor.id}/products/",
            {
                "product_name": "Modular shelf",
                "vendor_sku": "SKU-P3-1",
                "category_text": "STORAGE",
                "base_quote_price": "3200.00",
                "min_order_qty": "2.000",
                "lead_time_days": 8,
                "active": True,
            },
            format="json",
        )
        self.assertEqual(create_row.status_code, status.HTTP_201_CREATED, create_row.data)
        self.assertEqual(VendorProduct.objects.filter(vendor_id=self.vendor.id).count(), 1)

        self.client.force_authenticate(user=self.vendor_user)
        portal = self.client.get("/api/v1/vendor/products/")
        self.assertEqual(portal.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(portal.data.get("count", 0), 1)


class VendorOpsApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="vendor_ops_admin", phone="9399001001")
        self.vendor_user = create_customer_user(username="vendor_portal_user", phone="9399001002")
        self.vendor_user.role = "VENDOR"
        self.vendor_user.save(update_fields=["role"])
        self.vendor = Vendor.objects.create(name="Vendor One", display_name="Vendor One", linked_user=self.vendor_user, status="ACTIVE")
        self.customer = create_customer_profile(name="Vendor Test Customer", phone="9399001009")
        self.partner = create_partner_user(username="vendor_ops_partner", phone="9399001010")
        self.cashier = create_cashier_user(username="vendor_ops_cashier", phone="9399001011")
        VendorCategory.objects.get_or_create(name="General Vendor", code="GENERAL_VENDOR")

    def test_admin_can_crud_vendor_profile(self):
        self.client.force_authenticate(user=self.admin)
        create_response = self.client.post(
            "/api/v1/admin/vendors/",
            {"name": "Vendor Two", "display_name": "Vendor Two", "status": "ACTIVE"},
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        vendor_id = create_response.data["id"]
        patch_response = self.client.patch(
            f"/api/v1/admin/vendors/{vendor_id}/",
            {"contact_person": "Ops Lead"},
            format="json",
        )
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK, patch_response.data)
        self.assertEqual(patch_response.data["contact_person"], "Ops Lead")

    def test_admin_can_create_multiple_vendors_with_distinct_codes_and_party_links(self):
        self.client.force_authenticate(user=self.admin)

        created = []
        for suffix in ("Two", "Three"):
            response = self.client.post(
                "/api/v1/admin/vendors/",
                {
                    "name": f"Vendor {suffix}",
                    "display_name": f"Vendor {suffix}",
                    "phone": f"93990020{len(created) + 1:02d}",
                    "status": "ACTIVE",
                },
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
            created.append(response.data)

        self.assertNotEqual(created[0]["id"], created[1]["id"])
        self.assertNotEqual(created[0]["vendor_code"], created[1]["vendor_code"])
        self.assertNotIn("000000", created[0]["vendor_code"])
        self.assertNotIn("000000", created[1]["vendor_code"])
        self.assertEqual(
            PartyLink.objects.filter(
                role_type=PartyLinkRole.VENDOR,
                source_model="Vendor",
                source_pk__in=[created[0]["id"], created[1]["id"]],
            ).count(),
            2,
        )

        list_response = self.client.get("/api/v1/admin/vendors/?page_size=200")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK, list_response.data)
        returned_ids = {row["id"] for row in list_response.data["results"]}
        self.assertTrue({created[0]["id"], created[1]["id"]}.issubset(returned_ids))

    def test_vendor_categories_endpoint_works(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/vendors/categories/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertGreaterEqual(len(response.data), 1)

        create_response = self.client.post(
            "/api/v1/admin/vendors/categories/",
            {
                "name": "Raw Material Supplier",
                "code": "raw_material_supplier",
                "description": "Approved raw material suppliers.",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        self.assertEqual(create_response.data["code"], "RAW_MATERIAL_SUPPLIER")

        duplicate_response = self.client.post(
            "/api/v1/admin/vendors/categories/",
            {"name": "Another category", "code": "raw_material_supplier"},
            format="json",
        )
        self.assertEqual(duplicate_response.status_code, status.HTTP_400_BAD_REQUEST, duplicate_response.data)

    def test_vendor_address_and_service_area_serialize_in_detail(self):
        self.client.force_authenticate(user=self.admin)
        VendorAddress.objects.create(
            vendor=self.vendor,
            address_type="OFFICE",
            address_line1="Main Office",
            city="Dhaka",
            district="Dhaka",
            state="Dhaka",
            pincode="1207",
            is_primary=True,
        )
        VendorServiceArea.objects.create(
            vendor=self.vendor,
            state="Dhaka",
            district="Dhaka",
            city="Dhaka",
            pincode="1207",
            is_active=True,
        )
        response = self.client.get(f"/api/v1/admin/vendors/{self.vendor.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertGreaterEqual(len(response.data.get("addresses", [])), 1)
        self.assertGreaterEqual(len(response.data.get("service_areas", [])), 1)

    def test_vendor_sourcing_prefers_same_pincode(self):
        self.client.force_authenticate(user=self.admin)
        near_vendor = Vendor.objects.create(name="Near Vendor", status="ACTIVE")
        far_vendor = Vendor.objects.create(name="Far Vendor", status="ACTIVE")
        VendorServiceArea.objects.create(vendor=near_vendor, state="Dhaka", district="Dhaka", city="Dhaka", pincode="1207", is_active=True)
        VendorServiceArea.objects.create(vendor=far_vendor, state="Dhaka", district="Dhaka", city="Dhaka", pincode="1299", is_active=True)
        response = self.client.post(
            "/api/v1/admin/vendor-sourcing/suggest/",
            {"customer_state": "Dhaka", "customer_district": "Dhaka", "customer_city": "Dhaka", "customer_pincode": "1207"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertGreaterEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["vendor_name"], near_vendor.display_name or near_vendor.name)

    def test_vendor_user_sees_only_own_quote_requests(self):
        self.client.force_authenticate(user=self.admin)
        request_1 = VendorQuoteRequest.objects.create(
            request_no="VQR-OWN-001",
            source_type="MANUAL",
            product_name="Sofa",
            category_text="FURNITURE_DEALER",
            quantity=Decimal("2.000"),
            status="SENT",
            created_by=self.admin,
            customer=self.customer,
        )
        request_1.quotes.create(vendor=self.vendor, status="REQUESTED")
        other_vendor = Vendor.objects.create(name="Other Vendor", status="ACTIVE")
        request_2 = VendorQuoteRequest.objects.create(
            request_no="VQR-OTHER-001",
            source_type="MANUAL",
            product_name="Chair",
            category_text="GENERAL_VENDOR",
            quantity=Decimal("1.000"),
            status="SENT",
            created_by=self.admin,
        )
        request_2.quotes.create(vendor=other_vendor, status="REQUESTED")
        self.client.force_authenticate(user=self.vendor_user)
        response = self.client.get("/api/v1/vendor/quote-requests/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], request_1.id)

    def test_vendor_ledger_is_separate(self):
        self.client.force_authenticate(user=self.admin)
        VendorLedgerEntry.objects.create(
            vendor=self.vendor,
            entry_type="PURCHASE_BILL",
            source_type="PurchaseBill",
            source_reference="PB-001",
            debit=Decimal("1000.00"),
            credit=Decimal("0.00"),
            balance_after=Decimal("1000.00"),
            posted_at=timezone.now(),
            created_by=self.admin,
        )
        VendorLedgerEntry.objects.create(
            vendor=self.vendor,
            entry_type="PAYMENT_TO_VENDOR",
            source_type="VendorSettlement",
            source_reference="VS-001",
            debit=Decimal("0.00"),
            credit=Decimal("250.00"),
            balance_after=Decimal("750.00"),
            posted_at=timezone.now(),
            created_by=self.admin,
        )
        response = self.client.get(f"/api/v1/admin/vendors/{self.vendor.id}/outstanding/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["outstanding"], "750.00")

    def test_purchase_bill_increases_vendor_payable_and_return_reduces_it(self):
        self.client.force_authenticate(user=self.admin)
        PurchaseBill.objects.create(
            bill_no="PB-PH2-001",
            bill_date=timezone.localdate(),
            vendor=self.vendor,
            status="POSTED",
            grand_total=Decimal("1200.00"),
        )
        PurchaseReturn.objects.create(
            return_no="PR-PH2-001",
            purchase_bill=PurchaseBill.objects.get(bill_no="PB-PH2-001"),
            vendor=self.vendor,
            status="POSTED",
            return_date=timezone.localdate(),
            reason="Return excess",
            grand_total=Decimal("200.00"),
        )
        response = self.client.get(f"/api/v1/admin/vendors/{self.vendor.id}/outstanding/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["purchase_bills"], "1200")
        self.assertEqual(response.data["purchase_returns"], "200")
        self.assertEqual(response.data["outstanding"], "1000.00")

    def test_purchase_return_vendor_side_does_not_affect_customer_credit(self):
        self.client.force_authenticate(user=self.admin)
        before = CustomerCreditLedger.objects.filter(customer=self.customer).count()
        pb = PurchaseBill.objects.create(
            bill_no="PB-PH2-002",
            bill_date=timezone.localdate(),
            vendor=self.vendor,
            status="POSTED",
            grand_total=Decimal("500.00"),
        )
        PurchaseReturn.objects.create(
            return_no="PR-PH2-002",
            purchase_bill=pb,
            vendor=self.vendor,
            status="POSTED",
            return_date=timezone.localdate(),
            reason="Vendor-side return",
            grand_total=Decimal("100.00"),
        )
        after = CustomerCreditLedger.objects.filter(customer=self.customer).count()
        self.assertEqual(before, after)

    def test_vendor_user_cannot_see_another_vendor_ledger(self):
        self.client.force_authenticate(user=self.admin)
        other_user = create_customer_user(username="vendor_portal_other", phone="9399001099")
        other_user.role = "VENDOR"
        other_user.save(update_fields=["role"])
        other_vendor = Vendor.objects.create(name="Other Vendor Scoped", linked_user=other_user, status="ACTIVE")
        VendorLedgerEntry.objects.create(
            vendor=other_vendor,
            entry_type="PURCHASE_BILL",
            source_type="PurchaseBill",
            source_reference="PB-OTHER",
            debit=Decimal("111.00"),
            credit=Decimal("0.00"),
            balance_after=Decimal("111.00"),
            posted_at=timezone.now(),
            created_by=self.admin,
        )
        self.client.force_authenticate(user=self.vendor_user)
        response = self.client.get("/api/v1/vendor/ledger/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        references = {row["source_reference"] for row in response.data["results"]}
        self.assertNotIn("PB-OTHER", references)

    def test_admin_can_link_change_unlink_vendor_user(self):
        self.client.force_authenticate(user=self.admin)
        new_user = create_customer_user(username="new_vendor_user", phone="9399001012")
        new_user.role = "VENDOR"
        new_user.save(update_fields=["role"])
        link_response = self.client.post(
            f"/api/v1/admin/vendors/{self.vendor.id}/account-link/",
            {"user_id": new_user.id, "reason": "Vendor handoff"},
            format="json",
        )
        self.assertEqual(link_response.status_code, status.HTTP_200_OK, link_response.data)
        unlink_response = self.client.delete(
            f"/api/v1/admin/vendors/{self.vendor.id}/account-link/",
            {"reason": "Portal access revoked"},
            format="json",
        )
        self.assertEqual(unlink_response.status_code, status.HTTP_200_OK, unlink_response.data)
        self.assertIsNone(unlink_response.data["linked_user_id"])

    def test_non_admin_cannot_access_admin_vendor_api(self):
        self.client.force_authenticate(user=self.partner)
        response = self.client.get("/api/v1/admin/vendors/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(user=self.cashier)
        response = self.client.get("/api/v1/admin/vendors/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_partner_cashier_cannot_access_vendor_portal(self):
        self.client.force_authenticate(user=create_customer_user(username="portal_customer_no", phone="9399001020"))
        self.assertEqual(self.client.get("/api/v1/vendor/dashboard/").status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(user=self.partner)
        self.assertEqual(self.client.get("/api/v1/vendor/dashboard/").status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(user=self.cashier)
        self.assertEqual(self.client.get("/api/v1/vendor/dashboard/").status_code, status.HTTP_403_FORBIDDEN)


class VendorPhase4SourcingApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="vendor_p4_admin", phone="9377001001")
        self.partner = create_partner_user(username="vendor_p4_partner", phone="9377001002")
        self.customer = create_customer_profile(name="Sourcing Tester", phone="9377001099")

    def test_suggest_same_pincode_beats_same_state_vendor(self):
        pin_v = Vendor.objects.create(name="Pin Winner", status="ACTIVE")
        wide_v = Vendor.objects.create(name="State Wide Only", status="ACTIVE")
        VendorServiceArea.objects.create(vendor=pin_v, state="KA", district="BLR", city="BLR", pincode="560001", is_active=True)
        VendorServiceArea.objects.create(vendor=wide_v, state="KA", is_active=True)
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/v1/admin/vendor-sourcing/suggest/",
            {"customer_state": "KA", "customer_district": "BLR", "customer_city": "BLR", "customer_pincode": "560001"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["results"][0]["vendor_id"], pin_v.id)
        self.assertEqual(response.data["results"][0]["location_match_level"], "SAME_PINCODE")

    def test_out_of_area_vendor_hidden_unless_requested(self):
        out = Vendor.objects.create(name="Isolated Warehouse", status="ACTIVE")
        inc = Vendor.objects.create(name="Metro DC", status="ACTIVE")
        VendorServiceArea.objects.create(vendor=out, pincode="999991", state="XX", is_active=True)
        VendorServiceArea.objects.create(vendor=inc, pincode="560002", state="KA", district="BLR", city="BLR", is_active=True)
        self.client.force_authenticate(user=self.admin)
        r1 = self.client.post("/api/v1/admin/vendor-sourcing/suggest/", {"customer_pincode": "560002", "customer_city": "BLR"}, format="json")
        self.assertEqual(r1.status_code, status.HTTP_200_OK)
        ids1 = {row["vendor_id"] for row in r1.data["results"]}
        self.assertNotIn(out.id, ids1)
        r2 = self.client.post(
            "/api/v1/admin/vendor-sourcing/suggest/",
            {"customer_pincode": "560002", "include_out_of_area": True},
            format="json",
        )
        ids2 = {row["vendor_id"] for row in r2.data["results"]}
        self.assertIn(out.id, ids2)
        self.assertEqual(r2.data["results"][0]["vendor_id"], inc.id)

    def test_material_and_category_gate_catalog(self):
        v_ok = Vendor.objects.create(name="Teak Carpenter", status="ACTIVE")
        v_bad = Vendor.objects.create(name="Metal Fabricator", status="ACTIVE")
        VendorServiceArea.objects.create(vendor=v_ok, pincode="411001", is_active=True)
        VendorServiceArea.objects.create(vendor=v_bad, pincode="411001", is_active=True)
        VendorProduct.objects.create(vendor=v_ok, product_name="Chair teak", category_text="WOOD", material="solid teak ply", active=True)
        VendorProduct.objects.create(vendor=v_bad, product_name="Shelf steel", category_text="WOOD", material="steel frame", active=True)
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/v1/admin/vendor-sourcing/suggest/",
            {"customer_pincode": "411001", "material": "Teak", "category_text": "WOOD"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        hit = {row["vendor_id"] for row in response.data["results"]}
        self.assertIn(v_ok.id, hit)
        self.assertNotIn(v_bad.id, hit)

    def test_delivery_score_can_rank_two_pincode_neighbors(self):
        hi = Vendor.objects.create(name="Express Partner", status="ACTIVE", delivery_score=Decimal("100.00"))
        lo = Vendor.objects.create(name="Slow Partner", status="ACTIVE", delivery_score=Decimal("5.00"))
        VendorServiceArea.objects.create(vendor=hi, pincode="682001", state="KL", district="EKM", city="EKM", is_active=True)
        VendorServiceArea.objects.create(vendor=lo, pincode="682001", state="KL", district="EKM", city="EKM", is_active=True)
        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/v1/admin/vendor-sourcing/suggest/", {"customer_pincode": "682001"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"][0]["vendor_id"], hi.id)

    def test_partner_forbidden_vendor_sourcing_endpoints(self):
        self.client.force_authenticate(user=self.partner)
        self.assertEqual(
            self.client.post("/api/v1/admin/vendor-sourcing/suggest/", {"customer_pincode": "1"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post("/api/v1/admin/vendor-sourcing/request-quotes/", {}).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_suggest_endpoint_does_not_create_procurement_documents(self):
        Vendor.objects.create(name="Bench Vendor", status="ACTIVE")
        VendorQuoteRequest.objects.create(
            request_no="VQR-SRC-EXIST",
            source_type="MANUAL",
            product_name="X",
            quantity=Decimal("1.000"),
            status="DRAFT",
            created_by=self.admin,
        )
        po_before = PurchaseOrder.objects.count()
        pb_before = PurchaseBill.objects.count()
        qr_before = VendorQuoteRequest.objects.count()
        bill_before_row = VendorQuoteRequest.objects.order_by("-id").first()

        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/v1/admin/vendor-sourcing/suggest/", {"customer_pincode": "500001"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(PurchaseOrder.objects.count(), po_before)
        self.assertEqual(PurchaseBill.objects.count(), pb_before)
        self.assertEqual(VendorQuoteRequest.objects.count(), qr_before)
        self.assertEqual(VendorQuoteRequest.objects.order_by("-id").first().pk, bill_before_row.pk)

    def test_request_quotes_from_sourcing_workspace_creates_only_vendor_quote_request(self):
        lone = Vendor.objects.create(name="Sole Supplier", status="ACTIVE")
        VendorServiceArea.objects.create(vendor=lone, pincode="600001", is_active=True)

        qr_before = VendorQuoteRequest.objects.count()
        po_before = PurchaseOrder.objects.count()
        pb_before = PurchaseBill.objects.count()

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/v1/admin/vendor-sourcing/request-quotes/",
            {
                "source_type": "MANUAL",
                "product_name": "Display unit",
                "quantity": "1.000",
                "customer": self.customer.id,
                "vendor_ids": [lone.id],
                "send_to_vendors": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(VendorQuoteRequest.objects.count(), qr_before + 1)
        self.assertEqual(PurchaseOrder.objects.count(), po_before)
        self.assertEqual(PurchaseBill.objects.count(), pb_before)
        row = VendorQuoteRequest.objects.latest("id")
        self.assertEqual(row.quotes.filter(vendor_id=lone.id).count(), 1)
