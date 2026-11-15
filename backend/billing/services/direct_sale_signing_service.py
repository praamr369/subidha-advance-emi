import base64
import logging
import urllib.parse
from decimal import Decimal
from typing import Any

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.utils import timezone

from billing.models import DirectSale

logger = logging.getLogger(__name__)

DIRECT_SALE_SIGNING_SALT = "subidha.direct_sale.signing.v2"
DIRECT_SALE_SIGNING_MAX_AGE = 86400 * 14  # 14 days


def generate_direct_sale_signing_token(direct_sale_id: int) -> str:
    """Generate a tamper-proof timestamped signing token for a direct-sale invoice."""
    signer = TimestampSigner(salt=DIRECT_SALE_SIGNING_SALT)
    return signer.sign(str(direct_sale_id))


def verify_direct_sale_signing_token(token: str) -> int:
    """
    Verifies signing token and returns direct_sale_id. Raises BadSignature or SignatureExpired.
    Safely decodes percent-encoded tokens to ensure seamless resolution from mobile browsers,
    QR scanners, WhatsApp, and SMS links.
    """
    signer = TimestampSigner(salt=DIRECT_SALE_SIGNING_SALT)
    clean_token = (token or "").strip()
    if "%" in clean_token:
        try:
            clean_token = urllib.parse.unquote(clean_token)
        except Exception:
            pass
    if "%" in clean_token:
        try:
            clean_token = urllib.parse.unquote(clean_token)
        except Exception:
            pass
    direct_sale_id_str = signer.unsign(clean_token, max_age=DIRECT_SALE_SIGNING_MAX_AGE)
    return int(direct_sale_id_str)


def save_direct_sale_signature(
    sale: DirectSale,
    *,
    signature_data: str | None = None,
    signature_file: Any | None = None,
    signer_type: str = "AUTHORIZED",
    signer_name: str = "",
    ip_address: str = "",
) -> dict:
    """
    Saves digital signature image and metadata to DirectSale.
    Supports AUTHORIZED (store/owner), CUSTOMER (receiver), or BOTH.
    Stores base64 data URI directly for instant print rendering and saves physical
    file to default storage for archiving.
    """
    now = timezone.now()
    clean_data_uri = (signature_data or "").strip()
    file_saved_url = None

    if not clean_data_uri and signature_file:
        try:
            content = signature_file.read()
            b64_str = base64.b64encode(content).decode("ascii")
            content_type = getattr(signature_file, "content_type", "image/png")
            clean_data_uri = f"data:{content_type};base64,{b64_str}"
        except Exception as exc:
            logger.warning("Failed to read uploaded signature file: %s", exc)

    if not clean_data_uri:
        raise ValueError("Digital signature drawing or image is required.")

    # Archive physical file in media storage
    try:
        if "base64," in clean_data_uri:
            _, encoded = clean_data_uri.split("base64,", 1)
            data_bytes = base64.b64decode(encoded)
            file_name = f"signatures/direct_sales/sig_sale_{sale.id}_{signer_type.lower()}_{int(now.timestamp())}.png"
            saved_path = default_storage.save(file_name, ContentFile(data_bytes))
            file_saved_url = default_storage.url(saved_path)
    except Exception as exc:
        logger.warning("Could not persist archive signature file: %s", exc)

    update_fields = ["updated_at"]
    type_upper = (signer_type or "AUTHORIZED").upper()

    metadata = dict(sale.signature_metadata or {})
    sig_entry = {
        "signer_type": type_upper,
        "signer_name": signer_name or ("Subidha Furniture" if type_upper == "AUTHORIZED" else "Customer"),
        "signed_at": now.isoformat(),
        "ip_address": ip_address,
        "file_url": file_saved_url,
    }

    # Append to immutable signature history so prior signatures can always be recalled/restored
    history = list(metadata.get("history") or [])
    history.append({
        "signer_type": type_upper,
        "signer_name": sig_entry["signer_name"],
        "signed_at": sig_entry["signed_at"],
        "ip_address": ip_address,
        "signature_data": clean_data_uri,
        "file_url": file_saved_url,
    })
    metadata["history"] = history[-20:]

    if type_upper in ("AUTHORIZED", "BOTH"):
        sale.authorized_signature = clean_data_uri
        sale.authorized_signed_at = now
        update_fields.extend(["authorized_signature", "authorized_signed_at"])
        metadata["authorized"] = sig_entry

    if type_upper in ("CUSTOMER", "BOTH"):
        sale.customer_signature = clean_data_uri
        sale.customer_signed_at = now
        update_fields.extend(["customer_signature", "customer_signed_at"])
        metadata["customer"] = sig_entry

    metadata["last_signed_at"] = now.isoformat()
    sale.signature_metadata = metadata
    update_fields.append("signature_metadata")

    DirectSale.objects.filter(pk=sale.pk).update(
        **{f: getattr(sale, f) for f in update_fields if hasattr(sale, f)}
    )

    try:
        from subscriptions.models import AuditLog
        from subscriptions.services.audit_service import log_audit

        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=sale,
            performed_by=None,
            metadata={
                "event": "DIRECT_SALE_DIGITAL_SIGNATURE_ATTACHED",
                "direct_sale_id": sale.id,
                "sale_no": sale.sale_no,
                "signer_type": type_upper,
                "signer_name": sig_entry["signer_name"],
                "signed_at": now.isoformat(),
                "ip_address": ip_address,
            },
        )
    except Exception:
        pass

    return {
        "success": True,
        "direct_sale_id": sale.id,
        "signer_type": type_upper,
        "signed_at": now.isoformat(),
        "authorized_signature": sale.authorized_signature or None,
        "customer_signature": sale.customer_signature or None,
        "file_url": file_saved_url,
    }


