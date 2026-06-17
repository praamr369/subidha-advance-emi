"""
P2A — BusinessPolicy typed key/value service.

Callers use get_policy_value() and set_policy_value() only.
Never crashes on a missing optional policy — returns a safe default.
"""
from __future__ import annotations

import json
import logging
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.utils import timezone

from subscriptions.models_control_foundation import (
    BusinessPolicy,
    PolicyScopeType,
    PolicyValueType,
)

log = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# Well-known policy keys
# ─────────────────────────────────────────────

class PolicyKey:
    PAYMENT_REVERSAL_REQUIRES_APPROVAL = "PAYMENT_REVERSAL_REQUIRES_APPROVAL"
    DEPOSIT_REFUND_REQUIRES_APPROVAL = "DEPOSIT_REFUND_REQUIRES_APPROVAL"
    STOCK_ADJUSTMENT_REQUIRES_APPROVAL = "STOCK_ADJUSTMENT_REQUIRES_APPROVAL"
    MANUAL_JOURNAL_REQUIRES_APPROVAL = "MANUAL_JOURNAL_REQUIRES_APPROVAL"
    DIRECT_SALE_CANCEL_REQUIRES_APPROVAL = "DIRECT_SALE_CANCEL_REQUIRES_APPROVAL"
    RENT_LEASE_ACTIVATION_REQUIRES_APPROVAL = "RENT_LEASE_ACTIVATION_REQUIRES_APPROVAL"
    CASH_VARIANCE_REQUIRES_APPROVAL = "CASH_VARIANCE_REQUIRES_APPROVAL"
    STOCK_NEGATIVE_ALLOWED = "STOCK_NEGATIVE_ALLOWED"
    DIRECT_SALE_MAX_CASH_WITHOUT_APPROVAL = "DIRECT_SALE_MAX_CASH_WITHOUT_APPROVAL"


# Default values used when a policy key is absent or inactive.
_SAFE_DEFAULTS: dict[str, Any] = {
    PolicyKey.PAYMENT_REVERSAL_REQUIRES_APPROVAL: True,
    PolicyKey.DEPOSIT_REFUND_REQUIRES_APPROVAL: True,
    PolicyKey.STOCK_ADJUSTMENT_REQUIRES_APPROVAL: False,
    PolicyKey.MANUAL_JOURNAL_REQUIRES_APPROVAL: True,
    PolicyKey.DIRECT_SALE_CANCEL_REQUIRES_APPROVAL: False,
    PolicyKey.RENT_LEASE_ACTIVATION_REQUIRES_APPROVAL: False,
    PolicyKey.CASH_VARIANCE_REQUIRES_APPROVAL: False,
    PolicyKey.STOCK_NEGATIVE_ALLOWED: False,
    PolicyKey.DIRECT_SALE_MAX_CASH_WITHOUT_APPROVAL: Decimal("50000.00"),
}


# ─────────────────────────────────────────────
# Typed parsing
# ─────────────────────────────────────────────

def _parse_value(value: str, value_type: str) -> Any:
    try:
        if value_type == PolicyValueType.BOOL:
            return value.strip().lower() in ("true", "1", "yes")
        if value_type == PolicyValueType.INT:
            return int(value.strip())
        if value_type == PolicyValueType.DECIMAL:
            return Decimal(value.strip())
        if value_type == PolicyValueType.JSON:
            return json.loads(value)
        return value  # STRING
    except (ValueError, InvalidOperation, json.JSONDecodeError) as exc:
        log.warning("BusinessPolicy parse error value_type=%s value=%r: %s", value_type, value, exc)
        return None


# ─────────────────────────────────────────────
# Read path
# ─────────────────────────────────────────────

def get_policy_value(
    key: str,
    *,
    default: Any = None,
    scope_type: str = PolicyScopeType.GLOBAL,
    scope_key: str = "",
) -> Any:
    """Return the typed value for *key*, falling back to *default* then _SAFE_DEFAULTS.

    Never raises. Returns controlled default on any error.
    """
    try:
        from django.db.models import Q
        now = timezone.now()
        qs = BusinessPolicy.objects.filter(
            key=key,
            is_active=True,
            scope_type=scope_type,
            scope_key=scope_key,
        ).filter(
            Q(effective_from__isnull=True) | Q(effective_from__lte=now)
        ).filter(
            Q(effective_to__isnull=True) | Q(effective_to__gte=now)
        ).order_by("-created_at")

        policy = qs.first()
        if policy is None:
            return _resolve_default(key, default)

        parsed = _parse_value(policy.value, policy.value_type)
        if parsed is None:
            return _resolve_default(key, default)
        return parsed

    except Exception as exc:  # noqa: BLE001
        log.exception("get_policy_value failed for key=%s: %s", key, exc)
        return _resolve_default(key, default)


def _resolve_default(key: str, caller_default: Any) -> Any:
    if caller_default is not None:
        return caller_default
    return _SAFE_DEFAULTS.get(key)


# ─────────────────────────────────────────────
# Write path
# ─────────────────────────────────────────────

@transaction.atomic
def set_policy_value(
    *,
    key: str,
    value: Any,
    value_type: str = PolicyValueType.BOOL,
    scope_type: str = PolicyScopeType.GLOBAL,
    scope_key: str = "",
    effective_from=None,
    effective_to=None,
    updated_by=None,
    metadata: dict | None = None,
) -> BusinessPolicy:
    """Upsert an active policy row.

    Deactivates any existing active row for the same key/scope before creating
    the new one, preserving full history.
    """
    BusinessPolicy.objects.filter(
        key=key,
        scope_type=scope_type,
        scope_key=scope_key,
        is_active=True,
    ).update(is_active=False)

    serialized = _serialize_value(value, value_type)

    policy = BusinessPolicy.objects.create(
        key=key,
        value=serialized,
        value_type=value_type,
        scope_type=scope_type,
        scope_key=scope_key or "",
        effective_from=effective_from,
        effective_to=effective_to,
        is_active=True,
        updated_by=updated_by,
        metadata=metadata or {},
    )
    return policy


def _serialize_value(value: Any, value_type: str) -> str:
    if value_type == PolicyValueType.BOOL:
        return "true" if value else "false"
    if value_type == PolicyValueType.JSON:
        return json.dumps(value)
    return str(value)
