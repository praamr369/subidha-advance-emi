from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from accounting.models import RentLeasePostingBridgeConfig
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit

ENABLE_RENT_LEASE_POSTING_CONFIRMATION = "ENABLE RENT LEASE POSTING"
DISABLE_RENT_LEASE_POSTING_CONFIRMATION = "DISABLE RENT LEASE POSTING"
POSTING_MODE_AUDIT_DEFERRED = "AUDIT_DEFERRED"
POSTING_MODE_POSTING_ENABLED = "POSTING_ENABLED"
AUTO_READY_REASON = "Automatic Accounting Setup bridge readiness. Posting execution remains controlled by Period Controls."


def _serialize_config(config: RentLeasePostingBridgeConfig) -> dict[str, Any]:
    return {
        "id": config.id,
        "is_enabled": config.is_enabled,
        "enabled_at": config.enabled_at.isoformat() if config.enabled_at else None,
        "enabled_by_id": config.enabled_by_id,
        "disabled_at": config.disabled_at.isoformat() if config.disabled_at else None,
        "disabled_by_id": config.disabled_by_id,
        "reason": config.reason,
        "last_readiness_snapshot": config.last_readiness_snapshot or {},
        "created_at": config.created_at.isoformat() if config.created_at else None,
        "updated_at": config.updated_at.isoformat() if config.updated_at else None,
    }


def _auto_ready_config_payload(config: RentLeasePostingBridgeConfig, *, mapping_ready: bool) -> dict[str, Any]:
    payload = _serialize_config(config)
    if mapping_ready:
        payload["is_enabled"] = True
        payload["reason"] = payload.get("reason") or AUTO_READY_REASON
        payload["auto_ready_by_setup"] = True
    else:
        payload["auto_ready_by_setup"] = False
    return payload


def get_rent_lease_posting_bridge_config() -> RentLeasePostingBridgeConfig:
    config, _ = RentLeasePostingBridgeConfig.objects.get_or_create(pk=1)
    return config


def get_rent_lease_posting_bridge_state(*, readiness: dict[str, Any] | None = None) -> dict[str, Any]:
    config = get_rent_lease_posting_bridge_config()
    readiness = readiness or {}
    mapping_ready = bool(readiness.get("mapping_ready") or readiness.get("status") == "READY")
    period_controls_ready = bool(readiness.get("posting_controls_ready", False))
    bridge_setup_ready = bool(mapping_ready)
    return {
        "config": _auto_ready_config_payload(config, mapping_ready=mapping_ready),
        "is_enabled": bridge_setup_ready,
        "posting_bridge_approved": bridge_setup_ready,
        "posting_bridge_ready": bridge_setup_ready,
        "posting_execution_ready": bool(bridge_setup_ready and period_controls_ready),
        "period_controls_ready": period_controls_ready,
        "posting_mode": POSTING_MODE_POSTING_ENABLED if bridge_setup_ready else POSTING_MODE_AUDIT_DEFERRED,
        "blocked_reason": "" if bridge_setup_ready else "Rent/lease accounting mapping is not ready.",
        "period_blocked_reason": "" if period_controls_ready else "Accounting period and financial-year controls are handled in Period Controls.",
    }


def _validate_reason_and_confirmation(*, reason: str, confirmation: str, expected_confirmation: str) -> str:
    cleaned_reason = (reason or "").strip()
    if not cleaned_reason:
        raise ValidationError({"reason": "Reason is required."})
    if (confirmation or "").strip() != expected_confirmation:
        raise ValidationError({"confirmation": f"Type exactly: {expected_confirmation}"})
    return cleaned_reason


def _readiness_for_enable() -> dict[str, Any]:
    from subscriptions.services.rent_lease_accounting_readiness_service import get_rent_lease_accounting_readiness

    return get_rent_lease_accounting_readiness(auto_create=True)


@transaction.atomic
def enable_rent_lease_posting_bridge(actor, reason: str, confirmation: str) -> dict[str, Any]:
    cleaned_reason = _validate_reason_and_confirmation(
        reason=reason,
        confirmation=confirmation,
        expected_confirmation=ENABLE_RENT_LEASE_POSTING_CONFIRMATION,
    )
    readiness = _readiness_for_enable()
    if not readiness.get("mapping_ready"):
        raise ValidationError({"readiness": "Rent/lease COA and finance account mapping must be valid before bridge setup."})

    config = RentLeasePostingBridgeConfig.objects.select_for_update().filter(pk=1).first()
    if config is None:
        config = RentLeasePostingBridgeConfig(pk=1)
    now = timezone.now()
    previous_state = _serialize_config(config) if config.pk else {}
    config.is_enabled = True
    config.enabled_at = now
    config.enabled_by = actor
    config.disabled_at = None
    config.disabled_by = None
    config.reason = cleaned_reason
    config.last_readiness_snapshot = readiness
    config.save()
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=config,
        performed_by=actor,
        metadata={
            "event": "RENT_LEASE_POSTING_BRIDGE_ENABLED",
            "reason": cleaned_reason,
            "previous_state": previous_state,
            "readiness_snapshot": readiness,
            "financial_records_created": False,
            "period_controls_changed": False,
        },
    )
    from subscriptions.services.rent_lease_accounting_readiness_service import get_rent_lease_accounting_readiness

    return {"detail": "Rent/lease bridge setup is ready. Posting execution still depends on Period Controls.", "config": _auto_ready_config_payload(config, mapping_ready=True), "readiness": get_rent_lease_accounting_readiness(auto_create=False)}


@transaction.atomic
def disable_rent_lease_posting_bridge(actor, reason: str, confirmation: str) -> dict[str, Any]:
    cleaned_reason = _validate_reason_and_confirmation(
        reason=reason,
        confirmation=confirmation,
        expected_confirmation=DISABLE_RENT_LEASE_POSTING_CONFIRMATION,
    )
    config = RentLeasePostingBridgeConfig.objects.select_for_update().filter(pk=1).first()
    if config is None:
        config = RentLeasePostingBridgeConfig(pk=1)
    now = timezone.now()
    previous_state = _serialize_config(config) if config.pk else {}
    config.is_enabled = False
    config.disabled_at = now
    config.disabled_by = actor
    config.reason = cleaned_reason
    config.save()
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=config,
        performed_by=actor,
        metadata={
            "event": "RENT_LEASE_POSTING_BRIDGE_DISABLED",
            "reason": cleaned_reason,
            "previous_state": previous_state,
            "financial_records_created": False,
        },
    )
    from subscriptions.services.rent_lease_accounting_readiness_service import get_rent_lease_accounting_readiness

    return {"detail": "Rent/lease bridge setup disabled for manual review.", "config": _auto_ready_config_payload(config, mapping_ready=False), "readiness": get_rent_lease_accounting_readiness(auto_create=False)}
