from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.partner_collection_request import (
    PartnerCollectionRequestDecisionSerializer,
    PartnerCollectionRequestSerializer,
)
from subscriptions.models import (
    PartnerCollectionRequest,
    PartnerCollectionRequestStatus,
)
from subscriptions.services.payment_service import collect_payment_for_admin


def _request_base_queryset():
    """
    Safe read queryset for list/detail style serialization.

    Keep select_related here for response efficiency, but do NOT combine this
    queryset with select_for_update() because approved_payment / approved_emi are
    nullable and PostgreSQL rejects FOR UPDATE on the nullable side of outer joins.
    """
    return PartnerCollectionRequest.objects.select_related(
        "partner",
        "subscription",
        "customer",
        "reviewed_by",
        "approved_payment",
        "approved_emi",
    ).order_by("-created_at", "-id")


def _request_lock_queryset():
    """
    Safe lock queryset for approve/reject flows.

    Only include non-nullable joins that are needed for business logic.
    Do not include approved_payment / approved_emi / reviewed_by here.
    """
    return PartnerCollectionRequest.objects.select_related(
        "partner",
        "subscription",
        "customer",
    )


def _reload_request_for_response(request_id: int) -> PartnerCollectionRequest:
    return _request_base_queryset().get(pk=request_id)


class AdminPartnerCollectionRequestListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = _request_base_queryset()

        status_filter = (request.query_params.get("status") or "").strip()
        partner_id = (request.query_params.get("partner") or "").strip()
        subscription_id = (request.query_params.get("subscription") or "").strip()

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if partner_id:
            if partner_id.isdigit():
                queryset = queryset.filter(partner_id=int(partner_id))
            else:
                queryset = queryset.none()

        if subscription_id:
            if subscription_id.isdigit():
                queryset = queryset.filter(subscription_id=int(subscription_id))
            else:
                queryset = queryset.none()

        return Response(
            {
                "count": queryset.count(),
                "results": PartnerCollectionRequestSerializer(queryset, many=True).data,
            }
        )


class AdminPartnerCollectionRequestApproveView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        try:
            collection_request = (
                _request_lock_queryset()
                .select_for_update()
                .get(pk=pk)
            )
        except PartnerCollectionRequest.DoesNotExist:
            return Response(
                {"detail": "Collection request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if collection_request.status == PartnerCollectionRequestStatus.APPROVED:
            return Response(
                {"detail": "Collection request already approved."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if collection_request.status in (
            PartnerCollectionRequestStatus.REJECTED,
            PartnerCollectionRequestStatus.CANCELLED,
        ):
            return Response(
                {"detail": "Rejected or cancelled request cannot be approved."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PartnerCollectionRequestDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review_note = serializer.get_note()

        try:
            payment_result = collect_payment_for_admin(
                emi_id=collection_request.subscription.emis.filter(
                    status="PENDING"
                ).order_by("month_no", "due_date", "id").values_list("id", flat=True).first(),
                amount=collection_request.amount,
                admin_user=request.user,
                collected_by=collection_request.partner,
                payment_method=collection_request.payment_method,
                payment_date=collection_request.payment_date,
                reference_no=collection_request.reference_no,
                notes=collection_request.notes or review_note or None,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        approved_payment = payment_result["payment"]
        approved_emi = payment_result["emi"]

        collection_request.status = PartnerCollectionRequestStatus.APPROVED
        collection_request.reviewed_by = request.user
        collection_request.reviewed_at = timezone.now()
        collection_request.review_note = review_note
        collection_request.approved_payment = approved_payment
        collection_request.approved_emi = approved_emi
        collection_request.save(
            update_fields=[
                "status",
                "reviewed_by",
                "reviewed_at",
                "review_note",
                "approved_payment",
                "approved_emi",
            ]
        )

        response_obj = _reload_request_for_response(collection_request.id)

        return Response(
            {
                "detail": "Collection request approved successfully.",
                "result": PartnerCollectionRequestSerializer(response_obj).data,
            }
        )


class AdminPartnerCollectionRequestRejectView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        try:
            collection_request = (
                _request_lock_queryset()
                .select_for_update()
                .get(pk=pk)
            )
        except PartnerCollectionRequest.DoesNotExist:
            return Response(
                {"detail": "Collection request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if collection_request.status == PartnerCollectionRequestStatus.APPROVED:
            return Response(
                {"detail": "Approved request cannot be rejected."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if collection_request.status == PartnerCollectionRequestStatus.REJECTED:
            return Response(
                {"detail": "Collection request already rejected."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PartnerCollectionRequestDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review_note = serializer.get_note()

        collection_request.status = PartnerCollectionRequestStatus.REJECTED
        collection_request.reviewed_by = request.user
        collection_request.reviewed_at = timezone.now()
        collection_request.review_note = review_note
        collection_request.save(
            update_fields=[
                "status",
                "reviewed_by",
                "reviewed_at",
                "review_note",
            ]
        )

        response_obj = _reload_request_for_response(collection_request.id)

        return Response(
            {
                "detail": "Collection request rejected successfully.",
                "result": PartnerCollectionRequestSerializer(response_obj).data,
            }
        )