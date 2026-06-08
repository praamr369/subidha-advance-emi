from __future__ import annotations

from django.db.models import Max

from reconciliation.models import ReconciliationRun


def next_reconciliation_run_no() -> int:
    return (ReconciliationRun.objects.aggregate(mx=Max("run_no"))["mx"] or 0) + 1
