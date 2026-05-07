from decimal import Decimal

from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import Emi, LuckyDraw, OperationalCancellation, Payment
from tests.helpers import create_admin_user


class ReversalControlBlockerTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="rev_case_admin", phone="9386333001")
        self.client.force_authenticate(user=self.admin)

    def test_manage_py_check_passes(self):
        call_command("check")

    def test_manual_settlement_large_source_id_and_reference_are_valid(self):
        before = {
            "emi": Emi.objects.count(),
            "payment": Payment.objects.count(),
            "draw": LuckyDraw.objects.count(),
        }
        response = self.client.post(
            "/api/v1/admin/finance/reversal-cases/",
            {
                "source_type": "OTHER",
                "source_id": 9_223_372_036,
                "source_reference": "DOC-REV-9000",
                "reversal_type": "MANUAL_SETTLEMENT",
                "amount_snapshot": "10.00",
                "reason": "Manual settlement case",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        case = OperationalCancellation.objects.get(pk=response.data["id"])
        self.assertEqual(case.cancellation_type, OperationalCancellation.CancellationType.MANUAL_SETTLEMENT)
        self.assertEqual(case.source_id, 9_223_372_036)
        self.assertEqual(case.source_reference, "DOC-REV-9000")
        self.assertEqual(case.amount_snapshot, Decimal("10.00"))
        self.assertEqual(Emi.objects.count(), before["emi"])
        self.assertEqual(Payment.objects.count(), before["payment"])
        self.assertEqual(LuckyDraw.objects.count(), before["draw"])

    def test_manual_case_can_use_document_reference_without_source_id(self):
        response = self.client.post(
            "/api/v1/admin/finance/reversal-cases/",
            {
                "source_type": "OTHER",
                "source_id": "MANUAL-DOC-123",
                "reversal_type": "MANUAL_SETTLEMENT",
                "reason": "Manual document-only case",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIsNone(response.data["source_id"])
        self.assertEqual(response.data["source_reference"], "MANUAL-DOC-123")

    def test_invalid_cancellation_type_returns_400_not_500(self):
        response = self.client.post(
            "/api/v1/admin/finance/reversal-cases/",
            {
                "source_type": "OTHER",
                "source_id": 1001,
                "reversal_type": "NOT_ALLOWED",
                "reason": "Invalid reversal type",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
