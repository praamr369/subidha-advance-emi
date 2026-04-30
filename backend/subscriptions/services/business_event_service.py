from __future__ import annotations

import logging
from typing import Any

from django.utils import timezone

from subscriptions.models import BusinessEventLog, BusinessEventType

logger = logging.getLogger(__name__)


def append_business_event(
    *,
    event_type: str,
    source_module: str,
    actor_user=None,
    customer=None,
    subscription=None,
    contract_reference=None,
    payment=None,
    batch=None,
    lucky_id=None,
    ledger_reference: str | None = None,
    payload: dict[str, Any] | None = None,
    occurred_at=None,
    request_id: str | None = None,
    idempotency_key: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    critical: bool = False,
) -> BusinessEventLog | None:
    valid_types = set(BusinessEventType.values)
    if event_type not in valid_types:
        message = f"Unsupported business event type: {event_type!r}"
        if critical:
            raise ValueError(message)
        logger.warning(message)
        return None

    try:
        return BusinessEventLog.objects.create(
            event_type=event_type,
            actor_user=actor_user,
            customer=customer,
            subscription=subscription,
            contract_reference=contract_reference,
            payment=payment,
            batch=batch,
            lucky_id=lucky_id,
            ledger_reference=(ledger_reference or "").strip(),
            source_module=(source_module or "").strip() or "unknown",
            payload=payload or {},
            occurred_at=occurred_at or timezone.now(),
            request_id=(request_id or "").strip() or None,
            idempotency_key=(idempotency_key or "").strip() or None,
            ip_address=(ip_address or "").strip() or None,
            user_agent=(user_agent or "").strip() or None,
        )
    except Exception:
        if critical:
            raise
        logger.exception(
            "Non-critical business event write failed",
            extra={
                "event_type": event_type,
                "source_module": source_module,
            },
        )
        return None

