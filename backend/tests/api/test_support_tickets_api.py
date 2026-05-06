from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from service_desk.support_ticket_models import (
    SupportTicketEvent,
    SupportTicketEventType,
    SupportTicketStatus,
)
from service_desk.services.support_ticket_service import create_customer_ticket
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_customer_user,
    create_batch,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class SupportTicketApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="tkt_admin", phone="9100000001")
        self.customer_user = create_customer_user(username="tkt_customer", phone="9100000002")
        self.other_customer_user = create_customer_user(username="tkt_other", phone="9100000003")
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Ticket Customer",
            phone="9100000002",
        )
        self.other_customer = create_customer_profile(
            user=self.other_customer_user,
            name="Other Ticket Customer",
            phone="9100000003",
        )
        self.product = create_product(
            name="Ticket Product",
            product_code="TKT-P1",
            base_price=Decimal("3000.00"),
        )
        self.batch = create_batch(
            batch_code="TKT2026",
            duration_months=12,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=7)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("300.00"),
            tenure_months=12,
        )
        self.other_sub = create_subscription(
            customer=self.other_customer,
            product=self.product,
            batch=self.batch,
            lucky_id=create_lucky_id(batch=self.batch, lucky_number=8),
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("300.00"),
            tenure_months=12,
        )
        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("300.00"),
            due_date=date(2026, 3, 10),
        )

    def test_customer_create_and_list_own_ticket(self):
        self.client.force_authenticate(user=self.customer_user)
        res = self.client.post(
            "/api/v1/customer/support/tickets/",
            {
                "category": "EMI_QUERY",
                "subject": "EMI schedule question",
                "description": "Please clarify due dates.",
                "link_type": "subscription",
                "link_object_id": self.subscription.id,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertTrue(str(res.data.get("ticket_no", "")).startswith("TKT-"))

        lst = self.client.get("/api/v1/customer/support/tickets/")
        self.assertEqual(lst.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(lst.data["count"], 1)

    def test_customer_cannot_view_other_customer_ticket(self):
        t = create_customer_ticket(
            customer=self.other_customer,
            created_by=self.other_customer_user,
            category="GENERAL_SUPPORT",
            subject="Private",
            description="Other",
        )
        self.client.force_authenticate(user=self.customer_user)
        res = self.client.get(f"/api/v1/customer/support/tickets/{t.id}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_cannot_see_internal_notes_in_detail(self):
        t = create_customer_ticket(
            customer=self.customer,
            created_by=self.customer_user,
            category="PAYMENT_ISSUE",
            subject="Pay",
            description="Question",
        )
        self.client.force_authenticate(user=self.admin)
        self.client.post(
            f"/api/v1/admin/support/tickets/{t.id}/internal-note/",
            {"body": "Secret staff note"},
            format="json",
        )
        self.client.force_authenticate(user=self.customer_user)
        res = self.client.get(f"/api/v1/customer/support/tickets/{t.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        bodies = [c["body"] for c in res.data["comments"]]
        self.assertNotIn("Secret staff note", bodies)
        ev_types = [x.get("event_type") for x in res.data["timeline"] if x.get("kind") == "event"]
        self.assertNotIn(SupportTicketEventType.INTERNAL_NOTE_ADDED, ev_types)

    def test_admin_list_and_dashboard(self):
        create_customer_ticket(
            customer=self.customer,
            created_by=self.customer_user,
            category="SERVICE_REQUEST",
            subject="Svc",
            description="Help",
        )
        self.client.force_authenticate(user=self.admin)
        lst = self.client.get("/api/v1/admin/support/tickets/")
        self.assertEqual(lst.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(lst.data["count"], 1)
        dash = self.client.get("/api/v1/admin/support/dashboard/")
        self.assertEqual(dash.status_code, status.HTTP_200_OK)
        self.assertIn("total", dash.data)
        self.assertIn("by_status", dash.data)

    def test_link_subscription_does_not_mutate_subscription(self):
        t = create_customer_ticket(
            customer=self.customer,
            created_by=self.customer_user,
            category="EMI_QUERY",
            subject="Link",
            description="Test",
        )
        before = (self.subscription.status, self.subscription.total_amount)
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            f"/api/v1/admin/support/tickets/{t.id}/link/",
            {"link_type": "subscription", "object_id": self.subscription.id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.subscription.refresh_from_db()
        self.assertEqual((self.subscription.status, self.subscription.total_amount), before)

    def test_status_change_creates_events_resolve_close_reopen(self):
        t = create_customer_ticket(
            customer=self.customer,
            created_by=self.customer_user,
            category="GENERAL_SUPPORT",
            subject="Lifecycle",
            description="Flow",
        )
        self.client.force_authenticate(user=self.admin)
        self.client.patch(
            f"/api/v1/admin/support/tickets/{t.id}/",
            {"status": SupportTicketStatus.IN_REVIEW},
            format="json",
        )
        self.assertTrue(
            SupportTicketEvent.objects.filter(
                ticket_id=t.id,
                event_type=SupportTicketEventType.STATUS_CHANGED,
            ).exists()
        )
        self.client.post(
            f"/api/v1/admin/support/tickets/{t.id}/resolve/",
            {"resolution_summary": "Done"},
            format="json",
        )
        t.refresh_from_db()
        self.assertEqual(t.status, SupportTicketStatus.RESOLVED)
        self.assertIsNotNone(t.resolved_at)
        self.client.post(f"/api/v1/admin/support/tickets/{t.id}/close/", {}, format="json")
        t.refresh_from_db()
        self.assertEqual(t.status, SupportTicketStatus.CLOSED)
        self.assertIsNotNone(t.closed_at)
        self.client.post(f"/api/v1/admin/support/tickets/{t.id}/reopen/", {"message": "Still need help"}, format="json")
        t.refresh_from_db()
        self.assertEqual(t.status, SupportTicketStatus.REOPENED)
        self.assertTrue(
            SupportTicketEvent.objects.filter(
                ticket_id=t.id,
                event_type=SupportTicketEventType.REOPENED,
            ).exists()
        )

    def test_non_admin_blocked_from_admin_support_apis(self):
        self.client.force_authenticate(user=self.customer_user)
        res = self.client.get("/api/v1/admin/support/tickets/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_support_actions_do_not_mutate_emi(self):
        t = create_customer_ticket(
            customer=self.customer,
            created_by=self.customer_user,
            category="EMI_QUERY",
            subject="No touch",
            description="EMI",
        )
        self.emi.refresh_from_db()
        snap_status = self.emi.status
        snap_amount = self.emi.amount

        self.client.force_authenticate(user=self.admin)
        self.client.post(
            f"/api/v1/admin/support/tickets/{t.id}/link/",
            {"link_type": "emi", "object_id": self.emi.id},
            format="json",
        )
        self.client.post(
            f"/api/v1/admin/support/tickets/{t.id}/comment/",
            {"body": "Reviewed EMI"},
            format="json",
        )
        self.client.patch(
            f"/api/v1/admin/support/tickets/{t.id}/",
            {"status": SupportTicketStatus.WAITING_FOR_CUSTOMER},
            format="json",
        )

        self.emi.refresh_from_db()
        self.assertEqual(self.emi.status, snap_status)
        self.assertEqual(self.emi.amount, snap_amount)
