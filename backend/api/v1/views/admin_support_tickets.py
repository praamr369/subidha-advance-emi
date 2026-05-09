from __future__ import annotations

from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.support_tickets import (
    AdminSupportTicketAssignSerializer,
    AdminSupportTicketCloseSerializer,
    AdminSupportTicketCreateSerializer,
    AdminSupportTicketLinkSerializer,
    AdminSupportTicketPatchSerializer,
    AdminSupportTicketRejectSerializer,
    AdminSupportTicketResolveSerializer,
    CustomerSupportTicketCommentSerializer,
    CustomerSupportTicketReopenSerializer,
    serialize_support_ticket_row,
)
from accounts.models import User
from subscriptions.models import Customer
from service_desk.support_ticket_models import SupportTicket
from service_desk.services.support_ticket_service import (
    add_admin_comment,
    add_internal_note,
    assign_ticket,
    build_ticket_operational_context,
    build_ticket_timeline,
    change_ticket_priority,
    change_ticket_status,
    close_ticket,
    create_admin_ticket,
    link_ticket_to_object,
    reject_ticket,
    resolve_ticket,
    reopen_ticket,
    support_ticket_dashboard_summary,
)


def _admin_ticket_base_qs():
    return SupportTicket.objects.select_related(
        "customer",
        "created_by",
        "assigned_to",
        "resolved_by",
        "closed_by",
    ).order_by("-created_at", "-id")


def _apply_filters(qs, request):
    q = (request.query_params.get("q") or "").strip()
    st = (request.query_params.get("status") or "").strip().upper()
    pr = (request.query_params.get("priority") or "").strip().upper()
    cat = (request.query_params.get("category") or "").strip().upper()
    assignee = (request.query_params.get("assignee") or "").strip()

    if st:
        qs = qs.filter(status=st)
    if pr:
        qs = qs.filter(priority=pr)
    if cat:
        qs = qs.filter(category=cat)
    if assignee == "unassigned":
        qs = qs.filter(assigned_to__isnull=True)
    elif assignee.isdigit():
        qs = qs.filter(assigned_to_id=int(assignee))

    if q:
        filters = (
            Q(subject__icontains=q)
            | Q(description__icontains=q)
            | Q(ticket_no__icontains=q)
            | Q(customer__name__icontains=q)
            | Q(customer__phone__icontains=q)
        )
        if q.isdigit():
            filters |= Q(id=int(q))
        qs = qs.filter(filters)
    return qs


