from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsCashierOrAdmin
from subscriptions.models import Customer
from subscriptions.services.customer_account_service import (
    build_customer_operational_summary,
)


class CustomerOperationalSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCashierOrAdmin]

    def get(self, request, pk: int):
        try:
            customer = Customer.objects.select_related("user").get(pk=pk)
        except Customer.DoesNotExist:
            return Response(
                {"detail": "Customer not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            build_customer_operational_summary(customer),
            status=status.HTTP_200_OK,
        )
