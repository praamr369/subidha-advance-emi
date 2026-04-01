from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.admin_leads import (
    AdminLeadAssignSerializer,
    AdminLeadConversionCompleteSerializer,
    AdminLeadDetailSerializer,
    AdminLeadListSerializer,
    AdminLeadNoteUpdateSerializer,
    AdminLeadStatusUpdateSerializer,
)
from subscriptions.models import PublicLead, PublicLeadStatus
from subscriptions.services.public_lead_service import (
    assign_public_lead,
    complete_public_lead_conversion,
    update_public_lead_notes,
    update_public_lead_status,
)


def _lead_queryset():
    return (
        PublicLead.objects.select_related(
            "product",
            "assigned_to",
            "converted_customer",
            "converted_subscription",
            "converted_by",
        )
        .order_by("-created_at", "-id")
    )


def _apply_filters(queryset, request):
    status_filter = (request.query_params.get("status") or "").strip().upper()
    assignee_filter = (request.query_params.get("assignee") or "").strip()
    q = (request.query_params.get("q") or "").strip()
    date_from = (request.query_params.get("date_from") or "").strip()
    date_to = (request.query_params.get("date_to") or "").strip()

    if status_filter and status_filter in PublicLeadStatus.values:
        queryset = queryset.filter(status=status_filter)

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
            Q(name__icontains=q)
            | Q(phone__icontains=q)
            | Q(city__icontains=q)
            | Q(interested_product__icontains=q)
            | Q(notes__icontains=q)
            | Q(admin_notes__icontains=q)
            | Q(product__name__icontains=q)
            | Q(product__product_code__icontains=q)
            | Q(assigned_to__username__icontains=q)
            | Q(assigned_to__first_name__icontains=q)
            | Q(assigned_to__last_name__icontains=q)
        )

        if q.isdigit():
            filters = filters | Q(id=int(q))

        queryset = queryset.filter(filters)

    return queryset


def _summary_for_queryset(queryset):
    return {
        "total": queryset.count(),
        "new": queryset.filter(status=PublicLeadStatus.NEW).count(),
        "in_progress": queryset.filter(status=PublicLeadStatus.IN_PROGRESS).count(),
        "contacted": queryset.filter(status=PublicLeadStatus.CONTACTED).count(),
        "converted": queryset.filter(status=PublicLeadStatus.CONVERTED).count(),
        "closed": queryset.filter(status=PublicLeadStatus.CLOSED).count(),
        "assigned": queryset.filter(assigned_to__isnull=False).count(),
        "unassigned": queryset.filter(assigned_to__isnull=True).count(),
    }


class AdminLeadListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = _apply_filters(_lead_queryset(), request)
        serializer = AdminLeadListSerializer(queryset[:200], many=True)

        return Response(
            {
                "count": queryset.count(),
                "summary": _summary_for_queryset(queryset),
                "results": serializer.data,
            }
        )


class AdminLeadDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        lead = get_object_or_404(_lead_queryset(), pk=pk)
        serializer = AdminLeadDetailSerializer(lead)
        return Response(serializer.data)


class AdminLeadStatusUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        lead = get_object_or_404(_lead_queryset(), pk=pk)
        serializer = AdminLeadStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            lead = update_public_lead_status(
                lead=lead,
                next_status=serializer.validated_data["status"],
                performed_by=request.user,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"status": str(exc)}) from exc

        return Response(AdminLeadDetailSerializer(lead).data)


class AdminLeadAssignView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        lead = get_object_or_404(_lead_queryset(), pk=pk)
        serializer = AdminLeadAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            lead = assign_public_lead(
                lead=lead,
                assignee=serializer.validated_data.get("assigned_to"),
                performed_by=request.user,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"assigned_to": str(exc)}) from exc

        return Response(AdminLeadDetailSerializer(lead).data)


class AdminLeadNoteUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        lead = get_object_or_404(_lead_queryset(), pk=pk)
        serializer = AdminLeadNoteUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            lead = update_public_lead_notes(
                lead=lead,
                note=serializer.validated_data["note"],
                mode=serializer.validated_data["mode"],
                performed_by=request.user,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"note": str(exc)}) from exc

        return Response(AdminLeadDetailSerializer(lead).data)


class AdminLeadConversionCompleteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        lead = get_object_or_404(_lead_queryset(), pk=pk)
        serializer = AdminLeadConversionCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            lead = complete_public_lead_conversion(
                lead=lead,
                customer=serializer.validated_data.get("customer_id"),
                subscription=serializer.validated_data.get("subscription_id"),
                performed_by=request.user,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

        return Response(AdminLeadDetailSerializer(lead).data)
