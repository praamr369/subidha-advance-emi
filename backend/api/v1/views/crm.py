from __future__ import annotations

from django.db.models import Count, Min, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.crm import (
    PartyInteractionCreateSerializer,
    PartyInteractionSerializer,
    PartyInteractionStatusSerializer,
    PartyMasterListSerializer,
    PartyMasterUpdateSerializer,
)
from crm.models import (
    PartyInteraction,
    PartyInteractionStatus,
    PartyLink,
    PartyMaster,
)
from crm.services.interaction_service import (
    create_party_interaction,
    update_party_interaction_status,
)
from crm.services.party_service import seed_missing_party_links
from crm.services.timeline_service import build_party_detail_payload
from subscriptions.models import PublicLead, PublicLeadStatus


def _party_queryset():
    return PartyMaster.objects.prefetch_related("links").annotate(
        open_follow_up_count=Count(
            "interactions",
            filter=Q(interactions__status=PartyInteractionStatus.OPEN),
            distinct=True,
        ),
        next_follow_up_at=Min(
            "interactions__next_follow_up_at",
            filter=Q(
                interactions__status=PartyInteractionStatus.OPEN,
                interactions__next_follow_up_at__isnull=False,
            ),
        ),
    )


def _apply_party_filters(queryset, request):
    q = (request.query_params.get("q") or "").strip()
    role_type = (request.query_params.get("role_type") or "").strip().upper()
    party_kind = (request.query_params.get("party_kind") or "").strip().upper()
    follow_up_state = (request.query_params.get("follow_up_state") or "").strip().upper()
    city = (request.query_params.get("city") or "").strip()
    is_active = (request.query_params.get("is_active") or "").strip().lower()

    if q:
        queryset = queryset.filter(
            Q(party_no__icontains=q)
            | Q(display_name__icontains=q)
            | Q(primary_phone__icontains=q)
            | Q(primary_email__icontains=q)
            | Q(city__icontains=q)
            | Q(links__source_reference__icontains=q)
        ).distinct()

    if role_type:
        queryset = queryset.filter(links__role_type=role_type).distinct()

    if party_kind:
        queryset = queryset.filter(party_kind=party_kind)

    if city:
        queryset = queryset.filter(city__icontains=city)

    if is_active in {"true", "false"}:
        queryset = queryset.filter(is_active=is_active == "true")

    now = timezone.now()
    if follow_up_state == "DUE":
        queryset = queryset.filter(next_follow_up_at__isnull=False, next_follow_up_at__lte=now)
    elif follow_up_state == "SCHEDULED":
        queryset = queryset.filter(next_follow_up_at__isnull=False, next_follow_up_at__gt=now)
    elif follow_up_state == "NONE":
        queryset = queryset.filter(next_follow_up_at__isnull=True)

    return queryset.order_by("display_name", "id")


class CrmOverviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        seed_missing_party_links()

        party_queryset = _party_queryset()
        now = timezone.now()
        follow_up_queue = PartyInteraction.objects.select_related("party", "created_by").filter(
            status=PartyInteractionStatus.OPEN,
        ).order_by("next_follow_up_at", "-happened_at", "-id")
        recent_parties = list(party_queryset.order_by("-created_at", "-id")[:8])
        recent_leads = list(
            PublicLead.objects.select_related("product", "converted_customer", "converted_subscription", "converted_direct_sale")
            .order_by("-created_at", "-id")[:8]
        )

        role_counts = {
            item["role_type"]: item["party_count"]
            for item in PartyLink.objects.values("role_type").annotate(
                party_count=Count("party_id", distinct=True)
            )
        }
        lead_pipeline = {
            "new": PublicLead.objects.filter(status=PublicLeadStatus.NEW).count(),
            "in_progress": PublicLead.objects.filter(status=PublicLeadStatus.IN_PROGRESS).count(),
            "contacted": PublicLead.objects.filter(status=PublicLeadStatus.CONTACTED).count(),
            "converted": PublicLead.objects.filter(status=PublicLeadStatus.CONVERTED).count(),
            "closed": PublicLead.objects.filter(status=PublicLeadStatus.CLOSED).count(),
        }

        return Response(
            {
                "summary": {
                    "party_count": party_queryset.count(),
                    "lead_count": role_counts.get("LEAD", 0),
                    "customer_count": role_counts.get("CUSTOMER", 0),
                    "partner_count": role_counts.get("PARTNER", 0),
                    "vendor_count": role_counts.get("VENDOR", 0),
                    "staff_count": role_counts.get("STAFF", 0),
                    "due_follow_up_count": follow_up_queue.filter(
                        next_follow_up_at__isnull=False,
                        next_follow_up_at__lte=now,
                    ).count(),
                    "scheduled_follow_up_count": follow_up_queue.filter(
                        next_follow_up_at__isnull=False,
                        next_follow_up_at__gt=now,
                    ).count(),
                    "open_interaction_count": follow_up_queue.count(),
                },
                "lead_pipeline": lead_pipeline,
                "recent_parties": PartyMasterListSerializer(recent_parties, many=True).data,
                "recent_leads": [
                    {
                        "id": lead.id,
                        "name": lead.name,
                        "phone": lead.phone,
                        "city": lead.city,
                        "status": lead.status,
                        "product_name": getattr(lead.product, "name", ""),
                        "converted_customer_id": lead.converted_customer_id,
                        "converted_subscription_id": lead.converted_subscription_id,
                        "converted_direct_sale_id": lead.converted_direct_sale_id,
                        "created_at": lead.created_at,
                    }
                    for lead in recent_leads
                ],
                "follow_up_queue": [
                    {
                        "id": interaction.id,
                        "party_id": interaction.party_id,
                        "party_no": interaction.party.party_no,
                        "party_display_name": interaction.party.display_name,
                        "interaction_type": interaction.interaction_type,
                        "status": interaction.status,
                        "subject": interaction.subject,
                        "next_follow_up_at": interaction.next_follow_up_at,
                        "happened_at": interaction.happened_at,
                        "created_by_username": getattr(interaction.created_by, "username", None),
                    }
                    for interaction in follow_up_queue[:12]
                ],
            }
        )


class PartyDirectoryListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        seed_missing_party_links()
        queryset = _apply_party_filters(_party_queryset(), request)
        results = list(queryset[:200])
        serializer = PartyMasterListSerializer(results, many=True)
        return Response(
            {
                "count": queryset.count(),
                "results": serializer.data,
            }
        )


class PartyDirectoryDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        seed_missing_party_links()
        party = get_object_or_404(
            PartyMaster.objects.prefetch_related("links", "interactions"),
            pk=pk,
        )
        return Response(build_party_detail_payload(party))

    def patch(self, request, pk):
        party = get_object_or_404(PartyMaster, pk=pk)
        serializer = PartyMasterUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updates = serializer.validated_data
        if not updates:
            return Response(build_party_detail_payload(party))

        for field, value in updates.items():
            setattr(party, field, value)
        party.save(update_fields=[*updates.keys(), "updated_at"])
        return Response(build_party_detail_payload(party))


class PartyInteractionCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        party = get_object_or_404(PartyMaster, pk=pk)
        serializer = PartyInteractionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            interaction = create_party_interaction(
                party=party,
                performed_by=request.user,
                **serializer.validated_data,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

        return Response(
            {
                "interaction": PartyInteractionSerializer(interaction).data,
                "party": build_party_detail_payload(party)["party"],
            }
        )


class PartyInteractionStatusUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        interaction = get_object_or_404(
            PartyInteraction.objects.select_related("party"),
            pk=pk,
        )
        serializer = PartyInteractionStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            interaction = update_party_interaction_status(
                interaction=interaction,
                status=serializer.validated_data["status"],
                performed_by=request.user,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"status": str(exc)}) from exc

        return Response(
            {
                "interaction": PartyInteractionSerializer(interaction).data,
                "party": build_party_detail_payload(interaction.party)["party"],
            }
        )
