#!/usr/bin/env python
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.production')

import django
django.setup()

from subscriptions.models_address import PincodeDatabase
from django.db.models import Count

total = PincodeDatabase.objects.count()
print("\n" + "=" * 70)
print("Pincode Database Status")
print("=" * 70)
print("Total pincodes loaded: {:,}".format(total))

states = list(
    PincodeDatabase.objects.values('state')
    .annotate(count=Count('postal_code'))
    .order_by('-count')
)
print("States/UTs covered: {}".format(len(states)))
print("\nBreakdown by state:")
for item in states:
    print("  {}: {:,} pincodes".format(item['state'], item['count']))
print("=" * 70 + "\n")
