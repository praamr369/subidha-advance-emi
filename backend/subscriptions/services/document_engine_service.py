from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass
from typing import Any, Iterable

from django.apps import apps
from django.core.exceptions import PermissionDenied
from django.db import models
from django.utils import timezone

from billing.models import ReceiptDocument
from subscriptions.models import SubscriptionDocument


@dataclass(frozen=True)
class DocumentMeta:
    """
    Stable internal document metadata contract.

    This is intentionally additive and does not change any existing APIs.
    It is designed to unify:
    - file-backed SubscriptionDocument rows
    - record-backed ReceiptDocument rows whose PDFs are rendered on-demand
    """

    document_type: str
    document_number: str | None
    source_model: str
    source_object_id: int
    customer_id: int | None
    branch_id: int | None
    status: str
    generated_by_user_id: int | None
    generated_at: timezone.datetime | None
    checksum_sha256: str | None
    metadata: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class DocumentSource(models.TextChoices):  # type: ignore[name-defined]
    RECEIPT = "billing.ReceiptDocument", "ReceiptDocument"
    SUBSCRIPTION_DOCUMENT = "subscriptions.SubscriptionDocument", "SubscriptionDocument"


def checksum_sha256_bytes(value: bytes) -> str:
    h = hashlib.sha256()
    h.update(value)
    return h.hexdigest()


def checksum_sha256_file(field_file, *, chunk_size: int = 1024 * 1024) -> str | None:
    if not field_file:
        return None
    h = hashlib.sha256()
    try:
        for chunk in field_file.chunks(chunk_size=chunk_size):
            h.update(chunk)
    except Exception:
        return None
    return h.hexdigest()


def source_identity(instance) -> tuple[str, int]:
    meta = getattr(instance, "_meta", None)
    if not meta:
        raise ValueError("Unsupported instance for source_identity().")
    if not getattr(instance, "pk", None):
        raise ValueError("Instance must be saved before building source identity.")
    return f"{meta.app_label}.{meta.object_name}", int(instance.pk)


def _model_label(instance) -> str:
    meta = getattr(instance, "_meta", None)
    if not meta:
        raise ValueError("Unsupported instance for model label.")
    return f"{meta.app_label}.{meta.object_name}"


def user_can_view_receipt(*, user, receipt: ReceiptDocument) -> bool:
    role = getattr(user, "role", None)
    if role == "ADMIN":
        return True
    if role == "CUSTOMER":
        customer = getattr(user, "customer_profile", None)
        return bool(customer and receipt.customer_id and receipt.customer_id == customer.id)
    return False


def user_can_view_subscription_document(*, user, doc: SubscriptionDocument) -> bool:
    role = getattr(user, "role", None)
    if role == "ADMIN":
        return True
    if role == "CUSTOMER":
        customer = getattr(user, "customer_profile", None)
        return bool(
            customer
            and getattr(doc.subscription, "customer_id", None) == customer.id
        )
    return False


def assert_user_can_view_document_source(*, user, source) -> None:
    if isinstance(source, ReceiptDocument):
        if not user_can_view_receipt(user=user, receipt=source):
            raise PermissionDenied("Not allowed to access this receipt document.")
        return
    if isinstance(source, SubscriptionDocument):
        if not user_can_view_subscription_document(user=user, doc=source):
            raise PermissionDenied("Not allowed to access this subscription document.")
        return
    raise PermissionDenied("Not allowed to access this document source.")


def resolve_document_source(*, source_model: str, source_object_id: int):
    """
    Resolve a document source for future reconciliation use-cases.

    Only known safe source models are supported in Phase C.
    """
    cleaned = (source_model or "").strip()
    allowed = {choice for choice, _ in DocumentSource.choices}
    if cleaned not in allowed:
        raise ValueError("Unsupported source_model.")

    app_label, model_name = cleaned.split(".", 1)
    model = apps.get_model(app_label, model_name)
    instance = model.objects.filter(pk=source_object_id).first()
    if instance is None:
        raise ValueError("Source record not found.")
    return instance


def receipt_to_document_meta(*, receipt: ReceiptDocument) -> DocumentMeta:
    document_number = receipt.receipt_no or f"RCT-{receipt.id}"
    payment = getattr(receipt, "payment", None)
    collected_by = getattr(payment, "collected_by", None) if payment else None
    return DocumentMeta(
        document_type="MONEY_RECEIPT_PDF",
        document_number=document_number,
        source_model=_model_label(receipt),
        source_object_id=receipt.id,
        customer_id=receipt.customer_id,
        branch_id=getattr(receipt, "branch_id", None),
        status=receipt.status,
        generated_by_user_id=getattr(collected_by, "id", None),
        generated_at=getattr(receipt, "created_at", None),
        checksum_sha256=None,  # on-demand render; checksum can be computed from rendered bytes when needed
        metadata={
            "receipt_type": receipt.receipt_type,
            "receipt_date": str(receipt.receipt_date) if receipt.receipt_date else None,
            "amount": f"{receipt.amount:.2f}" if receipt.amount is not None else None,
            "payment_id": receipt.payment_id,
            "subscription_id": receipt.subscription_id,
            "billing_invoice_id": receipt.billing_invoice_id,
            "direct_sale_id": receipt.direct_sale_id,
            "source_type": receipt.source_type,
            "source_reference": receipt.source_reference,
            "printed_at": receipt.printed_at.isoformat() if receipt.printed_at else None,
            "printed_count": receipt.printed_count,
        },
    )


def subscription_document_to_document_meta(*, doc: SubscriptionDocument) -> DocumentMeta:
    subscription = getattr(doc, "subscription", None)
    subscription_id = getattr(subscription, "id", None)
    subscription_number = getattr(subscription, "subscription_number", None) if subscription else None
    contract_reference = getattr(subscription, "contract_reference", None) if subscription else None
    document_number = contract_reference or subscription_number or (f"SUB-{subscription_id}" if subscription_id else None)
    return DocumentMeta(
        document_type=doc.document_type,
        document_number=document_number,
        source_model=_model_label(doc),
        source_object_id=doc.id,
        customer_id=getattr(subscription, "customer_id", None) if subscription else None,
        branch_id=getattr(subscription, "branch_id", None) if subscription else None,
        status=doc.verification_status,
        generated_by_user_id=getattr(doc.generated_by, "id", None),
        generated_at=getattr(doc, "created_at", None),
        checksum_sha256=checksum_sha256_file(doc.file),
        metadata={
            "subscription_id": doc.subscription_id,
            "subscription_number": subscription_number,
            "document_version": doc.document_version,
            "uploaded_by_user_id": getattr(doc.uploaded_by, "id", None),
            "file_url": doc.file.url if doc.file else None,
            "file_name": doc.file.name.split("/")[-1] if doc.file else "",
            "regeneration_reason": doc.regeneration_reason,
            "notes": doc.notes,
        },
    )


def build_document_meta_list(
    *,
    receipts: Iterable[ReceiptDocument] = (),
    subscription_documents: Iterable[SubscriptionDocument] = (),
) -> list[DocumentMeta]:
    items: list[DocumentMeta] = []
    for receipt in receipts:
        items.append(receipt_to_document_meta(receipt=receipt))
    for doc in subscription_documents:
        items.append(subscription_document_to_document_meta(doc=doc))
    return items
