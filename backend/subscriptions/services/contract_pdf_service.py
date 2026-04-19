from __future__ import annotations

from io import BytesIO

from django.core.files.base import ContentFile
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    LeaseSubscriptionProfile,
    PlanType,
    RentSubscriptionProfile,
    Subscription,
    SubscriptionDocument,
    SubscriptionDocumentType,
)
from subscriptions.models_business_setup import BusinessProfile
from subscriptions.services.audit_service import log_audit


def _subscription_number(subscription: Subscription) -> str:
    return (
        getattr(subscription, "contract_reference", None)
        or getattr(subscription, "subscription_number", None)
        or f"SUB-{subscription.id}"
    )


def _business_header_lines() -> list[str]:
    profile = BusinessProfile.objects.filter(is_active=True).order_by("-created_at", "-id").first()
    if not profile:
        return ["Subidha Furniture", "Lucky Plan EMI System"]

    name = profile.trade_name or profile.legal_name
    address_bits = [
        profile.address_line_1,
        profile.address_line_2,
        profile.landmark,
        profile.city,
        profile.district,
        profile.state,
        profile.postal_code,
        profile.country,
    ]
    address = ", ".join([bit for bit in address_bits if (bit or "").strip()])
    lines = [name]
    if address:
        lines.append(address)
    if profile.primary_phone:
        lines.append(f"Phone: {profile.primary_phone}")
    if profile.primary_email:
        lines.append(f"Email: {profile.primary_email}")
    return lines


def generate_contract_pdf_for_subscription(*, subscription: Subscription, performed_by=None) -> SubscriptionDocument:
    """
    Generate and persist a single-page operational contract PDF for RENT/LEASE.

    Notes:
    - This is an operational template for lawyer review (no legal claims).
    - Stored as an auditable SubscriptionDocument row.
    """
    if subscription.plan_type not in (PlanType.RENT, PlanType.LEASE):
        raise ValueError("Contract PDF generation is supported only for RENT/LEASE subscriptions.")

    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "PDF generation dependency missing. Install reportlab in backend requirements."
        ) from exc

    if subscription.plan_type == PlanType.RENT:
        profile: RentSubscriptionProfile = subscription.rent_profile
        document_type = SubscriptionDocumentType.RENT_CONTRACT_PDF
        contract_title = "RENT Contract"
        buyout_line = None
        ownership_line = None
    else:
        profile = subscription.lease_profile  # type: ignore[assignment]
        document_type = SubscriptionDocumentType.LEASE_CONTRACT_PDF
        contract_title = "LEASE Contract"
        buyout_line = (
            f"Buyout Amount: INR {profile.buyout_amount:.2f}"
            if getattr(profile, "buyout_amount", None) is not None
            else None
        )
        ownership_line = (
            "Ownership Transfer Allowed: Yes"
            if getattr(profile, "ownership_transfer_allowed", False)
            else "Ownership Transfer Allowed: No"
        )

    generated_at = timezone.now()
    generated_date = timezone.localdate().strftime("%d %b %Y")

    customer = subscription.customer
    product = subscription.product
    contract_no = _subscription_number(subscription)

    # Compose PDF
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    margin_x = 16 * mm
    cursor_y = height - (18 * mm)

    def draw_line(text: str, *, size: int = 10, leading: float = 13.5):
        nonlocal cursor_y
        c.setFont("Helvetica", size)
        c.drawString(margin_x, cursor_y, text)
        cursor_y -= leading

    def draw_rule():
        nonlocal cursor_y
        cursor_y -= 2
        c.setLineWidth(0.6)
        c.line(margin_x, cursor_y, width - margin_x, cursor_y)
        cursor_y -= 10

    # Header
    c.setTitle(f"{contract_title} {contract_no}")
    for line in _business_header_lines():
        draw_line(line, size=11, leading=14.5)

    draw_rule()
    draw_line(f"{contract_title}", size=13, leading=16)
    draw_line(f"Contract No: {contract_no}", size=10)
    draw_line(f"Generated: {generated_date}", size=10)
    draw_rule()

    # Party + product
    draw_line("Customer", size=11, leading=14.5)
    draw_line(f"Name: {customer.name}", size=10)
    draw_line(f"Phone: {customer.phone}", size=10)
    draw_line("Product", size=11, leading=14.5)
    draw_line(f"Product: {product.name} ({product.product_code})", size=10)
    draw_line(f"Plan Type: {subscription.plan_type}", size=10)
    draw_rule()

    # Financial summary
    draw_line("Financial Summary", size=11, leading=14.5)
    draw_line(f"Contract Value: INR {subscription.total_amount:.2f}", size=10)
    draw_line(f"Tenure (months): {subscription.tenure_months}", size=10)
    draw_line(f"Recurring Amount (monthly): INR {subscription.monthly_amount:.2f}", size=10)
    draw_line(f"Security Deposit (%): {profile.security_deposit_percent}", size=10)
    draw_line(f"Security Deposit (amount): INR {profile.security_deposit_amount:.2f}", size=10)
    if buyout_line:
        draw_line(buyout_line, size=10)
    if ownership_line:
        draw_line(ownership_line, size=10)
    draw_rule()

    # Clauses (summary)
    draw_line("Operational Clauses Summary", size=11, leading=14.5)
    draw_line("- Security deposit is refundable subject to return-condition assessment.", size=10)
    draw_line("- Deductions may apply based on inspection notes and recorded return condition.", size=10)
    draw_line("- This is an operational template for internal use and lawyer review.", size=10)
    draw_line("- This document does not claim legal enforceability.", size=10)
    draw_rule()

    # Terms snapshot (truncated)
    terms = (profile.contract_terms_snapshot or "").strip()
    if terms:
        draw_line("Terms Snapshot (for audit)", size=11, leading=14.5)
        for line in terms.splitlines()[:18]:
            if not line.strip():
                continue
            draw_line(line.strip()[:110], size=9, leading=12.5)
        draw_rule()

    # Signatures
    draw_line("Signatures", size=11, leading=14.5)
    draw_line("Customer Signature: ____________________________", size=10)
    draw_line("Authorized Signature: __________________________", size=10)

    c.showPage()
    c.save()

    pdf_bytes = buffer.getvalue()
    buffer.close()

    filename = f"{subscription.plan_type.lower()}-contract-{contract_no}.pdf".replace("/", "-")
    content = ContentFile(pdf_bytes, name=filename)

    doc = SubscriptionDocument.objects.create(
        subscription=subscription,
        document_type=document_type,
        file=content,
        uploaded_by=performed_by,
        notes=f"Generated contract PDF on {generated_date}.",
    )

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "event": "CONTRACT_PDF_GENERATED",
            "subscription_id": subscription.id,
            "plan_type": subscription.plan_type,
            "document_id": doc.id,
            "document_type": document_type,
            "generated_at": generated_at.isoformat(),
        },
    )

    return doc

