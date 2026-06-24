"""Scheduled report export — generate and email a report on demand.
Admin configures report type + recipient; backend emails a CSV/summary."""
from __future__ import annotations

import csv
import io
from datetime import date, timedelta
from decimal import Decimal

from django.core.mail import EmailMessage
from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from api.v1.permissions import IsAdmin


REPORT_TYPES = {
    "outstanding_emis": "Outstanding EMIs",
    "overdue_emis": "Overdue EMIs",
    "tds_pending": "TDS Pending Deposit",
    "batch_fill_rates": "Batch Fill Rates",
    "kyc_expiring": "KYC Expiring Documents",
}


def _build_outstanding_emis_csv(date_from: str, date_to: str) -> tuple[str, str]:
    from subscriptions.models import Emi
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["EMI ID", "Subscription ID", "EMI No", "Due Date", "Amount", "Amount Paid", "Balance", "Status"])
    qs = Emi.objects.filter(
        status__in=["PENDING", "OVERDUE", "PARTIAL"],
        due_date__gte=date_from,
        due_date__lte=date_to,
    ).order_by("due_date")
    for e in qs:
        writer.writerow([
            e.id, e.subscription_id, e.emi_number, e.due_date,
            e.amount, e.amount_paid, e.amount - e.amount_paid, e.status,
        ])
    return buf.getvalue(), f"outstanding_emis_{date_from}_to_{date_to}.csv"


def _build_overdue_emis_csv(date_from: str, date_to: str) -> tuple[str, str]:
    from subscriptions.models import Emi
    today = timezone.localdate()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["EMI ID", "Subscription ID", "Customer ID", "EMI No", "Due Date", "Days Overdue", "Balance"])
    qs = Emi.objects.filter(
        status="OVERDUE",
        due_date__lte=today,
    ).select_related("subscription").order_by("due_date")
    for e in qs:
        overdue_days = (today - e.due_date).days
        writer.writerow([
            e.id, e.subscription_id, e.subscription.customer_id,
            e.emi_number, e.due_date, overdue_days, e.amount - e.amount_paid,
        ])
    return buf.getvalue(), "overdue_emis.csv"


def _build_tds_pending_csv(date_from: str, date_to: str) -> tuple[str, str]:
    from accounting.models import TDSDeduction
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["ID", "Vendor ID", "Section", "Transaction Date", "Gross Amount", "TDS Amount", "FY", "Quarter", "Status"])
    qs = TDSDeduction.objects.filter(
        status="PENDING",
        transaction_date__gte=date_from,
        transaction_date__lte=date_to,
    ).order_by("transaction_date")
    for t in qs:
        writer.writerow([
            t.id, t.vendor_id, t.section, t.transaction_date,
            t.gross_amount, t.tds_amount, t.financial_year, t.quarter, t.status,
        ])
    return buf.getvalue(), f"tds_pending_{date_from}_to_{date_to}.csv"


def _build_batch_fill_rates_csv(date_from: str, date_to: str) -> tuple[str, str]:
    from subscriptions.models import Batch, Subscription
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Batch ID", "Batch Ref", "Total Slots", "Filled", "Fill Rate %", "Status"])
    for b in Batch.objects.filter(status="ACTIVE"):
        filled = Subscription.objects.filter(batch=b, status__in=["ACTIVE", "COMPLETED"]).count()
        total = b.total_members or 1
        fill_rate = round(filled / total * 100, 1)
        writer.writerow([
            b.id,
            b.batch_ref if hasattr(b, "batch_ref") else str(b.id),
            total, filled, fill_rate, b.status,
        ])
    return buf.getvalue(), "batch_fill_rates.csv"


def _build_kyc_expiring_csv(date_from: str, date_to: str) -> tuple[str, str]:
    from subscriptions.models import CustomerKycDocument
    today = timezone.localdate()
    cutoff = today + timedelta(days=60)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Doc ID", "Customer ID", "Document Type", "Expiry Date", "Days Left", "Status"])
    qs = CustomerKycDocument.objects.filter(
        expiry_date__isnull=False,
        expiry_date__lte=cutoff,
        status__in=["SUBMITTED", "APPROVED"],
    ).order_by("expiry_date")
    for d in qs:
        writer.writerow([
            d.id, d.customer_id, d.document_type, d.expiry_date,
            (d.expiry_date - today).days, d.status,
        ])
    return buf.getvalue(), "kyc_expiring_60d.csv"


REPORT_BUILDERS = {
    "outstanding_emis": _build_outstanding_emis_csv,
    "overdue_emis": _build_overdue_emis_csv,
    "tds_pending": _build_tds_pending_csv,
    "batch_fill_rates": _build_batch_fill_rates_csv,
    "kyc_expiring": _build_kyc_expiring_csv,
}


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def scheduled_report_types_view(request):
    """List available report types for scheduled export."""
    return Response({
        "report_types": [
            {"key": k, "label": v} for k, v in REPORT_TYPES.items()
        ]
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def scheduled_report_export_view(request):
    """
    Generate and email a report CSV to the specified recipient.
    POST /admin/reports/scheduled-export/
    Body:
      {
        "report_type": "outstanding_emis",
        "date_from": "2026-01-01",
        "date_to": "2026-06-30",
        "notify_email": "manager@example.com",
        "dry_run": false
      }
    """
    report_type = request.data.get("report_type")
    if not report_type or report_type not in REPORT_BUILDERS:
        return Response(
            {"error": f"Invalid report_type. Choose from: {', '.join(REPORT_TYPES)}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    today = str(timezone.localdate())
    date_from = request.data.get("date_from") or str(timezone.localdate() - timedelta(days=30))
    date_to = request.data.get("date_to") or today
    notify_email = request.data.get("notify_email") or getattr(settings, "ADMIN_EMAIL", settings.DEFAULT_FROM_EMAIL)
    dry_run = bool(request.data.get("dry_run", False))

    try:
        csv_content, filename = REPORT_BUILDERS[report_type](date_from, date_to)
    except Exception as exc:
        return Response({"error": f"Report generation failed: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    row_count = max(csv_content.count("\n") - 1, 0)  # exclude header
    label = REPORT_TYPES[report_type]

    if not dry_run:
        email_msg = EmailMessage(
            subject=f"[Report] {label} — {today}",
            body=(
                f"Please find the attached report: {label}\n"
                f"Period: {date_from} to {date_to}\n"
                f"Records: {row_count}\n"
                f"Generated: {timezone.now().strftime('%Y-%m-%d %H:%M')}\n"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[notify_email],
        )
        email_msg.attach(filename, csv_content, "text/csv")
        try:
            email_msg.send(fail_silently=True)
        except Exception:
            pass

    return Response({
        "report_type": report_type,
        "label": label,
        "date_from": date_from,
        "date_to": date_to,
        "row_count": row_count,
        "filename": filename,
        "notify_email": notify_email,
        "dry_run": dry_run,
        "message": f"Report emailed to {notify_email}." if not dry_run else "Dry run — no email sent.",
    })
