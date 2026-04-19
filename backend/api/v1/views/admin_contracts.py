from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.admin_resources import SubscriptionAdminDetailSerializer
from api.v1.serializers.contracts import (
    AdminLeaseContractCreateSerializer,
    AdminRentContractCreateSerializer,
)
from subscriptions.services.subscription_financial_service import (
    get_subscription_detail_queryset,
)
from subscriptions.services.rent_lease_contract_service import (
    create_lease_contract,
    create_rent_contract,
)


class AdminRentContractCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = AdminRentContractCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        subscription = create_rent_contract(
            customer=data["customer"],
            product=data["product"],
            tenure_months=data["tenure_months"],
            start_date=data.get("start_date"),
            security_deposit_percent=data["security_deposit_percent"],
            performed_by=request.user,
            handover_notes=(data.get("handover_notes") or ""),
            contract_terms_snapshot=(data.get("contract_terms_snapshot") or ""),
        )

        # PDF generation is a required post-create step; service is imported lazily
        # to keep contract creation logic isolated from PDF rendering concerns.
        from subscriptions.services.contract_pdf_service import generate_contract_pdf_for_subscription

        generate_contract_pdf_for_subscription(subscription=subscription, performed_by=request.user)

        refreshed = get_subscription_detail_queryset().get(pk=subscription.pk)
        return Response(
            SubscriptionAdminDetailSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class AdminLeaseContractCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = AdminLeaseContractCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        subscription = create_lease_contract(
            customer=data["customer"],
            product=data["product"],
            tenure_months=data["tenure_months"],
            start_date=data.get("start_date"),
            security_deposit_percent=data["security_deposit_percent"],
            buyout_amount=data.get("buyout_amount"),
            ownership_transfer_allowed=bool(data.get("ownership_transfer_allowed", False)),
            performed_by=request.user,
            handover_notes=(data.get("handover_notes") or ""),
            contract_terms_snapshot=(data.get("contract_terms_snapshot") or ""),
        )

        from subscriptions.services.contract_pdf_service import generate_contract_pdf_for_subscription

        generate_contract_pdf_for_subscription(subscription=subscription, performed_by=request.user)

        refreshed = get_subscription_detail_queryset().get(pk=subscription.pk)
        return Response(
            SubscriptionAdminDetailSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

