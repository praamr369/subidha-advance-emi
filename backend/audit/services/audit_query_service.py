"""Audit Query Service (Area A: Document Pattern with JSONB metadata).

Provides structured document querying over `AuditLog.metadata` and
`BusinessEventLog.payload` without changing schema definitions.
"""
from __future__ import annotations

from typing import Any, Optional
from django.db.models import QuerySet

from audit.models import AuditLog, BusinessEventLog


def query_audit_by_json_metadata(
    *,
    model_name: Optional[str] = None,
    action_type: Optional[str] = None,
    performed_by_id: Optional[int] = None,
    metadata_filters: Optional[dict[str, Any]] = None,
    limit: int = 50,
) -> QuerySet[AuditLog]:
    """
    Query AuditLog entries matching specific JSON document metadata.
    Uses Django's JSON containment `metadata__contains` for PostgreSQL JSONB.
    """
    qs = AuditLog.objects.all().order_by("-created_at")

    if model_name:
        qs = qs.filter(model_name=model_name)
    if action_type:
        qs = qs.filter(action_type=action_type)
    if performed_by_id:
        qs = qs.filter(performed_by_id=performed_by_id)

    if metadata_filters:
        qs = qs.filter(metadata__contains=metadata_filters)

    return qs[:limit]


def query_business_events_by_payload(
    *,
    event_type: Optional[str] = None,
    customer_id: Optional[int] = None,
    subscription_id: Optional[int] = None,
    payload_filters: Optional[dict[str, Any]] = None,
    limit: int = 50,
) -> QuerySet[BusinessEventLog]:
    """
    Query BusinessEventLog entries matching specific payload JSON document.
    """
    qs = BusinessEventLog.objects.all().order_by("-occurred_at")

    if event_type:
        qs = qs.filter(event_type=event_type)
    if customer_id:
        qs = qs.filter(customer_id=customer_id)
    if subscription_id:
        qs = qs.filter(subscription_id=subscription_id)

    if payload_filters:
        qs = qs.filter(payload__contains=payload_filters)

    return qs[:limit]

