from __future__ import annotations

try:
    from celery import shared_task
except ModuleNotFoundError:  # pragma: no cover - local/test environments without Celery
    class _FallbackTaskRequest:
        id = ""

    class _FallbackTaskSelf:
        request = _FallbackTaskRequest()

    def shared_task(*_args, **_kwargs):
        bind = bool(_kwargs.get("bind"))

        def decorator(func):
            if not bind:
                return func

            def _wrapped(*args, **kwargs):
                if args:
                    return func(*args, **kwargs)
                return func(_FallbackTaskSelf(), **kwargs)

            return _wrapped

        return decorator
from django.utils import timezone

from reminders.services.emi_reminder_jobs import (
    generate_emi_due_reminders_for_date,
    generate_emi_overdue_reminders,
)
from reminders.services.rent_reminder_generation import generate_rent_due_reminders
from system_jobs.models import SystemJobStatus
from system_jobs.services.broadcast import notify_all_active_admins
from system_jobs.services.job_runner import run_idempotent_job
from system_jobs.services.notifications import emit_notification, notify_admins_of_job


@shared_task(name="system_jobs.tasks.daily_emi_due_reminders", bind=True)
def daily_emi_due_reminders(self):
    today = timezone.localdate()
    key = f"emi-due:{today.isoformat()}"

    def body(log):
        summary = generate_emi_due_reminders_for_date(on_date=today, performed_by=None)
        if summary["created_count"] > 0:
            notify_all_active_admins(
                module="billing",
                title="EMI due reminders generated",
                body=f"Created {summary['created_count']} internal EMI due reminders for {today}.",
                dedupe_prefix=f"{key}:notify",
                payload=summary,
                source_job=log,
            )
        return summary

    log, meta = run_idempotent_job(
        idempotency_key=key,
        job_type="daily_emi_due_reminders",
        celery_task_id=getattr(self.request, "id", "") or "",
        body=body,
    )
    if meta.get("skipped"):
        return meta
    if log.status == SystemJobStatus.FAILED:
        notify_admins_of_job(
            job=log,
            title="EMI due reminder job failed",
            body=log.failure_reason[:2000],
            module="system",
        )
    return meta


@shared_task(name="system_jobs.tasks.daily_emi_overdue_reminders", bind=True)
def daily_emi_overdue_reminders(self):
    today = timezone.localdate()
    key = f"emi-overdue:{today.isoformat()}"

    def body(log):
        summary = generate_emi_overdue_reminders(as_of=today, performed_by=None)
        if summary["created_count"] > 0:
            notify_all_active_admins(
                module="billing",
                title="Overdue EMI reminders generated",
                body=f"Created {summary['created_count']} overdue EMI reminders as of {today}.",
                dedupe_prefix=f"{key}:notify",
                payload=summary,
                source_job=log,
            )
        return summary

    log, meta = run_idempotent_job(
        idempotency_key=key,
        job_type="daily_emi_overdue_reminders",
        celery_task_id=getattr(self.request, "id", "") or "",
        body=body,
    )
    if meta.get("skipped"):
        return meta
    if log.status == SystemJobStatus.FAILED:
        notify_admins_of_job(
            job=log,
            title="Overdue EMI reminder job failed",
            body=log.failure_reason[:2000],
            module="system",
        )
    return meta


@shared_task(name="system_jobs.tasks.daily_rent_due_reminders", bind=True)
def daily_rent_due_reminders(self):
    today = timezone.localdate()
    key = f"rent-due:{today.isoformat()}"

    def body(log):
        summary = generate_rent_due_reminders(as_of=today, performed_by=None)
        if summary["created_count"] > 0:
            notify_all_active_admins(
                module="rent",
                title="Rent / lease due reminders generated",
                body=f"Created {summary['created_count']} internal rent reminders.",
                dedupe_prefix=f"{key}:notify",
                payload=summary,
                source_job=log,
            )
        return summary

    log, meta = run_idempotent_job(
        idempotency_key=key,
        job_type="daily_rent_due_reminders",
        celery_task_id=getattr(self.request, "id", "") or "",
        body=body,
    )
    if meta.get("skipped"):
        return meta
    if log.status == SystemJobStatus.FAILED:
        notify_admins_of_job(job=log, title="Rent reminder job failed", body=log.failure_reason[:2000], module="system")
    return meta


