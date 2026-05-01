from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Any

from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


def build_reports_center_csv_response(
    *,
    report_key: str,
    columns: list[dict[str, str]],
    rows: list[dict[str, Any]],
    filters: dict,
    actor,
) -> HttpResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["generated_at", datetime.utcnow().isoformat()])
    writer.writerow(["report_key", report_key])
    writer.writerow(["filters", str(filters)])
    writer.writerow([])
    headers = [c["key"] for c in columns] if columns else sorted({k for r in rows for k in r})
    writer.writerow(headers)
    for row in rows:
        writer.writerow([row.get(h, "") for h in headers])
    response = HttpResponse(buffer.getvalue(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="reports-center-{report_key}.csv"'
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=actor,
        performed_by=actor,
        metadata={
            "event": "REPORTS_CENTER_EXPORT_CSV",
            "report_key": report_key,
            "filters": filters,
            "row_count": len(rows),
        },
    )
    return response


def build_reports_center_pdf_summary_response(
    *,
    report_key: str,
    title: str,
    summary: list[dict[str, str]],
    columns: list[dict[str, str]],
    rows: list[dict[str, Any]],
    filters: dict,
    actor,
    max_rows: int = 80,
) -> HttpResponse:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), title=title[:80])
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"<b>{title}</b>", styles["Title"]),
        Paragraph(f"<font size=9>Report: {report_key} · Generated UTC {datetime.utcnow().isoformat()}</font>", styles["Normal"]),
        Spacer(1, 8),
        Paragraph(f"<font size=9>Filters: {filters}</font>", styles["Normal"]),
        Spacer(1, 12),
    ]
    if summary:
        sdata = [["Metric", "Value"]] + [[s.get("label", ""), str(s.get("value", ""))] for s in summary]
        t = Table(sdata, hAlign="LEFT")
        t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.25, colors.grey), ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey)]))
        story.append(t)
        story.append(Spacer(1, 12))
    headers = [c["header"] for c in columns] if columns else []
    keys = [c["key"] for c in columns] if columns else []
    slice_rows = rows[:max_rows]
    if keys and slice_rows:
        data = [headers] + [[str(r.get(k, "")) for k in keys] for r in slice_rows]
        tbl = Table(data, repeatRows=1, hAlign="LEFT")
        tbl.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                ]
            )
        )
        story.append(tbl)
    doc.build(story)
    pdf = buf.getvalue()
    response = HttpResponse(pdf, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="reports-center-{report_key}-summary.pdf"'
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=actor,
        performed_by=actor,
        metadata={
            "event": "REPORTS_CENTER_EXPORT_PDF",
            "report_key": report_key,
            "filters": filters,
            "row_count": len(slice_rows),
        },
    )
    return response
