from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.contract_amendments import ContractAmendmentSerializer
from api.v1.views.contract_amendments import _amendment_queryset


class AdminContractAmendmentFilteredListView(APIView):
    """
    Read-only admin amendment list with safe Customer 360 filters.

    This intentionally exposes no mutation behavior. The existing detail/review/
    approve/reject/implement/recontract views remain the only places where
    amendment workflow state can change.
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = _amendment_queryset()
        status_filter = request.query_params.get("status")
        contract_type = request.query_params.get("contract_type")
        customer = request.query_params.get("customer")

        if status_filter:
            queryset = queryset.filter(status=status_filter.strip().upper())
        if contract_type:
            queryset = queryset.filter(contract_type=contract_type.strip().upper())
        if customer:
            customer_value = customer.strip()
            customer_filter = Q(customer__name__icontains=customer_value) | Q(
                customer__phone__icontains=customer_value
            )
            if customer_value.isdigit():
                customer_filter |= Q(customer_id=int(customer_value))
            queryset = queryset.filter(customer_filter)

        return Response(
            ContractAmendmentSerializer(queryset, many=True).data,
            status=status.HTTP_200_OK,
        )
