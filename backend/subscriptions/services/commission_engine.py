from collections import defaultdict

from django.db import transaction
from django.db.models import Sum

from subscriptions.models import Commission, CommissionPayoutBatch, PartnerPayout


@transaction.atomic
def process_monthly_commissions(*, month, processed_by):
    approved = Commission.objects.filter(
        status="APPROVED",
        created_at__month=month.month,
        created_at__year=month.year,
    )

    total_batch_amount = approved.aggregate(total=Sum("commission_amount"))["total"] or 0

    batch = CommissionPayoutBatch.objects.create(
        month=month,
        total_amount=total_batch_amount,
        processed_by=processed_by,
    )

    partner_map = defaultdict(list)
    for commission in approved:
        partner_map[commission.partner_id].append(commission)

    for partner_id, commissions in partner_map.items():
        partner_total = sum(c.commission_amount for c in commissions)

        PartnerPayout.objects.create(
            payout_batch=batch,
            partner_id=partner_id,
            total_commission=partner_total,
            commission_count=len(commissions),
        )

        Commission.objects.filter(id__in=[c.id for c in commissions]).update(
            status="PAID",
            is_settled=True,
        )

    return batch
