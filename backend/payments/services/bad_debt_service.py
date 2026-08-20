from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from subscriptions.models import AuditLog, RecoveryStage
from subscriptions.services.audit_service import log_audit

NPA_THRESHOLD_DAYS = 90
PROVISIONING_BUCKETS = [
    (90, Decimal("10.00")),   # sub-standard
    (180, Decimal("50.00")),  # doubtful (1 year)
    (365, Decimal("100.00")),  # loss
]
WRITE_OFF_MIN_AGING_DAYS = 365


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _provisioning_percent(aging_days: int) -> Decimal:
    result = Decimal("0.00")
    for threshold, pct in PROVISIONING_BUCKETS:
        if aging_days >= threshold:
            result = pct
    return result


def list_bad_debt_cases(*, include_written_off: bool = False) -> list[dict]:
    from payments.models import RecoveryCase

    qs = RecoveryCase.objects.select_related(
        "subscription__customer",
    ).order_by("-first_overdue_date")

    if not include_written_off:
        qs = qs.exclude(stage=RecoveryStage.SETTLED)

    results = []
    for rc in qs[:200]:
        customer = getattr(rc.subscription, "customer", None) if rc.subscription_id else None
        results.append({
            "id": rc.id,
            "subscription_id": rc.subscription_id,
            "customer_name": getattr(customer, "name", None),
            "stage": rc.stage,
            "overdue_amount": str(rc.overdue_amount),
            "overdue_emis": rc.overdue_emis,
            "aging_days": rc.aging_days,
            "aging_bucket": rc.aging_bucket,
            "npa_classified_at": rc.npa_classified_at.isoformat() if rc.npa_classified_at else None,
            "provisioning_percent": str(rc.provisioning_percent),
            "provisioned_amount": str(_money(rc.overdue_amount * rc.provisioning_percent / Decimal("100"))),
            "written_off_amount": str(rc.written_off_amount),
            "written_off_at": rc.written_off_at.isoformat() if rc.written_off_at else None,
            "legal_notice_date": str(rc.write_off_legal_notice_date) if rc.write_off_legal_notice_date else None,
            "legal_notice_ref": rc.write_off_legal_notice_ref,
        })
    return results


def aging_report() -> dict:
    from payments.models import RecoveryCase

    cases = RecoveryCase.objects.exclude(stage=RecoveryStage.SETTLED).all()
    buckets = {"0-30": [], "31-60": [], "61-90": [], "91-120": [], "120+": []}
    total_overdue = Decimal("0.00")
    total_provisioned = Decimal("0.00")
    total_written_off = Decimal("0.00")

    for rc in cases:
        bucket = rc.aging_bucket
        overdue = _money(rc.overdue_amount)
        provisioned = _money(overdue * rc.provisioning_percent / Decimal("100"))
        buckets.setdefault(bucket, []).append({
            "id": rc.id,
            "overdue_amount": str(overdue),
            "provisioned": str(provisioned),
        })
        total_overdue += overdue
        total_provisioned += provisioned
        total_written_off += _money(rc.written_off_amount)

    return {
        "buckets": {k: {"count": len(v), "total": str(sum(Decimal(i["overdue_amount"]) for i in v))} for k, v in buckets.items()},
        "total_overdue": str(total_overdue),
        "total_provisioned": str(total_provisioned),
        "total_written_off": str(total_written_off),
    }


