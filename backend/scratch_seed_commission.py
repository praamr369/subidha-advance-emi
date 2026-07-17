import os
import sys
from decimal import Decimal

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

import django
django.setup()

from subscriptions.models import Commission, CommissionStatus, Subscription, Payment
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()
partner = User.objects.filter(role="PARTNER").first()
if not partner:
    print("No partner found")
    sys.exit()

payment = Payment.objects.filter(commission__isnull=True).first()

if payment:
    c = Commission.objects.create(
        partner=partner,
        subscription=payment.subscription,
        payment=payment,
        commission_amount=Decimal("150.00"),
        status=CommissionStatus.PENDING
    )
    print(f"Successfully created pending Commission for partner {partner.username} with amount 150.00!")
else:
    print("No payments without commissions found in the database. Creating a mock one...")
    sub = Subscription.objects.first()
    if sub:
        payment = Payment.objects.create(
            subscription=sub,
            customer=sub.customer,
            amount=Decimal("500.00"),
            payment_date=timezone.now().date(),
            method="CASH"
        )
        c = Commission.objects.create(
            partner=partner,
            subscription=payment.subscription,
            payment=payment,
            commission_amount=Decimal("150.00"),
            status=CommissionStatus.PENDING
        )
        print(f"Successfully created mock payment and pending Commission for partner {partner.username} with amount 150.00!")
    else:
        print("No subscriptions found, cannot create a commission.")
