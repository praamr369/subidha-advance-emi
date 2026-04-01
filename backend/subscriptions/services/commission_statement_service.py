import csv
from dataclasses import dataclass
from decimal import Decimal
from io import BytesIO, StringIO

from subscriptions.models import Commission, CommissionStatus, MONEY_ZERO
from subscriptions.services.commission_reporting_service import build_commission_summary


def _money(value) -> str:
    return f"{Decimal(value or MONEY_ZERO):.2f}"


@dataclass(frozen=True)
class CommissionStatementFilters:
    partner_id: int | None = None
    partner: object | None = None
    status: str | None = None
    date_from: object | None = None
    date_to: object | None = None


def _statement_queryset(filters: CommissionStatementFilters):
    queryset = (
        Commission.objects.select_related(
            "partner",
            "subscription",
            "subscription__customer",
            "payment",
            "emi",
            "payout_line__payout_batch",
        )
        .order_by("-created_at", "-id")
    )

    if filters.partner is not None:
        queryset = queryset.filter(partner=filters.partner)
    elif filters.partner_id:
        queryset = queryset.filter(partner_id=filters.partner_id)

    if filters.status:
        queryset = queryset.filter(status=filters.status)

    if filters.date_from:
        queryset = queryset.filter(created_at__date__gte=filters.date_from)

    if filters.date_to:
        queryset = queryset.filter(created_at__date__lte=filters.date_to)

    return queryset


def build_commission_statement_payload(filters: CommissionStatementFilters):
    if filters.date_from and filters.date_to and filters.date_from > filters.date_to:
        raise ValueError("date_to must be on or after date_from.")

    queryset = _statement_queryset(filters)
    partner_scope = filters.partner

    summary = build_commission_summary(
        partner_id=partner_scope.id if partner_scope is not None else filters.partner_id,
        status=filters.status,
        date_from=filters.date_from,
        date_to=filters.date_to,
    )["summary"]

    rows = []
    partner_names = set()

    for commission in queryset:
        partner = getattr(commission, "partner", None)
        subscription = getattr(commission, "subscription", None)
        customer = getattr(subscription, "customer", None) if subscription else None
        payment = getattr(commission, "payment", None)
        emi = getattr(commission, "emi", None)
        payout_line = getattr(commission, "payout_line", None)
        payout_batch = getattr(payout_line, "payout_batch", None) if payout_line else None

        partner_names.add(getattr(partner, "username", "") or f"Partner #{commission.partner_id}")

        rows.append(
            {
                "commission_id": commission.id,
                "partner_id": commission.partner_id,
                "partner_username": getattr(partner, "username", "") or "",
                "partner_phone": getattr(partner, "phone", "") or "",
                "customer_name": getattr(customer, "name", "") or "",
                "customer_phone": getattr(customer, "phone", "") or "",
                "subscription_id": commission.subscription_id,
                "subscription_number": f"SUB-{commission.subscription_id}" if commission.subscription_id else "",
                "payment_id": commission.payment_id,
                "payment_reference_no": getattr(payment, "reference_no", "") or "",
                "payment_date": payment.payment_date.isoformat() if payment and payment.payment_date else "",
                "emi_id": commission.emi_id or "",
                "emi_month_no": getattr(emi, "month_no", "") or "",
                "commission_rate": _money(commission.commission_rate),
                "commission_amount": _money(commission.commission_amount),
                "amount": _money(commission.commission_amount),
                "status": commission.status,
                "settlement_date": commission.settlement_date.isoformat()
                if commission.settlement_date
                else "",
                "payout_batch_id": getattr(payout_batch, "id", "") or "",
                "payout_batch_code": getattr(payout_batch, "batch_code", "") or "",
                "created_at": commission.created_at.isoformat() if commission.created_at else "",
            }
        )

    partner_label = (
        getattr(partner_scope, "username", "") or ""
        if partner_scope is not None
        else "All Partners" if not filters.partner_id
        else f"Partner #{filters.partner_id}"
    )
    if filters.partner is None and filters.partner_id is None and partner_names:
        partner_label = "All Partners"

    return {
        "filters": {
            "partner_label": partner_label,
            "partner_id": getattr(partner_scope, "id", None) if partner_scope is not None else filters.partner_id,
            "status": filters.status or "",
            "date_from": filters.date_from.isoformat() if filters.date_from else "",
            "date_to": filters.date_to.isoformat() if filters.date_to else "",
        },
        "summary": summary,
        "row_count": len(rows),
        "rows": rows,
    }


