"""Contract activation / handover readiness service (P0).

A single authoritative milestone check that answers: *is this subscription's
contract ready for the asset to leave the shop's control — i.e. to reach
ACTIVE / HANDED_OVER — from a KYC + document + (rent/lease) deposit-receipt +
(lease) asset-condition standpoint?*

This is an **additive orchestration layer** on top of the established
``kyc_readiness_service``. It does not change EMI math, payment posting, draw,
waiver, commission, payout, reconciliation, or any existing audit semantics. It
only *reads* existing customer / subscription / deposit-ledger state and either
reports readiness or raises a controlled HTTP 400.

Milestone requirements (per spec)
---------------------------------
* **EMI** — identity proof + signed scheme consent.
* **Rent** — KYC verified, identity proof, address proof, signed contract,
  deposit receipt (collected).
* **Lease** — everything Rent requires **plus** an asset condition proof.

Enforcement discipline
----------------------
Readiness is **always computed** (so the UI can show the checklist), but it is
only **enforced** (hard-raised) when ``KYC_CONTRACT_GATING_ENABLED`` is True —
the same opt-in flag the existing KYC gate uses. This keeps the change
non-breaking: existing flows and tests keep working unless a shop opts in.

The deposit receipt requirement is satisfied by real collected evidence
(``RentLeaseDepositTransaction`` of type COLLECTED/DEPOSIT_RECEIPT, or a
SECURITY_DEPOSIT demand with ``collected_amount > 0``) and falls back to the
``SECURITY_DEPOSIT_RECEIPT_PDF`` contract document. The lease asset-condition
proof is satisfied by a future ``AssetConditionSnapshot`` (P3, forward
compatible), a return/condition inspection document, or recorded lease handover
condition notes.
"""
from __future__ import annotations

from typing import Optional

from subscriptions.models import (
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionStatus,
    RentLeaseDepositTransactionType,
    SubscriptionDocumentType,
)
from subscriptions.services import kyc_readiness_service as kyc


# ---------------------------------------------------------------------------
# Milestone requirement + blocker codes
# ---------------------------------------------------------------------------
class MilestoneDocCode:
    ID_PROOF = kyc.DocCode.ID_PROOF
    ADDRESS_PROOF = kyc.DocCode.ADDRESS_PROOF
    SIGNED_CONTRACT = kyc.DocCode.SIGNED_CONTRACT
    DEPOSIT_RECEIPT = "DEPOSIT_RECEIPT"
    CONDITION_PROOF = "CONDITION_PROOF"


class MilestoneBlocker:
    KYC_NOT_VERIFIED = kyc.BlockerCode.KYC_NOT_VERIFIED
    ID_PROOF_MISSING = kyc.BlockerCode.ID_PROOF_MISSING
    ADDRESS_PROOF_MISSING = kyc.BlockerCode.ADDRESS_PROOF_MISSING
    SIGNED_CONTRACT_MISSING = kyc.BlockerCode.SIGNED_CONTRACT_MISSING
    DEPOSIT_RECEIPT_MISSING = "DEPOSIT_RECEIPT_MISSING"
    CONDITION_PROOF_MISSING = "CONDITION_PROOF_MISSING"


_DOC_LABELS = {
    MilestoneDocCode.ID_PROOF: "Customer identity proof",
    MilestoneDocCode.ADDRESS_PROOF: "Customer address proof",
    MilestoneDocCode.SIGNED_CONTRACT: "Signed contract / scheme consent",
    MilestoneDocCode.DEPOSIT_RECEIPT: "Security deposit receipt (collected)",
    MilestoneDocCode.CONDITION_PROOF: "Asset condition proof at handover",
}
_DOC_TO_BLOCKER = {
    MilestoneDocCode.ID_PROOF: MilestoneBlocker.ID_PROOF_MISSING,
    MilestoneDocCode.ADDRESS_PROOF: MilestoneBlocker.ADDRESS_PROOF_MISSING,
    MilestoneDocCode.SIGNED_CONTRACT: MilestoneBlocker.SIGNED_CONTRACT_MISSING,
    MilestoneDocCode.DEPOSIT_RECEIPT: MilestoneBlocker.DEPOSIT_RECEIPT_MISSING,
    MilestoneDocCode.CONDITION_PROOF: MilestoneBlocker.CONDITION_PROOF_MISSING,
}


class ContractActivationNotReady(kyc.KycGateError):
    """Controlled HTTP 400 raised when an activation/handover milestone fails.

    Subclasses :class:`KycGateError` so it renders with the same JSON shape and
    is caught by existing ``except KycGateError`` handlers, but carries a
    distinct default code.
    """

    default_code = "CONTRACT_ACTIVATION_NOT_READY"


