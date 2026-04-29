from __future__ import annotations

from io import BytesIO

from django.utils import timezone

from subscriptions.services.pdf_branding_service import (
    draw_brand_header_footer,
    get_branding_context,
)


def _mask_phone(value: str | None) -> str:
    raw = (value or "").strip()
    if len(raw) < 4:
        return raw or "N/A"
    return f"{'*' * max(0, len(raw) - 4)}{raw[-4:]}"


def _draw_common_header(*, canvas, width, height, margin_x, document_no: str, title: str):
    branding = get_branding_context()
    generated_at = timezone.now()
    generated_label = generated_at.strftime("%d %b %Y %H:%M")
    draw_brand_header_footer(
        canvas=canvas,
        width=width,
        height=height,
        margin_x=margin_x,
        branding=branding,
        document_no=document_no,
        generated_at=generated_label,
    )
    canvas.setTitle(f"{title} {document_no}")
    return generated_label


def render_invoice_pdf(*, invoice) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, pageCompression=0)
    width, height = A4
    mx = 16 * mm
    cy = height - (52 * mm)

    document_no = invoice.document_no or f"INV-{invoice.id}"
    generated_label = _draw_common_header(
        canvas=c,
        width=width,
        height=height,
        margin_x=mx,
        document_no=document_no,
        title="Direct Sale Invoice",
    )

    def line(text: str, size: int = 10, lead: float = 13.5):
        nonlocal cy
        c.setFont("Helvetica", size)
        c.drawString(mx, cy, text)
        cy -= lead

    def rule():
        nonlocal cy
        cy -= 2
        c.setLineWidth(0.6)
        c.line(mx, cy, width - mx, cy)
        cy -= 10

    customer_name = invoice.customer_name_snapshot or getattr(invoice.customer, "name", "Customer")
    customer_phone = invoice.customer_phone_snapshot or getattr(getattr(invoice, "customer", None), "phone", "")
    sale_no = getattr(getattr(invoice, "direct_sale", None), "sale_no", None) or "N/A"
    delivery_status = getattr(getattr(invoice, "direct_sale", None), "status", None) or "N/A"

    rule()
    line("DIRECT SALE INVOICE", size=13, lead=17)
    line(f"Document Type: Invoice", size=10)
    line(f"Invoice Number: {document_no}", size=10)
    line(f"Issue Date: {invoice.invoice_date}", size=10)
    line(f"Status: {invoice.status}", size=10)
    line(f"Generated Timestamp: {generated_label}", size=9)
    rule()
    line(f"Customer: {customer_name}", size=10)
    line(f"Phone (masked): {_mask_phone(customer_phone)}", size=10)
    line(f"Contract/Reference: {invoice.source_reference or sale_no}", size=10)
    line(f"Direct Sale Number: {sale_no}", size=10)
    line(f"Delivery Status: {delivery_status}", size=10)
    rule()
    line(f"Total Amount: INR {invoice.grand_total:.2f}", size=10)
    line(f"Paid Amount: INR {invoice.received_total:.2f}", size=10)
    line(f"Outstanding Amount: INR {invoice.balance_total:.2f}", size=10)

    c.showPage()
    c.save()
    data = buf.getvalue()
    buf.close()
    return data


def render_receipt_pdf(*, receipt) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, pageCompression=0)
    width, height = A4
    mx = 16 * mm
    cy = height - (52 * mm)

    receipt_no = receipt.receipt_no or f"RCT-{receipt.id}"
    generated_label = _draw_common_header(
        canvas=c,
        width=width,
        height=height,
        margin_x=mx,
        document_no=receipt_no,
        title="Payment Receipt",
    )

    def line(text: str, size: int = 10, lead: float = 13.5):
        nonlocal cy
        c.setFont("Helvetica", size)
        c.drawString(mx, cy, text)
        cy -= lead

    def rule():
        nonlocal cy
        cy -= 2
        c.setLineWidth(0.6)
        c.line(mx, cy, width - mx, cy)
        cy -= 10

    payment = getattr(receipt, "payment", None)
    customer_name = receipt.customer_name_snapshot or getattr(getattr(receipt, "customer", None), "name", "Customer")
    customer_phone = receipt.customer_phone_snapshot or getattr(getattr(receipt, "customer", None), "phone", "")
    collected_by = getattr(getattr(payment, "collected_by", None), "username", None) or "N/A"
    finance_account_name = getattr(getattr(receipt, "finance_account", None), "name", None) or "N/A"

    rule()
    line("PAYMENT RECEIPT", size=13, lead=17)
    line(f"Document Type: Receipt", size=10)
    line(f"Receipt Number: {receipt_no}", size=10)
    line(f"Issue Date: {receipt.receipt_date}", size=10)
    line(f"Status: {receipt.status}", size=10)
    line(f"Generated Timestamp: {generated_label}", size=9)
    rule()
    line(f"Customer: {customer_name}", size=10)
    line(f"Phone (masked): {_mask_phone(customer_phone)}", size=10)
    line(f"Contract/Reference: {receipt.source_reference or 'N/A'}", size=10)
    line(f"Payment Method: {getattr(payment, 'method', 'N/A')}", size=10)
    line(f"Collected By: {collected_by}", size=10)
    line(f"Finance Account: {finance_account_name}", size=10)
    rule()
    line(f"Amount: INR {receipt.amount:.2f}", size=10)

    c.showPage()
    c.save()
    data = buf.getvalue()
    buf.close()
    return data


def render_delivery_handover_pdf(*, delivery) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, pageCompression=0)
    width, height = A4
    mx = 16 * mm
    cy = height - (52 * mm)

    delivery_ref = delivery.delivery_reference or f"DLV-{delivery.id}"
    generated_label = _draw_common_header(
        canvas=c,
        width=width,
        height=height,
        margin_x=mx,
        document_no=delivery_ref,
        title="Delivery Handover",
    )

    def line(text: str, size: int = 10, lead: float = 13.5):
        nonlocal cy
        c.setFont("Helvetica", size)
        c.drawString(mx, cy, text)
        cy -= lead

    def rule():
        nonlocal cy
        cy -= 2
        c.setLineWidth(0.6)
        c.line(mx, cy, width - mx, cy)
        cy -= 10

    subscription = delivery.subscription
    customer = getattr(subscription, "customer", None)
    contract_reference = getattr(subscription, "contract_reference", None) or f"SUB-{subscription.id}"

    rule()
    line("DELIVERY / HANDOVER DOCUMENT", size=13, lead=17)
    line("Document Type: Delivery Handover", size=10)
    line(f"Delivery Reference: {delivery_ref}", size=10)
    line(f"Issue Date: {timezone.localdate()}", size=10)
    line(f"Handover Status: {delivery.status}", size=10)
    line(f"Generated Timestamp: {generated_label}", size=9)
    rule()
    line(f"Customer: {getattr(customer, 'name', 'Customer')}", size=10)
    line(f"Phone (masked): {_mask_phone(getattr(customer, 'phone', ''))}", size=10)
    line(f"Contract/Reference: {contract_reference}", size=10)
    line(f"Delivery Address: {delivery.delivery_address_snapshot or 'N/A'}", size=10)
    line(f"Receiver: {delivery.receiver_name or 'N/A'}", size=10)
    line(f"Receiver Phone (masked): {_mask_phone(delivery.receiver_phone)}", size=10)
    rule()
    line("Receiver Signature: ____________________________", size=10)
    line("Company Representative Signature: _______________", size=10)

    c.showPage()
    c.save()
    data = buf.getvalue()
    buf.close()
    return data
