from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from billing.services.billing_service import create_direct_sale
from inventory.models import InventoryItem
from subscriptions.models import AuditLog, PublicLead, PublicLeadStatus
from subscriptions.services.public_lead_service import create_public_lead
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_customer_user,
    create_lucky_id,
    create_product,
    create_subscription,
)


class AdminLeadApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="lead_admin", phone="9000000801")
        self.cashier = create_cashier_user(
            username="lead_cashier",
            phone="9000000802",
        )
        self.product = create_product(
            name="Lead Product",
            product_code="LEAD-001",
        )
        self.client.force_authenticate(user=self.admin)

    def test_public_lead_submission_with_product_context_still_works(self):
        self.client.force_authenticate(user=None)

        response = self.client.post(
            "/api/v1/public/leads/",
            {
                "name": "Mina Akter",
                "phone": "9800000001",
                "city": "Dhaka",
                "product_id": self.product.id,
                "interested_product": "",
                "preferred_emi_amount": "2500.00",
                "notes": "Looking for monthly follow-up.",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            msg=f"Unexpected lead submission response: {response.status_code} {response.data}",
        )

        lead = PublicLead.objects.get(pk=response.data["lead_id"])
        self.assertEqual(lead.product_id, self.product.id)
        self.assertEqual(lead.status, PublicLeadStatus.NEW)
        self.assertIn(self.product.name, lead.interested_product)
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="PublicLead",
                object_id=lead.id,
                action_type=AuditLog.ActionType.LEAD_CREATED,
            ).exists()
        )

    def test_admin_lead_list_filters_and_summary(self):
        contacted = create_public_lead(
            name="Rupa",
            phone="9800000002",
            city="Dhaka",
            interested_product="Wardrobe",
            product=self.product,
        )
        contacted.status = PublicLeadStatus.CONTACTED
        contacted.save(update_fields=["status"])

        create_public_lead(
            name="Karim",
            phone="9800000003",
            city="Chattogram",
            interested_product="Bed",
        )

        response = self.client.get(
            "/api/v1/admin/leads/?status=CONTACTED&q=9800000002"
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected lead list response: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["summary"]["contacted"], 1)
        self.assertEqual(response.data["results"][0]["id"], contacted.id)

    def test_admin_lead_status_update_sets_contacted_timestamp_and_audit(self):
        lead = create_public_lead(
            name="Status Lead",
            phone="9800000004",
            interested_product="Sofa",
        )

        response = self.client.post(
            f"/api/v1/admin/leads/{lead.id}/status/",
            {"status": "CONTACTED"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected lead status response: {response.status_code} {response.data}",
        )

        lead.refresh_from_db()
        self.assertEqual(lead.status, PublicLeadStatus.CONTACTED)
        self.assertIsNotNone(lead.contacted_at)
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="PublicLead",
                object_id=lead.id,
                action_type=AuditLog.ActionType.LEAD_STATUS_UPDATED,
            ).exists()
        )

    def test_admin_lead_assign_and_note_update_work(self):
        lead = create_public_lead(
            name="Ops Lead",
            phone="9800000005",
            interested_product="Dining Table",
        )

        assign_response = self.client.post(
            f"/api/v1/admin/leads/{lead.id}/assign/",
            {"assigned_to": self.cashier.id},
            format="json",
        )
        self.assertEqual(
            assign_response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected lead assign response: {assign_response.status_code} {assign_response.data}",
        )

        note_response = self.client.post(
            f"/api/v1/admin/leads/{lead.id}/notes/",
            {"note": "Customer requested evening follow-up.", "mode": "append"},
            format="json",
        )
        self.assertEqual(
            note_response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected lead note response: {note_response.status_code} {note_response.data}",
        )

        detail_response = self.client.get(f"/api/v1/admin/leads/{lead.id}/")
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)

        lead.refresh_from_db()
        self.assertEqual(lead.assigned_to_id, self.cashier.id)
        self.assertIn("evening follow-up", lead.admin_notes)
        self.assertEqual(detail_response.data["assigned_to_id"], self.cashier.id)
        self.assertIn("evening follow-up", detail_response.data["admin_notes"])
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="PublicLead",
                object_id=lead.id,
                action_type=AuditLog.ActionType.LEAD_ASSIGNED,
            ).exists()
        )
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="PublicLead",
                object_id=lead.id,
                action_type=AuditLog.ActionType.LEAD_NOTE_UPDATED,
            ).exists()
        )

    def test_admin_lead_status_cannot_mark_converted_without_real_linkage(self):
        lead = create_public_lead(
            name="Blocked Convert",
            phone="9800000006",
            interested_product="Wardrobe",
        )

        response = self.client.post(
            f"/api/v1/admin/leads/{lead.id}/status/",
            {"status": "CONVERTED"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        lead.refresh_from_db()
        self.assertEqual(lead.status, PublicLeadStatus.NEW)
        self.assertIsNone(lead.converted_customer_id)
        self.assertIsNone(lead.converted_subscription_id)

    def test_admin_lead_conversion_completion_links_real_records_and_audits(self):
        lead = create_public_lead(
            name="Converted Lead",
            phone="9800000007",
            interested_product="Sofa Set",
            product=self.product,
        )
        customer_user = create_customer_user(
            username="lead_converted_customer",
            phone="9800000017",
        )
        customer = create_customer_profile(
            user=customer_user,
            name="Converted Customer",
            phone="9800000017",
        )
        batch = create_batch(batch_code="LEADCONVERT1")
        lucky_id = create_lucky_id(batch=batch, lucky_number=12)
        subscription = create_subscription(
            customer=customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
        )

        response = self.client.post(
            f"/api/v1/admin/leads/{lead.id}/convert/",
            {
                "customer_id": customer.id,
                "subscription_id": subscription.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected lead conversion response: {response.status_code} {response.data}",
        )

        lead.refresh_from_db()
        self.assertEqual(lead.status, PublicLeadStatus.CONVERTED)
        self.assertEqual(lead.converted_customer_id, customer.id)
        self.assertEqual(lead.converted_subscription_id, subscription.id)
        self.assertEqual(lead.converted_by_id, self.admin.id)
        self.assertIsNotNone(lead.converted_at)
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="PublicLead",
                object_id=lead.id,
                action_type=AuditLog.ActionType.LEAD_CUSTOMER_LINKED,
            ).exists()
        )
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="PublicLead",
                object_id=lead.id,
                action_type=AuditLog.ActionType.LEAD_SUBSCRIPTION_LINKED,
            ).exists()
        )
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="PublicLead",
                object_id=lead.id,
                action_type=AuditLog.ActionType.LEAD_CONVERTED,
            ).exists()
        )

    def test_admin_lead_conversion_can_derive_customer_from_subscription(self):
        lead = create_public_lead(
            name="Subscription Only Lead",
            phone="9800000008",
            interested_product="Bed",
            product=self.product,
        )
        customer_user = create_customer_user(
            username="lead_subscription_customer",
            phone="9800000018",
        )
        customer = create_customer_profile(
            user=customer_user,
            name="Subscription Customer",
            phone="9800000018",
        )
        batch = create_batch(batch_code="LEADCONVERT2")
        lucky_id = create_lucky_id(batch=batch, lucky_number=13)
        subscription = create_subscription(
            customer=customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
        )

        response = self.client.post(
            f"/api/v1/admin/leads/{lead.id}/convert/",
            {"subscription_id": subscription.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        lead.refresh_from_db()
        self.assertEqual(lead.converted_customer_id, customer.id)
        self.assertEqual(lead.converted_subscription_id, subscription.id)

    def test_admin_lead_conversion_can_link_direct_sale_and_return_party_context(self):
        lead = create_public_lead(
            name="Retail Lead",
            phone="9800000009",
            interested_product="Dining Set",
            product=self.product,
        )
        customer_user = create_customer_user(
            username="lead_direct_sale_customer",
            phone="9800000019",
        )
        customer = create_customer_profile(
            user=customer_user,
            name="Retail Customer",
            phone="9800000019",
        )
        inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="LEAD-RETAIL-SKU-001",
            opening_stock_qty=Decimal("4.000"),
        )
        direct_sale = create_direct_sale(
            payload={
                "sale_date": date(2026, 4, 10),
                "customer": customer,
                "delivery_required": False,
                "received_total": Decimal("5000.00"),
                "customer_name_snapshot": customer.name,
                "customer_phone_snapshot": customer.phone,
                "lines": [
                    {
                        "product": self.product,
                        "inventory_item": inventory_item,
                        "description": "Retail lead line",
                        "quantity": "1.000",
                        "unit_price": "5000.00",
                        "discount_amount": "0.00",
                        "taxable_value": "5000.00",
                        "gst_rate": None,
                        "cgst_amount": "0.00",
                        "sgst_amount": "0.00",
                        "igst_amount": "0.00",
                        "line_total": "5000.00",
                        "hsn_sac_code": "",
                    }
                ],
            },
            created_by=self.admin,
        )

        response = self.client.post(
            f"/api/v1/admin/leads/{lead.id}/convert/",
            {"direct_sale_id": direct_sale.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        lead.refresh_from_db()
        self.assertEqual(lead.status, PublicLeadStatus.CONVERTED)
        self.assertEqual(lead.converted_customer_id, customer.id)
        self.assertEqual(lead.converted_direct_sale_id, direct_sale.id)
        self.assertEqual(response.data["converted_direct_sale_id"], direct_sale.id)
        self.assertTrue(response.data["party_id"])
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="PublicLead",
                object_id=lead.id,
                action_type=AuditLog.ActionType.LEAD_DIRECT_SALE_LINKED,
            ).exists()
        )
