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


def _validated_request_payload(request_data, *, subscription_id):
    serializer = PartnerCollectionRequestCreateSerializer(
        data={
            "subscription": subscription_id,
            "amount": request_data.get("amount"),
            "payment_mode": request_data.get("payment_mode")
            or request_data.get("method")
            or request_data.get("payment_method"),
            "payment_date": request_data.get("payment_date")
            or request_data.get("paid_at"),
            "reference_no": request_data.get("reference_no"),
            "notes": request_data.get("notes"),
        }
    )
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def _create_collection_request(
    *,
    partner,
    subscription,
    amount,
    payment_method,
    payment_date,
    reference_no,
    notes,
):
    if amount <= MONEY_ZERO:
        raise ValueError("Amount must be greater than zero.")

    with transaction.atomic():
        return PartnerCollectionRequest.objects.create(
            partner=partner,
            subscription=subscription,
            customer=subscription.customer,
            amount=amount,
            payment_method=payment_method,
            payment_date=payment_date,
            reference_no=reference_no,
            notes=notes or "",
            status=PartnerCollectionRequestStatus.SUBMITTED,
        )


def _collection_request_response(request_obj, *, legacy_contract=False):
    payload = {
        "message": "Collection request submitted successfully.",
        "detail": "Collection request submitted successfully.",
        "request": PartnerCollectionRequestSerializer(request_obj).data,
        "reference_no": request_obj.reference_no,
    }
    if legacy_contract:
        payload.update(
            {
                "id": request_obj.id,
                "amount": str(request_obj.amount),
                "method": request_obj.payment_method,
                "payment_method": request_obj.payment_method,
                "status": request_obj.status,
            }
        )
    return payload


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

        try:
            subscription = Subscription.objects.select_related("customer").get(
                pk=serializer.validated_data["subscription"],
                partner=partner,
            )
        except Subscription.DoesNotExist:
            return Response(
                {"detail": "Subscription not found for current partner."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            request_obj = _create_collection_request(
                partner=partner,
                subscription=subscription,
                amount=serializer.validated_data["amount"],
                payment_method=serializer.validated_data["payment_method"],
                payment_date=serializer.validated_data["payment_date"],
                reference_no=serializer.validated_data.get("reference_no"),
                notes=serializer.validated_data.get("notes"),
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            _collection_request_response(request_obj),
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


class LegacyPartnerCollectionListCreateView(PartnerCollectionRequestListCreateView):
    """
    Backward-compatible alias for the pre-review partner collection path.

    This endpoint preserves the older `/partner/collections/` contract surface
    while continuing to create PartnerCollectionRequest rows only. It never
    bypasses admin review or creates final Payment truth directly.
    """

    def post(self, request):
        partner = _get_partner_user(request)
        emi_id = request.data.get("emi_id")

        if not emi_id:
            return Response(
                {"emi_id": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        emi = (
            Emi.objects.select_related("subscription", "subscription__customer")
            .filter(pk=emi_id)
            .first()
        )
        if emi is None:
            return Response(
                {"detail": "EMI not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if emi.subscription.partner_id != partner.id:
            return Response(
                {"detail": "You do not have permission to submit collection for this EMI."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = _validated_request_payload(
            request.data,
            subscription_id=emi.subscription_id,
        )

        try:
            request_obj = _create_collection_request(
                partner=partner,
                subscription=emi.subscription,
                amount=serializer["amount"],
                payment_method=serializer["payment_method"],
                payment_date=serializer["payment_date"],
                reference_no=serializer.get("reference_no"),
                notes=serializer.get("notes"),
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            _collection_request_response(request_obj, legacy_contract=True),
            status=status.HTTP_201_CREATED,
        )


class LegacyPartnerPaymentCollectView(APIView):
    """
    Compatibility stub for the retired `/partner/payments/collect/` route.

    The legacy path now submits a reviewable collection request so financial
    history remains append-only and auditable.
    """

    permission_classes = [IsAuthenticated, IsPartner]

    def post(self, request):
        partner = _get_partner_user(request)
        subscription_id = request.data.get("subscription_id")

        if not subscription_id:
            return Response(
                {"subscription_id": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        subscription = (
            Subscription.objects.select_related("customer")
            .filter(pk=subscription_id)
            .first()
        )
        if subscription is None:
            return Response(
                {"detail": "Subscription not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if subscription.partner_id != partner.id:
            return Response(
                {"detail": "You do not have permission to collect payment for this subscription."},
                status=status.HTTP_403_FORBIDDEN,
            )

        emi_id = request.data.get("emi_id")
        if emi_id:
            emi = Emi.objects.filter(pk=emi_id).first()
            if emi is None:
                return Response(
                    {"detail": "EMI not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if emi.subscription_id != subscription.id:
                return Response(
                    {"detail": "EMI does not belong to the provided subscription."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = _validated_request_payload(
            request.data,
            subscription_id=subscription.id,
        )

        try:
            request_obj = _create_collection_request(
                partner=partner,
                subscription=subscription,
                amount=serializer["amount"],
                payment_method=serializer["payment_method"],
                payment_date=serializer["payment_date"],
                reference_no=serializer.get("reference_no"),
                notes=serializer.get("notes"),
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            _collection_request_response(request_obj, legacy_contract=True),
            status=status.HTTP_201_CREATED,
        )