def recall_direct_sale_signature(
    sale: DirectSale,
    *,
    action: str = "assign_to_customer",
    history_index: int | None = None,
    target_role: str = "CUSTOMER",
    performed_by: Any | None = None,
) -> dict:
    """
    Recalls or reassigns signatures for DirectSale:
    - "assign_to_customer": Takes the current authorized signature (or latest history item)
      and sets it as the customer signature. Clears authorized signature so owner can sign.
    - "copy_to_customer": Copies the current authorized signature to customer signature without clearing.
    - "assign_to_authorized": Copies/moves customer signature to authorized signature.
    - "swap": Swaps customer and authorized signatures.
    - "restore_from_history": Restores signature from history (history_index) to target_role.
    """
    now = timezone.now()
    metadata = dict(sale.signature_metadata or {})
    history = list(metadata.get("history") or [])
    update_fields = ["updated_at"]

    if action == "assign_to_customer":
        sig_data = sale.authorized_signature
        sig_signed_at = sale.authorized_signed_at or now
        sig_name = sale.customer_name_snapshot or (sale.customer.name if sale.customer else "Customer")

        if not sig_data and history:
            # Fall back to latest signature in history
            sig_data = history[-1].get("signature_data") or ""
            sig_signed_at = now

        if not sig_data:
            raise ValueError("No signature available to assign to customer.")

        sale.customer_signature = sig_data
        sale.customer_signed_at = sig_signed_at
        sale.authorized_signature = ""
        sale.authorized_signed_at = None
        update_fields.extend(["customer_signature", "customer_signed_at", "authorized_signature", "authorized_signed_at"])

        metadata["customer"] = {
            "signer_type": "CUSTOMER",
            "signer_name": sig_name,
            "signed_at": sig_signed_at.isoformat() if hasattr(sig_signed_at, "isoformat") else str(sig_signed_at),
            "recalled_from": "authorized",
        }
        metadata.pop("authorized", None)

    elif action == "copy_to_customer":
        sig_data = sale.authorized_signature
        sig_signed_at = sale.authorized_signed_at or now
        sig_name = sale.customer_name_snapshot or (sale.customer.name if sale.customer else "Customer")

        if not sig_data and history:
            sig_data = history[-1].get("signature_data") or ""
            sig_signed_at = now

        if not sig_data:
            raise ValueError("No signature available to copy to customer.")

        sale.customer_signature = sig_data
        sale.customer_signed_at = sig_signed_at
        update_fields.extend(["customer_signature", "customer_signed_at"])

        metadata["customer"] = {
            "signer_type": "CUSTOMER",
            "signer_name": sig_name,
            "signed_at": sig_signed_at.isoformat() if hasattr(sig_signed_at, "isoformat") else str(sig_signed_at),
            "copied_from": "authorized",
        }

    elif action == "swap":
        if not sale.authorized_signature and not sale.customer_signature:
            raise ValueError("No signatures available to swap.")
        sale.authorized_signature, sale.customer_signature = sale.customer_signature, sale.authorized_signature
        sale.authorized_signed_at, sale.customer_signed_at = sale.customer_signed_at, sale.authorized_signed_at
        update_fields.extend(["authorized_signature", "authorized_signed_at", "customer_signature", "customer_signed_at"])

        auth_meta = metadata.get("authorized")
        cust_meta = metadata.get("customer")
        if auth_meta:
            metadata["customer"] = auth_meta
        else:
            metadata.pop("customer", None)
        if cust_meta:
            metadata["authorized"] = cust_meta
        else:
            metadata.pop("authorized", None)

    elif action == "restore_from_history":
        if not history:
            raise ValueError("No signature history available.")
        if history_index is None:
            history_index = len(history) - 1
        if history_index < 0 or history_index >= len(history):
            raise ValueError(f"Invalid history index {history_index}.")
        entry = history[history_index]
        sig_data = entry.get("signature_data")
        if not sig_data:
            raise ValueError("No signature drawing data available in this history entry.")

        target_upper = (target_role or "CUSTOMER").upper()
        if target_upper == "CUSTOMER":
            sale.customer_signature = sig_data
            sale.customer_signed_at = now
            update_fields.extend(["customer_signature", "customer_signed_at"])
            metadata["customer"] = {
                "signer_type": "CUSTOMER",
                "signer_name": entry.get("signer_name") or sale.customer_name_snapshot or "Customer",
                "signed_at": now.isoformat(),
                "restored_from_history_index": history_index,
            }
        else:
            sale.authorized_signature = sig_data
            sale.authorized_signed_at = now
            update_fields.extend(["authorized_signature", "authorized_signed_at"])
            metadata["authorized"] = {
                "signer_type": "AUTHORIZED",
                "signer_name": entry.get("signer_name") or "Subidha Furniture",
                "signed_at": now.isoformat(),
                "restored_from_history_index": history_index,
            }
    else:
        raise ValueError(f"Unknown recall action: {action}")

    metadata["last_recalled_at"] = now.isoformat()
    sale.signature_metadata = metadata
    update_fields.append("signature_metadata")

    DirectSale.objects.filter(pk=sale.pk).update(
        **{f: getattr(sale, f) for f in update_fields if hasattr(sale, f)}
    )

    try:
        from subscriptions.models import AuditLog
        from subscriptions.services.audit_service import log_audit

        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=sale,
            performed_by=performed_by,
            metadata={
                "event": "DIRECT_SALE_SIGNATURE_RECALLED",
                "direct_sale_id": sale.id,
                "sale_no": sale.sale_no,
                "action": action,
                "target_role": target_role,
                "history_index": history_index,
            },
        )
    except Exception:
        pass

    return {
        "success": True,
        "direct_sale_id": sale.id,
        "action": action,
        "authorized_signature": sale.authorized_signature or None,
        "customer_signature": sale.customer_signature or None,
        "authorized_signed_at": sale.authorized_signed_at.isoformat() if sale.authorized_signed_at else None,
        "customer_signed_at": sale.customer_signed_at.isoformat() if sale.customer_signed_at else None,
    }


