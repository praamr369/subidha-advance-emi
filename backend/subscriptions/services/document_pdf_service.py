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


def _render_contract_pdf(*, subscription, profile, contract_kind: str) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, pageCompression=0)
    width, height = A4
    mx = 16 * mm
    cy = height - (52 * mm)

    contract_no = (
        getattr(subscription, "contract_reference", None)
        or getattr(subscription, "subscription_number", None)
        or f"SUB-{subscription.id}"
    )
    generated_label = _draw_common_header(
        canvas=c,
        width=width,
        height=height,
        margin_x=mx,
        document_no=contract_no,
        title=f"{contract_kind} Contract",
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

    customer = getattr(subscription, "customer", None)
    product = getattr(subscription, "product", None)
    monthly_label = "Rent" if contract_kind.upper() == "RENT" else "Lease"

    rule()
    line(f"{contract_kind.upper()} CONTRACT", size=13, lead=17)
    line(f"Document Type: {contract_kind.title()} Contract", size=10)
    line(f"Contract Number: {contract_no}", size=10)
    line(f"Issue Date: {timezone.localdate()}", size=10)
    line(f"Contract Status: {subscription.status}", size=10)
    line(f"Generated Timestamp: {generated_label}", size=9)
    rule()
    line(f"Customer: {getattr(customer, 'name', 'Customer')}", size=10)
    line(f"Phone (masked): {_mask_phone(getattr(customer, 'phone', ''))}", size=10)
    line(f"Customer Address: {getattr(customer, 'address', '') or 'N/A'}", size=10)
    line(f"Product Summary: {getattr(product, 'name', 'Product')}", size=10)
    line(f"Reference No: {contract_no}", size=10)
    rule()
    line(f"Tenure: {subscription.tenure_months} months", size=10)
    line(f"Start Date: {subscription.start_date}", size=10)
    line(f"End Date: {getattr(subscription, 'end_date', None) or 'N/A'}", size=10)
    line(f"Monthly {monthly_label} Amount: INR {subscription.monthly_amount:.2f}", size=10)
    line(f"Security Deposit Amount: INR {profile.security_deposit_amount:.2f}", size=10)
    if contract_kind.upper() == "LEASE":
        line(f"Renewal/Upgrade Note: {profile.contract_terms_snapshot or 'Standard lease renewal terms apply.'}", size=10)
    else:
        line("Product Care Responsibility: Customer must maintain product condition for return.", size=10)
    line(f"Return/Inspection Note: {profile.return_inspection_notes or 'Subject to return inspection and recorded condition.'}", size=10)
    line(f"Handover/Return Policy: {profile.handover_notes or 'Handover and return logs are audit-tracked.'}", size=10)

    c.showPage()
    c.save()
    data = buf.getvalue()
    buf.close()
    return data


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


def render_rent_contract_pdf(*, contract) -> bytes:
    return _render_contract_pdf(
        subscription=contract.subscription,
        profile=contract,
        contract_kind="RENT",
    )


def render_lease_contract_pdf(*, contract) -> bytes:
    return _render_contract_pdf(
        subscription=contract.subscription,
        profile=contract,
        contract_kind="LEASE",
    )


def render_security_deposit_pdf(*, deposit_or_contract) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    demand = deposit_or_contract
    subscription = demand.subscription
    customer = getattr(subscription, "customer", None)
    product = getattr(subscription, "product", None)

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, pageCompression=0)
    width, height = A4
    mx = 16 * mm
    cy = height - (52 * mm)
    document_no = demand.reference_key or f"DEP-{demand.id}"
    generated_label = _draw_common_header(
        canvas=c,
        width=width,
        height=height,
        margin_x=mx,
        document_no=document_no,
        title="Security Deposit",
    )

    def line(text: str, size: int = 10, lead: float = 13.5):
        nonlocal cy
        c.setFont("Helvetica", size)
        c.drawString(mx, cy, text)
        cy -= lead

    line("SECURITY DEPOSIT DOCUMENT", size=13, lead=17)
    line(f"Document Type: Security Deposit", size=10)
    line(f"Reference: {document_no}", size=10)
    line(f"Contract Reference: {subscription.contract_reference or f'SUB-{subscription.id}'}", size=10)
    line(f"Generated Timestamp: {generated_label}", size=9)
    line(f"Customer: {getattr(customer, 'name', 'Customer')}", size=10)
    line(f"Phone (masked): {_mask_phone(getattr(customer, 'phone', ''))}", size=10)
    line(f"Customer Address: {getattr(customer, 'address', '') or 'N/A'}", size=10)
    line(f"Product Summary: {getattr(product, 'name', 'Product')}", size=10)
    line(f"Contract Status: {subscription.status}", size=10)
    line(f"Deposit Amount: INR {demand.amount:.2f}", size=10)
    line(f"Refundable Amount: INR {demand.refundable_amount:.2f}", size=10)
    line(f"Deduction Amount: INR {demand.deducted_amount:.2f}", size=10)
    line(f"Payment Method: {demand.metadata.get('payment_method', 'N/A')}", size=10)
    line("Refundable Liability Note: Deposit is refundable subject to dues, damage, and inspection.", size=10)

    c.showPage()
    c.save()
    data = buf.getvalue()
    buf.close()
    return data


