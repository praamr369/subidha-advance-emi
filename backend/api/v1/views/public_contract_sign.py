import base64
import logging
import re
from django.core.files.base import ContentFile
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from contracts.models import Subscription, SubscriptionDocument
from subscriptions.enums import DocumentVerificationStatus, SubscriptionDocumentType
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit

logger = logging.getLogger(__name__)

CONTRACT_SIGNING_SALT = "subidha.contract.signing.v1"
CONTRACT_SIGNING_MAX_AGE = 86400 * 14  # 14 days


def generate_contract_signing_token(subscription_id: int) -> str:
    """Generate a tamper-proof timestamped signing token for a contract/subscription."""
    signer = TimestampSigner(salt=CONTRACT_SIGNING_SALT)
    return signer.sign(str(subscription_id))


def verify_contract_signing_token(token: str) -> int:
    """Verifies signing token and returns subscription_id. Raises BadSignature or SignatureExpired."""
    signer = TimestampSigner(salt=CONTRACT_SIGNING_SALT)
    subscription_id_str = signer.unsign(token, max_age=CONTRACT_SIGNING_MAX_AGE)
    return int(subscription_id_str)


def _mask_phone(phone: str | None) -> str:
    if not phone:
        return "—"
    clean = re.sub(r"\D", "", phone)
    if len(clean) >= 10:
        return f"{clean[:2]}******{clean[-2:]}"
    return "****"


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def public_contract_sign_view(request, token: str):
    """
    Public mobile endpoint allowing customers to review contract summary and submit digital signature.
    GET:  Returns contract details for review.
    POST: Accepts digital touchscreen signature (base64 data URL or uploaded file) and attaches to subscription.
    """
    try:
        subscription_id = verify_contract_signing_token(token)
    except SignatureExpired:
        return Response(
            {"error": "This contract signing link has expired. Please contact Subidha Furniture for an updated link."},
            status=status.HTTP_410_GONE,
        )
    except (BadSignature, Exception):
        return Response(
            {"error": "Invalid signing link or token."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    subscription = (
        Subscription.objects.select_related("customer", "product")
        .prefetch_related("contract_items__product", "documents")
        .filter(pk=subscription_id)
        .first()
    )
    if not subscription:
        return Response({"error": "Contract record not found."}, status=status.HTTP_404_NOT_FOUND)

    customer = getattr(subscription, "customer", None)
    product = getattr(subscription, "product", None)
    contract_ref = (
        getattr(subscription, "subscription_number", None)
        or getattr(subscription, "contract_reference", None)
        or f"SUB-{subscription.id}"
    )

    existing_sig = (
        subscription.documents.filter(document_type=SubscriptionDocumentType.CUSTOMER_SIGNATURE)
        .order_by("-id")
        .first()
    )

    if request.method == "GET":
        items_summary = []
        if hasattr(subscription, "contract_items"):
            for itm in subscription.contract_items.all():
                pname = getattr(itm.product, "name", "Furniture Item")
                items_summary.append({
                    "name": pname,
                    "quantity": itm.quantity,
                    "monthly_amount": str(itm.monthly_amount),
                })

        product_display_name = getattr(product, "name", "")
        if not product_display_name and items_summary:
            product_display_name = f"{items_summary[0]['name']} (+{len(items_summary) - 1} more)" if len(items_summary) > 1 else items_summary[0]["name"]
        elif not product_display_name and subscription.product_snapshot:
            product_display_name = subscription.product_snapshot.get("name", "Furniture Package")

        sig_url = None
        if existing_sig and existing_sig.file:
            try:
                sig_url = request.build_absolute_uri(existing_sig.file.url)
            except Exception:
                sig_url = None

        return Response({
            "success": True,
            "subscription_id": subscription.id,
            "contract_ref": contract_ref,
            "plan_type": subscription.plan_type,
            "status": subscription.status,
            "customer_name": getattr(customer, "name", "Valued Customer"),
            "customer_phone_masked": _mask_phone(getattr(customer, "phone", "")),
            "customer_email": getattr(customer, "email", "") or "",
            "product_name": product_display_name or "Subidha Furniture",
            "items": items_summary,
            "total_amount": str(subscription.total_amount),
            "monthly_amount": str(subscription.monthly_amount),
            "tenure_months": subscription.tenure_months,
            "start_date": str(subscription.start_date) if subscription.start_date else None,
            "already_signed": bool(existing_sig),
            "signed_at": existing_sig.created_at.isoformat() if existing_sig else None,
            "signature_url": sig_url,
        })

    # POST: Process digital signature submission
    signer_name = request.data.get("customer_name_confirmation", "").strip() or getattr(customer, "name", "Customer")
    file_obj = None

    # Option A: Multipart image file upload
    if "signature_image" in request.FILES:
        file_obj = request.FILES["signature_image"]

    # Option B: Base64 Canvas data URI (data:image/png;base64,...)
    elif "signature_data" in request.data:
        data_uri = str(request.data["signature_data"]).strip()
        if "base64," in data_uri:
            try:
                header, encoded = data_uri.split("base64,", 1)
                data_bytes = base64.b64decode(encoded)
                timestamp_token = int(timezone.now().timestamp())
                filename = f"signature_sub_{subscription.id}_{timestamp_token}.png"
                file_obj = ContentFile(data_bytes, name=filename)
            except Exception as e:
                logger.warning("Failed to decode base64 signature: %s", e)
                return Response(
                    {"error": "Failed to process the signature drawing data. Please try drawing again."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

    if not file_obj:
        return Response(
            {"error": "Digital signature drawing or file is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    now = timezone.now()
    doc = SubscriptionDocument.objects.create(
        subscription=subscription,
        document_type=SubscriptionDocumentType.CUSTOMER_SIGNATURE,
        file=file_obj,
        notes=f"Digitally signed via mobile signing link by {signer_name} on {now.strftime('%d %b %Y, %I:%M %p')}.",
        verification_status=DocumentVerificationStatus.VERIFIED,
    )

    log_audit(
        action_type=AuditLog.ActionType.SUB_ACTIVATED if subscription.status == "DRAFT" else AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=doc,
        performed_by=None,
        metadata={
            "event": "CUSTOMER_DIGITAL_SIGNATURE_ATTACHED",
            "subscription_id": subscription.id,
            "document_id": doc.id,
            "contract_ref": contract_ref,
            "signer_name": signer_name,
            "signed_at": now.isoformat(),
            "ip_address": request.META.get("REMOTE_ADDR"),
        },
    )

    try:
        from subscriptions.services.operational_notification_service import (
            schedule_contract_signed_notification,
        )
        product_name = getattr(product, "name", "")
        if not product_name and subscription.product_snapshot:
            product_name = subscription.product_snapshot.get("name", "Furniture")

        schedule_contract_signed_notification(
            subscription_id=subscription.id,
            customer_user_id=getattr(customer, "user_id", None),
            contract_ref=contract_ref,
            plan_type=subscription.plan_type,
            product_name=product_name or "Furniture",
        )
    except Exception:
        pass

    return Response({
        "success": True,
        "message": "Your digital signature has been recorded and attached to your contract.",
        "contract_ref": contract_ref,
        "document_id": doc.id,
        "signed_at": now.isoformat(),
        "signature_url": request.build_absolute_uri(doc.file.url) if doc.file else None,
    }, status=status.HTTP_201_CREATED)
