from __future__ import annotations

from rest_framework import serializers

from accounts.models import User
from service_desk.support_ticket_models import (
    SupportTicket,
    SupportTicketCategory,
    SupportTicketComment,
    SupportTicketLinkType,
    SupportTicketPriority,
    SupportTicketSource,
    SupportTicketStatus,
)


class SupportTicketUserBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name")


class SupportTicketCommentReadSerializer(serializers.ModelSerializer):
    author = SupportTicketUserBriefSerializer(read_only=True)

    class Meta:
        model = SupportTicketComment
        fields = ("id", "body", "is_internal", "author", "created_at")


class CustomerSupportTicketCreateSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=SupportTicketCategory.choices)
    subject = serializers.CharField(max_length=200)
    description = serializers.CharField()
    priority = serializers.ChoiceField(
        choices=SupportTicketPriority.choices,
        default=SupportTicketPriority.NORMAL,
        required=False,
    )
    preferred_contact_time = serializers.CharField(
        max_length=120, required=False, allow_blank=True, default=""
    )
    link_type = serializers.ChoiceField(
        choices=SupportTicketLinkType.choices,
        required=False,
        allow_null=True,
    )
    link_object_id = serializers.IntegerField(required=False, allow_null=True)


class CustomerSupportTicketCommentSerializer(serializers.Serializer):
    body = serializers.CharField()


class AdminSupportTicketCreateSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=SupportTicketCategory.choices)
    subject = serializers.CharField(max_length=200)
    description = serializers.CharField()
    customer = serializers.IntegerField(required=False, allow_null=True)
    priority = serializers.ChoiceField(
        choices=SupportTicketPriority.choices,
        default=SupportTicketPriority.NORMAL,
        required=False,
    )
    source = serializers.ChoiceField(
        choices=SupportTicketSource.choices,
        default=SupportTicketSource.ADMIN,
        required=False,
    )
    preferred_contact_time = serializers.CharField(
        max_length=120, required=False, allow_blank=True, default=""
    )


class AdminSupportTicketPatchSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=SupportTicketStatus.choices, required=False)
    priority = serializers.ChoiceField(choices=SupportTicketPriority.choices, required=False)
    due_at = serializers.DateTimeField(required=False, allow_null=True)
    subject = serializers.CharField(max_length=200, required=False)
    description = serializers.CharField(required=False)
    category = serializers.ChoiceField(choices=SupportTicketCategory.choices, required=False)


class AdminSupportTicketAssignSerializer(serializers.Serializer):
    assignee_id = serializers.IntegerField(required=False, allow_null=True)


class AdminSupportTicketLinkSerializer(serializers.Serializer):
    link_type = serializers.ChoiceField(choices=SupportTicketLinkType.choices)
    object_id = serializers.IntegerField(min_value=1)


class AdminSupportTicketResolveSerializer(serializers.Serializer):
    resolution_summary = serializers.CharField()


class AdminSupportTicketRejectSerializer(serializers.Serializer):
    reason = serializers.CharField()


class AdminSupportTicketCloseSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, default="")


class CustomerSupportTicketReopenSerializer(serializers.Serializer):
    message = serializers.CharField(required=False, allow_blank=True, default="")


def serialize_support_ticket_row(ticket: SupportTicket, *, detail: bool) -> dict:
    from service_desk.services.support_ticket_service import (
        build_ticket_operational_context,
        build_ticket_timeline,
    )

    data = {
        "id": ticket.id,
        "ticket_no": ticket.ticket_no,
        "category": ticket.category,
        "status": ticket.status,
        "priority": ticket.priority,
        "subject": ticket.subject,
        "description": ticket.description if detail else None,
        "source": ticket.source,
        "customer": ticket.customer_id,
        "created_by": ticket.created_by_id,
        "assigned_to": ticket.assigned_to_id,
        "due_at": ticket.due_at.isoformat() if ticket.due_at else None,
        "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
        "closed_at": ticket.closed_at.isoformat() if ticket.closed_at else None,
        "resolution_summary": ticket.resolution_summary if detail else None,
        "preferred_contact_time": ticket.preferred_contact_time,
        "created_at": ticket.created_at.isoformat(),
        "updated_at": ticket.updated_at.isoformat(),
    }
    if not detail:
        data.pop("description", None)
        data.pop("resolution_summary", None)
    return data