def render_commission_statement_csv(payload) -> bytes:
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["statement_scope", payload["filters"]["partner_label"]])
    writer.writerow(["status_filter", payload["filters"]["status"]])
    writer.writerow(["date_from", payload["filters"]["date_from"]])
    writer.writerow(["date_to", payload["filters"]["date_to"]])
    writer.writerow([])
    writer.writerow(["total_commission", payload["summary"]["total_commission"]])
    writer.writerow(["pending_commission", payload["summary"]["pending_commission"]])
    writer.writerow(["settled_commission", payload["summary"]["settled_commission"]])
    writer.writerow(["reversed_commission", payload["summary"]["reversed_commission"]])
    writer.writerow([])
    writer.writerow(
        [
            "commission_id",
            "payment_id",
            "subscription_id",
            "partner_id",
            "amount",
            "status",
            "payout_batch_id",
            "partner_username",
            "partner_phone",
            "customer_name",
            "customer_phone",
            "subscription_number",
            "payment_reference_no",
            "payment_date",
            "emi_id",
            "emi_month_no",
            "commission_rate",
            "settlement_date",
            "payout_batch_code",
            "created_at",
        ]
    )

    for row in payload["rows"]:
        writer.writerow(
            [
                row["commission_id"],
                row["payment_id"],
                row["subscription_id"],
                row["partner_id"],
                row["amount"],
                row["status"],
                row["payout_batch_id"],
                row["partner_username"],
                row["partner_phone"],
                row["customer_name"],
                row["customer_phone"],
                row["subscription_number"],
                row["payment_reference_no"],
                row["payment_date"],
                row["emi_id"],
                row["emi_month_no"],
                row["commission_rate"],
                row["settlement_date"],
                row["payout_batch_code"],
                row["created_at"],
            ]
        )

    return buffer.getvalue().encode("utf-8")


def render_commission_statement_pdf(payload) -> bytes:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas
    except Exception:
        return _render_simple_pdf(payload)

    try:
        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4
        y = height - 18 * mm

        def ensure_page(next_height=8 * mm):
            nonlocal y
            if y < 18 * mm + next_height:
                pdf.showPage()
                y = height - 18 * mm

        pdf.setFont("Helvetica-Bold", 14)
        pdf.drawString(18 * mm, y, "SUBIDHA FURNITURE")
        y -= 6 * mm
        pdf.setFont("Helvetica", 10)
        pdf.drawString(18 * mm, y, "Partner Commission Earnings Statement")
        y -= 8 * mm

        pdf.setFont("Helvetica", 9)
        pdf.drawString(18 * mm, y, f"Scope: {payload['filters']['partner_label']}")
        y -= 5 * mm
        pdf.drawString(
            18 * mm,
            y,
            f"Status: {payload['filters']['status'] or 'All'} | Date: {payload['filters']['date_from'] or '—'} to {payload['filters']['date_to'] or '—'}",
        )
        y -= 7 * mm

        summary_rows = [
            ("Total Commission", payload["summary"]["total_commission"]),
            ("Pending", payload["summary"]["pending_commission"]),
            ("Settled", payload["summary"]["settled_commission"]),
            ("Reversed", payload["summary"]["reversed_commission"]),
            ("Rows", str(payload["row_count"])),
        ]

        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(18 * mm, y, "Summary")
        y -= 5 * mm
        pdf.setFont("Helvetica", 9)
        for label, value in summary_rows:
            ensure_page()
            pdf.drawString(20 * mm, y, f"{label}: {value}")
            y -= 4.5 * mm

        y -= 2 * mm
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(18 * mm, y, "Rows")
        y -= 6 * mm

        headers = ["Commission", "Partner", "Payment", "Subscription", "Amount", "Status", "Batch"]
        positions = [18 * mm, 42 * mm, 78 * mm, 108 * mm, 138 * mm, 158 * mm, 178 * mm]

        def draw_headers():
            nonlocal y
            pdf.setFont("Helvetica-Bold", 7)
            for index, header in enumerate(headers):
                pdf.drawString(positions[index], y, header)
            y -= 4 * mm

        draw_headers()
        pdf.setFont("Helvetica", 7)

        for row in payload["rows"]:
            ensure_page(12 * mm)
            if y > height - 22 * mm:
                draw_headers()
                pdf.setFont("Helvetica", 7)

            pdf.drawString(positions[0], y, str(row["commission_id"]))
            pdf.drawString(positions[1], y, row["partner_username"][:18])
            pdf.drawString(positions[2], y, str(row["payment_reference_no"] or row["payment_id"])[:18])
            pdf.drawString(positions[3], y, row["subscription_number"][:16])
            pdf.drawRightString(156 * mm, y, row["amount"])
            pdf.drawString(positions[5], y, row["status"][:10])
            pdf.drawString(positions[6], y, str(row["payout_batch_code"] or "-")[:10])
            y -= 4 * mm

        pdf.setFont("Helvetica", 7)
        pdf.drawString(
            18 * mm,
            12 * mm,
            "System-generated commission statement based on commission and payout batch truth.",
        )
        pdf.save()
        buffer.seek(0)
        return buffer.getvalue()
    except Exception:
        return _render_simple_pdf(payload)


