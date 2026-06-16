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


def _first_branding_value(profile, candidate_fields: tuple[str, ...]) -> str:
    """Return the first non-empty value among candidate attribute names.

    BusinessProfile field names have varied over time (e.g. ``pan`` vs
    ``pan_number``). Branding rendering must never assume one specific spelling,
    so we probe a list of compatible names defensively and fall back to "" when
    none of them exist or carry a value. This keeps contract/receipt PDF
    generation crash-free even when optional branding data is absent.
    """
    for field_name in candidate_fields:
        value = getattr(profile, field_name, None)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


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
        _first_branding_value(profile, ("address_line_1",)),
        _first_branding_value(profile, ("address_line_2",)),
        _first_branding_value(profile, ("landmark",)),
        _first_branding_value(profile, ("city",)),
        _first_branding_value(profile, ("district",)),
        _first_branding_value(profile, ("state",)),
        _first_branding_value(profile, ("postal_code",)),
        _first_branding_value(profile, ("country",)),
    ]
    address = ", ".join([bit for bit in address_bits if bit])

    gst_value = _first_branding_value(profile, ("gstin", "gst", "gst_number", "tax_id"))
    pan_value = _first_branding_value(
        profile, ("pan", "pan_number", "owner_pan", "business_pan")
    )
    tax_bits = []
    if gst_value:
        tax_bits.append(f"GST: {gst_value}")
    if pan_value:
        tax_bits.append(f"PAN: {pan_value}")

    legal_name = _first_branding_value(profile, ("legal_name",))
    trade_name = _first_branding_value(profile, ("trade_name",))
    business_name = trade_name or legal_name or "Subidha Furniture"
    return PdfBrandingContext(
        business_name=business_name,
        address=address,
        phone=_first_branding_value(profile, ("primary_phone", "phone")),
        email=_first_branding_value(profile, ("primary_email", "email")),
        tax_line=" | ".join(tax_bits),
        watermark=(trade_name or legal_name or "SUBIDHA").upper(),
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
