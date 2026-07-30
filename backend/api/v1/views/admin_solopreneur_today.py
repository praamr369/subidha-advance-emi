"""
Solopreneur Command Center — "Today" view.

Single GET endpoint returning a 30s-cached aggregate of everything
the solo operator needs to start (or check on) the day.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.db import models
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin

logger = logging.getLogger(__name__)

CACHE_KEY_PREFIX = "solopreneur:today"
CACHE_TTL_SECONDS = 30
MONEY_ZERO = Decimal("0.00")


def _money(v) -> str:
    return f"{Decimal(str(v or 0)).quantize(MONEY_ZERO)}"


def build_solopreneur_today_payload() -> dict:
    """
    Shared service function — also used by Phase 6 management commands
    (solopreneur_digest, solopreneur_healthcheck).
    """
    today = timezone.localdate()
    yesterday = today - timedelta(days=1)

    # ── 1. Money Today ────────────────────────────────────────────────
    from subscriptions.models import Emi, EmiStatus, Payment

    emis_due_today = Emi.objects.filter(
        due_date=today, status=EmiStatus.PENDING
    )
    emis_due_today_count = emis_due_today.count()
    emis_due_today_total = emis_due_today.aggregate(
        total=models.Sum("amount")
    )["total"] or MONEY_ZERO

    emis_overdue = Emi.objects.filter(
        due_date__lt=today, status=EmiStatus.PENDING
    )
    emis_overdue_count = emis_overdue.count()
    emis_overdue_total = emis_overdue.aggregate(
        total=models.Sum("amount")
    )["total"] or MONEY_ZERO

    from billing.models import DirectSale, DirectSaleStatus, ReceiptDocument, BillingDocumentStatus

    ds_outstanding_qs = DirectSale.objects.filter(
        balance_total__gt=MONEY_ZERO,
        status=DirectSaleStatus.INVOICED,
    )
    ds_outstanding_count = ds_outstanding_qs.count()
    ds_outstanding_total = ds_outstanding_qs.aggregate(
        total=models.Sum("balance_total")
    )["total"] or MONEY_ZERO

    # Yesterday's collections (all sources: EMI, Direct Sale, Advance)
    yesterday_payments_total = ReceiptDocument.objects.filter(
        receipt_date=yesterday,
        status=BillingDocumentStatus.POSTED,
    ).aggregate(total=models.Sum("amount"))["total"] or MONEY_ZERO

    money_today = {
        "emis_due_today_count": emis_due_today_count,
        "emis_due_today_total": _money(emis_due_today_total),
        "emis_overdue_count": emis_overdue_count,
        "emis_overdue_total": _money(emis_overdue_total),
        "ds_outstanding_count": ds_outstanding_count,
        "ds_outstanding_total": _money(ds_outstanding_total),
        "yesterday_collections_total": _money(yesterday_payments_total),
    }

    # ── 2. Cash Position ──────────────────────────────────────────────
    cash_position = []
    try:
        from accounting.models import FinanceAccount

        accounts = FinanceAccount.objects.filter(
            is_active=True, is_real_settlement_account=True
        ).order_by("name")
        for acct in accounts:
            cash_position.append({
                "id": acct.id,
                "name": acct.name,
                "kind": acct.kind,
                "opening_balance": _money(acct.opening_balance),
            })
    except Exception:
        logger.exception("Failed to load finance account cash position")

    # ── 3. Action Queue ───────────────────────────────────────────────
    action_queue = []

    # 3a. Pending subscription requests
    from subscriptions.models import SubscriptionRequest, SubscriptionRequestStatus

    pending_sub_requests = SubscriptionRequest.objects.filter(
        status=SubscriptionRequestStatus.SUBMITTED
    ).count()
    if pending_sub_requests > 0:
        action_queue.append({
            "label": f"{pending_sub_requests} pending subscription request(s)",
            "href": "/admin/requests/product-requests",
            "severity": "amber",
            "count": pending_sub_requests,
            "category": "requests",
        })

    # 3b. Pending KYC
    from subscriptions.models import Customer, KycStatus

    pending_kyc = Customer.objects.filter(
        kyc_status__in=[KycStatus.PENDING, KycStatus.SUBMITTED]
    ).count()
    if pending_kyc > 0:
        action_queue.append({
            "label": f"{pending_kyc} customer(s) awaiting KYC review",
            "href": "/admin/customers?kyc_status=PENDING",
            "severity": "amber",
            "count": pending_kyc,
            "category": "kyc",
        })

    # 3c. Deliveries pending dispatch
    from subscriptions.models import DeliveryStatus
    from subscriptions.services.delivery_service import get_delivery_queryset

    deliveries_pending = (
        get_delivery_queryset()
        .filter(
            status__in=[DeliveryStatus.PENDING, DeliveryStatus.SCHEDULED],
        )
        .filter(
            models.Q(scheduled_date__lte=today) | models.Q(scheduled_date__isnull=True)
        )
        .count()
    )
    if deliveries_pending > 0:
        action_queue.append({
            "label": f"{deliveries_pending} delivery(ies) to ship today",
            "href": "/admin/logistics",
            "severity": "amber" if deliveries_pending < 5 else "red",
            "count": deliveries_pending,
            "category": "deliveries",
        })

    # 3d. Service desk cases with finance or stock pending
    from service_desk.models import (
        ServiceDeskCase, ServiceDeskCaseStatus,
        ServiceDeskFinanceStatus, ServiceDeskStockStatus,
    )

    sd_pending = ServiceDeskCase.objects.exclude(
        status__in=[ServiceDeskCaseStatus.CLOSED, ServiceDeskCaseStatus.CANCELLED, ServiceDeskCaseStatus.REJECTED]
    ).filter(
        models.Q(finance_status=ServiceDeskFinanceStatus.PENDING)
        | models.Q(stock_status=ServiceDeskStockStatus.PENDING)
    ).count()
    if sd_pending > 0:
        action_queue.append({
            "label": f"{sd_pending} service-desk case(s) need attention",
            "href": "/admin/service-desk",
            "severity": "red",
            "count": sd_pending,
            "category": "service_desk",
        })

    # 3e. Low stock alerts
    try:
        from inventory.services.stock_service import build_stock_summary

        stock_summary = build_stock_summary()
        low_stock_count = sum(
            1 for row in stock_summary.get("results", [])
            if row.get("is_below_reorder")
        )
        if low_stock_count > 0:
            action_queue.append({
                "label": f"{low_stock_count} item(s) below reorder level",
                "href": "/admin/inventory/stock-on-hand",
                "severity": "amber",
                "count": low_stock_count,
                "category": "inventory",
            })
    except Exception:
        logger.exception("Failed to compute low-stock count for Today view")

    # 3f. CRM follow-ups due today
    try:
        from crm.models import FollowUpTask, FollowUpTaskStatus

        followups_due = FollowUpTask.objects.filter(
            status=FollowUpTaskStatus.OPEN,
            due_at__date__lte=today,
        ).count()
        if followups_due > 0:
            action_queue.append({
                "label": f"{followups_due} CRM follow-up(s) due",
                "href": "/admin/crm/follow-ups",
                "severity": "amber",
                "count": followups_due,
                "category": "crm",
            })
    except Exception:
        logger.exception("Failed to count CRM follow-ups for Today view")

    # 3g. Reminders due today
    try:
        from reminders.models import PaymentReminder, ReminderStatus

        reminders_due = PaymentReminder.objects.filter(
            due_date__lte=today,
            status__in=[ReminderStatus.DRAFT, ReminderStatus.PENDING, ReminderStatus.SCHEDULED],
        ).count()
        if reminders_due > 0:
            action_queue.append({
                "label": f"{reminders_due} payment reminder(s) to dispatch",
                "href": "/admin/reminders",
                "severity": "amber",
                "count": reminders_due,
                "category": "reminders",
            })
    except Exception:
        logger.exception("Failed to count reminders for Today view")

    # 3h. Overdue EMIs (distinct from due today — these are blocked money)
    if emis_overdue_count > 0:
        action_queue.append({
            "label": f"{emis_overdue_count} overdue EMI(s) — ₹{_money(emis_overdue_total)}",
            "href": "/admin/outstandings",
            "severity": "red",
            "count": emis_overdue_count,
            "category": "collections",
        })

    # ── 4. Health ─────────────────────────────────────────────────────
    
    # We temporarily skip checking last close date as there is no specific
    # SOLOPRENEUR_DAILY_CLOSE AuditLog action type yet.
    health = {
        "last_daily_close_date": None,
        "is_balanced": None,  # filled below
    }

    try:
        ledger_health = cache.get("solopreneur:ledger-health")
        if ledger_health:
            health["is_balanced"] = ledger_health.get("is_balanced")
        else:
            from accounting.services.trial_balance_check_service import build_trial_balance_check

            tb = build_trial_balance_check(
                as_of=today,
                period={"year": today.year, "month": today.month},
            )
            health["is_balanced"] = tb.get("is_balanced", False)
    except Exception:
        logger.exception("Failed to check ledger health for Today view")

    if health.get("is_balanced") is False:
        action_queue.append({
            "label": "Ledger imbalance detected — run daily close",
            "href": "/admin/finance/daily-close",
            "severity": "red",
            "count": 1,
            "category": "accounting",
        })

    # Sort action queue: red first, then amber, then sky
    severity_order = {"red": 0, "amber": 1, "sky": 2}
    action_queue.sort(key=lambda x: severity_order.get(x.get("severity", "sky"), 3))

    return {
        "generated_at": timezone.now().isoformat(),
        "date": today.isoformat(),
        "money_today": money_today,
        "cash_position": cash_position,
        "action_queue": action_queue,
        "action_queue_count": len(action_queue),
        "health": health,
    }


class AdminSolopreneurTodayView(APIView):
    """
    GET /api/v1/admin/solopreneur/today/

    30s-cached daily command-center payload.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        today = timezone.localdate()
        cache_key = f"{CACHE_KEY_PREFIX}:{today.isoformat()}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        payload = build_solopreneur_today_payload()
        cache.set(cache_key, payload, CACHE_TTL_SECONDS)
        return Response(payload)
