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

from datetime import date
from decimal import Decimal
from typing import Optional

from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Sum

from subscriptions.models import (
    AssetConditionSnapshotStage,
    DocumentVerificationStatus,
    EmiStatus,
    MONEY_ZERO,
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionStatus,
    RentLeaseDepositTransactionType,
    SubscriptionStatus,
    SubscriptionDocument,
    SubscriptionDocumentType,
    q2,
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
    KYC_DOCUMENT_EXPIRED = kyc.BlockerCode.KYC_DOCUMENT_EXPIRED
    ID_PROOF_MISSING = kyc.BlockerCode.ID_PROOF_MISSING
    ADDRESS_PROOF_MISSING = kyc.BlockerCode.ADDRESS_PROOF_MISSING
    SIGNED_CONTRACT_MISSING = kyc.BlockerCode.SIGNED_CONTRACT_MISSING
    DEPOSIT_RECEIPT_MISSING = "DEPOSIT_RECEIPT_MISSING"
    CONDITION_PROOF_MISSING = "CONDITION_PROOF_MISSING"
    # P3A vault-state blockers
    SIGNED_CONTRACT_REJECTED = "SIGNED_CONTRACT_REJECTED"
    SIGNED_CONTRACT_EXPIRED = "SIGNED_CONTRACT_EXPIRED"
    DEPOSIT_RECEIPT_REJECTED = "DEPOSIT_RECEIPT_REJECTED"
    DEPOSIT_RECEIPT_EXPIRED = "DEPOSIT_RECEIPT_EXPIRED"
    CONDITION_PROOF_REJECTED = "CONDITION_PROOF_REJECTED"
    CONTRACT_DATA_INCOMPLETE = "CONTRACT_DATA_INCOMPLETE"
    EMI_SCHEDULE_NOT_READY = "EMI_SCHEDULE_NOT_READY"
    DEPOSIT_NOT_FULLY_COLLECTED = "DEPOSIT_NOT_FULLY_COLLECTED"
    CONTRACT_STATUS_NOT_DELIVERABLE = "CONTRACT_STATUS_NOT_DELIVERABLE"
    STOCK_UNAVAILABLE = "STOCK_UNAVAILABLE"


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
# P3A: Vault-aware subscription document helpers
# ---------------------------------------------------------------------------
def _subscription_docs_for_types(subscription, doc_types: set) -> list:
    """Fetch SubscriptionDocument records matching any of doc_types."""
    if not subscription or not getattr(subscription, "pk", None) or not doc_types:
        return []
    return list(
        SubscriptionDocument.objects.filter(
            subscription=subscription,
            document_type__in=doc_types,
        ).order_by("-created_at", "-id")
    )


def _vault_doc_blocker(docs: list, *, missing_code: str, rejected_code: str, expired_code: str) -> Optional[str]:
    """Return a vault-state blocker code or None when the docs are acceptable.

    Returns:
    - missing_code   when there are no docs at all
    - rejected_code  when all non-expired docs are rejected
    - expired_code   when the best non-rejected doc is expired
    - None           when at least one doc is verified/pending and not expired
    """
    if not docs:
        return missing_code
    today = date.today()
    for doc in docs:
        expired = doc.expires_on is not None and doc.expires_on < today
        if doc.verification_status == DocumentVerificationStatus.REJECTED:
            continue
        if expired:
            continue
        # Found a non-rejected, non-expired doc → acceptable
        return None
    # Check if any expired (non-rejected)
    for doc in docs:
        if doc.verification_status != DocumentVerificationStatus.REJECTED:
            return expired_code
    return rejected_code


# ---------------------------------------------------------------------------
# Evidence detection
# ---------------------------------------------------------------------------
def _rent_lease_profile(subscription):
    try:
        if subscription.plan_type == PlanType.RENT:
            return subscription.rent_profile
        if subscription.plan_type == PlanType.LEASE:
            return subscription.lease_profile
    except ObjectDoesNotExist:
        return None
    return None


def _deposit_readiness(subscription) -> dict:
    """Read authoritative deposit collection state without creating a demand."""
    if not subscription or not getattr(subscription, "pk", None):
        return {
            "required": False,
            "ready": False,
            "expected_amount": "0.00",
            "collected_amount": "0.00",
            "outstanding_amount": "0.00",
            "evidence_source": "NONE",
        }

    profile = _rent_lease_profile(subscription)
    expected = q2(
        Decimal(str(getattr(profile, "security_deposit_amount", MONEY_ZERO) or MONEY_ZERO))
    )
    if expected <= MONEY_ZERO:
        return {
            "required": True,
            "ready": False,
            "expected_amount": f"{expected:.2f}",
            "collected_amount": "0.00",
            "outstanding_amount": f"{expected:.2f}",
            "evidence_source": "PROFILE",
        }

    demand = (
        RentLeaseBillingDemand.objects.filter(
            subscription=subscription,
            demand_type=RentLeaseDemandType.SECURITY_DEPOSIT,
        )
        .order_by("-created_at", "-id")
        .first()
    )
    if demand is not None:
        collected = q2(demand.collected_amount)
        expected = q2(max(expected, demand.amount))
        source = "SECURITY_DEPOSIT_DEMAND"
    else:
        collected = q2(
            RentLeaseDepositTransaction.objects.filter(
                subscription=subscription,
                status=RentLeaseDepositTransactionStatus.ACTIVE,
                transaction_type__in=[
                    RentLeaseDepositTransactionType.COLLECTED,
                    RentLeaseDepositTransactionType.DEPOSIT_RECEIPT,
                ],
            ).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )
        source = "ACTIVE_DEPOSIT_TRANSACTIONS" if collected > MONEY_ZERO else "NONE"

    outstanding = q2(max(expected - collected, MONEY_ZERO))
    return {
        "required": True,
        "ready": expected > MONEY_ZERO and outstanding <= MONEY_ZERO,
        "expected_amount": f"{expected:.2f}",
        "collected_amount": f"{collected:.2f}",
        "outstanding_amount": f"{outstanding:.2f}",
        "evidence_source": source,
    }


def _has_collected_deposit(subscription) -> bool:
    """True only when the refundable security deposit is fully collected."""
    return bool(_deposit_readiness(subscription)["ready"])


def _has_active_deposit_source(subscription) -> bool:
    return RentLeaseDepositTransaction.objects.filter(
        subscription=subscription,
        status=RentLeaseDepositTransactionStatus.ACTIVE,
        transaction_type__in=[
            RentLeaseDepositTransactionType.COLLECTED,
            RentLeaseDepositTransactionType.DEPOSIT_RECEIPT,
        ],
    ).exists()


def _has_condition_proof(subscription) -> bool:
    """True when asset condition at handover is documented (lease only)."""
    if not subscription or not getattr(subscription, "pk", None):
        return False

    # P3B: check for a BEFORE_HANDOVER AssetConditionSnapshot on this subscription.
    snapshots = getattr(subscription, "asset_condition_snapshots", None)
    if snapshots is not None:
        try:
            if snapshots.filter(
                stage=AssetConditionSnapshotStage.BEFORE_HANDOVER
            ).exists():
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

    def customer_doc(code, *, required=True, stage="activate"):
        status = cat_status.get(code, kyc.STATUS_MISSING)
        rows.append(
            {
                "code": code,
                "label": _DOC_LABELS[code],
                "required": bool(required),
                "present": status == kyc.STATUS_VERIFIED,
                "status": status,
                "source": "CUSTOMER_KYC",
                "category": "KYC_PROFILE",
                "stage": stage,
            }
        )

    def evidence(code, present, *, required=True, stage="activate", category="CONTRACT_DATA"):
        rows.append(
            {
                "code": code,
                "label": _DOC_LABELS[code],
                "required": bool(required),
                "present": bool(present),
                "status": kyc.STATUS_VERIFIED if present else kyc.STATUS_MISSING,
                "source": "CONTRACT_EVIDENCE",
                "category": category,
                "stage": stage,
            }
        )

    signed_present = (
        SubscriptionDocumentType.CUSTOMER_SIGNATURE in sub_doc_types
    )

    if plan == PlanType.EMI:
        customer_doc(MilestoneDocCode.ID_PROOF)
        evidence(
            MilestoneDocCode.SIGNED_CONTRACT,
            signed_present,
            stage="handover",
        )
    elif plan in {PlanType.RENT, PlanType.LEASE}:
        customer_doc(MilestoneDocCode.ID_PROOF)
        customer_doc(MilestoneDocCode.ADDRESS_PROOF)
        evidence(MilestoneDocCode.SIGNED_CONTRACT, signed_present)
        evidence(
            MilestoneDocCode.DEPOSIT_RECEIPT,
            _has_collected_deposit(subscription),
            category="PAYMENT_DEPOSIT",
        )
        if plan == PlanType.LEASE:
            evidence(
                MilestoneDocCode.CONDITION_PROOF,
                _has_condition_proof(subscription),
                stage="handover",
                category="DELIVERY",
            )

    return rows


def _category(*, required: bool, ready, blocker_codes=None, details=None) -> dict:
    return {
        "required": bool(required),
        "ready": ready,
        "blocker_codes": list(blocker_codes or []),
        "details": details or {},
    }


def _contract_data_category(subscription, plan: str) -> dict:
    blockers: list[str] = []
    details = {
        "customer_present": bool(subscription.customer_id),
        "product_present": bool(subscription.product_id),
        "tenure_months": int(subscription.tenure_months or 0),
        "total_amount": f"{q2(subscription.total_amount):.2f}",
        "monthly_amount": f"{q2(subscription.monthly_amount):.2f}",
        "batch_required": plan == PlanType.EMI,
        "batch_present": bool(subscription.batch_id),
        "lucky_id_required": plan == PlanType.EMI,
        "lucky_id_present": bool(subscription.lucky_id_id),
        "rent_lease_profile_present": _rent_lease_profile(subscription) is not None,
    }
    if (
        not details["customer_present"]
        or not details["product_present"]
        or details["tenure_months"] <= 0
        or q2(subscription.total_amount) <= MONEY_ZERO
        or q2(subscription.monthly_amount) <= MONEY_ZERO
    ):
        blockers.append(MilestoneBlocker.CONTRACT_DATA_INCOMPLETE)
    if plan == PlanType.EMI:
        if not subscription.batch_id or not subscription.lucky_id_id:
            blockers.append(MilestoneBlocker.CONTRACT_DATA_INCOMPLETE)
        elif subscription.lucky_id.batch_id != subscription.batch_id:
            blockers.append(MilestoneBlocker.CONTRACT_DATA_INCOMPLETE)
    elif plan in {PlanType.RENT, PlanType.LEASE}:
        if subscription.batch_id or subscription.lucky_id_id or _rent_lease_profile(subscription) is None:
            blockers.append(MilestoneBlocker.CONTRACT_DATA_INCOMPLETE)
    return _category(
        required=True,
        ready=not blockers,
        blocker_codes=blockers,
        details=details,
    )


def _emi_schedule_category(subscription, plan: str) -> dict:
    if plan != PlanType.EMI:
        return _category(
            required=False,
            ready=True,
            details={"applicable": False, "reason": "Rent/lease monthly demands are separate from EMI schedules."},
        )
    rows = list(subscription.emis.order_by("month_no", "id").values("month_no", "amount", "status"))
    total = q2(sum((row["amount"] for row in rows), MONEY_ZERO))
    expected_months = list(range(1, int(subscription.tenure_months or 0) + 1))
    actual_months = [row["month_no"] for row in rows]
    ready = (
        len(rows) == int(subscription.tenure_months or 0)
        and actual_months == expected_months
        and total == q2(subscription.total_amount)
        and all(row["status"] in EmiStatus.values for row in rows)
    )
    return _category(
        required=True,
        ready=ready,
        blocker_codes=[] if ready else [MilestoneBlocker.EMI_SCHEDULE_NOT_READY],
        details={
            "applicable": True,
            "expected_count": int(subscription.tenure_months or 0),
            "actual_count": len(rows),
            "schedule_total": f"{total:.2f}",
            "contract_total": f"{q2(subscription.total_amount):.2f}",
        },
    )


def _payment_deposit_category(subscription, plan: str) -> dict:
    if plan == PlanType.EMI:
        return _category(
            required=False,
            ready=True,
            details={
                "deposit_required": False,
                "initial_emi_payment_required": False,
                "payment_records_created": False,
            },
        )
    deposit = _deposit_readiness(subscription)
    monthly_type = (
        RentLeaseDemandType.RENT_MONTHLY
        if plan == PlanType.RENT
        else RentLeaseDemandType.LEASE_MONTHLY
    )
    deposit["monthly_demand_required_for_activation"] = False
    deposit["monthly_demand_count"] = RentLeaseBillingDemand.objects.filter(
        subscription=subscription,
        demand_type=monthly_type,
    ).count()
    deposit["active_deposit_source_present"] = _has_active_deposit_source(subscription)
    return _category(
        required=True,
        ready=deposit["ready"],
        blocker_codes=[] if deposit["ready"] else [MilestoneBlocker.DEPOSIT_NOT_FULLY_COLLECTED],
        details=deposit,
    )


def _delivery_category(subscription) -> dict:
    deliverable_statuses = {
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.WON,
        SubscriptionStatus.DELIVERY_PENDING,
        SubscriptionStatus.HANDED_OVER,
    }
    ready = subscription.status in deliverable_statuses
    return _category(
        required=True,
        ready=ready,
        blocker_codes=[] if ready else [MilestoneBlocker.CONTRACT_STATUS_NOT_DELIVERABLE],
        details={"subscription_status": subscription.status},
    )


def _inventory_category(subscription) -> dict:
    try:
        inventory_item = subscription.product.inventory_profile
    except ObjectDoesNotExist:
        inventory_item = None
    if (
        inventory_item is None
        or not inventory_item.stock_tracking_enabled
        or not inventory_item.delivery_stock_bridge_enabled
    ):
        return _category(
            required=False,
            ready=True,
            details={"applicable": False, "reason": "Delivery stock control is not enabled for this product."},
        )
    from inventory.services.stock_movement_service import check_stock_for_delivery

    stock = check_stock_for_delivery(inventory_item=inventory_item)
    return _category(
        required=True,
        ready=bool(stock["ok"]),
        blocker_codes=[] if stock["ok"] else [MilestoneBlocker.STOCK_UNAVAILABLE],
        details={
            "applicable": True,
            "inventory_item_id": inventory_item.id,
            "reason": stock.get("reason", ""),
        },
    )


def _accounting_bridge_category(plan: str) -> dict:
    if plan == PlanType.EMI:
        return _category(
            required=False,
            ready=None,
            details={"applicable": False, "status": "NOT_APPLICABLE"},
        )
    from accounting.models import (
        ChartOfAccountType,
        RentLeaseAccountingAccountMapping,
    )

    mapping = (
        RentLeaseAccountingAccountMapping.objects.select_related(
            "monthly_income_account",
            "deposit_liability_account",
            "deposit_refund_account",
            "damage_recovery_income_account",
            "settlement_finance_account",
            "settlement_finance_account__chart_account",
        )
        .filter(is_active=True)
        .first()
    )
    mapping_ready = bool(
        mapping
        and mapping.monthly_income_account.is_active
        and mapping.monthly_income_account.account_type == ChartOfAccountType.INCOME
        and mapping.deposit_liability_account.is_active
        and mapping.deposit_liability_account.account_type == ChartOfAccountType.LIABILITY
        and mapping.deposit_refund_account.is_active
        and mapping.deposit_refund_account.account_type == ChartOfAccountType.ASSET
        and mapping.damage_recovery_income_account.is_active
        and mapping.damage_recovery_income_account.account_type == ChartOfAccountType.INCOME
        and mapping.settlement_finance_account_id
        and mapping.settlement_finance_account.is_active
        and mapping.settlement_finance_account.chart_account_id
        and mapping.settlement_finance_account.chart_account.is_active
        and mapping.settlement_finance_account.chart_account.account_type == ChartOfAccountType.ASSET
    )
    return _category(
        required=False,
        ready=None,
        blocker_codes=[] if mapping_ready else ["ACCOUNTING_BRIDGE_MAPPING_NOT_READY"],
        details={
            "applicable": True,
            "mapping_ready": mapping_ready,
            "activation_blocking": False,
            "status": (
                "MAPPING_READY_POSTING_CONTROLS_NOT_EVALUATED"
                if mapping_ready
                else "DEFERRED_TO_ACCOUNTING_SETUP"
            ),
        },
    )


# ---------------------------------------------------------------------------
# P3C: Risk payload builder (advisory; never raises)
# ---------------------------------------------------------------------------
def _build_risk_payload(subscription) -> dict:
    """Return the risk evaluation dict for *subscription* without ever raising."""
    try:
        from subscriptions.services.customer_risk_service import evaluate_contract_risk
        customer = getattr(subscription, "customer", None)
        return evaluate_contract_risk(subscription, customer=customer)
    except Exception:
        return {
            "risk_score": 0,
            "risk_band": "LOW",
            "reason_codes": [],
            "enforcement_enabled": False,
            "approval_required": False,
            "blocker_codes": [],
        }


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
            "risk": _build_risk_payload(subscription),
            "kyc_gating_enabled": enabled,
            "enforced": False,
            "kyc_verified": kyc.is_kyc_verified(subscription.customer),
            "can_reach_active_or_handover": True,
            "required_documents": [],
            "missing_documents": [],
            "present_documents": [],
            "blocker_codes": [],
            "blocker_messages": [],
            "can_activate": True,
            "can_handover": True,
            "readiness_categories": {},
        }

    kyc_verified = kyc.is_kyc_verified(subscription.customer)
    requirements = _milestone_requirements(subscription)
    # EMI's lighter bar (identity + signed consent) does not require a KYC
    # status flip; rent/lease (asset leaves the shop) require verified KYC.
    require_kyc_verified = plan in {PlanType.RENT, PlanType.LEASE}

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
    expired_cats = kyc._customer_expired_categories(subscription.customer)
    if expired_cats:
        blocker_codes.append(MilestoneBlocker.KYC_DOCUMENT_EXPIRED)
        labels = [kyc.DOC_LABELS.get(c, c) for c in expired_cats]
        blocker_messages.append(
            f"Expired KYC document(s): {', '.join(labels)}. Upload renewed documents before activation."
        )
    for row in requirements:
        if row["required"] and not row["present"]:
            blocker = _DOC_TO_BLOCKER.get(row["code"])
            if blocker:
                blocker_codes.append(blocker)
                blocker_messages.append(f"{row['label']} is required before handover.")

    # P3A: Also check vault state (rejected / expired) for subscription-level docs.
    # Only runs when at least one document of the relevant type exists — missing
    # docs are already handled by the "present" check above.
    _SIGNATURE_TYPES = {SubscriptionDocumentType.CUSTOMER_SIGNATURE}
    _DEPOSIT_TYPES = {SubscriptionDocumentType.SECURITY_DEPOSIT_RECEIPT_PDF}
    _CONDITION_TYPES = {
        SubscriptionDocumentType.RETURN_INSPECTION_REPORT,
        SubscriptionDocumentType.ASSET_HANDOVER_ACKNOWLEDGEMENT,
        SubscriptionDocumentType.DELIVERY_HANDOVER_NOTE,
    }

    if plan in {PlanType.EMI, PlanType.RENT, PlanType.LEASE}:
        sig_docs = _subscription_docs_for_types(subscription, _SIGNATURE_TYPES)
        if sig_docs:
            sig_blocker = _vault_doc_blocker(
                sig_docs,
                missing_code=MilestoneBlocker.SIGNED_CONTRACT_MISSING,
                rejected_code=MilestoneBlocker.SIGNED_CONTRACT_REJECTED,
                expired_code=MilestoneBlocker.SIGNED_CONTRACT_EXPIRED,
            )
            if sig_blocker and sig_blocker not in blocker_codes:
                blocker_codes.append(sig_blocker)
                blocker_messages.append("Signed contract / consent document is rejected or expired.")

    if plan in {PlanType.RENT, PlanType.LEASE}:
        dep_docs = _subscription_docs_for_types(subscription, _DEPOSIT_TYPES)
        if dep_docs:
            dep_blocker = _vault_doc_blocker(
                dep_docs,
                missing_code=MilestoneBlocker.DEPOSIT_RECEIPT_MISSING,
                rejected_code=MilestoneBlocker.DEPOSIT_RECEIPT_REJECTED,
                expired_code=MilestoneBlocker.DEPOSIT_RECEIPT_EXPIRED,
            )
            if dep_blocker and dep_blocker not in blocker_codes:
                blocker_codes.append(dep_blocker)
                blocker_messages.append("Security deposit receipt is rejected or expired.")

    if plan == PlanType.LEASE:
        cond_docs = _subscription_docs_for_types(subscription, _CONDITION_TYPES)
        if cond_docs:
            cond_blocker = _vault_doc_blocker(
                cond_docs,
                missing_code=MilestoneBlocker.CONDITION_PROOF_MISSING,
                rejected_code=MilestoneBlocker.CONDITION_PROOF_REJECTED,
                expired_code=MilestoneBlocker.CONDITION_PROOF_MISSING,
            )
            if cond_blocker and cond_blocker not in blocker_codes:
                blocker_codes.append(cond_blocker)
                blocker_messages.append("Asset condition proof is rejected or expired.")

    signature_vault_blockers = {
        MilestoneBlocker.SIGNED_CONTRACT_REJECTED,
        MilestoneBlocker.SIGNED_CONTRACT_EXPIRED,
    }
    deposit_vault_blockers = {
        MilestoneBlocker.DEPOSIT_RECEIPT_REJECTED,
        MilestoneBlocker.DEPOSIT_RECEIPT_EXPIRED,
    }
    condition_vault_blockers = {
        MilestoneBlocker.CONDITION_PROOF_REJECTED,
    }

    categories = {
        "kyc_profile": _category(
            required=True,
            ready=(kyc_verified or not require_kyc_verified)
            and all(
                row["present"]
                for row in requirements
                if row["required"] and row["category"] == "KYC_PROFILE"
            ),
            blocker_codes=[
                code
                for code in blocker_codes
                if code
                in {
                    MilestoneBlocker.KYC_NOT_VERIFIED,
                    MilestoneBlocker.ID_PROOF_MISSING,
                    MilestoneBlocker.ADDRESS_PROOF_MISSING,
                }
            ],
            details={"kyc_verified": kyc_verified},
        ),
        "contract_data": _contract_data_category(subscription, plan),
        "emi_schedule": _emi_schedule_category(subscription, plan),
        "payment_deposit": _payment_deposit_category(subscription, plan),
        "delivery": _delivery_category(subscription),
        "inventory_stock": _inventory_category(subscription),
        "accounting_bridge": _accounting_bridge_category(plan),
    }
    category_key_by_requirement = {
        "KYC_PROFILE": "kyc_profile",
        "CONTRACT_DATA": "contract_data",
        "PAYMENT_DEPOSIT": "payment_deposit",
        "DELIVERY": "delivery",
    }
    for row in requirements:
        if not row["required"] or row["present"]:
            continue
        category_key = category_key_by_requirement[row["category"]]
        category_blocker = _DOC_TO_BLOCKER.get(row["code"])
        categories[category_key]["ready"] = False
        if (
            category_blocker
            and category_blocker not in categories[category_key]["blocker_codes"]
        ):
            categories[category_key]["blocker_codes"].append(category_blocker)

    for category_key, vault_codes in (
        ("contract_data", signature_vault_blockers),
        ("payment_deposit", deposit_vault_blockers),
        ("delivery", condition_vault_blockers),
    ):
        matched = [code for code in blocker_codes if code in vault_codes]
        if matched:
            categories[category_key]["ready"] = False
            categories[category_key]["blocker_codes"].extend(
                code
                for code in matched
                if code not in categories[category_key]["blocker_codes"]
            )

    activate_doc_codes = [
        row["code"]
        for row in requirements
        if row["required"] and row["stage"] == "activate" and not row["present"]
    ]
    handover_doc_codes = [
        row["code"]
        for row in requirements
        if row["required"] and row["stage"] in {"activate", "handover"} and not row["present"]
    ]
    activation_category_names = (
        "kyc_profile",
        "contract_data",
        "emi_schedule",
        "payment_deposit",
    )
    handover_category_names = activation_category_names + (
        "delivery",
        "inventory_stock",
    )

    def _unique(codes) -> list[str]:
        return list(dict.fromkeys(code for code in codes if code))

    emi_handover_only_blockers = (
        {
            MilestoneBlocker.SIGNED_CONTRACT_MISSING,
            MilestoneBlocker.SIGNED_CONTRACT_REJECTED,
            MilestoneBlocker.SIGNED_CONTRACT_EXPIRED,
        }
        if plan == PlanType.EMI
        else set()
    )
    activation_blocker_codes = _unique(
        (
            [MilestoneBlocker.KYC_NOT_VERIFIED]
            if require_kyc_verified and not kyc_verified
            else []
        )
        + [_DOC_TO_BLOCKER.get(code) for code in activate_doc_codes]
        + [
            code
            for code in blocker_codes
            if code in signature_vault_blockers | deposit_vault_blockers
            and code not in emi_handover_only_blockers
        ]
        + [
            code
            for name in activation_category_names
            for code in categories[name]["blocker_codes"]
            if code not in emi_handover_only_blockers
        ]
    )
    handover_blocker_codes = _unique(
        activation_blocker_codes
        + [_DOC_TO_BLOCKER.get(code) for code in handover_doc_codes]
        + [
            code
            for code in blocker_codes
            if code in condition_vault_blockers
        ]
        + [
            code
            for name in handover_category_names
            for code in categories[name]["blocker_codes"]
        ]
    )

    can_activate = not activation_blocker_codes
    can_handover = not handover_blocker_codes

    # P3C: attach advisory risk payload (never blocks unless enforcement enabled)
    risk_payload = _build_risk_payload(subscription)
    if risk_payload.get("blocker_codes"):
        activation_blocker_codes = _unique(
            activation_blocker_codes + risk_payload["blocker_codes"]
        )
        handover_blocker_codes = _unique(
            handover_blocker_codes + risk_payload["blocker_codes"]
        )
        if risk_payload["blocker_codes"]:
            blocker_messages.append(
                f"Customer risk policy blocked this contract: {', '.join(risk_payload['blocker_codes'])}."
            )
        can_activate = False
        can_handover = False

    blocker_codes = handover_blocker_codes
    for code in blocker_codes:
        if not any(code in message for message in blocker_messages):
            blocker_messages.append(f"{code.replace('_', ' ').title()}.")

    return {
        "plan_type": plan,
        "is_direct_sale": False,
        "kyc_gating_enabled": enabled,
        "enforced": enabled,
        "kyc_verified": kyc_verified,
        "can_activate": can_activate,
        "can_handover": can_handover,
        "can_reach_active_or_handover": can_handover,
        "required_documents": requirements,
        "missing_documents": missing,
        "present_documents": present,
        "blocker_codes": blocker_codes,
        "activation_blocker_codes": activation_blocker_codes,
        "handover_blocker_codes": handover_blocker_codes,
        "blocker_messages": blocker_messages,
        "risk": risk_payload,
        "readiness_categories": categories,
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
    activating = stage == "activate"
    gate_key = "can_activate" if activating else "can_handover"
    if readiness[gate_key]:
        return readiness

    blocker_key = "activation_blocker_codes" if activating else "handover_blocker_codes"
    raise ContractActivationNotReady(
        "Contract is not ready for activation / handover: required KYC, documents, "
        "or deposit evidence are missing.",
        code="CONTRACT_ACTIVATION_NOT_READY",
        missing_documents=readiness["missing_documents"],
        blocker_codes=readiness[blocker_key],
        blocker_messages=readiness["blocker_messages"],
    )