def get_direct_sale_signing_payload(sale: DirectSale, request=None) -> dict:
    """Builds serialization for both admin modal and public mobile signing page."""
    token = generate_direct_sale_signing_token(sale.id)
    signing_path = f"/sign-invoice/{token}?role=customer"
    customer_signing_path = f"/sign-invoice/{token}?role=customer"
    authorized_signing_path = f"/sign-invoice/{token}?role=authorized"

    signing_url = request.build_absolute_uri(signing_path) if request else signing_path
    customer_signing_url = request.build_absolute_uri(customer_signing_path) if request else customer_signing_path
    authorized_signing_url = request.build_absolute_uri(authorized_signing_path) if request else authorized_signing_path

    # Extract invoice number
    inv = sale.billing_invoices.order_by("-id").first() if hasattr(sale, "billing_invoices") else None
    invoice_no = getattr(inv, "document_no", None) or getattr(inv, "invoice_no", None) or sale.sale_no or f"SALE-{sale.id}"

    # Extract customer details
    cust_name = sale.customer_name_snapshot or (sale.customer.name if sale.customer else "Walk-in Customer")
    cust_phone = sale.customer_phone_snapshot or (sale.customer.phone if sale.customer else "")

    # Line items summary
    lines_summary = []
    for line in sale.lines.all() if hasattr(sale, "lines") else []:
        lines_summary.append({
            "id": line.id,
            "description": line.description,
            "quantity": str(line.quantity),
            "unit_price": str(line.unit_price),
            "line_total": str(line.line_total),
        })

    metadata = sale.signature_metadata or {}
    history = metadata.get("history") or []
    history_summary = []
    for idx, item in enumerate(history):
        history_summary.append({
            "index": idx,
            "signer_type": item.get("signer_type", ""),
            "signer_name": item.get("signer_name", ""),
            "signed_at": item.get("signed_at", ""),
            "file_url": item.get("file_url", ""),
            "has_data": bool(item.get("signature_data")),
        })

    can_recall = bool(sale.authorized_signature and not sale.customer_signature) or len(history) > 0

    return {
        "success": True,
        "direct_sale_id": sale.id,
        "sale_no": sale.sale_no or f"SALE-{sale.id}",
        "billing_invoice_no": invoice_no,
        "sale_date": str(sale.sale_date),
        "customer_name": cust_name,
        "customer_phone": cust_phone,
        "tax_mode": sale.tax_mode,
        "grand_total": str(sale.grand_total),
        "received_total": str(sale.received_total),
        "balance_total": str(sale.balance_total),
        "token": token,
        "signing_path": signing_path,
        "signing_url": signing_url,
        "customer_signing_path": customer_signing_path,
        "customer_signing_url": customer_signing_url,
        "authorized_signing_path": authorized_signing_path,
        "authorized_signing_url": authorized_signing_url,
        "has_signature": bool(sale.authorized_signature or sale.customer_signature),
        "authorized_signed": bool(sale.authorized_signature),
        "authorized_signed_at": sale.authorized_signed_at.isoformat() if sale.authorized_signed_at else None,
        "customer_signed": bool(sale.customer_signature),
        "customer_signed_at": sale.customer_signed_at.isoformat() if sale.customer_signed_at else None,
        "authorized_signature": sale.authorized_signature or None,
        "customer_signature": sale.customer_signature or None,
        "signature_history": history_summary,
        "can_recall": can_recall,
        "lines": lines_summary,
    }

