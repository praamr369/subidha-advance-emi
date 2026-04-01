from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.support_requests import (
    AdminSupportRequestReadSerializer,
    AdminSupportRequestAssignSerializer,
    AdminSupportRequestNoteUpdateSerializer,
    AdminSupportRequestResolveSerializer,
    AdminSupportRequestStatusUpdateSerializer,
)
from subscriptions.models import CustomerSupportRequest, SupportRequestStatus
from subscriptions.services.customer_support_service import (
    assign_customer_support_request,
    resolve_customer_support_request,
    update_customer_support_request_notes,
    update_customer_support_request_status,
)


def _support_request_queryset():
    return CustomerSupportRequest.objects.select_related(
        "customer",
        "payment",
        "subscription",
        "assigned_to",
        "resolved_by",
    ).order_by("-created_at", "-id")


def _apply_filters(queryset, request):
    q = (request.query_params.get("q") or "").strip()
    status_filter = (request.query_params.get("status") or "").strip().upper()
    category_filter = (request.query_params.get("category") or "").strip().upper()
    assignee_filter = (request.query_params.get("assignee") or "").strip()
    date_from = (request.query_params.get("date_from") or "").strip()
    date_to = (request.query_params.get("date_to") or "").strip()

    if status_filter and status_filter in SupportRequestStatus.values:
        queryset = queryset.filter(status=status_filter)

    if category_filter:
        queryset = queryset.filter(category=category_filter)

    if assignee_filter:
        if assignee_filter == "unassigned":
            queryset = queryset.filter(assigned_to__isnull=True)
        elif assignee_filter.isdigit():
            queryset = queryset.filter(assigned_to_id=int(assignee_filter))

    if date_from:
        queryset = queryset.filter(created_at__date__gte=date_from)

    if date_to:
        queryset = queryset.filter(created_at__date__lte=date_to)

    if q:
        filters = (
            Q(message__icontains=q)
            | Q(internal_notes__icontains=q)
            | Q(customer__name__icontains=q)
            | Q(customer__phone__icontains=q)
            | Q(payment__reference_no__icontains=q)
            | Q(assigned_to__username__icontains=q)
            | Q(assigned_to__first_name__icontains=q)
            | Q(assigned_to__last_name__icontains=q)
        )

        if q.isdigit():
            filters = filters | Q(id=int(q)) | Q(payment_id=int(q)) | Q(subscription_id=int(q))

        queryset = queryset.filter(filters)

    return queryset


def _summary_for_queryset(queryset):
    return {
        "total": queryset.count(),
        "submitted": queryset.filter(status=SupportRequestStatus.SUBMITTED).count(),
        "under_review": queryset.filter(status=SupportRequestStatus.UNDER_REVIEW).count(),
        "closed": queryset.filter(status=SupportRequestStatus.CLOSED).count(),
        "assigned": queryset.filter(assigned_to__isnull=False).count(),
        "unassigned": queryset.filter(assigned_to__isnull=True).count(),
    }


class AdminSupportRequestListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = _apply_filters(_support_request_queryset(), request)
        serializer = AdminSupportRequestReadSerializer(queryset[:200], many=True)

        return Response(
            {
                "count": queryset.count(),
                "summary": _summary_for_queryset(queryset),
                "results": serializer.data,
            }
        )


class AdminSupportRequestDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        support_request = get_object_or_404(_support_request_queryset(), pk=pk)
        return Response(AdminSupportRequestReadSerializer(support_request).data)


class AdminSupportRequestStatusUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        support_request = get_object_or_404(_support_request_queryset(), pk=pk)
        serializer = AdminSupportRequestStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            support_request = update_customer_support_request_status(
                support_request=support_request,
                next_status=serializer.validated_data["status"],
                performed_by=request.user,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"status": str(exc)}) from exc

        return Response(AdminSupportRequestReadSerializer(support_request).data)


class AdminSupportRequestAssignView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        support_request = get_object_or_404(_support_request_queryset(), pk=pk)
        serializer = AdminSupportRequestAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            support_request = assign_customer_support_request(
                support_request=support_request,
                assignee=serializer.validated_data.get("assigned_to"),
                performed_by=request.user,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"assigned_to": str(exc)}) from exc

        return Response(AdminSupportRequestReadSerializer(support_request).data)


class AdminSupportRequestNoteUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        support_request = get_object_or_404(_support_request_queryset(), pk=pk)
        serializer = AdminSupportRequestNoteUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            support_request = update_customer_support_request_notes(
                support_request=support_request,
                note=serializer.validated_data["note"],
                mode=serializer.validated_data["mode"],
                performed_by=request.user,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"note": str(exc)}) from exc

        return Response(AdminSupportRequestReadSerializer(support_request).data)


class AdminSupportRequestResolveView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        support_request = get_object_or_404(_support_request_queryset(), pk=pk)
        serializer = AdminSupportRequestResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            support_request = resolve_customer_support_request(
                support_request=support_request,
                resolution_summary=serializer.validated_data["resolution_summary"],
                performed_by=request.user,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"resolution_summary": str(exc)}) from exc

        return Response(AdminSupportRequestReadSerializer(support_request).data)
