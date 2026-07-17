import os
import sys
import django

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from subscriptions.models import Subscription

try:
    sub = Subscription.objects.get(id=6)
    print(f"--- SUBSCRIPTION 6 ---")
    print(f"Status: {sub.status}")
    print(f"Total Amount: {sub.total_amount}")
    
    print("\n--- EMIs ---")
    for emi in sub.emis.all().order_by('month_no'):
        print(f"EMI month {emi.month_no}: due={emi.amount}, status={emi.status}")
        
    print("\n--- PAYMENTS ---")
    for p in sub.payments.all():
        print(f"Payment {p.id}: amount={p.amount}")
except Exception as e:
    print(f"Error: {e}")
