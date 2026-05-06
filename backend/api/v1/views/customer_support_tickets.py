from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsCustomer
from api.v1.serializers.support_tickets import (
    CustomerSupportTicketCommentSerializer,
    CustomerSupportTicketCreateSerializer,
    CustomerSupportTicketReopenSerializer,
    serialize_support_ticket_row,
)
from api.v1.views.customer import _get_customer_or_404_response
from service_desk.support_ticket_models import (
    SupportTicket,
    SupportTicketPriority,
    SupportTicketStatus,
)
from service_desk.services.support_ticket_service import (
    add_customer_comment,
    build_ticket_operational_context,
    build_ticket_timeline,
    create_customer_ticket,
    link_ticket_to_object,
    reopen_ticket,
)


def _customer_ticket_queryset(customer):
    return (
        SupportTicket.objects.filter(customer=customer)
        .select_related("customer", "created_by", "assigned_to")
        .order_by("-created_at", "-id")
    )


def _detail_payload(ticket: SupportTicket, *, customer):
    comments = ticket.comments.filter(is_internal=False).select_related("author").order_by("created_at", "id")
    return {
        **serialize_support_ticket_row(ticket, detail=True),
        "description": ticket.description,
        "resolution_summary": ticket.resolution_summary
        if ticket.status
        in {
            SupportTicketStatus.RESOLVED,
            SupportTicketStatus.CLOSED,
            SupportTicketStatus.REJECTED,
        }
        else None,
        "comments": [
            {
                "id": c.id,
                "body": c.body,
                "author": {
                    "id": c.author_id,
                    "username": c.author.username,
                    "first_name": c.author.first_name,
                    "last_name": c.author.last_name,
                },
                "created_at": c.created_at.isoformat(),
            }
            for c in comments
        ],
        "timeline": build_ticket_timeline(
            ticket=ticket,
            include_internal=False,
            include_internal_events=False,
        ),
        "operational_context": build_ticket_operational_context(ticket),
    }


class CustomerSupportTicketListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    def get(self, request):
        customer, err = _get_customer_or_404_response(request)
        if err:
            return err
        qs = _customer_ticket_queryset(customer)
        tab = (request.query_params.get("tab") or "").strip().lower()
        if tab == "open":
            qs = qs.exclude(
                status__in={
                    SupportTicketStatus.RESOLVED,
                    SupportTicketStatus.CLOSED,
                    SupportTicketStatus.REJECTED,
                }
            ).exclude(status=SupportTicketStatus.WAITING_FOR_CUSTOMER)
        elif tab == "waiting_customer":
            qs = qs.filter(status=SupportTicketStatus.WAITING_FOR_CUSTOMER)
        elif tab == "resolved":
            qs = qs.filter(
                status__in={
                    SupportTicketStatus.RESOLVED,
                    SupportTicketStatus.CLOSED,
                }
            )
        results = [serialize_support_ticket_row(t, detail=False) for t in qs[:100]]
        return Response({"count": qs.count(), "results": results})

    def post(self, request):
        customer, err = _get_customer_or_404_response(request)
        if err:
            return err
        ser = CustomerSupportTicketCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        try:
            ticket = create_customer_ticket(
                customer=customer,
                created_by=request.user,
                category=data["category"],
                subject=data["subject"],
                description=data["description"],
                priority=data.get("priority") or SupportTicketPriority.NORMAL,
                preferred_contact_time=data.get("preferred_contact_time") or "",
            )
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        lt = data.get("link_type")
        oid = data.get("link_object_id")
        if lt and oid:
            try:
                link_ticket_to_object(
                    ticket=ticket,
                    link_type=lt,
                    object_id=oid,
                    performed_by=request.user,
                )
            except ValueError as exc:
                raise serializers.ValidationError({"link": str(exc)}) from exc
        ticket.refresh_from_db()
        return Response(_detail_payload(ticket, customer=customer), status=status.HTTP_201_CREATED)


class CustomerSupportTicketDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    def get(self, request, pk):
        customer, err = _get_customer_or_404_response(request)
        if err:
            return err
        ticket = get_object_or_404(_customer_ticket_queryset(customer), pk=pk)
        return Response(_detail_payload(ticket, customer=customer))


class CustomerSupportTicketCommentView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    def post(self, request, pk):
        customer, err = _get_customer_or_404_response(request)
        if err:
            return err
        ticket = get_object_or_404(_customer_ticket_queryset(customer), pk=pk)
        ser = CustomerSupportTicketCommentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            add_customer_comment(
                ticket=ticket,
                customer=customer,
                author=request.user,
                body=ser.validated_data["body"],
            )
        except ValueError as exc:
            raise serializers.ValidationError({"body": str(exc)}) from exc
        ticket.refresh_from_db()
        return Response(_detail_payload(ticket, customer=customer))


class CustomerSupportTicketReopenView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    def post(self, request, pk):
        customer, err = _get_customer_or_404_response(request)
        if err:
            return err
        ticket = get_object_or_404(_customer_ticket_queryset(customer), pk=pk)
        ser = CustomerSupportTicketReopenSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            reopen_ticket(
                ticket=ticket,
                performed_by=request.user,
                message=ser.validated_data.get("message") or "",
            )
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        ticket.refresh_from_db()
        return Response(_detail_payload(ticket, customer=customer))
