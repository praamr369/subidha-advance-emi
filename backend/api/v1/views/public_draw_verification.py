"""Public verification of a lucky draw's commit-reveal.

The scheme's defensibility rests on an outsider being able to check the draw
themselves. Before the draw, sha256(secret_seed) is published as the commit
hash; afterwards the seed is revealed. Anyone can hash the revealed seed and
compare. If it matches the hash that was published beforehand, the seed cannot
have been chosen after the entrants were known.

This endpoint does that comparison, and it is deliberately PUBLIC and
unauthenticated: a verification only staff can run proves nothing to the person
who needs convincing. It is also deliberately read-only — it changes nothing,
so exposing it costs nothing.

What it does NOT do is tell anyone whether a draw was fair in some broader
sense. It answers one narrow, checkable question: does this seed hash to the
hash that was committed? That is the question the cryptography can answer, and
overstating it would be worse than not having the endpoint.
"""
from __future__ import annotations

import hashlib

from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from api.v1.throttles.public import PublicLeadThrottle
from lucky_plan.models import DrawCommit


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PublicLeadThrottle])
def public_verify_seed_view(request):
    """Check a revealed seed against the hash committed before the draw.

    Throttled: it is unauthenticated and hashes user input, so it is the kind
    of endpoint that gets hammered. The existing public-lead throttle is reused
    rather than introducing a second policy to keep in step.
    """
    reveal_seed = str(request.data.get("reveal_seed") or "").strip()
    commit_hash = str(request.data.get("commit_hash") or "").strip().lower()
    batch_id = request.data.get("batch_id")

    if not reveal_seed:
        return Response(
            {"reveal_seed": ["Provide the revealed seed to verify."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # The seed is hashed exactly as it was at commit time — strip() then
    # sha256 of the UTF-8 bytes. Any difference here (an encoding, a stray
    # newline) would make a genuine seed look forged, so this mirrors
    # batch_draw_coordination_service rather than reimplementing it loosely.
    computed = hashlib.sha256(reveal_seed.strip().encode()).hexdigest()

    expected = commit_hash
    batch_code = ""
    committed_at = None

    # A batch id lets the caller verify against what was actually published,
    # rather than against a hash they supplied themselves — which would only
    # prove they can run sha256.
    if batch_id not in (None, ""):
        commit = (
            DrawCommit.objects.select_related("batch")
            .filter(batch_id=batch_id)
            .first()
        )
        if commit is None:
            return Response(
                {"detail": "No draw commitment exists for that batch."},
                status=status.HTTP_404_NOT_FOUND,
            )
        expected = commit.public_commit_hash.lower()
        batch_code = getattr(commit.batch, "code", "") or ""
        committed_at = commit.committed_at

    if not expected:
        return Response(
            {
                "detail": (
                    "Provide either a batch_id to verify against the published "
                    "commitment, or a commit_hash to compare with."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response(
        {
            "valid": computed == expected,
            "computed_hash": computed,
            "expected_hash": expected,
            "batch_code": batch_code,
            "committed_at": committed_at,
            "algorithm": "sha256(seed)",
            # Said plainly, because a bare true/false invites over-reading.
            "verifies": (
                "That the revealed seed hashes to the value committed before "
                "the draw, so the seed was fixed in advance."
            ),
        }
    )
