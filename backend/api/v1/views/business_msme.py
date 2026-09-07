"""MSME / Udyam registration details.

A small, self-contained slice of BusinessProfile rather than a model of its
own: Udyam registration describes the same legal entity the business profile
already describes, and splitting it would create two rows that must agree about
who the business is.

Why it is worth a dedicated endpoint rather than folding into
/admin/business-profile/: the MSME category determines the payment terms a
buyer owes this business under the MSMED Act 2006 s.15, so it is edited, cited
and audited on its own. The settings page that maintains it has called this
path since it was written.
"""
from __future__ import annotations

from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from api.v1.permissions import IsAdmin
from business_setup.models import BusinessProfile

EDITABLE_FIELDS = ("udyam_number", "enterprise_type", "enterprise_name", "nic_code")
ENTERPRISE_TYPES = {"MICRO", "SMALL", "MEDIUM", ""}


def _row(profile: BusinessProfile | None) -> dict:
    if profile is None:
        # A business that has not registered yet is a real state, not an error.
        # Blanks let the form render and be filled in; a 404 would leave the
        # page unable to record a registration for the first time.
        return {field: "" for field in EDITABLE_FIELDS} | {"is_registered": False}
    return {
        "udyam_number": profile.udyam_number,
        "enterprise_type": profile.enterprise_type,
        "enterprise_name": profile.enterprise_name,
        "nic_code": profile.nic_code,
        "is_registered": bool(profile.udyam_number),
    }


@api_view(["GET", "PATCH"])
@permission_classes([IsAdmin])
def business_msme_view(request):
    profile = BusinessProfile.objects.order_by("pk").first()

    if request.method == "GET":
        return Response(_row(profile))

    if profile is None:
        return Response(
            {
                "detail": (
                    "No business profile exists yet. Complete the business "
                    "profile before recording an MSME registration — the "
                    "registration describes that same entity."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    enterprise_type = request.data.get("enterprise_type")
    if enterprise_type is not None:
        normalised = str(enterprise_type or "").upper()
        if normalised not in ENTERPRISE_TYPES:
            return Response(
                {
                    "enterprise_type": [
                        f"'{enterprise_type}' is not an MSME category."
                    ],
                    "allowed": sorted(t for t in ENTERPRISE_TYPES if t),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    with transaction.atomic():
        updated = []
        for field in EDITABLE_FIELDS:
            if field not in request.data:
                continue
            value = request.data.get(field)
            value = "" if value is None else str(value).strip()
            if field == "enterprise_type":
                value = value.upper()
            setattr(profile, field, value)
            updated.append(field)
        if updated:
            profile.save(update_fields=updated)

    return Response(_row(profile))
