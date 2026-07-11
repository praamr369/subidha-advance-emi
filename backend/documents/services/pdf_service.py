import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable


def _build_doc(buffer, title):
    return SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title=title,
    )


def _header_table(doc_type, ref_no, date_str, business_name="Subidha Finance"):
    data = [
        [Paragraph(f"<b>{business_name}</b>", getSampleStyleSheet()["Normal"]),
         Paragraph(f"<b>{doc_type}</b>", getSampleStyleSheet()["Heading2"])],
        [f"Ref: {ref_no}", f"Date: {date_str}"],
    ]
    t = Table(data, colWidths=[90 * mm, 80 * mm])
    t.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def generate_invoice_pdf(invoice_data: dict) -> bytes:
    """invoice_data keys: ref_no, date, customer_name, customer_address, items (list of dicts), total, tax, grand_total"""
    buf = io.BytesIO()
    doc = _build_doc(buf, f"Invoice {invoice_data.get('ref_no', '')}")
    styles = getSampleStyleSheet()
    story = []

    story.append(_header_table("TAX INVOICE", invoice_data.get("ref_no", ""), invoice_data.get("date", "")))
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph(f"<b>Bill To:</b> {invoice_data.get('customer_name', '')}", styles["Normal"]))
    addr = invoice_data.get("customer_address", "")
    if addr:
        story.append(Paragraph(addr, styles["Normal"]))
    story.append(Spacer(1, 4 * mm))

    items = invoice_data.get("items", [])
    table_data = [["#", "Description", "Qty", "Rate", "Amount"]]
    for i, item in enumerate(items, 1):
        table_data.append([
            str(i),
            item.get("description", ""),
            str(item.get("qty", 1)),
            f"₹{item.get('rate', 0):.2f}",
            f"₹{item.get('amount', 0):.2f}",
        ])

    col_widths = [10 * mm, 75 * mm, 15 * mm, 20 * mm, 25 * mm]
    t = Table(table_data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a56db")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)
    story.append(Spacer(1, 4 * mm))

    totals = [
        ["", "", "", "Subtotal:", f"₹{invoice_data.get('total', 0):.2f}"],
        ["", "", "", "Tax:", f"₹{invoice_data.get('tax', 0):.2f}"],
        ["", "", "", "Grand Total:", f"₹{invoice_data.get('grand_total', 0):.2f}"],
    ]
    tt = Table(totals, colWidths=col_widths)
    tt.setStyle(TableStyle([
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("FONTNAME", (3, 2), (-1, 2), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    story.append(tt)

    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph("Thank you for your business.", styles["Normal"]))

    doc.build(story)
    return buf.getvalue()


def generate_receipt_pdf(receipt_data: dict) -> bytes:
    """receipt_data keys: ref_no, date, customer_name, amount, payment_mode, for_description"""
    buf = io.BytesIO()
    doc = _build_doc(buf, f"Receipt {receipt_data.get('ref_no', '')}")
    styles = getSampleStyleSheet()
    story = []

    story.append(_header_table("PAYMENT RECEIPT", receipt_data.get("ref_no", ""), receipt_data.get("date", "")))
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
    story.append(Spacer(1, 6 * mm))

    rows = [
        ["Received From:", receipt_data.get("customer_name", "")],
        ["Amount:", f"₹{receipt_data.get('amount', 0):.2f}"],
        ["Payment Mode:", receipt_data.get("payment_mode", "")],
        ["For:", receipt_data.get("for_description", "")],
        ["Date:", receipt_data.get("date", "")],
    ]
    t = Table(rows, colWidths=[50 * mm, 120 * mm])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph("Authorised Signatory: ____________________", styles["Normal"]))

    doc.build(story)
    return buf.getvalue()


def generate_contract_pdf(contract_data: dict) -> bytes:
    """contract_data keys: ref_no, date, party_a, party_b, clauses (list of str), effective_date"""
    buf = io.BytesIO()
    doc = _build_doc(buf, f"Contract {contract_data.get('ref_no', '')}")
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph(f"<b>CONTRACT AGREEMENT</b>", styles["Heading1"]))
    story.append(Paragraph(f"Ref: {contract_data.get('ref_no', '')}  |  Date: {contract_data.get('date', '')}", styles["Normal"]))
    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph(f"<b>Party A:</b> {contract_data.get('party_a', '')}", styles["Normal"]))
    story.append(Paragraph(f"<b>Party B:</b> {contract_data.get('party_b', '')}", styles["Normal"]))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(f"<b>Effective Date:</b> {contract_data.get('effective_date', '')}", styles["Normal"]))
    story.append(Spacer(1, 4 * mm))

    for i, clause in enumerate(contract_data.get("clauses", []), 1):
        story.append(Paragraph(f"<b>{i}.</b> {clause}", styles["Normal"]))
        story.append(Spacer(1, 2 * mm))

    story.append(Spacer(1, 10 * mm))
    sig = [
        ["Party A Signature:", "", "Party B Signature:", ""],
        ["____________________", "", "____________________", ""],
        ["Date:", "", "Date:", ""],
    ]
    st = Table(sig, colWidths=[45 * mm, 45 * mm, 45 * mm, 35 * mm])
    st.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(st)

    doc.build(story)
    return buf.getvalue()


def generate_kyc_pdf(kyc_data: dict) -> bytes:
    """kyc_data keys: ref_no, date, full_name, dob, gender, address, pan_masked, aadhaar_last4, photo_url(optional)"""
    buf = io.BytesIO()
    doc = _build_doc(buf, f"KYC {kyc_data.get('ref_no', '')}")
    styles = getSampleStyleSheet()
    story = []

    story.append(_header_table("KYC DOCUMENT", kyc_data.get("ref_no", ""), kyc_data.get("date", "")))
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
    story.append(Spacer(1, 4 * mm))

    rows = [
        ["Full Name:", kyc_data.get("full_name", "")],
        ["Date of Birth:", kyc_data.get("dob", "")],
        ["Gender:", kyc_data.get("gender", "")],
        ["Address:", kyc_data.get("address", "")],
        ["PAN:", kyc_data.get("pan_masked", "")],
        ["Aadhaar (last 4):", kyc_data.get("aadhaar_last4", "")],
    ]
    t = Table(rows, colWidths=[50 * mm, 120 * mm])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
    ]))
    story.append(t)
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph("Verified by: ____________________  Date: ____________________", styles["Normal"]))

    doc.build(story)
    return buf.getvalue()
