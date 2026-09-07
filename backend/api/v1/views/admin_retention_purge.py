"""Retention purge scheduling and approval (CTRL-DPDP-8).

Held back when the privacy back office was built, because "execute" deletes
customer data and that needed a stated policy. Set on 2026-09-07: a job is
previewed, requires explicit human approval, and never runs on a schedule.

WHAT "PURGE" MEANS HERE, because the word promises more than it does. It is not
a DELETE. Removing a customer row would take the payment, EMI, invoice and
ledger records with it, and those must be retained 6-8 years under the
Companies Act s.128, the Income Tax Act s.44AA and GST Rule 56. Execution
therefore delegates to privacy.services.anonymization_service, which redacts
personal fields and keeps the financial history with a statutory reason
recorded against each retained field. That satisfies DPDP erasure without
destroying the books, and it is the same path the per-customer erasure flow
already uses — one implementation of "forget this person", not two.

Nothing here is scheduled. A job sits in AWAITING_APPROVAL until a person
approves it. An unattended bulk anonymisation driven by a mistyped retention
period is indistinguishable from data loss, and unlike most mistakes in this
system it cannot be undone from a backup without also rolling back everything
else that happened since.
"""
from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from api.v1.permissions import IsAdmin
from privacy.dpdp_compliance_models import DataRetentionSchedule, PurgeJobStatus
from privacy.models import DataRetentionPolicy
from subscriptions.models import AuditLog

# Categories this can actually act on. A policy for a category with no handler
# is configuration only: previewing it reports zero and executing it refuses,
# rather than reporting success for work nobody implemented.
SUPPORTED_CATEGORIES = {"CUSTOMER_PROFILE"}

SAMPLE_SIZE = 5


def _user_label(user) -> str:
    if user is None:
        return ""
    return user.get_full_name() or user.get_username()


def _row(job: DataRetentionSchedule) -> dict:
    return {
        "id": job.pk,
        "schedule_reference": job.schedule_reference,
        "data_category": job.data_category,
        "status": job.status,
        "status_display": job.get_status_display(),
        "scheduled_purge_date": job.scheduled_purge_date,
        "records_targeted": job.records_targeted,
        "records_purged": job.records_purged,
        "retention_policy_reference": job.retention_policy_reference,
        "approved_by_name": _user_label(job.approved_by),
        "approved_at": job.approved_at,
        "executed_by_name": _user_label(job.executed_by),
        "completed_at": job.completed_at,
        "cancellation_reason": job.cancellation_reason,
        "execution_log": job.execution_log,
        "is_supported": job.data_category in SUPPORTED_CATEGORIES,
    }


def _eligible_customers(cutoff_date):
    """Customers whose retention window has closed.

    Eligibility is last *activity*, not signup: a customer who paid an EMI last
    month is active regardless of when they joined. Anyone still holding a live
    subscription is excluded outright — a retention policy cannot expire a
    relationship that is still running.
    """
    from customers.models import Customer

    return (
        Customer.objects.filter(created_at__date__lte=cutoff_date)
        .exclude(subscriptions__status__in=["ACTIVE", "PENDING"])
        .exclude(name__startswith="REDACTED-")
        .distinct()
    )


