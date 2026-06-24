"""Batch performance threshold alerts — email admin when fill rate, payment discipline,
or draw completion falls below configured thresholds."""
from __future__ import annotations

from django.core.mail import send_mail
from django.conf import settings
from django.db.models import Count, Q, F
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from api.v1.permissions import IsAdmin
from subscriptions.models import Batch, Subscription, Emi, LuckyDraw


DEFAULT_FILL_RATE_THRESHOLD = 80        # % slots filled
DEFAULT_PAYMENT_DISCIPLINE_THRESHOLD = 75  # % EMIs paid on time
DEFAULT_DRAW_COMPLETION_THRESHOLD = 90  # % lucky draws conducted vs expected

# Batches in active lifecycle stages
ACTIVE_STATUSES = ["OPEN", "FULL", "READY_TO_LOCK", "LOCKED", "DRAW_IN_PROGRESS", "DRAW_COMMITTED", "DRAW_COMPLETED"]


def _batch_kpis(batch: Batch) -> dict:
    total_slots = batch.total_slots or 1
    filled = Subscription.objects.filter(batch=batch).count()
    fill_rate = round(filled / total_slots * 100, 1)

    total_emis = Emi.objects.filter(subscription__batch=batch).count()
    paid_emis = Emi.objects.filter(subscription__batch=batch, status="PAID").count()
    payment_discipline = round(paid_emis / max(total_emis, 1) * 100, 1)

    expected_draws = batch.duration_months or 0
    conducted_draws = LuckyDraw.objects.filter(batch=batch).count()
    draw_completion = round(conducted_draws / max(expected_draws, 1) * 100, 1)

    return {
        "batch_id": batch.id,
        "batch_ref": batch.batch_code,
        "fill_rate": fill_rate,
        "filled_slots": filled,
        "total_slots": total_slots,
        "payment_discipline": payment_discipline,
        "paid_emis": paid_emis,
        "total_emis": total_emis,
        "draw_completion": draw_completion,
        "conducted_draws": conducted_draws,
        "expected_draws": expected_draws,
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def batch_performance_check_view(request):
    """
    Check all ACTIVE batches against alert thresholds.
    GET /admin/batches/performance-check/
    Query params:
      fill_rate_threshold=80
      payment_discipline_threshold=75
      draw_completion_threshold=90
    """
    fill_threshold = float(request.query_params.get("fill_rate_threshold", DEFAULT_FILL_RATE_THRESHOLD))
    payment_threshold = float(request.query_params.get("payment_discipline_threshold", DEFAULT_PAYMENT_DISCIPLINE_THRESHOLD))
    draw_threshold = float(request.query_params.get("draw_completion_threshold", DEFAULT_DRAW_COMPLETION_THRESHOLD))

    active_batches = Batch.objects.filter(status__in=ACTIVE_STATUSES)
    alerts = []
    healthy = []

    for batch in active_batches:
        kpi = _batch_kpis(batch)
        batch_alerts = []
        if kpi["fill_rate"] < fill_threshold:
            batch_alerts.append({
                "metric": "fill_rate",
                "value": kpi["fill_rate"],
                "threshold": fill_threshold,
                "message": f"Fill rate {kpi['fill_rate']}% is below {fill_threshold}%",
            })
        if kpi["payment_discipline"] < payment_threshold:
            batch_alerts.append({
                "metric": "payment_discipline",
                "value": kpi["payment_discipline"],
                "threshold": payment_threshold,
                "message": f"Payment discipline {kpi['payment_discipline']}% is below {payment_threshold}%",
            })
        if kpi["draw_completion"] < draw_threshold and kpi["expected_draws"] > 0:
            batch_alerts.append({
                "metric": "draw_completion",
                "value": kpi["draw_completion"],
                "threshold": draw_threshold,
                "message": f"Draw completion {kpi['draw_completion']}% is below {draw_threshold}%",
            })

        if batch_alerts:
            alerts.append({**kpi, "alerts": batch_alerts})
        else:
            healthy.append(kpi)

    return Response({
        "checked_at": timezone.now().isoformat(),
        "thresholds": {
            "fill_rate": fill_threshold,
            "payment_discipline": payment_threshold,
            "draw_completion": draw_threshold,
        },
        "total_active_batches": len(alerts) + len(healthy),
        "batches_with_alerts": len(alerts),
        "batches_healthy": len(healthy),
        "alerts": alerts,
        "healthy": healthy,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def batch_performance_alert_notify_view(request):
    """
    Check batches and email alert summary to admin if any breach thresholds.
    POST /admin/batches/performance-alert/
    Body:
      {
        "fill_rate_threshold": 80,
        "payment_discipline_threshold": 75,
        "draw_completion_threshold": 90,
        "notify_email": "admin@example.com",
        "dry_run": false
      }
    """
    fill_threshold = float(request.data.get("fill_rate_threshold", DEFAULT_FILL_RATE_THRESHOLD))
    payment_threshold = float(request.data.get("payment_discipline_threshold", DEFAULT_PAYMENT_DISCIPLINE_THRESHOLD))
    draw_threshold = float(request.data.get("draw_completion_threshold", DEFAULT_DRAW_COMPLETION_THRESHOLD))
    notify_email = request.data.get("notify_email") or getattr(settings, "ADMIN_EMAIL", settings.DEFAULT_FROM_EMAIL)
    dry_run = bool(request.data.get("dry_run", False))

    active_batches = Batch.objects.filter(status__in=ACTIVE_STATUSES)
    alert_batches = []

    for batch in active_batches:
        kpi = _batch_kpis(batch)
        batch_alerts = []
        if kpi["fill_rate"] < fill_threshold:
            batch_alerts.append(f"  • Fill rate: {kpi['fill_rate']}% < {fill_threshold}%")
        if kpi["payment_discipline"] < payment_threshold:
            batch_alerts.append(f"  • Payment discipline: {kpi['payment_discipline']}% < {payment_threshold}%")
        if kpi["draw_completion"] < draw_threshold and kpi["expected_draws"] > 0:
            batch_alerts.append(f"  • Draw completion: {kpi['draw_completion']}% < {draw_threshold}%")
        if batch_alerts:
            alert_batches.append((kpi, batch_alerts))

    if not alert_batches:
        return Response({
            "message": "All batches are within thresholds. No alert sent.",
            "dry_run": dry_run,
            "batches_checked": active_batches.count(),
        })

    lines = []
    for kpi, msgs in alert_batches:
        lines.append(f"Batch {kpi['batch_ref']} (ID: {kpi['batch_id']}):")
        lines.extend(msgs)
        lines.append("")

    body = (
        f"Batch Performance Alert — {timezone.now().strftime('%Y-%m-%d %H:%M')}\n\n"
        f"{len(alert_batches)} batch(es) below threshold:\n\n"
        + "\n".join(lines)
        + f"\n\nThresholds — Fill: {fill_threshold}%, Payment: {payment_threshold}%, Draws: {draw_threshold}%\n"
        "Please review and take corrective action."
    )

    if not dry_run:
        send_mail(
            subject=f"[ALERT] {len(alert_batches)} Batch(es) Below Performance Threshold",
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[notify_email],
            fail_silently=True,
        )

    return Response({
        "dry_run": dry_run,
        "email": notify_email,
        "batches_with_alerts": len(alert_batches),
        "alert_summary": [kpi["batch_ref"] for kpi, _ in alert_batches],
        "message": "Alert email sent." if not dry_run else "Dry run — no email sent.",
    })
