"""Cashier variance escalation — email alert when day-close cash variance exceeds threshold."""
from __future__ import annotations

from decimal import Decimal
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from api.v1.permissions import IsAdmin


DEFAULT_VARIANCE_THRESHOLD = Decimal("500")  # ₹500 absolute variance triggers alert


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def cashier_variance_list_view(request):
    """
    List day-close records with variance exceeding threshold.
    GET /admin/cashier/variance/?threshold=500&date_from=2026-01-01&date_to=2026-06-30
    """
    from settlements.models import CashierDayClose

    threshold = Decimal(str(request.query_params.get("threshold", DEFAULT_VARIANCE_THRESHOLD)))
    date_from = request.query_params.get("date_from")
    date_to = request.query_params.get("date_to")

    qs = CashierDayClose.objects.all().order_by("-business_date")
    if date_from:
        qs = qs.filter(business_date__gte=date_from)
    if date_to:
        qs = qs.filter(business_date__lte=date_to)

    rows = []
    for dc in qs:
        abs_variance = abs(dc.variance or Decimal("0"))
        if abs_variance >= threshold:
            rows.append({
                "id": dc.id,
                "close_no": dc.close_no,
                "business_date": str(dc.business_date),
                "cashier_id": dc.cashier_id,
                "system_cash_total": str(dc.system_cash_total),
                "counted_cash": str(dc.counted_cash),
                "variance": str(dc.variance),
                "abs_variance": str(abs_variance),
                "status": dc.status,
            })

    return Response({
        "threshold": str(threshold),
        "total_breaches": len(rows),
        "results": rows,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def cashier_variance_escalate_view(request, close_id):
    """
    Escalate a cashier day-close variance by emailing admin.
    POST /admin/cashier/day-closes/{close_id}/escalate/
    Body: { "notify_email": "manager@example.com", "notes": "Please investigate..." }
    """
    from settlements.models import CashierDayClose

    try:
        dc = CashierDayClose.objects.get(pk=close_id)
    except CashierDayClose.DoesNotExist:
        return Response({"error": "Day-close record not found."}, status=status.HTTP_404_NOT_FOUND)

    notify_email = request.data.get("notify_email") or getattr(settings, "ADMIN_EMAIL", settings.DEFAULT_FROM_EMAIL)
    notes = request.data.get("notes", "").strip()

    abs_variance = abs(dc.variance or Decimal("0"))

    cashier_name = (
        dc.cashier.get_full_name() if dc.cashier_id else "Unknown Cashier"
    )

    body = (
        f"Cashier Variance Escalation\n"
        f"Close Ref: {dc.close_no}\n"
        f"Business Date: {dc.business_date}\n"
        f"Cashier: {cashier_name}\n"
        f"System Cash Total: ₹{dc.system_cash_total}\n"
        f"Counted Cash: ₹{dc.counted_cash}\n"
        f"Variance: ₹{dc.variance}\n"
        f"Status: {dc.status}\n"
    )
    if notes:
        body += f"\nAdditional Notes:\n{notes}\n"
    body += "\nPlease investigate and take corrective action."

    send_mail(
        subject=f"[ESCALATION] Cashier Cash Variance ₹{abs_variance} on {dc.business_date}",
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[notify_email],
        fail_silently=True,
    )

    return Response({
        "escalated": True,
        "close_id": dc.id,
        "close_no": dc.close_no,
        "variance": str(dc.variance),
        "notify_email": notify_email,
        "message": f"Escalation email sent to {notify_email}.",
    })
