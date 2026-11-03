import logging
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.core.signing import BadSignature, SignatureExpired

from billing.models import DirectSale
from billing.services.direct_sale_signing_service import (
    verify_direct_sale_signing_token,
    get_direct_sale_signing_payload,
    save_direct_sale_signature,
)
from api.v1.views.public_contract_sign import get_official_support_phone

logger = logging.getLogger(__name__)


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def public_direct_sale_sign_view(request, token: str):
    """
    Public endpoint allowing store operators or customers to review direct-sale invoice summary
    and capture digital signature directly from smartphone touchscreen.
    GET:  Returns invoice summary, customer name, grand total, and current signature status.
    POST: Accepts touchscreen signature drawing (base64 data URI or uploaded image) and updates DirectSale.
    """
    support_phone = get_official_support_phone()

    try:
        sale_id = verify_direct_sale_signing_token(token)
    except SignatureExpired:
        return Response(
            {
                "error": "This invoice signing link has expired. Please contact Subidha Furniture for a new link.",
                "support_phone": support_phone,
            },
            status=status.HTTP_410_GONE,
        )
    except (BadSignature, Exception):
        return Response(
            {
                "error": "Invalid invoice signing link or token.",
                "support_phone": support_phone,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    sale = (
        DirectSale.objects.select_related("customer", "branch", "cash_counter", "finance_account")
        .prefetch_related("lines", "billing_invoices")
        .filter(pk=sale_id)
        .first()
    )
    if not sale:
        return Response(
            {"error": "Direct sale invoice not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        payload = get_direct_sale_signing_payload(sale, request=request)
        return Response(payload, status=status.HTTP_200_OK)

    # POST: Process digital signature
    signature_data = request.data.get("signature_data")
    signature_image = request.FILES.get("signature_image")
    signer_type = (request.data.get("signer_type") or "AUTHORIZED").upper()
    signer_name = request.data.get("signer_name", "").strip()

    if not signature_data and not signature_image:
        return Response(
            {"error": "Digital signature drawing or image is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        result = save_direct_sale_signature(
            sale,
            signature_data=signature_data,
            signature_file=signature_image,
            signer_type=signer_type,
            signer_name=signer_name,
            ip_address=request.META.get("REMOTE_ADDR", ""),
        )
        return Response(
            {
                "success": True,
                "message": "Signature saved successfully.",
                "details": result,
            },
            status=status.HTTP_200_OK,
        )
    except ValueError as val_err:
        return Response({"error": str(val_err)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        logger.exception("Failed to save direct sale signature: %s", exc)
        return Response(
            {"error": "Internal error saving signature. Please try again."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

