"""Contract KYC / document readiness service.

Additive, non-breaking service layer that answers a single question for a
customer + plan type (+ optional contract): *is this contract ready to be
activated / have its final contract generated / be delivered, from a KYC and
document-completeness standpoint?*

Design notes
------------
* Direct sale is **never** gated here (KYC stays optional for direct sale).
* EMI / Rent / Lease readiness is always *computed* so the UI can show the
  checklist, but it is only *enforced* (hard-blocked) when the
  ``KYC_CONTRACT_GATING_ENABLED`` setting is True. This keeps the change
  additive: existing flows and tests continue to work unless a shop opts in.
* Nothing here touches EMI math, lucky-draw logic, payment posting, receipts,
  journals, or reconciliation. It only reads existing customer/subscription
  document state.
* It reuses the existing ``CustomerKycDocument`` (customer-level) and
  ``SubscriptionDocument`` (contract-level) storage. The additive
  ``CustomerKycDocument.category`` field classifies documents into readiness
  buckets; when a document has no explicit category we infer one from its
  ``document_type`` so historical rows still count.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from django.conf import settings
from rest_framework.exceptions import APIException

from subscriptions.models import (
    CustomerKycDocument,
    CustomerKycDocumentStatus,
    CustomerKycDocumentType,
    KycDocumentCategory,
    KycStatus,
    PlanType,
    SubscriptionDocument,
    SubscriptionDocumentType,
)

# ---------------------------------------------------------------------------
# Acceptance sets
# ---------------------------------------------------------------------------

# A customer's KYC is considered "good enough" to proceed when VERIFIED, the
# legacy APPROVED status, or the additive admin EXCEPTION_APPROVED override.
ACCEPTABLE_KYC_STATUSES = frozenset(
    {
        KycStatus.VERIFIED,
        KycStatus.APPROVED,
        KycStatus.EXCEPTION_APPROVED,
    }
)


# ---------------------------------------------------------------------------
# Readiness document requirement codes (categories surfaced to the UI/API)
# ---------------------------------------------------------------------------
class DocCode:
    ID_PROOF = "ID_PROOF"
    ADDRESS_PROOF = "ADDRESS_PROOF"
    CUSTOMER_PHOTO = "CUSTOMER_PHOTO"
    PHONE_VERIFICATION = "PHONE_VERIFICATION"
    SIGNED_CONTRACT = "SIGNED_CONTRACT"
    SECURITY_DEPOSIT_PROOF = "SECURITY_DEPOSIT_PROOF"
    DELIVERY_ADDRESS_PROOF = "DELIVERY_ADDRESS_PROOF"
    CONTRACT_PDF = "CONTRACT_PDF"
    ASSET_HANDOVER_ACKNOWLEDGEMENT = "ASSET_HANDOVER_ACKNOWLEDGEMENT"
    GUARANTOR_ID_PROOF = "GUARANTOR_ID_PROOF"
    GUARANTOR_ADDRESS_PROOF = "GUARANTOR_ADDRESS_PROOF"


# ---------------------------------------------------------------------------
# Blocker codes (stable, machine-readable reasons)
# ---------------------------------------------------------------------------
class BlockerCode:
    KYC_NOT_VERIFIED = "KYC_NOT_VERIFIED"
    KYC_DOCUMENT_EXPIRED = "KYC_DOCUMENT_EXPIRED"
    ID_PROOF_MISSING = "ID_PROOF_MISSING"
    ADDRESS_PROOF_MISSING = "ADDRESS_PROOF_MISSING"
    SIGNED_CONTRACT_MISSING = "SIGNED_CONTRACT_MISSING"
    SECURITY_DEPOSIT_PROOF_MISSING = "SECURITY_DEPOSIT_PROOF_MISSING"
    DELIVERY_ADDRESS_PROOF_MISSING = "DELIVERY_ADDRESS_PROOF_MISSING"
    CONTRACT_PDF_MISSING = "CONTRACT_PDF_MISSING"
    HANDOVER_DOCUMENT_MISSING = "HANDOVER_DOCUMENT_MISSING"


DOC_TO_BLOCKER = {
    DocCode.ID_PROOF: BlockerCode.ID_PROOF_MISSING,
    DocCode.ADDRESS_PROOF: BlockerCode.ADDRESS_PROOF_MISSING,
    DocCode.SIGNED_CONTRACT: BlockerCode.SIGNED_CONTRACT_MISSING,
    DocCode.SECURITY_DEPOSIT_PROOF: BlockerCode.SECURITY_DEPOSIT_PROOF_MISSING,
    DocCode.DELIVERY_ADDRESS_PROOF: BlockerCode.DELIVERY_ADDRESS_PROOF_MISSING,
    DocCode.CONTRACT_PDF: BlockerCode.CONTRACT_PDF_MISSING,
    DocCode.ASSET_HANDOVER_ACKNOWLEDGEMENT: BlockerCode.HANDOVER_DOCUMENT_MISSING,
}

DOC_LABELS = {
    DocCode.ID_PROOF: "Customer ID proof",
    DocCode.ADDRESS_PROOF: "Customer address proof",
    DocCode.CUSTOMER_PHOTO: "Customer photo",
    DocCode.PHONE_VERIFICATION: "Phone verification",
    DocCode.SIGNED_CONTRACT: "Signed / submitted contract acknowledgement",
    DocCode.SECURITY_DEPOSIT_PROOF: "Security deposit proof / receipt",
    DocCode.DELIVERY_ADDRESS_PROOF: "Delivery address proof",
    DocCode.CONTRACT_PDF: "Contract PDF",
    DocCode.ASSET_HANDOVER_ACKNOWLEDGEMENT: "Asset handover acknowledgement",
    DocCode.GUARANTOR_ID_PROOF: "Guarantor ID proof",
    DocCode.GUARANTOR_ADDRESS_PROOF: "Guarantor address proof",
}


# Document status tokens used in readiness entries.
STATUS_VERIFIED = "VERIFIED"
STATUS_PENDING = "PENDING"
STATUS_MISSING = "MISSING"
STATUS_EXPIRED = "EXPIRED"


# ---------------------------------------------------------------------------
# document_type -> readiness category inference (for legacy / un-categorised docs)
# ---------------------------------------------------------------------------
_ID_DOC_TYPES = {
    CustomerKycDocumentType.AADHAAR,
    CustomerKycDocumentType.PAN,
    CustomerKycDocumentType.PASSPORT,
    CustomerKycDocumentType.DRIVING_LICENSE,
    CustomerKycDocumentType.VOTER_ID,
}
# PAN is identity-only; the rest also evidence address.
_ADDRESS_DOC_TYPES = {
    CustomerKycDocumentType.AADHAAR,
    CustomerKycDocumentType.PASSPORT,
    CustomerKycDocumentType.DRIVING_LICENSE,
    CustomerKycDocumentType.VOTER_ID,
}


class KycGateError(APIException):
    """Controlled gate failure rendered by DRF as HTTP 400 (never a 500).

    The response body is exactly::

        {"detail": "...", "code": "KYC_REQUIRED", "missing_documents": [...],
         "blocker_codes": [...]}
    """

    status_code = 400
    default_code = "KYC_REQUIRED"

    def __init__(
        self,
        message: str,
        *,
        code: str = "KYC_REQUIRED",
        missing_documents: Optional[list] = None,
        blocker_codes: Optional[list] = None,
        blocker_messages: Optional[list] = None,
    ):
        self.code = code
        self.missing_documents = list(missing_documents or [])
        self.blocker_codes = list(blocker_codes or [])
        self.blocker_messages = list(blocker_messages or [])
        super().__init__(
            detail={
                "detail": message,
                "code": code,
                "missing_documents": self.missing_documents,
                "blocker_codes": self.blocker_codes,
            }
        )


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------
def is_kyc_gating_enabled() -> bool:
    """Whether hard backend enforcement is switched on (default False)."""
    return bool(getattr(settings, "KYC_CONTRACT_GATING_ENABLED", False))


def _normalize_plan_type(plan_type) -> str:
    return (str(plan_type or "")).strip().upper()


def is_direct_sale(plan_type) -> bool:
    """Anything that is not EMI / RENT / LEASE is treated as direct sale."""
    return _normalize_plan_type(plan_type) not in {
        PlanType.EMI,
        PlanType.RENT,
        PlanType.LEASE,
    }


def kyc_status_of(customer) -> str:
    return (getattr(customer, "kyc_status", "") or "")


def is_kyc_verified(customer) -> bool:
    return kyc_status_of(customer) in ACCEPTABLE_KYC_STATUSES


# ---------------------------------------------------------------------------
# Document presence detection
# ---------------------------------------------------------------------------
def _customer_doc_category_status(customer) -> dict[str, str]:
    """Map readiness category -> best document status for the customer.

    Best status precedence: VERIFIED (an APPROVED doc) > PENDING (uploaded but
    not yet approved). Rejected-only and expired documents do not register as
    present — expired docs are tracked separately via EXPIRED status.
    """
    result: dict[str, str] = {}
    if not getattr(customer, "pk", None):
        return result

    today = date.today()
    docs = CustomerKycDocument.objects.filter(customer=customer).only(
        "document_type", "category", "status", "expiry_date"
    )
    for doc in docs:
        if doc.status == CustomerKycDocumentStatus.REJECTED:
            continue
        expiry = getattr(doc, "expiry_date", None)
        if expiry is not None and expiry < today:
            for category in _categories_for_document(doc):
                if result.get(category) not in (STATUS_VERIFIED, STATUS_PENDING):
                    result[category] = STATUS_EXPIRED
            continue
        approved = doc.status == CustomerKycDocumentStatus.APPROVED
        for category in _categories_for_document(doc):
            existing = result.get(category)
            if existing == STATUS_VERIFIED:
                continue
            result[category] = STATUS_VERIFIED if approved else STATUS_PENDING
    return result


def _customer_expired_categories(customer) -> list[str]:
    """Return readiness category codes where the BEST available doc is expired."""
    if not getattr(customer, "pk", None):
        return []
    status_map = _customer_doc_category_status(customer)
    return [cat for cat, status in status_map.items() if status == STATUS_EXPIRED]


def _categories_for_document(doc) -> set[str]:
    explicit = (getattr(doc, "category", "") or "").strip()
    if explicit and explicit != KycDocumentCategory.UNSPECIFIED:
        return {explicit}

    inferred: set[str] = set()
    dt = doc.document_type
    if dt in _ID_DOC_TYPES:
        inferred.add(DocCode.ID_PROOF)
    if dt in _ADDRESS_DOC_TYPES:
        inferred.add(DocCode.ADDRESS_PROOF)
    return inferred


def _subscription_doc_types(subscription) -> set[str]:
    if not subscription or not getattr(subscription, "pk", None):
        return set()
    return set(
        SubscriptionDocument.objects.filter(subscription=subscription).values_list(
            "document_type", flat=True
        )
    )


_CONTRACT_PDF_TYPES = {
    SubscriptionDocumentType.RENT_CONTRACT_PDF,
    SubscriptionDocumentType.LEASE_CONTRACT_PDF,
    SubscriptionDocumentType.ADVANCE_EMI_CONTRACT_PDF,
}
_HANDOVER_TYPES = {
    SubscriptionDocumentType.DELIVERY_HANDOVER_NOTE,
    SubscriptionDocumentType.ASSET_HANDOVER_ACKNOWLEDGEMENT,
}


# ---------------------------------------------------------------------------
# Requirement assembly
# ---------------------------------------------------------------------------
def _deposit_required_for(subscription, plan_type, deposit_required) -> bool:
    if deposit_required is not None:
        return bool(deposit_required)
    plan = _normalize_plan_type(plan_type)
    if plan not in {PlanType.RENT, PlanType.LEASE}:
        return False
    # Rent/Lease always carry a refundable security deposit (20-30%).
    if subscription is not None:
        profile = getattr(subscription, "rent_profile", None) or getattr(
            subscription, "lease_profile", None
        )
        if profile is not None:
            return bool(getattr(profile, "security_deposit_amount", 0) or 0)
    return True


def _build_requirements(
    *,
    plan_type: str,
    customer_cat_status: dict[str, str],
    subscription_doc_types: set[str],
    deposit_required: bool,
    delivery_address_differs: bool,
    has_subscription: bool,
) -> list[dict]:
    plan = _normalize_plan_type(plan_type)
    rows: list[dict] = []

    def customer_doc(code, *, required, stage):
        status = customer_cat_status.get(code, STATUS_MISSING)
        rows.append(
            {
                "code": code,
                "label": DOC_LABELS[code],
                "required": bool(required),
                "present": status == STATUS_VERIFIED,
                "status": status,
                "source": "CUSTOMER_KYC",
                "stage": stage,
            }
        )

    def contract_doc(code, present, *, required, stage):
        rows.append(
            {
                "code": code,
                "label": DOC_LABELS[code],
                "required": bool(required),
                "present": bool(present),
                "status": STATUS_VERIFIED if present else STATUS_MISSING,
                "source": "CONTRACT_DOCUMENT",
                "stage": stage,
            }
        )

    contract_pdf_present = bool(subscription_doc_types & _CONTRACT_PDF_TYPES)
    signed_present = SubscriptionDocumentType.CUSTOMER_SIGNATURE in subscription_doc_types
    deposit_present = (
        SubscriptionDocumentType.SECURITY_DEPOSIT_RECEIPT_PDF in subscription_doc_types
    )
    handover_present = bool(subscription_doc_types & _HANDOVER_TYPES)

    if plan in {PlanType.RENT, PlanType.LEASE}:
        # Rent/Lease: identity + address proof must exist before the contract
        # can go ACTIVE (asset goes out of the shop's control).
        customer_doc(DocCode.ID_PROOF, required=True, stage="activate")
        customer_doc(DocCode.ADDRESS_PROOF, required=True, stage="activate")
        customer_doc(DocCode.CUSTOMER_PHOTO, required=False, stage="activate")
        customer_doc(DocCode.PHONE_VERIFICATION, required=False, stage="activate")
        if delivery_address_differs:
            customer_doc(
                DocCode.DELIVERY_ADDRESS_PROOF, required=True, stage="deliver"
            )
        # Guarantor documents remain optional (no high-value policy exists yet).
        customer_doc(DocCode.GUARANTOR_ID_PROOF, required=False, stage="deliver")
        customer_doc(DocCode.GUARANTOR_ADDRESS_PROOF, required=False, stage="deliver")

        contract_doc(
            DocCode.CONTRACT_PDF,
            contract_pdf_present,
            required=True,
            stage="generate_contract",
        )
        if deposit_required:
            contract_doc(
                DocCode.SECURITY_DEPOSIT_PROOF,
                deposit_present,
                required=True,
                stage="deliver",
            )
        contract_doc(
            DocCode.SIGNED_CONTRACT,
            signed_present,
            required=has_subscription,
            stage="deliver",
        )
        contract_doc(
            DocCode.ASSET_HANDOVER_ACKNOWLEDGEMENT,
            handover_present,
            required=True,
            stage="deliver",
        )
    elif plan == PlanType.EMI:
        # EMI: identity + address proof required before activation — same trust
        # level as Rent/Lease. The subscription reaches APPROVED at creation;
        # activation is the explicit business step that confirms KYC-backed
        # possession entitlement. Signed contract + contract PDF must exist
        # before delivery/handover (they are generated after APPROVED creation).
        customer_doc(DocCode.ID_PROOF, required=True, stage="activate")
        customer_doc(DocCode.ADDRESS_PROOF, required=True, stage="activate")
        customer_doc(DocCode.CUSTOMER_PHOTO, required=False, stage="activate")
        customer_doc(DocCode.PHONE_VERIFICATION, required=False, stage="activate")
        contract_doc(
            DocCode.SIGNED_CONTRACT,
            signed_present,
            required=has_subscription,
            stage="deliver",
        )
        contract_doc(
            DocCode.CONTRACT_PDF,
            contract_pdf_present,
            required=has_subscription,
            stage="deliver",
        )

    return rows


# ---------------------------------------------------------------------------
# Public readiness API
# ---------------------------------------------------------------------------
def get_contract_kyc_readiness(
    customer,
    plan_type,
    subscription=None,
    *,
    delivery_address_differs: bool = False,
    deposit_required: Optional[bool] = None,
    high_value: bool = False,
) -> dict:
    """Return the structured KYC/document readiness for a contract.

    Keys: can_activate, can_generate_final_contract, can_deliver,
    required_documents, missing_documents, present_documents, kyc_status,
    blocker_codes, blocker_messages (+ contextual flags).
    """
    plan = _normalize_plan_type(plan_type)
    direct_sale = is_direct_sale(plan)
    enabled = is_kyc_gating_enabled()
    kyc_status = kyc_status_of(customer)
    kyc_verified = is_kyc_verified(customer)

    if direct_sale:
        # Direct sale: KYC optional. Surface an advisory note for high-value
        # / refund-risk customers but never report a blocker.
        warnings: list[str] = []
        if high_value and not kyc_verified:
            warnings.append(
                "High-value direct sale: customer KYC is recommended for refund safety."
            )
        return {
            "plan_type": plan,
            "is_direct_sale": True,
            "kyc_gating_enabled": enabled,
            "enforced": False,
            "kyc_status": kyc_status,
            "kyc_verified": kyc_verified,
            "kyc_optional": True,
            "exception_approved": kyc_status == KycStatus.EXCEPTION_APPROVED,
            "can_activate": True,
            "can_generate_final_contract": True,
            "can_deliver": True,
            "required_documents": [],
            "missing_documents": [],
            "present_documents": [],
            "blocker_codes": [],
            "blocker_messages": [],
            "optional_warnings": warnings,
        }

    resolved_deposit = _deposit_required_for(subscription, plan, deposit_required)
    requirements = _build_requirements(
        plan_type=plan,
        customer_cat_status=_customer_doc_category_status(customer),
        subscription_doc_types=_subscription_doc_types(subscription),
        deposit_required=resolved_deposit,
        delivery_address_differs=bool(delivery_address_differs),
        has_subscription=subscription is not None and bool(getattr(subscription, "pk", None)),
    )

    def stage_satisfied(stages: set[str]) -> bool:
        return all(
            row["present"]
            for row in requirements
            if row["required"] and row["stage"] in stages
        )

    activate_ok = kyc_verified and stage_satisfied({"activate"})
    generate_ok = kyc_verified and stage_satisfied({"activate", "generate_contract"})
    deliver_ok = kyc_verified and stage_satisfied(
        {"activate", "generate_contract", "deliver"}
    )

    missing_documents = [
        row["code"] for row in requirements if row["required"] and not row["present"]
    ]
    present_documents = [row["code"] for row in requirements if row["present"]]

    # Primary blockers explain why the contract cannot be ACTIVATED.
    blocker_codes: list[str] = []
    blocker_messages: list[str] = []
    if not kyc_verified:
        blocker_codes.append(BlockerCode.KYC_NOT_VERIFIED)
        blocker_messages.append(
            "Customer KYC must be VERIFIED or EXCEPTION_APPROVED before activation."
        )
    expired_cats = _customer_expired_categories(customer)
    if expired_cats:
        blocker_codes.append(BlockerCode.KYC_DOCUMENT_EXPIRED)
        labels = [DOC_LABELS.get(c, c) for c in expired_cats]
        blocker_messages.append(
            f"Expired KYC document(s): {', '.join(labels)}. Upload renewed documents before activation."
        )
    for row in requirements:
        if row["required"] and not row["present"] and row["stage"] == "activate":
            code = DOC_TO_BLOCKER.get(row["code"])
            if code:
                blocker_codes.append(code)
                blocker_messages.append(f"{row['label']} is required before activation.")

    expired_categories = expired_cats

    return {
        "plan_type": plan,
        "is_direct_sale": False,
        "kyc_gating_enabled": enabled,
        "enforced": enabled,
        "kyc_status": kyc_status,
        "kyc_verified": kyc_verified,
        "kyc_optional": False,
        "exception_approved": kyc_status == KycStatus.EXCEPTION_APPROVED,
        "deposit_required": resolved_deposit,
        "delivery_address_differs": bool(delivery_address_differs),
        "can_activate": activate_ok,
        "can_generate_final_contract": generate_ok,
        "can_deliver": deliver_ok,
        "required_documents": requirements,
        "missing_documents": missing_documents,
        "present_documents": present_documents,
        "blocker_codes": blocker_codes,
        "blocker_messages": blocker_messages,
        "expired_categories": expired_categories,
        "optional_warnings": [],
    }


# ---------------------------------------------------------------------------
# Enforcement
# ---------------------------------------------------------------------------
_STAGE_LABEL = {
    "activate": "activating this contract",
    "generate_contract": "generating the final contract",
    "deliver": "delivering / handing over this contract",
}
_STAGE_SCOPE = {
    "activate": {"activate"},
    "generate_contract": {"activate", "generate_contract"},
    "deliver": {"activate", "generate_contract", "deliver"},
}


def enforce_contract_kyc_gate(
    *,
    subscription=None,
    customer=None,
    plan_type=None,
    stage: str,
    delivery_address_differs: bool = False,
    deposit_required: Optional[bool] = None,
) -> dict:
    """Raise :class:`KycGateError` (HTTP 400) when the gate fails.

    No-op when gating is disabled or for direct sale. Returns the computed
    readiness dict when it passes (handy for callers that want to log it).
    """
    if subscription is not None:
        customer = customer if customer is not None else subscription.customer
        plan_type = plan_type if plan_type is not None else subscription.plan_type

    readiness = get_contract_kyc_readiness(
        customer,
        plan_type,
        subscription,
        delivery_address_differs=delivery_address_differs,
        deposit_required=deposit_required,
    )

    # Computation is always available; enforcement only when explicitly enabled.
    if not is_kyc_gating_enabled() or readiness["is_direct_sale"]:
        return readiness

    gate_ok = {
        "activate": readiness["can_activate"],
        "generate_contract": readiness["can_generate_final_contract"],
        "deliver": readiness["can_deliver"],
    }.get(stage, readiness["can_activate"])
    if gate_ok:
        return readiness

    scope = _STAGE_SCOPE.get(stage, {"activate"})
    missing = [
        row["code"]
        for row in readiness["required_documents"]
        if row["required"] and not row["present"] and row["stage"] in scope
    ]

    blocker_codes: list[str] = []
    blocker_messages: list[str] = []
    if not readiness["kyc_verified"]:
        blocker_codes.append(BlockerCode.KYC_NOT_VERIFIED)
        blocker_messages.append(
            "Customer KYC must be VERIFIED or EXCEPTION_APPROVED."
        )
    for code in missing:
        blocker = DOC_TO_BLOCKER.get(code)
        if blocker:
            blocker_codes.append(blocker)
            blocker_messages.append(f"{DOC_LABELS.get(code, code)} is required.")

    raise KycGateError(
        f"KYC documents are required before {_STAGE_LABEL.get(stage, 'activating this contract')}.",
        code="KYC_REQUIRED",
        missing_documents=missing,
        blocker_codes=blocker_codes,
        blocker_messages=blocker_messages,
    )
