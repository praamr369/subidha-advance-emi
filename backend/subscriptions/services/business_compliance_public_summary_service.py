from __future__ import annotations

from typing import Any

from subscriptions.models_business_compliance_review import BusinessComplianceReviewStatus
from subscriptions.models_business_setup import (
    BusinessComplianceDocument,
    BusinessComplianceDocumentType,
    BusinessComplianceDocumentVerificationStatus,
    BusinessComplianceDocumentVisibility,
    BusinessProfile,
    PublicBusinessProfile,
)


def _clean_text(value: str | None) -> str:
    return (value or "").strip()


def _verified_approved_doc_exists(document_type: str) -> bool:
    return BusinessComplianceDocument.objects.filter(
        document_type=document_type,
        verification_status=BusinessComplianceDocumentVerificationStatus.VERIFIED,
        is_active=True,
        review_state__review_status=BusinessComplianceReviewStatus.APPROVED,
    ).exists()


def _public_summary_queryset():
    return (
        BusinessComplianceDocument.objects.filter(
            is_active=True,
            public_visibility=BusinessComplianceDocumentVisibility.PUBLIC_SUMMARY_ONLY,
            verification_status=BusinessComplianceDocumentVerificationStatus.VERIFIED,
            review_state__review_status=BusinessComplianceReviewStatus.APPROVED,
            review_state__approved_public_summary=True,
        )
        .exclude(public_summary="")
        .order_by("document_type", "-created_at", "-id")
    )


def _build_business_address(profile: BusinessProfile | None, public_profile: PublicBusinessProfile | None) -> str:
    public_address = _clean_text(getattr(public_profile, "address_text", ""))
    if public_address:
        return public_address
    if not profile:
        return "Asansol, West Bengal, India"
    parts = [
        _clean_text(profile.address_line_1),
        _clean_text(profile.address_line_2),
        _clean_text(profile.landmark),
        _clean_text(profile.city),
        _clean_text(profile.district),
        _clean_text(profile.state),
        _clean_text(profile.postal_code),
        _clean_text(profile.country),
    ]
    return ", ".join(part for part in parts if part) or "Asansol, West Bengal, India"


def get_public_business_compliance_summary() -> dict[str, Any]:
    business_profile = BusinessProfile.objects.filter(is_active=True).order_by("-created_at", "-id").first()
    public_profile = PublicBusinessProfile.objects.filter(is_active=True).order_by("-created_at", "-id").first()
    website = _clean_text(getattr(business_profile, "website_url", "")) or "subidhafurnitureasansol.com"
    phone = _clean_text(getattr(public_profile, "support_phone", "")) or _clean_text(getattr(business_profile, "primary_phone", "")) or "Not provided"
    email = _clean_text(getattr(public_profile, "support_email", "")) or _clean_text(getattr(business_profile, "primary_email", "")) or "Not provided"
    address = _build_business_address(business_profile, public_profile)

    gst_verified = _verified_approved_doc_exists(BusinessComplianceDocumentType.GST_CERTIFICATE)
    udyam_verified = _verified_approved_doc_exists(BusinessComplianceDocumentType.UDYAM_CERTIFICATE)

    gst_status_text = "Provided on verified business records. Public details are shared only through approved channels." if gst_verified else "Not provided / will be updated after registration."
    if not gst_verified and _clean_text(getattr(business_profile, "gstin", "")):
        gst_status_text = "GST registration is available. Number is not publicly listed on this page."

    documents = [
        {
            "document_type": row.document_type,
            "title": row.title or row.get_document_type_display(),
            "verification_status": row.verification_status,
            "public_summary": row.public_summary,
            "verified_at": row.verified_at,
            "is_publicly_downloadable": False,
        }
        for row in _public_summary_queryset()
    ]

    return {
        "business_name": "Subidha Furniture",
        "business_location": "Asansol, West Bengal, India",
        "website_url": website,
        "business_phone": phone,
        "business_email": email,
        "business_address": address,
        "gst_status_text": gst_status_text,
        "udyam_status_text": "Provided on verified business records. Public details are shared only through approved channels." if udyam_verified else "Not provided / will be updated after registration.",
        "public_documents": documents,
        "private_document_disclaimer": "Private compliance documents are not publicly downloadable by default. Only approved public-safe summaries are shown.",
    }
