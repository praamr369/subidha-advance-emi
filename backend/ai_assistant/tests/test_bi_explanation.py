from __future__ import annotations

from unittest.mock import patch

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from ai_assistant.models import AIQueryLog
from inventory.models import InventoryItem
from subscriptions.models import Payment, Subscription
from tests.helpers import create_admin_user, create_partner_user


class AIBIExplanationApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="ai_bi_admin", phone="919100001401")
        self.partner = create_partner_user(username="ai_bi_partner", phone="919100001402")

    @override_settings(AI_ASSISTANT_ENABLED=False)
    def test_disabled_returns_503(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/ai/bi-explain/?scope=ADMIN_BI&window=THIS_MONTH")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["detail"], "AI assistant is disabled")

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_non_admin_blocked(self):
        self.client.force_authenticate(self.partner)
        response = self.client.get("/api/v1/admin/ai/bi-explain/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_scope_and_window_validation(self):
        self.client.force_authenticate(self.admin)
        scope_response = self.client.get("/api/v1/admin/ai/bi-explain/?scope=UNKNOWN&window=THIS_MONTH")
        self.assertEqual(scope_response.status_code, status.HTTP_400_BAD_REQUEST)
        window_response = self.client.get("/api/v1/admin/ai/bi-explain/?scope=ADMIN_BI&window=FOREVER")
        self.assertEqual(window_response.status_code, status.HTTP_400_BAD_REQUEST)
        topic_response = self.client.get("/api/v1/admin/ai/bi-explain/?scope=ADMIN_BI&window=THIS_MONTH&topic=AUTOMATE_COLLECTION")
        self.assertEqual(topic_response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_admin_receives_explanation_with_safety_and_source_metrics(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/ai/bi-explain/?scope=BI_CONTROL_CENTER&window=THIS_MONTH")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["safety"]["read_only"])
        self.assertFalse(response.data["safety"]["actions_executed"])
        self.assertTrue(len(response.data["source_metrics"]) > 0)
        self.assertIn("summary", response.data)
        self.assertEqual(AIQueryLog.objects.count(), 1)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_business_data_is_not_mutated(self):
        self.client.force_authenticate(self.admin)
        payment_count_before = Payment.objects.count()
        subscription_count_before = Subscription.objects.count()
        inventory_count_before = InventoryItem.objects.count()

        response = self.client.get("/api/v1/admin/ai/bi-explain/?scope=FINANCE&window=THIS_MONTH")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        self.assertEqual(Payment.objects.count(), payment_count_before)
        self.assertEqual(Subscription.objects.count(), subscription_count_before)
        self.assertEqual(InventoryItem.objects.count(), inventory_count_before)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_phase10_explanation_topics_are_read_only_and_grounded_in_bi_sources(self):
        self.client.force_authenticate(self.admin)
        payment_count_before = Payment.objects.count()
        response = self.client.get(
            "/api/v1/admin/ai/bi-explain/?scope=PROFITABILITY&window=THIS_MONTH&topic=REVENUE_DROP"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["safety"]["read_only"])
        self.assertFalse(response.data["safety"]["actions_executed"])
        self.assertFalse(response.data["safety"]["financial_actions_enabled"])
        self.assertFalse(response.data["safety"]["automation_enabled"])
        self.assertIn("Revenue explanation", response.data["summary"])
        self.assertTrue(
            any(metric["source"].startswith("/api/v1/admin/bi/") for metric in response.data["source_metrics"])
        )
        self.assertEqual(Payment.objects.count(), payment_count_before)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_overdue_low_stock_and_hr_messages_render_with_fixture_metrics(self):
        self.client.force_authenticate(self.admin)
        with (
            patch(
                "ai_assistant.services.bi_explanation_service.build_admin_dashboard",
                return_value={
                    "financial": {"today_collection": "1200.00"},
                    "emi": {"overdue": 3},
                    "crm": {"open_leads": 1},
                },
            ),
            patch(
                "ai_assistant.services.bi_explanation_service.build_admin_queue_summary",
                return_value={
                    "results": [
                        {"key": "reconciliation_pending", "count": 2},
                        {"key": "subscription_requests_pending", "count": 4},
                        {"key": "delivery_blocked", "count": 1},
                        {"key": "partner_payment_requests_pending", "count": 1},
                    ]
                },
            ),
            patch(
                "ai_assistant.services.bi_explanation_service.get_hr_summary",
                return_value={"pending_leave_requests": 2, "payroll_pending": 1},
            ),
            patch(
                "ai_assistant.services.bi_explanation_service.build_stock_summary",
                return_value={"results": [{"is_below_reorder": True}, {"is_below_reorder": False}]},
            ),
            patch(
                "ai_assistant.services.bi_explanation_service.build_accounting_deposit_liability",
                return_value={"held_total": "4500.00"},
            ),
        ):
            response = self.client.get("/api/v1/admin/ai/bi-explain/?scope=ADMIN_BI&window=THIS_MONTH")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        risk_messages = [row["message"] for row in response.data["risks"]]
        highlight_messages = [row["message"] for row in response.data["highlights"]]
        self.assertIn("There are overdue amounts that need collection follow-up.", risk_messages)
        self.assertIn("Some products need stock attention.", risk_messages)
        self.assertIn("Leave requests need approval.", risk_messages)
        self.assertIn("Payroll items need review.", risk_messages)
        self.assertIn("Rent/lease deposits are held as refundable liabilities.", highlight_messages)