def render_deposit_refund_pdf(*, refund_or_deposit_action) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    demand = refund_or_deposit_action
    subscription = demand.subscription
    transactions = list(
        subscription.deposit_transactions.filter(
            transaction_type__in=["REFUNDED", "DEPOSIT_REFUND"]
        ).order_by("-created_at")[:1]
    )
    approved_transactions = list(
        subscription.deposit_transactions.filter(transaction_type="REFUND_APPROVED").order_by("-created_at")[:1]
    )
    refund_tx = transactions[0] if transactions else None
    approved_tx = approved_transactions[0] if approved_transactions else None

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, pageCompression=0)
    width, height = A4
    mx = 16 * mm
    cy = height - (52 * mm)
    document_no = f"REFUND-{demand.reference_key or demand.id}"
    generated_label = _draw_common_header(
        canvas=c,
        width=width,
        height=height,
        margin_x=mx,
        document_no=document_no,
        title="Deposit Refund",
    )

    def line(text: str, size: int = 10, lead: float = 13.5):
        nonlocal cy
        c.setFont("Helvetica", size)
        c.drawString(mx, cy, text)
        cy -= lead

    line("DEPOSIT REFUND DOCUMENT", size=13, lead=17)
    line(f"Document Type: Deposit Refund", size=10)
    line(f"Reference: {document_no}", size=10)
    line(f"Contract Reference: {subscription.contract_reference or f'SUB-{subscription.id}'}", size=10)
    line(f"Generated Timestamp: {generated_label}", size=9)
    line(f"Original Deposit Amount: INR {demand.amount:.2f}", size=10)
    line(f"Approved Refund Amount: INR {getattr(approved_tx, 'amount', 0):.2f}", size=10)
    line(f"Deduction Amount: INR {demand.deducted_amount:.2f}", size=10)
    line(f"Refund Method/Status: {demand.status}", size=10)
    line(
        f"Approval User/Date: {getattr(getattr(approved_tx, 'approved_by', None), 'username', 'N/A')} / {getattr(approved_tx, 'created_at', 'N/A')}",
        size=9,
    )
    line(f"Refund Note: {getattr(refund_tx, 'reason', '') or 'N/A'}", size=10)

    c.showPage()
    c.save()
    data = buf.getvalue()
    buf.close()
    return data


def render_deposit_deduction_pdf(*, deduction_or_deposit_action) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    demand = deduction_or_deposit_action
    subscription = demand.subscription
    deduction_tx = subscription.deposit_transactions.filter(transaction_type="DEDUCTION").order_by("-created_at").first()

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, pageCompression=0)
    width, height = A4
    mx = 16 * mm
    cy = height - (52 * mm)
    document_no = f"DEDUCTION-{demand.reference_key or demand.id}"
    generated_label = _draw_common_header(
        canvas=c,
        width=width,
        height=height,
        margin_x=mx,
        document_no=document_no,
        title="Deposit Deduction",
    )

    def line(text: str, size: int = 10, lead: float = 13.5):
        nonlocal cy
        c.setFont("Helvetica", size)
        c.drawString(mx, cy, text)
        cy -= lead

    line("DEPOSIT DEDUCTION DOCUMENT", size=13, lead=17)
    line(f"Document Type: Deposit Deduction", size=10)
    line(f"Reference: {document_no}", size=10)
    line(f"Contract Reference: {subscription.contract_reference or f'SUB-{subscription.id}'}", size=10)
    line(f"Generated Timestamp: {generated_label}", size=9)
    line(f"Deducted Amount: INR {demand.deducted_amount:.2f}", size=10)
    line(f"Reason: {getattr(deduction_tx, 'reason', '') or 'N/A'}", size=10)
    line(f"Inspection/Damage Reference: {getattr(deduction_tx, 'inspection_id', None) or 'N/A'}", size=10)
    line(f"Remaining Refundable Balance: INR {demand.refundable_amount:.2f}", size=10)

    c.showPage()
    c.save()
    data = buf.getvalue()
    buf.close()
    return data


def render_return_inspection_pdf(*, return_or_inspection_record) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    inspection = return_or_inspection_record
    subscription = inspection.subscription
    customer = getattr(subscription, "customer", None)

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, pageCompression=0)
    width, height = A4
    mx = 16 * mm
    cy = height - (52 * mm)
    document_no = f"INSPECT-{inspection.id}"
    generated_label = _draw_common_header(
        canvas=c,
        width=width,
        height=height,
        margin_x=mx,
        document_no=document_no,
        title="Return Inspection",
    )

    def line(text: str, size: int = 10, lead: float = 13.5):
        nonlocal cy
        c.setFont("Helvetica", size)
        c.drawString(mx, cy, text)
        cy -= lead

    line("RETURN INSPECTION DOCUMENT", size=13, lead=17)
    line(f"Document Type: Return Inspection", size=10)
    line(f"Reference: {document_no}", size=10)
    line(f"Contract Reference: {subscription.contract_reference or f'SUB-{subscription.id}'}", size=10)
    line(f"Generated Timestamp: {generated_label}", size=9)
    line(f"Customer: {getattr(customer, 'name', 'Customer')}", size=10)
    line(f"Phone (masked): {_mask_phone(getattr(customer, 'phone', ''))}", size=10)
    line(f"Return Date: {inspection.inspection_date or 'N/A'}", size=10)
    line(f"Product Condition: {inspection.condition_recorded or 'N/A'}", size=10)
    line(f"Damage Notes: {inspection.damage_notes or 'N/A'}", size=10)
    line(f"Missing Parts: {inspection.stock_routing_notes or 'N/A'}", size=10)
    line("Photos/Attachments References: N/A", size=10)
    line(f"Inspector: {getattr(getattr(inspection, 'inspected_by', None), 'username', 'N/A')}", size=10)
    line(f"Receiver/Approver: {getattr(getattr(inspection, 'approved_by', None), 'username', 'N/A')}", size=10)
    line("Customer Acknowledgement / Signature: ______________________", size=10)

    c.showPage()
    c.save()
    data = buf.getvalue()
    buf.close()
    return data
