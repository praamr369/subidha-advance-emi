from django.db.models import Count, Min, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
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
from crm.models import PartyInteraction, PartyInteractionStatus, PartyLink, PartyLinkRole
from crm.services.party_service import seed_missing_party_links
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
            "converted_direct_sale",
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
            | Q(converted_direct_sale__sale_no__icontains=q)
        )

        if q.isdigit():
            filters = filters | Q(id=int(q))

        queryset = queryset.filter(filters)

    return queryset


def _crm_serializer_context(request, leads):
    lead_ids = [lead.id for lead in leads if getattr(lead, "id", None)]
    if not lead_ids:
        return {"request": request}

    seed_missing_party_links()
    now = timezone.now()

    links = list(
        PartyLink.objects.select_related("party")
        .filter(
            role_type=PartyLinkRole.LEAD,
            source_model="PublicLead",
            source_pk__in=lead_ids,
        )
        .order_by("id")
    )
    party_ids = [link.party_id for link in links]
    follow_up_rows = {
        row["party_id"]: row
        for row in PartyInteraction.objects.filter(
            party_id__in=party_ids,
            status=PartyInteractionStatus.OPEN,
        )
        .values("party_id")
        .annotate(
            open_follow_up_count=Count("id"),
            next_follow_up_at=Min("next_follow_up_at"),
        )
    }

    lead_crm_map = {}
    for link in links:
        follow_up = follow_up_rows.get(link.party_id, {})
        next_follow_up_at = follow_up.get("next_follow_up_at")
        if next_follow_up_at is None:
            follow_up_state = "NONE"
        elif next_follow_up_at <= now:
            follow_up_state = "DUE"
        else:
            follow_up_state = "SCHEDULED"

        lead_crm_map[link.source_pk] = {
            "party_id": link.party_id,
            "party_no": link.party.party_no,
            "party_display_name": link.party.display_name,
            "next_follow_up_at": next_follow_up_at,
            "follow_up_state": follow_up_state,
            "open_follow_up_count": follow_up.get("open_follow_up_count", 0),
        }

    return {
        "request": request,
        "lead_crm_map": lead_crm_map,
    }


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
        leads = list(queryset[:200])
        serializer = AdminLeadListSerializer(
            leads,
            many=True,
            context=_crm_serializer_context(request, leads),
        )

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
        serializer = AdminLeadDetailSerializer(
            lead,
            context=_crm_serializer_context(request, [lead]),
        )
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

        return Response(
            AdminLeadDetailSerializer(
                lead,
                context=_crm_serializer_context(request, [lead]),
            ).data
        )


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

        return Response(
            AdminLeadDetailSerializer(
                lead,
                context=_crm_serializer_context(request, [lead]),
            ).data
        )


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

        return Response(
            AdminLeadDetailSerializer(
                lead,
                context=_crm_serializer_context(request, [lead]),
            ).data
        )


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
                direct_sale=serializer.validated_data.get("direct_sale_id"),
                performed_by=request.user,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

        return Response(
            AdminLeadDetailSerializer(
                lead,
                context=_crm_serializer_context(request, [lead]),
            ).data
        )