# ---------------------------------------------------------------------------
# Evidence detection
# ---------------------------------------------------------------------------
def _has_collected_deposit(subscription) -> bool:
    """True when a real security-deposit receipt exists for the subscription."""
    if not subscription or not getattr(subscription, "pk", None):
        return False

    if RentLeaseDepositTransaction.objects.filter(
        subscription=subscription,
        status=RentLeaseDepositTransactionStatus.ACTIVE,
        transaction_type__in=[
            RentLeaseDepositTransactionType.COLLECTED,
            RentLeaseDepositTransactionType.DEPOSIT_RECEIPT,
        ],
    ).exists():
        return True

    if RentLeaseBillingDemand.objects.filter(
        subscription=subscription,
        demand_type=RentLeaseDemandType.SECURITY_DEPOSIT,
        collected_amount__gt=0,
    ).exists():
        return True

    # Fallback: a recorded deposit receipt document is acceptable evidence.
    return (
        SubscriptionDocumentType.SECURITY_DEPOSIT_RECEIPT_PDF
        in kyc._subscription_doc_types(subscription)
    )


def _has_condition_proof(subscription) -> bool:
    """True when asset condition at handover is documented (lease only)."""
    if not subscription or not getattr(subscription, "pk", None):
        return False

    # Forward compatible with the P3 AssetConditionSnapshot model.
    snapshots = getattr(subscription, "asset_condition_snapshots", None)
    if snapshots is not None:
        try:
            if snapshots.exists():
                return True
        except Exception:
            pass

    if (
        SubscriptionDocumentType.RETURN_INSPECTION_REPORT
        in kyc._subscription_doc_types(subscription)
    ):
        return True

    profile = getattr(subscription, "lease_profile", None)
    if profile is not None and (getattr(profile, "handover_notes", "") or "").strip():
        return True
    return False


# ---------------------------------------------------------------------------
# Requirement assembly
# ---------------------------------------------------------------------------
def _milestone_requirements(subscription) -> list[dict]:
    plan = kyc._normalize_plan_type(subscription.plan_type)
    cat_status = kyc._customer_doc_category_status(subscription.customer)
    sub_doc_types = kyc._subscription_doc_types(subscription)

    rows: list[dict] = []

    def customer_doc(code, *, required=True):
        status = cat_status.get(code, kyc.STATUS_MISSING)
        rows.append(
            {
                "code": code,
                "label": _DOC_LABELS[code],
                "required": bool(required),
                "present": status == kyc.STATUS_VERIFIED,
                "status": status,
                "source": "CUSTOMER_KYC",
            }
        )

    def evidence(code, present, *, required=True):
        rows.append(
            {
                "code": code,
                "label": _DOC_LABELS[code],
                "required": bool(required),
                "present": bool(present),
                "status": kyc.STATUS_VERIFIED if present else kyc.STATUS_MISSING,
                "source": "CONTRACT_EVIDENCE",
            }
        )

    signed_present = (
        SubscriptionDocumentType.CUSTOMER_SIGNATURE in sub_doc_types
    )

    if plan == PlanType.EMI:
        customer_doc(MilestoneDocCode.ID_PROOF)
        evidence(MilestoneDocCode.SIGNED_CONTRACT, signed_present)
    elif plan in {PlanType.RENT, PlanType.LEASE}:
        customer_doc(MilestoneDocCode.ID_PROOF)
        customer_doc(MilestoneDocCode.ADDRESS_PROOF)
        evidence(MilestoneDocCode.SIGNED_CONTRACT, signed_present)
        evidence(
            MilestoneDocCode.DEPOSIT_RECEIPT, _has_collected_deposit(subscription)
        )
        if plan == PlanType.LEASE:
            evidence(
                MilestoneDocCode.CONDITION_PROOF, _has_condition_proof(subscription)
            )

    return rows


