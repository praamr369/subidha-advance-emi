from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsPartner
from api.v1.serializers.partner_collection_request import (
    PartnerCollectionRequestCreateSerializer,
    PartnerCollectionRequestSerializer,
)
from subscriptions.models import (
    MONEY_ZERO,
    Emi,
    PartnerCollectionRequest,
    PartnerCollectionRequestStatus,
    Subscription,
)


def _get_partner_user(request):
    return request.user


class PartnerCollectionRequestListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request):
        partner = _get_partner_user(request)

        queryset = (
            PartnerCollectionRequest.objects.select_related(
                "partner",
                "subscription",
                "customer",
                "reviewed_by",
                "approved_payment",
                "approved_emi",
            )
            .filter(partner=partner)
            .order_by("-created_at", "-id")
        )

        subscription_id = request.query_params.get("subscription")
        status_filter = request.query_params.get("status")

        if subscription_id:
            queryset = queryset.filter(subscription_id=subscription_id)

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        return Response(
            {
                "count": queryset.count(),
                "results": PartnerCollectionRequestSerializer(queryset, many=True).data,
            }
        )

    def post(self, request):
        partner = _get_partner_user(request)

        serializer = PartnerCollectionRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        subscription_id = serializer.validated_data["subscription"]
        amount = serializer.validated_data["amount"]
        payment_method = serializer.validated_data["payment_method"]
        payment_date = serializer.validated_data["payment_date"]
        reference_no = serializer.validated_data.get("reference_no")
        notes = serializer.validated_data.get("notes") or ""

        try:
            subscription = Subscription.objects.select_related("customer").get(
                pk=subscription_id,
                partner=partner,
            )
        except Subscription.DoesNotExist:
            return Response(
                {"detail": "Subscription not found for current partner."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if amount <= MONEY_ZERO:
            return Response(
                {"detail": "Amount must be greater than zero."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            request_obj = PartnerCollectionRequest.objects.create(
                partner=partner,
                subscription=subscription,
                customer=subscription.customer,
                amount=amount,
                payment_method=payment_method,
                payment_date=payment_date,
                reference_no=reference_no,
                notes=notes,
                status=PartnerCollectionRequestStatus.SUBMITTED,
            )

        return Response(
            {
                "message": "Collection request submitted successfully.",
                "detail": "Collection request submitted successfully.",
                "request": PartnerCollectionRequestSerializer(request_obj).data,
                "reference_no": request_obj.reference_no,
            },
            status=status.HTTP_201_CREATED,
        )


class PartnerCollectionRequestDetailView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request, pk):
        partner = _get_partner_user(request)

        request_obj = (
            PartnerCollectionRequest.objects.select_related(
                "partner",
                "subscription",
                "customer",
                "reviewed_by",
                "approved_payment",
                "approved_emi",
            )
            .filter(partner=partner, pk=pk)
            .first()
        )

        if request_obj is None:
            return Response(
                {"detail": "Collection request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(PartnerCollectionRequestSerializer(request_obj).data)
