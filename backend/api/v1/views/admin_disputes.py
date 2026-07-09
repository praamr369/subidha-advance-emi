"""Customer dispute workflow — open, review, resolve, reject, escalate."""
from __future__ import annotations

from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from api.v1.permissions import IsAdmin
from subscriptions.models import CustomerDispute, Customer


def _ref() -> str:
    from django.utils.crypto import get_random_string
    ts = timezone.now().strftime("%y%m%d%H%M%S")
    return f"DSP-{ts}-{get_random_string(4).upper()}"


def _row(d: CustomerDispute) -> dict:
    return {
        "id": d.id,
        "dispute_ref": d.dispute_ref,
        "customer_id": d.customer_id,
        "customer_name": d.customer.user.get_full_name() if d.customer.user_id else str(d.customer_id),
        "subscription_id": d.subscription_id,
        "dispute_type": d.dispute_type,
        "subject": d.subject,
        "description": d.description,
        "stage": d.stage,
        "priority": d.priority,
        "assigned_to_id": d.assigned_to_id,
        "assigned_to_name": d.assigned_to.get_full_name() if d.assigned_to_id else None,
        "resolution_notes": d.resolution_notes,
        "resolution_decision": d.resolution_decision,
        "resolved_at": d.resolved_at.isoformat() if d.resolved_at else None,
        "created_at": d.created_at.isoformat(),
        "updated_at": d.updated_at.isoformat(),
        # SLA fields
        "is_sla_compliant": d.is_sla_compliant,
        "is_sla_breached": d.is_sla_breached,
        "days_since_creation": d.days_since_creation,
        "open_due_at": d.open_due_at.isoformat() if d.open_due_at else None,
        "review_due_at": d.review_due_at.isoformat() if d.review_due_at else None,
        "resolve_due_at": d.resolve_due_at.isoformat() if d.resolve_due_at else None,
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def dispute_list_create_view(request):
    """List all disputes (GET) or raise a new one (POST)."""
    if request.method == "GET":
        qs = CustomerDispute.objects.select_related("customer__user")
        stage = request.query_params.get("stage")
        dtype = request.query_params.get("dispute_type")
        customer_id = request.query_params.get("customer_id")
        if stage:
            qs = qs.filter(stage=stage)
        if dtype:
            qs = qs.filter(dispute_type=dtype)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        total = qs.count()
        rows = [_row(d) for d in qs[:200]]
        return Response({"count": total, "results": rows})

    # POST — create
    customer_id = request.data.get("customer_id")
    if not customer_id:
        return Response({"error": "customer_id required."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        customer = Customer.objects.get(pk=customer_id)
    except Customer.DoesNotExist:
        return Response({"error": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

    d = CustomerDispute.objects.create(
        dispute_ref=_ref(),
        customer=customer,
        subscription_id=request.data.get("subscription_id") or None,
        dispute_type=request.data.get("dispute_type", "OTHER"),
        subject=request.data.get("subject", "")[:200],
        description=request.data.get("description", ""),
        priority=request.data.get("priority", "MEDIUM"),
        created_by=request.user,
    )
    return Response(_row(d), status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated, IsAdmin])
def dispute_detail_view(request, dispute_id):
    """Retrieve or update a dispute."""
    try:
        d = CustomerDispute.objects.select_related("customer__user").get(pk=dispute_id)
    except CustomerDispute.DoesNotExist:
        return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(_row(d))

    # PATCH — advance stage or update fields
    new_stage = request.data.get("stage")
    if new_stage and new_stage != d.stage:
        allowed = {
            "OPEN": ["UNDER_REVIEW", "ESCALATED", "REJECTED"],
            "UNDER_REVIEW": ["RESOLVED", "REJECTED", "ESCALATED"],
            "ESCALATED": ["UNDER_REVIEW", "RESOLVED", "REJECTED"],
        }
        if new_stage not in allowed.get(d.stage, []):
            return Response(
                {"error": f"Cannot move from {d.stage} to {new_stage}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        d.stage = new_stage
        if new_stage in ("RESOLVED", "REJECTED"):
            d.resolved_at = timezone.now()

    if "resolution_notes" in request.data:
        d.resolution_notes = request.data["resolution_notes"]
    if "assigned_to_id" in request.data:
        d.assigned_to_id = request.data["assigned_to_id"] or None
    if "priority" in request.data:
        d.priority = request.data["priority"]

    d.save()
    return Response(_row(d))


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def dispute_notify_customer_view(request, dispute_id):
    """
    Email customer a status update for their dispute.
    POST /admin/disputes/{id}/notify/
    Body: { "message": "We are reviewing your case..." }
    """
    try:
        d = CustomerDispute.objects.select_related("customer__user").get(pk=dispute_id)
    except CustomerDispute.DoesNotExist:
        return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    message = (request.data.get("message") or "").strip()
    if not message:
        return Response({"error": "message is required."}, status=status.HTTP_400_BAD_REQUEST)

    email = d.customer.user.email if d.customer.user_id else None
    if not email:
        return Response({"error": "Customer has no email address."}, status=status.HTTP_400_BAD_REQUEST)

    name = d.customer.user.get_full_name() if d.customer.user_id else "Customer"
    send_mail(
        subject=f"Dispute Update: {d.dispute_ref}",
        message=f"Dear {name},\n\n{message}\n\nDispute Ref: {d.dispute_ref}\nStatus: {d.stage}\n\nRegards,\nSupport Team",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=True,
    )

    return Response({"message": "Notification sent.", "email": email, "dispute_ref": d.dispute_ref})


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def dispute_sla_status_view(request, dispute_id):
    """Get SLA compliance status for a dispute."""
    try:
        d = CustomerDispute.objects.get(pk=dispute_id)
    except CustomerDispute.DoesNotExist:
        return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    return Response({
        "dispute_ref": d.dispute_ref,
        "stage": d.stage,
        "is_sla_compliant": d.is_sla_compliant,
        "is_sla_breached": d.is_sla_breached,
        "days_since_creation": d.days_since_creation,
        "open_due_at": d.open_due_at.isoformat() if d.open_due_at else None,
        "review_due_at": d.review_due_at.isoformat() if d.review_due_at else None,
        "resolve_due_at": d.resolve_due_at.isoformat() if d.resolve_due_at else None,
        "review_started_at": d.review_started_at.isoformat() if d.review_started_at else None,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def dispute_sla_breached_view(request):
    """List all disputes with breached SLA."""
    disputes = CustomerDispute.objects.filter(
        stage__in=["OPEN", "UNDER_REVIEW"]
    ).select_related("customer__user", "assigned_to")

    breached = [d for d in disputes if d.is_sla_breached]
    rows = [_row(d) for d in breached]

    return Response({
        "count": len(rows),
        "results": rows,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def dispute_pending_escalation_view(request):
    """List disputes that need escalation (SLA compliance about to breach)."""
    disputes = CustomerDispute.objects.filter(
        stage__in=["OPEN", "UNDER_REVIEW"]
    ).select_related("customer__user", "assigned_to")

    # Disputes that are compliant but need escalation (5+ days old)
    pending = [d for d in disputes if not d.is_sla_breached and d.is_sla_compliant and d.days_since_creation >= 5]
    rows = [_row(d) for d in pending]

    return Response({
        "count": len(rows),
        "results": rows,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def dispute_move_to_review_view(request, dispute_id):
    """Move dispute from OPEN to UNDER_REVIEW."""
    try:
        d = CustomerDispute.objects.get(pk=dispute_id)
    except CustomerDispute.DoesNotExist:
        return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if d.stage != "OPEN":
        return Response(
            {"error": f"Can only move OPEN disputes to review. Current stage: {d.stage}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    d.stage = "UNDER_REVIEW"
    d.review_started_at = timezone.now()
    d.assigned_to_id = request.data.get("assigned_to_id") or request.user.id
    d.save(update_fields=["stage", "review_started_at", "assigned_to_id"])

    return Response(_row(d))


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def dispute_escalate_view(request, dispute_id):
    """Escalate a dispute when SLA is about to breach."""
    try:
        d = CustomerDispute.objects.get(pk=dispute_id)
    except CustomerDispute.DoesNotExist:
        return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if d.stage not in ["OPEN", "UNDER_REVIEW"]:
        return Response(
            {"error": f"Can only escalate OPEN or UNDER_REVIEW disputes. Current stage: {d.stage}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    d.stage = "ESCALATED"
    d.save(update_fields=["stage"])

    return Response(_row(d))
