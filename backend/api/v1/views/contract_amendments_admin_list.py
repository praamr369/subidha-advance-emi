from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.contract_amendments import ContractAmendmentSerializer
from api.v1.views.contract_amendments import _amendment_queryset


class AdminContractAmendmentFilteredListView(APIView):
    """
    Read-only admin amendment list with safe enterprise filters.

    This intentionally exposes no mutation behavior. The existing detail/review/
    approve/reject/implement/recontract views remain the only places where
    amendment workflow state can change.
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = _amendment_queryset()
        status_filter = request.query_params.get("status")
        contract_type = request.query_params.get("contract_type")
        amendment_type = request.query_params.get("amendment_type") or request.query_params.get("type")
        customer = request.query_params.get("customer")
        partner = request.query_params.get("partner")
        source = request.query_params.get("source") or request.query_params.get("subscription") or request.query_params.get("contract")
        search = request.query_params.get("search") or request.query_params.get("q")
        ordering = request.query_params.get("ordering") or "-created_at"

        if status_filter:
            queryset = queryset.filter(status=status_filter.strip().upper())
        if contract_type:
            queryset = queryset.filter(contract_type=contract_type.strip().upper())
        if amendment_type:
            queryset = queryset.filter(amendment_type=amendment_type.strip().upper())
        if customer:
            customer_value = customer.strip()
            customer_filter = Q(customer__name__icontains=customer_value) | Q(customer__phone__icontains=customer_value)
            if customer_value.isdigit():
                customer_filter |= Q(customer_id=int(customer_value))
            queryset = queryset.filter(customer_filter)
        if partner:
            partner_value = partner.strip()
            partner_filter = Q(partner__username__icontains=partner_value) | Q(partner__email__icontains=partner_value)
            if partner_value.isdigit():
                partner_filter |= Q(partner_id=int(partner_value))
            queryset = queryset.filter(partner_filter)
        if source:
            source_value = source.strip()
            source_filter = (
                Q(subscription__subscription_number__icontains=source_value)
                | Q(subscription__contract_reference__icontains=source_value)
                | Q(rent_lease_contract__subscription_number__icontains=source_value)
                | Q(rent_lease_contract__contract_reference__icontains=source_value)
            )
            if source_value.isdigit():
                source_filter |= Q(subscription_id=int(source_value)) | Q(rent_lease_contract_id=int(source_value))
            queryset = queryset.filter(source_filter)
        if search:
            value = search.strip()
            search_filter = (
                Q(amendment_no__icontains=value)
                | Q(reason__icontains=value)
                | Q(admin_note__icontains=value)
                | Q(customer__name__icontains=value)
                | Q(customer__phone__icontains=value)
                | Q(subscription__subscription_number__icontains=value)
                | Q(subscription__contract_reference__icontains=value)
                | Q(rent_lease_contract__subscription_number__icontains=value)
                | Q(rent_lease_contract__contract_reference__icontains=value)
            )
            if value.isdigit():
                search_filter |= Q(id=int(value)) | Q(customer_id=int(value)) | Q(subscription_id=int(value)) | Q(rent_lease_contract_id=int(value))
            queryset = queryset.filter(search_filter)

        allowed_ordering = {
            "created_at": "created_at",
            "-created_at": "-created_at",
            "requested_at": "created_at",
            "-requested_at": "-created_at",
            "updated_at": "updated_at",
            "-updated_at": "-updated_at",
            "id": "id",
            "-id": "-id",
        }
        queryset = queryset.order_by(allowed_ordering.get(ordering, "-created_at"), "-id")

        return Response(
            ContractAmendmentSerializer(queryset.distinct(), many=True).data,
            status=status.HTTP_200_OK,
        )