@transaction.atomic
def classify_npa(*, recovery_case_id: int, actor) -> dict:
    from payments.models import RecoveryCase

    rc = RecoveryCase.objects.select_for_update().get(pk=recovery_case_id)

    if rc.npa_classified_at:
        raise ValueError("Already classified as NPA.")

    if rc.aging_days < NPA_THRESHOLD_DAYS:
        raise ValueError(f"Recovery case must be overdue for at least {NPA_THRESHOLD_DAYS} days to classify as NPA. Current: {rc.aging_days} days.")

    prov = _provisioning_percent(rc.aging_days)
    rc.npa_classified_at = timezone.now()
    rc.provisioning_percent = prov
    rc.save(update_fields=["npa_classified_at", "provisioning_percent", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=rc,
        performed_by=actor,
        metadata={
            "event": "NPA_CLASSIFIED",
            "recovery_case_id": recovery_case_id,
            "aging_days": rc.aging_days,
            "provisioning_percent": str(prov),
            "legal_reference": "RBI NPA norms — >90 days overdue",
        },
    )
    return {"id": rc.id, "npa_classified_at": rc.npa_classified_at.isoformat(), "provisioning_percent": str(prov)}


@transaction.atomic
def update_provisioning(*, recovery_case_id: int) -> dict:
    from payments.models import RecoveryCase

    rc = RecoveryCase.objects.select_for_update().get(pk=recovery_case_id)
    if not rc.npa_classified_at:
        raise ValueError("Must be NPA-classified before updating provisioning.")

    prov = _provisioning_percent(rc.aging_days)
    rc.provisioning_percent = prov
    rc.save(update_fields=["provisioning_percent", "updated_at"])
    return {"id": rc.id, "provisioning_percent": str(prov), "aging_days": rc.aging_days}


@transaction.atomic
def record_legal_notice(*, recovery_case_id: int, notice_date, notice_ref: str, actor) -> dict:
    from payments.models import RecoveryCase

    rc = RecoveryCase.objects.select_for_update().get(pk=recovery_case_id)
    rc.write_off_legal_notice_date = notice_date
    rc.write_off_legal_notice_ref = notice_ref.strip()
    if rc.stage in (RecoveryStage.IDENTIFIED, RecoveryStage.NOTICE_SENT):
        rc.stage = RecoveryStage.LEGAL
    rc.save(update_fields=["write_off_legal_notice_date", "write_off_legal_notice_ref", "stage", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=rc,
        performed_by=actor,
        metadata={
            "event": "LEGAL_NOTICE_RECORDED",
            "recovery_case_id": recovery_case_id,
            "notice_date": str(notice_date),
            "notice_ref": notice_ref,
            "legal_reference": "CPC s.80 / Order 37 legal demand notice",
        },
    )
    return {"id": rc.id, "stage": rc.stage, "legal_notice_date": str(notice_date)}


@transaction.atomic
def write_off(*, recovery_case_id: int, actor) -> dict:
    from payments.models import RecoveryCase

    rc = RecoveryCase.objects.select_for_update().get(pk=recovery_case_id)

    if rc.stage == RecoveryStage.WRITTEN_OFF:
        raise ValueError("Already written off.")

    if not rc.write_off_legal_notice_date:
        raise ValueError("Legal demand notice must be issued before write-off (CPC s.80).")

    if rc.stage not in (RecoveryStage.LEGAL, RecoveryStage.FIELD_VISIT):
        raise ValueError("Recovery case must be at LEGAL or FIELD_VISIT stage before write-off.")

    if rc.aging_days < WRITE_OFF_MIN_AGING_DAYS:
        raise ValueError(f"Minimum {WRITE_OFF_MIN_AGING_DAYS} days overdue required for write-off. Current: {rc.aging_days}.")

    if not rc.npa_classified_at:
        raise ValueError("Must be NPA-classified before write-off.")

    written_off_amount = _money(rc.overdue_amount)
    rc.stage = RecoveryStage.WRITTEN_OFF
    rc.written_off_amount = written_off_amount
    rc.written_off_at = timezone.now()
    rc.written_off_by = actor
    rc.provisioning_percent = Decimal("100.00")
    rc.save(update_fields=[
        "stage", "written_off_amount", "written_off_at", "written_off_by",
        "provisioning_percent", "updated_at",
    ])

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=rc,
        performed_by=actor,
        metadata={
            "event": "BAD_DEBT_WRITTEN_OFF",
            "recovery_case_id": recovery_case_id,
            "written_off_amount": str(written_off_amount),
            "aging_days": rc.aging_days,
            "legal_reference": "IT Act s.36(1)(vii) — bad debt write-off",
            "accounting_entry": "Dr Bad Debt Expense / Cr Customer Receivable",
        },
    )
    return {
        "id": rc.id,
        "stage": rc.stage,
        "written_off_amount": str(written_off_amount),
    }