def _escape_pdf_text(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .replace("\r", " ")
        .replace("\n", " ")
    )


def _render_simple_pdf(payload) -> bytes:
    lines = [
        "SUBIDHA FURNITURE",
        "Partner Commission Earnings Statement",
        "",
        f"Scope: {payload['filters']['partner_label']}",
        f"Status: {payload['filters']['status'] or 'All'}",
        f"Date: {payload['filters']['date_from'] or '-'} to {payload['filters']['date_to'] or '-'}",
        "",
        f"Total Commission: {payload['summary']['total_commission']}",
        f"Pending: {payload['summary']['pending_commission']}",
        f"Settled: {payload['summary']['settled_commission']}",
        f"Reversed: {payload['summary']['reversed_commission']}",
        f"Rows: {payload['row_count']}",
        "",
        "Commission | Partner | Payment | Subscription | Amount | Status | Batch",
    ]

    for row in payload["rows"]:
        lines.append(
            " | ".join(
                [
                    str(row["commission_id"]),
                    row["partner_username"] or "-",
                    str(row["payment_reference_no"] or row["payment_id"] or "-"),
                    row["subscription_number"] or "-",
                    row["commission_amount"],
                    row["status"],
                    str(row["payout_batch_code"] or "-"),
                ]
            )
        )

    pages = []
    page_size = 48
    for index in range(0, len(lines), page_size):
        pages.append(lines[index : index + page_size])

    objects: list[bytes] = []

    def add_object(content: str | bytes) -> int:
        if isinstance(content, str):
            content = content.encode("utf-8")
        objects.append(content)
        return len(objects)

    font_id = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    page_object_ids: list[int] = []
    content_object_ids: list[int] = []

    for page_lines in pages or [[]]:
        stream_lines = ["BT", "/F1 9 Tf", "50 792 Td"]
        for index, line in enumerate(page_lines):
            if index > 0:
                stream_lines.append("0 -14 Td")
            stream_lines.append(f"({_escape_pdf_text(line)}) Tj")
        stream_lines.append("ET")
        stream = "\n".join(stream_lines)
        content_id = add_object(
            f"<< /Length {len(stream.encode('utf-8'))} >>\nstream\n{stream}\nendstream"
        )
        content_object_ids.append(content_id)
        page_object_ids.append(0)

    pages_id = add_object("<< /Type /Pages /Kids [] /Count 0 >>")

    for index, content_id in enumerate(content_object_ids):
        page_id = add_object(
            f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>"
        )
        page_object_ids[index] = page_id

    kids = " ".join(f"{page_id} 0 R" for page_id in page_object_ids)
    objects[pages_id - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_object_ids)} >>".encode(
        "utf-8"
    )
    catalog_id = add_object(f"<< /Type /Catalog /Pages {pages_id} 0 R >>")

    buffer = BytesIO()
    buffer.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")

    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(buffer.tell())
        buffer.write(f"{index} 0 obj\n".encode("utf-8"))
        buffer.write(obj)
        buffer.write(b"\nendobj\n")

    xref_start = buffer.tell()
    buffer.write(f"xref\n0 {len(objects) + 1}\n".encode("utf-8"))
    buffer.write(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        buffer.write(f"{offset:010d} 00000 n \n".encode("utf-8"))

    buffer.write(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n"
            f"startxref\n{xref_start}\n%%EOF"
        ).encode("utf-8")
    )
    return buffer.getvalue()
