from __future__ import annotations

import csv
import io
from datetime import datetime

from django.http import HttpResponse

from subscriptions.services.audit_service import log_audit
from subscriptions.models import AuditLog


EXPORT_TYPES = {
    "finance",
    "collections",
    "overdue",
    "reconciliation",
    "inventory",
    "delivery",
    "partners",
    "waiver_loss",
}


def build_csv_export_response(
    *,
    export_type: str,
    rows: list[dict],
    filters: dict,
    actor,
) -> HttpResponse:
    if export_type not in EXPORT_TYPES:
        raise ValueError("Unsupported export type.")

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["generated_at", datetime.utcnow().isoformat()])
    writer.writerow(["export_type", export_type])
    writer.writerow(["filters", str(filters)])
    writer.writerow([])
    if rows:
        headers = sorted({key for row in rows for key in row.keys()})
        writer.writerow(headers)
        for row in rows:
            writer.writerow([row.get(key, "") for key in headers])
    else:
        writer.writerow(["empty_reason", "No data rows for applied filters."])

    content = buffer.getvalue()
    response = HttpResponse(content, content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="phase5-{export_type}-export.csv"'

    # Keep export fully auditable.
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=actor,
        performed_by=actor,
        metadata={"event": "PHASE5_REPORT_EXPORT", "export_type": export_type, "filters": filters, "row_count": len(rows)},
    )
    return response

