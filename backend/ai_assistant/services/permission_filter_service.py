from __future__ import annotations

from ai_assistant.models import AIKnowledgeChunk, AIKnowledgeSource
from ai_assistant.services.ingestion_service import ALLOWED_SOURCE_TYPES


PHASE_8D_VISIBILITY = AIKnowledgeSource.Visibility.ADMIN_ONLY


def user_is_phase_8d_admin(user) -> bool:
    role = (getattr(user, "role", "") or "").strip().upper()
    return bool(getattr(user, "is_staff", False) or role == "ADMIN")


def allowed_visibility_for_user(user) -> set[str]:
    if user_is_phase_8d_admin(user):
        return {PHASE_8D_VISIBILITY}
    return set()


def allowed_source_types_for_user(user) -> set[str]:
    if user_is_phase_8d_admin(user):
        return set(ALLOWED_SOURCE_TYPES)
    return set()


def phase_8d_chunk_queryset(user):
    """
    Phase 8D deliberately enables admin-only retrieval.

    Future role-specific retrieval can add STAFF/PARTNER/CUSTOMER_PUBLIC
    visibility rules here, but they are not enabled in this phase.
    """
    return AIKnowledgeChunk.objects.select_related("source").filter(
        source__status=AIKnowledgeSource.Status.ACTIVE,
        source__visibility=PHASE_8D_VISIBILITY,
        source__source_type__in=allowed_source_types_for_user(user),
        visibility=PHASE_8D_VISIBILITY,
    )
