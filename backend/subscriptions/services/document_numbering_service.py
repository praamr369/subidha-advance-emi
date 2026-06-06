from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Iterable

from accounting.services.document_sequence_service import (
    DOCUMENT_PROFILES_BY_KEY,
    DOCUMENT_TYPE_PROFILES,
    DocumentNumberingSetupError,
    ResetPolicy,
    build_document_numbering_readiness,
    upsert_numbering_profile,
)


@dataclass(frozen=True)
class NumberingSpec:
    key: str
    label: str
    series_code: str
    default_prefix_template: str
    doc_kind: str
    workflow_group: str
    required_for_go_live: bool = True
    description: str = ""
    document_type: str = ""
    default_pattern: str = ""


NUMBERING_SPECS: tuple[NumberingSpec, ...] = tuple(
    NumberingSpec(
        key=profile.key,
        label=profile.label,
        series_code=profile.series_code,
        default_prefix_template=profile.prefix,
        doc_kind=profile.doc_kind,
        workflow_group=profile.workflow_group,
        required_for_go_live=profile.required_for_go_live,
        description=profile.description,
        document_type=profile.document_type,
        default_pattern=profile.pattern,
    )
    for profile in DOCUMENT_TYPE_PROFILES
)
NUMBERING_KEYS = {spec.key for spec in NUMBERING_SPECS}
NUMBERING_BY_KEY = {spec.key: spec for spec in NUMBERING_SPECS}


def get_document_numbering_state(*, reference_date: date | None = None) -> dict:
    return build_document_numbering_readiness(reference_date=reference_date)


def upsert_document_numbering(
    *,
    key: str,
    prefix: str,
    padding: int,
    next_number: int,
    performed_by=None,
    reference_date: date | None = None,
    pattern: str = "",
    suffix: str = "",
    reset_policy: str = ResetPolicy.YEARLY,
):
    profile = DOCUMENT_PROFILES_BY_KEY.get(key)
    if profile is None:
        raise ValueError("Unsupported numbering key.")
    try:
        return upsert_numbering_profile(
            document_type=profile.document_type,
            prefix=prefix,
            pattern=pattern or profile.pattern,
            suffix=suffix,
            reset_policy=reset_policy,
            next_number=next_number,
            padding=padding,
            performed_by=performed_by,
            reference_date=reference_date,
        )
    except DocumentNumberingSetupError as exc:
        raise ValueError(str(exc)) from exc


def seed_default_document_numbering(*, performed_by=None, reference_date: date | None = None) -> dict:
    created: list[dict] = []
    skipped: list[dict] = []
    current = get_document_numbering_state(reference_date=reference_date)
    for row in current["sequences"]:
        if row["configured"]:
            skipped.append({"key": row["key"], "series_code": row["series_code"], "reason": "already_configured"})
            continue
        sequence = upsert_document_numbering(
            key=row["key"],
            prefix=row["default_prefix"],
            pattern=row["default_pattern"],
            padding=row["default_padding"],
            next_number=1,
            performed_by=performed_by,
            reference_date=reference_date,
        )
        created.append({"key": row["key"], "series_code": row["series_code"], "id": sequence.id})
    return {
        "financial_year": current["financial_year"],
        "created_count": len(created),
        "skipped_count": len(skipped),
        "created": created,
        "skipped": skipped,
    }


def required_numbering_keys_for_checklist() -> Iterable[str]:
    return tuple(spec.key for spec in NUMBERING_SPECS if spec.required_for_go_live)
