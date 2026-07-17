import os
import sys
import django
from decimal import Decimal
import datetime

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from subscriptions.models import Subscription, SubscriptionEMI, Payment

sub = Subscription.objects.get(id=6)

print(f"Sub Status Before: {sub.status}")

# Check EMI 1
emi1 = sub.emis.get(month_no=1)
print(f"EMI 1: amount={emi1.amount}, status={emi1.status}, paid_amount={getattr(emi1, 'paid_amount', 'N/A')}")
# Check the payments for EMI 1
for p in emi1.payments.all():
    print(f"  Payment for EMI 1: amount={p.amount}")

