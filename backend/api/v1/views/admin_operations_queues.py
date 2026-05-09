from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.services.admin_operations_queue_service import (
    build_admin_next_actions,
    build_admin_queue_summary,
    list_partner_payment_requests,
)


class _AdminBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AdminOperationsQueueSummaryView(_AdminBase):
    def get(self, request):
        return Response(build_admin_queue_summary())


class AdminOperationsRequestQueuesView(_AdminBase):
    def get(self, request):
        return Response(build_admin_queue_summary())


class AdminOperationsNextActionsView(_AdminBase):
    def get(self, request):
        return Response(build_admin_next_actions())


class AdminPartnerOperationsSummaryView(_AdminBase):
    def get(self, request):
        summary = build_admin_queue_summary()
        partner_rows = [row for row in summary["results"] if row["key"].startswith("partner_")]
        return Response({"count": len(partner_rows), "results": partner_rows})


class AdminPartnerPaymentRequestsView(_AdminBase):
    def get(self, request):
        return Response(list_partner_payment_requests())
