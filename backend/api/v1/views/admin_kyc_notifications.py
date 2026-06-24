"""KYC expiry notification + bulk re-verification trigger."""
from __future__ import annotations

from datetime import timedelta

from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from api.v1.permissions import IsAdmin
from subscriptions.models import CustomerKycDocument


def _days_label(days: int) -> str:
    if days <= 0:
        return "has expired"
    if days == 1:
        return "expires tomorrow"
    return f"expires in {days} days"


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def kyc_expiry_preview_view(request):
    """
    Preview KYC documents expiring within window_days (default 60).
    GET /admin/kyc/expiry-preview/?window_days=60
    Returns grouped counts and per-customer list.
    """
    window = int(request.query_params.get("window_days", 60))
    today = timezone.localdate()
    cutoff = today + timedelta(days=window)

    docs = (
        CustomerKycDocument.objects.select_related("customer__user")
        .filter(
            expiry_date__isnull=False,
            expiry_date__lte=cutoff,
            status__in=["SUBMITTED", "APPROVED"],
        )
        .order_by("expiry_date")
    )

    overdue = []
    expiring_14 = []
    expiring_30 = []
    expiring_60 = []

    rows = []
    for doc in docs:
        days_left = (doc.expiry_date - today).days
        customer_name = (
            doc.customer.user.get_full_name() if doc.customer.user_id else str(doc.customer.id)
        )
        entry = {
            "customer_id": doc.customer_id,
            "customer_name": customer_name,
            "document_type": doc.document_type,
            "expiry_date": str(doc.expiry_date),
            "days_left": days_left,
            "status_label": _days_label(days_left),
            "doc_id": doc.id,
        }
        rows.append(entry)
        if days_left < 0:
            overdue.append(entry)
        elif days_left <= 14:
            expiring_14.append(entry)
        elif days_left <= 30:
            expiring_30.append(entry)
        else:
            expiring_60.append(entry)

    return Response({
        "window_days": window,
        "total": len(rows),
        "overdue_count": len(overdue),
        "expiring_14d_count": len(expiring_14),
        "expiring_30d_count": len(expiring_30),
        "expiring_60d_count": len(expiring_60),
        "documents": rows,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def kyc_expiry_notify_view(request):
    """
    Send KYC expiry reminder emails to customers with documents expiring within window_days.
    POST /admin/kyc/expiry-notify/
    Body: { "window_days": 60, "dry_run": false }

    Emails go to customer.user.email via Django email backend (no paid gateway).
    """
    window = int(request.data.get("window_days", 60))
    dry_run = bool(request.data.get("dry_run", False))
    today = timezone.localdate()
    cutoff = today + timedelta(days=window)

    docs = (
        CustomerKycDocument.objects.select_related("customer__user")
        .filter(
            expiry_date__isnull=False,
            expiry_date__lte=cutoff,
            status__in=["SUBMITTED", "APPROVED"],
        )
        .order_by("expiry_date")
    )

    # Group by customer to send one consolidated email per customer
    customer_map: dict[int, dict] = {}
    for doc in docs:
        cid = doc.customer_id
        if cid not in customer_map:
            email = doc.customer.user.email if doc.customer.user_id else None
            name = doc.customer.user.get_full_name() if doc.customer.user_id else f"Customer #{cid}"
            customer_map[cid] = {"name": name, "email": email, "docs": []}
        days_left = (doc.expiry_date - today).days
        customer_map[cid]["docs"].append({
            "type": doc.document_type,
            "expiry": str(doc.expiry_date),
            "days_left": days_left,
        })

    sent = []
    skipped_no_email = []

    for cid, info in customer_map.items():
        if not info["email"]:
            skipped_no_email.append(cid)
            continue

        doc_lines = "\n".join(
            f"  • {d['type']}: {_days_label(d['days_left'])} ({d['expiry']})"
            for d in info["docs"]
        )
        subject = "Action Required: Your KYC Documents Are Expiring"
        body = (
            f"Dear {info['name']},\n\n"
            f"The following KYC documents on your account require renewal:\n\n"
            f"{doc_lines}\n\n"
            f"Please upload updated documents to avoid service interruption.\n\n"
            f"Regards,\nCompliance Team"
        )

        if not dry_run:
            try:
                send_mail(
                    subject,
                    body,
                    settings.DEFAULT_FROM_EMAIL,
                    [info["email"]],
                    fail_silently=True,
                )
                sent.append({"customer_id": cid, "email": info["email"]})
            except Exception:
                skipped_no_email.append(cid)
        else:
            sent.append({"customer_id": cid, "email": info["email"], "dry_run": True})

    return Response({
        "window_days": window,
        "dry_run": dry_run,
        "customers_notified": len(sent),
        "skipped_no_email": len(skipped_no_email),
        "results": sent,
    })
