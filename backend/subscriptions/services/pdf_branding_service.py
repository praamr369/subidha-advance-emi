from __future__ import annotations

from dataclasses import dataclass

from subscriptions.models_business_setup import BusinessProfile


@dataclass(frozen=True)
class PdfBrandingContext:
    business_name: str
    address: str
    phone: str
    email: str
    tax_line: str
    watermark: str


def get_branding_context() -> PdfBrandingContext:
    profile = BusinessProfile.objects.filter(is_active=True).order_by("-created_at", "-id").first()
    if not profile:
        return PdfBrandingContext(
            business_name="Subidha Furniture",
            address="",
            phone="",
            email="",
            tax_line="",
            watermark="SUBIDHA",
        )

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
    tax_bits = []
    if profile.gstin:
        tax_bits.append(f"GST: {profile.gstin}")
    if profile.pan:
        tax_bits.append(f"PAN: {profile.pan}")
    return PdfBrandingContext(
        business_name=profile.trade_name or profile.legal_name or "Subidha Furniture",
        address=address,
        phone=profile.primary_phone or "",
        email=profile.primary_email or "",
        tax_line=" | ".join(tax_bits),
        watermark=(profile.trade_name or profile.legal_name or "SUBIDHA").upper(),
    )


def draw_brand_header_footer(*, canvas, width, height, margin_x, branding: PdfBrandingContext, document_no: str, generated_at: str):
    canvas.setFont("Helvetica-Bold", 11)
    canvas.drawString(margin_x, height - 36, branding.business_name)
    canvas.setFont("Helvetica", 9)
    y = height - 50
    if branding.address:
        canvas.drawString(margin_x, y, branding.address[:140])
        y -= 12
    if branding.phone or branding.email:
        canvas.drawString(margin_x, y, f"Phone: {branding.phone or '—'}  Email: {branding.email or '—'}")
        y -= 12
    if branding.tax_line:
        canvas.drawString(margin_x, y, branding.tax_line)

    canvas.saveState()
    canvas.setFillGray(0.93)
    canvas.setFont("Helvetica-Bold", 44)
    canvas.translate(width / 2, height / 2)
    canvas.rotate(45)
    canvas.drawCentredString(0, 0, branding.watermark[:20])
    canvas.restoreState()

    canvas.setFont("Helvetica", 8)
    footer = f"Generated: {generated_at} | Document: {document_no} | Computer generated document"
    canvas.drawString(margin_x, 18, footer[:160])
