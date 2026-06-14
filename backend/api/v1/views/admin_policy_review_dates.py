from __future__ import annotations

from datetime import date

from django.db import transaction
from django.utils.dateparse import parse_date
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.models_business_setup import PolicyPage
from subscriptions.services.policy_governance_service import POLICY_STATUS_ARCHIVED, hydrate_policy_governance_metadata


def _resolve_review_due_date(value: str | None) -> date:
    if value:
        parsed = parse_date(str(value))
        if parsed is None:
            raise ValidationError({"review_due_date": "Use YYYY-MM-DD format."})
        return parsed
    today = date.today()
    try:
        return today.replace(year=today.year + 1)
    except ValueError:
        return today.replace(month=2, day=28, year=today.year + 1)


class AdminPolicyBulkReviewDateView(APIView):
    """Admin-only helper to add review due dates to active policy rows.

    This is governance metadata only. It does not publish, approve, archive,
    create public content, or mutate legal policy text.
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request):
        review_due_date = _resolve_review_due_date(request.data.get("review_due_date"))
        queryset = PolicyPage.objects.exclude(status=POLICY_STATUS_ARCHIVED).order_by("slug", "-version", "-id")
        updated = 0
        skipped = 0
        for policy in queryset:
            metadata = hydrate_policy_governance_metadata(policy)
            if metadata.review_due_date:
                skipped += 1
                continue
            metadata.review_due_date = review_due_date
            metadata.save(update_fields=["review_due_date", "updated_at"])
            updated += 1
        return Response(
            {
                "review_due_date": review_due_date.isoformat(),
                "updated_count": updated,
                "skipped_count": skipped,
                "detail": "Annual policy review due dates updated for active rows without changing policy content or publication state.",
            },
            status=status.HTTP_200_OK,
        )
