from __future__ import annotations

import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from subscriptions.services.pdf_branding_service import get_branding_context

DISCLAIMER = (
    "This quotation is not an invoice, receipt, contract, subscription, or stock "
    "reservation. Final billing, payment, stock availability, delivery, and contract "
    "creation require admin approval and separate confirmation."
)


def _money(value) -> str:
    return f"INR {value or '0.00'}"


def build_brochure_quotation_pdf(*, quotation, public_url="") -> bytes:
    branding = get_branding_context()
    buffer = io.BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=quotation.quotation_no,
        author=branding.business_name,
    )
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="QuoteSmall",
            parent=styles["Normal"],
            fontSize=8.5,
            leading=12,
            textColor=colors.HexColor("#5F574F"),
        )
    )
    story = [
        Paragraph(
            escape(branding.business_name or "Subidha Furniture"),
            styles["Title"],
        ),
        Paragraph("Customer Quotation", styles["Heading1"]),
        Spacer(1, 4 * mm),
        Table(
            [
                ["Quotation No", quotation.quotation_no, "Date", quotation.created_at.date()],
                [
                    "Valid Until",
                    quotation.validity_date or "Not specified",
                    "Type",
                    quotation.get_quotation_type_display(),
                ],
                ["Customer", quotation.customer_name, "Phone", quotation.phone],
                ["Location", quotation.location or "-", "Status", quotation.status],
            ],
            colWidths=[28 * mm, 60 * mm, 26 * mm, 55 * mm],
            style=TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D7C7B6")),
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F6EFE7")),
                    ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#F6EFE7")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                    ("PADDING", (0, 0), (-1, -1), 5),
                ]
            ),
        ),
        Spacer(1, 6 * mm),
    ]
    rows = [["Product", "Plan", "Qty", "Price / Month", "Deposit", "Discount", "Total"]]
    for line in quotation.lines.all():
        price = (
            _money(line.unit_price)
            if line.plan_type == "DIRECT_SALE"
            else f"{_money(line.monthly_amount)} / month"
        )
        rows.append(
            [
                line.product_name,
                line.get_plan_type_display(),
                line.quantity,
                price,
                _money(line.security_deposit),
                _money(line.discount_amount),
                _money(line.line_total),
            ]
        )
    story.extend(
        [
            Table(
                rows,
                colWidths=[43 * mm, 24 * mm, 12 * mm, 34 * mm, 25 * mm, 23 * mm, 28 * mm],
                repeatRows=1,
                style=TableStyle(
                    [
                        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D7C7B6")),
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#5B3A29")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("PADDING", (0, 0), (-1, -1), 4),
                    ]
                ),
            ),
            Spacer(1, 5 * mm),
            Table(
                [
                    ["Subtotal", _money(quotation.subtotal_amount)],
                    ["Quotation discount", _money(quotation.discount_amount)],
                    ["Delivery charge", _money(quotation.delivery_charge)],
                    ["Security deposit total", _money(quotation.security_deposit_total)],
                    ["Total payable now", _money(quotation.total_payable_now)],
                    ["Recurring monthly total", _money(quotation.recurring_monthly_total)],
                    ["Grand / projected total", _money(quotation.grand_total)],
                ],
                colWidths=[65 * mm, 45 * mm],
                hAlign="RIGHT",
                style=TableStyle(
                    [
                        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D7C7B6")),
                        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F6EFE7")),
                        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                        ("PADDING", (0, 0), (-1, -1), 5),
                    ]
                ),
            ),
            Spacer(1, 5 * mm),
            Paragraph("<b>Terms</b>", styles["Heading3"]),
            Paragraph(escape(quotation.terms_text or "Terms available from our admin team."), styles["QuoteSmall"]),
            Spacer(1, 4 * mm),
            Paragraph(f"<b>Important:</b> {escape(DISCLAIMER)}", styles["QuoteSmall"]),
        ]
    )
    if public_url:
        story.extend(
            [
                Spacer(1, 3 * mm),
                Paragraph(f"<b>Public quotation link:</b> {escape(public_url)}", styles["QuoteSmall"]),
            ]
        )
    document.build(story)
    return buffer.getvalue()