def _admin_detail(ticket: SupportTicket) -> dict:
    comments = list(ticket.comments.select_related("author").order_by("created_at", "id"))
    return {
        **serialize_support_ticket_row(ticket, detail=True),
        "description": ticket.description,
        "resolution_summary": ticket.resolution_summary,
        "customer_detail": {
            "id": ticket.customer.id,
            "name": ticket.customer.name,
            "phone": ticket.customer.phone,
        }
        if ticket.customer_id
        else None,
        "comments": [
            {
                "id": c.id,
                "body": c.body,
                "is_internal": c.is_internal,
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
        "timeline": build_ticket_timeline(ticket=ticket, include_internal=True),
        "operational_context": build_ticket_operational_context(ticket),
    }


class AdminSupportTicketDashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = _apply_filters(_admin_ticket_base_qs(), request)
        return Response(support_ticket_dashboard_summary(qs))


class AdminSupportTicketListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = _apply_filters(_admin_ticket_base_qs(), request)
        return Response(
            {
                "count": qs.count(),
                "summary": support_ticket_dashboard_summary(qs),
                "results": [serialize_support_ticket_row(t, detail=False) for t in qs[:200]],
            }
        )

    def post(self, request):
        ser = AdminSupportTicketCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        customer = None
        cid = data.get("customer")
        if cid:
            customer = get_object_or_404(Customer.objects.all(), pk=cid)
        try:
            ticket = create_admin_ticket(
                created_by=request.user,
                category=data["category"],
                subject=data["subject"],
                description=data["description"],
                customer=customer,
                priority=data.get("priority"),
                source=data.get("source"),
                preferred_contact_time=data.get("preferred_contact_time") or "",
            )
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return Response(_admin_detail(ticket), status=status.HTTP_201_CREATED)


class AdminSupportTicketDetailPatchView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        ticket = get_object_or_404(_admin_ticket_base_qs(), pk=pk)
        return Response(_admin_detail(ticket))

    def patch(self, request, pk):
        ticket = get_object_or_404(_admin_ticket_base_qs(), pk=pk)
        ser = AdminSupportTicketPatchSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        if "priority" in data and data["priority"]:
            try:
                change_ticket_priority(
                    ticket=ticket,
                    next_priority=data["priority"],
                    performed_by=request.user,
                )
            except ValueError as exc:
                raise serializers.ValidationError({"priority": str(exc)}) from exc
        if "status" in data and data["status"]:
            try:
                change_ticket_status(
                    ticket=ticket,
                    next_status=data["status"],
                    performed_by=request.user,
                )
            except ValueError as exc:
                raise serializers.ValidationError({"status": str(exc)}) from exc
        simple_fields = []
        if "due_at" in data:
            ticket.due_at = data["due_at"]
            simple_fields.append("due_at")
        if "subject" in data and data["subject"]:
            ticket.subject = data["subject"]
            simple_fields.append("subject")
        if "description" in data and data["description"] is not None:
            ticket.description = data["description"]
            simple_fields.append("description")
        if "category" in data and data["category"]:
            ticket.category = data["category"]
            simple_fields.append("category")
        if simple_fields:
            simple_fields.append("updated_at")
            ticket.save(update_fields=simple_fields)
        ticket.refresh_from_db()
        return Response(_admin_detail(ticket))


class AdminSupportTicketAssignView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        ticket = get_object_or_404(_admin_ticket_base_qs(), pk=pk)
        if "assignee_id" not in request.data:
            raise serializers.ValidationError({"assignee_id": "assignee_id is required (use null to unassign)."})
        ser = AdminSupportTicketAssignSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        aid = ser.validated_data.get("assignee_id")
        assignee = get_object_or_404(User.objects.filter(is_active=True), pk=aid) if aid else None
        try:
            assign_ticket(ticket=ticket, assignee=assignee, performed_by=request.user)
        except ValueError as exc:
            raise serializers.ValidationError({"assignee_id": str(exc)}) from exc
        ticket.refresh_from_db()
        return Response(_admin_detail(ticket))


class AdminSupportTicketCommentView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        ticket = get_object_or_404(_admin_ticket_base_qs(), pk=pk)
        ser = CustomerSupportTicketCommentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            add_admin_comment(
                ticket=ticket,
                author=request.user,
                body=ser.validated_data["body"],
            )
        except ValueError as exc:
            raise serializers.ValidationError({"body": str(exc)}) from exc
        ticket.refresh_from_db()
        return Response(_admin_detail(ticket))


class AdminSupportTicketInternalNoteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        ticket = get_object_or_404(_admin_ticket_base_qs(), pk=pk)
        ser = CustomerSupportTicketCommentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            add_internal_note(
                ticket=ticket,
                author=request.user,
                body=ser.validated_data["body"],
            )
        except ValueError as exc:
            raise serializers.ValidationError({"body": str(exc)}) from exc
        ticket.refresh_from_db()
        return Response(_admin_detail(ticket))


class AdminSupportTicketLinkView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        ticket = get_object_or_404(_admin_ticket_base_qs(), pk=pk)
        ser = AdminSupportTicketLinkSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            link_ticket_to_object(
                ticket=ticket,
                link_type=ser.validated_data["link_type"],
                object_id=ser.validated_data["object_id"],
                performed_by=request.user,
            )
        except ObjectDoesNotExist as exc:
            raise serializers.ValidationError("Linked object was not found.") from exc
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        ticket.refresh_from_db()
        return Response(_admin_detail(ticket))


class AdminSupportTicketResolveView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        ticket = get_object_or_404(_admin_ticket_base_qs(), pk=pk)
        ser = AdminSupportTicketResolveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            resolve_ticket(
                ticket=ticket,
                performed_by=request.user,
                resolution_summary=ser.validated_data["resolution_summary"],
            )
        except ValueError as exc:
            raise serializers.ValidationError({"resolution_summary": str(exc)}) from exc
        ticket.refresh_from_db()
        return Response(_admin_detail(ticket))


class AdminSupportTicketRejectView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        ticket = get_object_or_404(_admin_ticket_base_qs(), pk=pk)
        ser = AdminSupportTicketRejectSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            reject_ticket(
                ticket=ticket,
                performed_by=request.user,
                reason=ser.validated_data["reason"],
            )
        except ValueError as exc:
            raise serializers.ValidationError({"reason": str(exc)}) from exc
        ticket.refresh_from_db()
        return Response(_admin_detail(ticket))


class AdminSupportTicketCloseView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        ticket = get_object_or_404(_admin_ticket_base_qs(), pk=pk)
        ser = AdminSupportTicketCloseSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            close_ticket(
                ticket=ticket,
                performed_by=request.user,
                note=ser.validated_data.get("note") or "",
            )
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        ticket.refresh_from_db()
        return Response(_admin_detail(ticket))


class AdminSupportTicketReopenView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        ticket = get_object_or_404(_admin_ticket_base_qs(), pk=pk)
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
        return Response(_admin_detail(ticket))
