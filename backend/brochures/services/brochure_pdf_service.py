from __future__ import annotations

import io
from collections import defaultdict
from datetime import datetime
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from subscriptions.services.pdf_branding_service import get_branding_context

BROWN = colors.HexColor("#5B3A29")
CREAM = colors.HexColor("#F7F0E6")
GOLD = colors.HexColor("#B7863D")
MUTED = colors.HexColor("#6B625C")


def _money(label: str, value: str | None) -> str | None:
    return f"{label}: INR {value}" if value else None


def _draw_page(canvas, doc, *, brochure_no: str, generated_at: str, business_name: str):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D8C8B6"))
    canvas.line(16 * mm, 14 * mm, A4[0] - 16 * mm, 14 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(
        16 * mm, 9 * mm, f"{business_name} | {brochure_no} | Generated {generated_at}"
    )
    canvas.drawRightString(A4[0] - 16 * mm, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _product_card(row: dict, styles) -> KeepTogether:
    price_lines = [
        _money("Sale / Lucky EMI price", row.get("sale_price")),
        _money("Monthly rent", row.get("monthly_rent")),
        _money("Monthly lease", row.get("lease_monthly_amount")),
        _money("Security deposit", row.get("security_deposit")),
    ]
    price_text = (
        "<br/>".join(escape(line) for line in price_lines if line) or "Price on request"
    )
    badge = (
        f" · {escape(str(row.get('public_badge') or ''))}"
        if row.get("public_badge")
        else ""
    )
    data = [
        [
            Paragraph(
                f"<b>{escape(str(row.get('name') or 'Product'))}</b>{badge}<br/>"
                f"<font size='8' color='#6B625C'>{escape(str(row.get('product_code') or ''))}</font>",
                styles["CardTitle"],
            ),
            Paragraph(price_text, styles["Price"]),
        ],
        [
            Paragraph(
                escape(
                    str(row.get("short_description") or "Details available on request.")
                ),
                styles["Body"],
            ),
            Paragraph(
                f"<b>{escape(str(row.get('availability_label') or 'Availability on request'))}</b><br/>"
                f"<font size='8'>{escape(str(row.get('public_product_url') or ''))}</font>",
                styles["Meta"],
            ),
        ],
    ]
    table = Table(data, colWidths=[116 * mm, 48 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#D8C8B6")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E8DED3")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return KeepTogether([table, Spacer(1, 5 * mm)])


def build_brochure_pdf(
    *,
    brochure_no: str,
    brochure_type: str,
    title: str,
    products: list[dict],
    generated_at: datetime,
) -> bytes:
    branding = get_branding_context()
    generated_text = generated_at.strftime("%d %B %Y, %I:%M %p")
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=20 * mm,
        title=title[:160],
        author=branding.business_name,
    )
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="CoverBrand",
            parent=styles["Title"],
            fontSize=24,
            leading=30,
            textColor=BROWN,
            alignment=TA_CENTER,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CoverTitle",
            parent=styles["Heading1"],
            fontSize=18,
            leading=23,
            textColor=BROWN,
            alignment=TA_CENTER,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Badge",
            parent=styles["Normal"],
            fontSize=10,
            leading=13,
            textColor=colors.white,
            alignment=TA_CENTER,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Section",
            parent=styles["Heading2"],
            fontSize=14,
            leading=18,
            textColor=BROWN,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CardTitle",
            parent=styles["Normal"],
            fontSize=11,
            leading=15,
            textColor=BROWN,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Price",
            parent=styles["Normal"],
            fontSize=9,
            leading=13,
            textColor=BROWN,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Body",
            parent=styles["Normal"],
            fontSize=8.5,
            leading=12,
            textColor=MUTED,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Meta",
            parent=styles["Normal"],
            fontSize=8.5,
            leading=12,
            textColor=MUTED,
        )
    )

    contact_bits = [branding.address, branding.phone, branding.email]
    contact = (
        " · ".join(escape(bit) for bit in contact_bits if bit)
        or "Contact details available from our store team."
    )
    story = [
        Spacer(1, 18 * mm),
        Paragraph(
            escape(branding.business_name or "Subidha Furniture"), styles["CoverBrand"]
        ),
        Spacer(1, 8 * mm),
        Paragraph(escape(title), styles["CoverTitle"]),
        Spacer(1, 7 * mm),
        Table(
            [[Paragraph(escape(brochure_type.replace("_", " ")), styles["Badge"])]],
            colWidths=[55 * mm],
            hAlign="CENTER",
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), BROWN),
                    ("BOX", (0, 0), (-1, -1), 0.5, GOLD),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            ),
        ),
        Spacer(1, 10 * mm),
        Paragraph(f"Generated on {escape(generated_text)}", styles["Body"]),
        Spacer(1, 4 * mm),
        Paragraph(contact, styles["Body"]),
        Spacer(1, 12 * mm),
        Table(
            [
                [
                    Paragraph(
                        "<b>Customer note</b><br/>Browse the current selection and contact our team for final availability, quotation, delivery, and plan eligibility.",
                        styles["Body"],
                    )
                ]
            ],
            colWidths=[165 * mm],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), CREAM),
                    ("BOX", (0, 0), (-1, -1), 0.6, GOLD),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ]
            ),
        ),
        PageBreak(),
    ]

    by_category: dict[str, list[dict]] = defaultdict(list)
    for product in products:
        by_category[str(product.get("category") or "Uncategorized")].append(product)
    for category, rows in by_category.items():
        story.append(Paragraph(escape(category), styles["Section"]))
        for row in rows:
            story.append(_product_card(row, styles))

    terms = [
        "Prices are indicative until final quotation/contract.",
        "Security deposit and delivery charges may apply.",
        "Stock availability can change.",
        "Brochure does not reserve stock.",
        "Final billing follows approved invoice/contract.",
    ]
    story.extend(
        [
            Spacer(1, 4 * mm),
            Paragraph("Important terms", styles["Section"]),
            Paragraph(
                "<br/>".join(f"• {escape(term)}" for term in terms), styles["Body"]
            ),
        ]
    )

    def page_callback(canvas, current_doc):
        _draw_page(
            canvas,
            current_doc,
            brochure_no=brochure_no,
            generated_at=generated_text,
            business_name=branding.business_name,
        )

    doc.build(story, onFirstPage=page_callback, onLaterPages=page_callback)
    return buffer.getvalue()