@shared_task(name="system_jobs.tasks.daily_accounting_health_check", bind=True)
def daily_accounting_health_check(self):
    today = timezone.localdate()
    key = f"acct-health:{today.isoformat()}"

    def body(log):
        from accounting.services.control_validation_service import validate_financial_period_balance

        payload = validate_financial_period_balance(date_from=today.replace(day=1), date_to=today)
        warn = int(payload.get("unbalanced_group_count") or 0)
        if warn > 0:
            notify_all_active_admins(
                module="accounting",
                title="Accounting health warnings",
                body=f"Unbalanced journal groups detected in period: {warn}.",
                dedupe_prefix=f"{key}:notify",
                payload=payload,
                source_job=log,
            )
        return payload

    log, meta = run_idempotent_job(
        idempotency_key=key,
        job_type="daily_accounting_health_check",
        celery_task_id=getattr(self.request, "id", "") or "",
        body=body,
    )
    if meta.get("skipped"):
        return meta
    if log.status == SystemJobStatus.FAILED:
        notify_admins_of_job(job=log, title="Accounting health job failed", body=log.failure_reason[:2000], module="system")
    return meta


@shared_task(name="system_jobs.tasks.daily_inventory_reorder_check", bind=True)
def daily_inventory_reorder_check(self):
    today = timezone.localdate()
    key = f"inv-reorder:{today.isoformat()}"

    def body(log):
        from inventory.services.demand_service import get_purchase_suggestions

        suggestions = get_purchase_suggestions(product_ids=None)
        per_source_created = 0
        for item in suggestions[:200]:
            product_id = item.get("product_id")
            if not product_id:
                continue
            dedupe_key = f"{key}:product:{product_id}"
            _notification, created = emit_notification(
                module="inventory",
                title="Stock low alert",
                body=f"{item.get('product_name') or 'Product'} requires review ({item.get('trigger') or 'LOW_STOCK'}).",
                payload={
                    "product_id": product_id,
                    "product_code": item.get("product_code"),
                    "product_name": item.get("product_name"),
                    "trigger": item.get("trigger"),
                    "physical_stock": str(item.get("physical_stock") or ""),
                    "available_stock": str(item.get("available_stock") or ""),
                    "low_stock_threshold": str(item.get("low_stock_threshold") or ""),
                    "suggested_order_quantity": str(item.get("suggested_order_quantity") or ""),
                },
                dedupe_key=dedupe_key,
                source_job=log,
            )
            if created:
                per_source_created += 1
        if suggestions:
            notify_all_active_admins(
                module="inventory",
                title="Inventory reorder suggestions",
                body=f"{len(suggestions)} product(s) need review based on stock and demand.",
                dedupe_prefix=f"{key}:notify",
                payload={"count": len(suggestions), "per_source_alerts_created": per_source_created},
                source_job=log,
            )
        return {"count": len(suggestions), "per_source_alerts_created": per_source_created}

    log, meta = run_idempotent_job(
        idempotency_key=key,
        job_type="daily_inventory_reorder_check",
        celery_task_id=getattr(self.request, "id", "") or "",
        body=body,
    )
    if meta.get("skipped"):
        return meta
    if log.status == SystemJobStatus.FAILED:
        notify_admins_of_job(job=log, title="Inventory reorder job failed", body=log.failure_reason[:2000], module="system")
    return meta


@shared_task(name="system_jobs.tasks.daily_report_snapshot", bind=True)
def daily_report_snapshot(self):
    today = timezone.localdate()
    key = f"report-snap:{today.isoformat()}"

    def body(log):
        from inventory.services.stock_service import build_stock_summary

        snap = build_stock_summary()
        return {"as_of": today.isoformat(), "inventory_items": snap.get("count", 0)}

    log, meta = run_idempotent_job(
        idempotency_key=key,
        job_type="daily_report_snapshot",
        celery_task_id=getattr(self.request, "id", "") or "",
        body=body,
    )
    if meta.get("skipped"):
        return meta
    if log.status == SystemJobStatus.FAILED:
        notify_admins_of_job(job=log, title="Report snapshot job failed", body=log.failure_reason[:2000], module="reports")
    return meta


@shared_task(name="system_jobs.tasks.nightly_failed_pdf_regeneration_scan", bind=True)
def nightly_failed_pdf_regeneration_scan(self):
    day = timezone.localdate()
    key = f"pdf-regen:{day.isoformat()}"

    def body(_log):
        # Placeholder: discover failed PDF artifacts when a durable queue exists.
        return {"candidates": 0, "note": "No automated PDF regeneration candidates in this build."}

    log, meta = run_idempotent_job(
        idempotency_key=key,
        job_type="nightly_failed_pdf_regeneration_scan",
        celery_task_id=getattr(self.request, "id", "") or "",
        body=body,
    )
    if meta.get("skipped"):
        return meta
    if log.status == SystemJobStatus.FAILED:
        notify_admins_of_job(job=log, title="PDF regeneration scan failed", body=log.failure_reason[:2000], module="system")
    return meta