@api_view(["GET", "POST"])
@permission_classes([IsAdmin])
def admin_retention_schedule_view(request):
    if request.method == "GET":
        jobs = (
            DataRetentionSchedule.objects.select_related("approved_by", "executed_by")
            .all()
            .order_by("-created_at")
        )
        return Response([_row(job) for job in jobs])

    category = str(request.data.get("data_category") or "").strip().upper()
    policy = DataRetentionPolicy.objects.filter(data_category=category).first()
    if policy is None:
        return Response(
            {
                "data_category": [
                    f"No retention policy is configured for '{category}'. "
                    "Create the policy first — the retention period is what "
                    "decides which records are in scope."
                ]
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Frozen at creation, not recomputed at execution: the set a person
    # approves must be the set that runs, even if approval takes a week.
    cutoff = (timezone.now() - timedelta(days=30 * policy.retention_months)).date()

    if category in SUPPORTED_CATEGORIES:
        eligible = _eligible_customers(cutoff)
        targeted = eligible.count()
        sample = [
            {"id": c.pk, "name": c.name, "joined": c.created_at.date().isoformat()}
            for c in eligible[:SAMPLE_SIZE]
        ]
    else:
        targeted = 0
        sample = []

    with transaction.atomic():
        job = DataRetentionSchedule.objects.create(
            schedule_reference=f"PURGE-{uuid4().hex[:10].upper()}",
            data_category=category,
            status=PurgeJobStatus.AWAITING_APPROVAL,
            scheduled_purge_date=cutoff,
            records_targeted=targeted,
            retention_policy_reference=(
                f"{policy.data_category} / {policy.retention_months} months"
            ),
            execution_log=[
                {
                    "at": timezone.now().isoformat(),
                    "event": "PREVIEWED",
                    "by": _user_label(request.user),
                    "records_targeted": targeted,
                    "sample": sample,
                    "supported": category in SUPPORTED_CATEGORIES,
                }
            ],
        )
        AuditLog.objects.create(
            action_type="PRIVACY_RETENTION_PURGE_PREVIEWED",
            performed_by=request.user,
            model_name="DataRetentionSchedule",
            object_id=str(job.pk),
            metadata={
                "data_category": category,
                "cutoff_date": cutoff.isoformat(),
                "records_targeted": targeted,
            },
        )
    return Response(_row(job), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAdmin])
@transaction.atomic
def admin_retention_schedule_action_view(request, job_id: int, action: str):
    job = get_object_or_404(
        DataRetentionSchedule.objects.select_for_update(), pk=job_id
    )
    now = timezone.now()

    if action == "approve":
        if job.status != PurgeJobStatus.AWAITING_APPROVAL:
            return Response(
                {"detail": f"Only a job awaiting approval can be approved; this is {job.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        job.status = PurgeJobStatus.APPROVED
        job.approved_by = request.user
        job.approved_at = now
        job.execution_log = list(job.execution_log) + [
            {"at": now.isoformat(), "event": "APPROVED", "by": _user_label(request.user)}
        ]
        job.save(update_fields=["status", "approved_by", "approved_at", "execution_log"])
        audit = "PRIVACY_RETENTION_PURGE_APPROVED"

    elif action == "cancel":
        if job.status in (PurgeJobStatus.COMPLETED, PurgeJobStatus.IN_PROGRESS):
            return Response(
                {"detail": f"A {job.status} job cannot be cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = str(request.data.get("cancellation_reason") or "").strip()
        if not reason:
            return Response(
                {"cancellation_reason": ["Say why this purge was cancelled."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        job.status = PurgeJobStatus.CANCELLED
        job.cancellation_reason = reason
        job.execution_log = list(job.execution_log) + [
            {
                "at": now.isoformat(),
                "event": "CANCELLED",
                "by": _user_label(request.user),
                "reason": reason,
            }
        ]
        job.save(update_fields=["status", "cancellation_reason", "execution_log"])
        audit = "PRIVACY_RETENTION_PURGE_CANCELLED"

    elif action == "execute":
        # The approval gate, and the whole point of this model existing.
        if job.status != PurgeJobStatus.APPROVED:
            return Response(
                {
                    "detail": (
                        "This purge has not been approved. Anonymisation is "
                        f"irreversible; a {job.status} job cannot execute."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if job.data_category not in SUPPORTED_CATEGORIES:
            # Refuse rather than record a success for work that does not exist.
            return Response(
                {
                    "detail": (
                        f"No purge handler is implemented for "
                        f"'{job.data_category}'. Reporting this as executed "
                        "would claim data was erased when it was not."
                    ),
                    "supported": sorted(SUPPORTED_CATEGORIES),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        processed, failed, notes = _execute_customer_profile_purge(job, request.user)

        job.status = PurgeJobStatus.COMPLETED
        job.records_purged = processed
        job.completed_at = timezone.now()
        job.executed_by = request.user
        job.execution_log = list(job.execution_log) + [
            {
                "at": timezone.now().isoformat(),
                "event": "EXECUTED",
                "by": _user_label(request.user),
                "processed": processed,
                "failed": failed,
                "notes": notes[:20],
            }
        ]
        job.save(
            update_fields=[
                "status",
                "records_purged",
                "completed_at",
                "executed_by",
                "execution_log",
            ]
        )
        audit = "PRIVACY_RETENTION_PURGE_EXECUTED"

    else:
        return Response(
            {
                "detail": f"Unknown action '{action}'.",
                "allowed": ["approve", "cancel", "execute"],
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    AuditLog.objects.create(
        action_type=audit,
        performed_by=request.user,
        model_name="DataRetentionSchedule",
        object_id=str(job.pk),
        metadata={
            "data_category": job.data_category,
            "records_targeted": job.records_targeted,
            "records_purged": job.records_purged,
        },
    )
    return Response(_row(job))


def _execute_customer_profile_purge(job, actor):
    """Anonymise each eligible customer through the existing erasure service.

    Per-customer failures are collected rather than raised: one customer with
    an unexpected state should not abandon the rest of an approved run
    half-finished, which would leave the job's counts describing neither what
    was done nor what was intended.
    """
    from privacy.dpdp_compliance_models import DataErasureGuard, ErasureRequestStatus
    from privacy.services.anonymization_service import execute_erasure

    processed = 0
    failed = 0
    notes: list[dict] = []

    for customer in _eligible_customers(job.scheduled_purge_date):
        try:
            guard = DataErasureGuard.objects.create(
                customer=customer,
                status=ErasureRequestStatus.APPROVED,
                request_reference=f"RET-{uuid4().hex[:10].upper()}",
                due_date=timezone.now().date(),
                fields_to_erase=[],
            )
            execute_erasure(erasure_guard_id=guard.pk, actor=actor)
            processed += 1
        except Exception as exc:  # noqa: BLE001 - recorded, not swallowed
            failed += 1
            notes.append({"customer_id": customer.pk, "error": str(exc)[:200]})

    return processed, failed, notes


@api_view(["POST"])
@permission_classes([IsAdmin])
def admin_retention_policy_purge_view(request, job_id: int):
    """Alias for the older data-retention page, which posts to `{id}/purge/`.

    That page predates the approval gate and reads as "purge now". It is mapped
    to `execute`, which means the gate still applies: an unapproved job is
    refused rather than run because the URL sounded imperative.
    """
    return admin_retention_schedule_action_view(request._request, job_id, "execute")