# ---------------------------------------------------------------------------
# Public readiness API
# ---------------------------------------------------------------------------
def evaluate_contract_activation_readiness(subscription) -> dict:
    """Compute (never raise) the activation/handover readiness for a contract."""
    plan = kyc._normalize_plan_type(subscription.plan_type)
    enabled = kyc.is_kyc_gating_enabled()

    if kyc.is_direct_sale(plan):
        return {
            "plan_type": plan,
            "is_direct_sale": True,
            "kyc_gating_enabled": enabled,
            "enforced": False,
            "kyc_verified": kyc.is_kyc_verified(subscription.customer),
            "can_reach_active_or_handover": True,
            "required_documents": [],
            "missing_documents": [],
            "present_documents": [],
            "blocker_codes": [],
            "blocker_messages": [],
        }

    kyc_verified = kyc.is_kyc_verified(subscription.customer)
    requirements = _milestone_requirements(subscription)

    docs_ok = all(row["present"] for row in requirements if row["required"])
    # EMI's lighter bar (identity + signed consent) does not require a KYC
    # status flip; rent/lease (asset leaves the shop) require verified KYC.
    require_kyc_verified = plan in {PlanType.RENT, PlanType.LEASE}
    ready = docs_ok and (kyc_verified or not require_kyc_verified)

    missing = [
        row["code"] for row in requirements if row["required"] and not row["present"]
    ]
    present = [row["code"] for row in requirements if row["present"]]

    blocker_codes: list[str] = []
    blocker_messages: list[str] = []
    if require_kyc_verified and not kyc_verified:
        blocker_codes.append(MilestoneBlocker.KYC_NOT_VERIFIED)
        blocker_messages.append(
            "Customer KYC must be VERIFIED or EXCEPTION_APPROVED before the asset is handed over."
        )
    for row in requirements:
        if row["required"] and not row["present"]:
            blocker = _DOC_TO_BLOCKER.get(row["code"])
            if blocker:
                blocker_codes.append(blocker)
                blocker_messages.append(f"{row['label']} is required before handover.")

    return {
        "plan_type": plan,
        "is_direct_sale": False,
        "kyc_gating_enabled": enabled,
        "enforced": enabled,
        "kyc_verified": kyc_verified,
        "can_reach_active_or_handover": ready,
        "required_documents": requirements,
        "missing_documents": missing,
        "present_documents": present,
        "blocker_codes": blocker_codes,
        "blocker_messages": blocker_messages,
    }


# ---------------------------------------------------------------------------
# Legacy compatibility classification (read-only, never mutates status)
# ---------------------------------------------------------------------------
# Classification tokens for already-active / handed-over legacy records.
COMPAT_COMPLIANT = "COMPLIANT"
COMPAT_BACKFILL_REQUIRED = "BACKFILL_REQUIRED"
COMPAT_NOT_APPLICABLE = "NOT_APPLICABLE"


def classify_legacy_activation_compatibility(subscription) -> dict:
    """Classify whether an existing record satisfies the new milestone gate.

    This is **purely informational** for backfill planning. It never changes a
    subscription's status — existing legacy ACTIVE / HANDED_OVER records are
    preserved exactly as-is. Use it to build a backfill-readiness report so a
    shop can chase missing documents at its own pace instead of being forced
    into a hard cut-over.

    Returns ``compatibility`` in {COMPLIANT, BACKFILL_REQUIRED, NOT_APPLICABLE}
    plus the missing milestone documents / blockers.
    """
    readiness = evaluate_contract_activation_readiness(subscription)
    if readiness["is_direct_sale"]:
        compatibility = COMPAT_NOT_APPLICABLE
    elif readiness["can_reach_active_or_handover"]:
        compatibility = COMPAT_COMPLIANT
    else:
        compatibility = COMPAT_BACKFILL_REQUIRED

    return {
        "subscription_id": getattr(subscription, "id", None),
        "subscription_number": getattr(subscription, "subscription_number", None),
        "plan_type": readiness["plan_type"],
        "status": getattr(subscription, "status", None),
        "compatibility": compatibility,
        "missing_documents": readiness["missing_documents"],
        "blocker_codes": readiness["blocker_codes"],
        "blocker_messages": readiness["blocker_messages"],
    }


def assert_contract_activation_ready(subscription, *, stage: str = "handover") -> dict:
    """Raise :class:`ContractActivationNotReady` (HTTP 400) when not ready.

    No-op for direct sale or when ``KYC_CONTRACT_GATING_ENABLED`` is False.
    Returns the computed readiness dict when it passes (handy for logging).

    ``stage`` is accepted for caller clarity (e.g. "activate" / "handover") and
    recorded in telemetry; the milestone requirements are the same set in both.
    """
    readiness = evaluate_contract_activation_readiness(subscription)

    if readiness["is_direct_sale"] or not kyc.is_kyc_gating_enabled():
        return readiness
    if readiness["can_reach_active_or_handover"]:
        return readiness

    raise ContractActivationNotReady(
        "Contract is not ready for activation / handover: required KYC, documents, "
        "or deposit evidence are missing.",
        code="CONTRACT_ACTIVATION_NOT_READY",
        missing_documents=readiness["missing_documents"],
        blocker_codes=readiness["blocker_codes"],
        blocker_messages=readiness["blocker_messages"],
    )
