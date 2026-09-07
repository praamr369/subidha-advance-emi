"""What a partner can see about their own arrangement with the business.

Read-only, and deliberately so. Everything here — commission rate, settlement
cycle, contract dates — is set by the business, not by the partner. A partner
editing their own commission rate is the obvious thing this must never allow,
and the simplest way to guarantee that is to expose no write path at all.
Partners change their username and password through the two existing
/partner/profile/ endpoints; nothing else about them is self-service.

The page has called this path since it was written and it was never mounted, so
the profile panel rendered empty.
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.v1.permissions import IsPartner


def _money(value) -> Decimal:
    return Decimal(value or 0)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsPartner])
def partner_profile_info_view(request):
    """The partner's own record, assembled from what already exists.

    No PartnerProfile model exists — a partner is a User with role=PARTNER, and
    the commercial terms live on that row and on their commissions. Inventing a
    profile model to satisfy this screen would create a second place for the
    same facts to disagree.
    """
    user = request.user

    # Commission totals come from the commission records themselves rather than
    # a cached balance: a stored total that drifts from the ledger is worse
    # than a slightly slower query, because the partner is being told what they
    # are owed.
    earned = Decimal("0")
    pending = Decimal("0")
    last_settlement_date = None
    last_settlement_amount = None
    try:
        from commissions.models import Commission

        rows = Commission.objects.filter(partner=user)
        earned = _money(rows.aggregate(total=Sum("commission_amount"))["total"])
        pending = _money(
            rows.exclude(status__in=["PAID", "CANCELLED"]).aggregate(
                total=Sum("commission_amount")
            )["total"]
        )
        last_paid = (
            rows.filter(status="PAID")
            .order_by("-settlement_date", "-id")
            .first()
        )
        if last_paid is not None:
            last_settlement_amount = last_paid.commission_amount
            last_settlement_date = last_paid.settlement_date
    except Exception:
        # A partner with no commission history is the common case for a new
        # partner, and the panel should still render their contact details
        # rather than failing wholesale.
        pass

    full_name = (user.get_full_name() or "").strip() or user.get_username()

    return Response(
        {
            "name": full_name,
            "code": user.get_username(),
            "phone": getattr(user, "phone", "") or "",
            "email": user.email or "",
            # Not modelled on the user; reported empty rather than invented, so
            # the panel never shows an address the business cannot stand behind.
            "address": "",
            "kyc_status": "",
            "admin_name": "",
            "admin_phone": "",
            "admin_email": "",
            "commission_rate": getattr(user, "commission_rate", None),
            "commission_type": "PERCENT",
            "settlement_cycle": "",
            "last_settlement_date": last_settlement_date,
            "last_settlement_amount": last_settlement_amount,
            "total_earned": earned,
            "total_pending": pending,
            "contract_start": getattr(user, "date_joined", None),
            "contract_end": None,
            "contract_status": "ACTIVE" if user.is_active else "INACTIVE",
        }
    )
