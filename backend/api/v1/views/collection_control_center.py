from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin, IsCashierOrAdmin
from subscriptions.services.collection_control_center_service import build_collection_control_center_payload


class AdminCollectionControlCenterView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(
            build_collection_control_center_payload(user=request.user, role="admin"),
            status=status.HTTP_200_OK,
        )


class CashierCollectionControlCenterView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCashierOrAdmin]

    def get(self, request):
        return Response(
            build_collection_control_center_payload(user=request.user, role="cashier"),
            status=status.HTTP_200_OK,
        )
