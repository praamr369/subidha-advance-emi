import os
import sys
import django

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from subscriptions.models import Subscription, EmiStatus, LedgerEntryType, FinancialLedger, LedgerDirection

sub = Subscription.objects.get(id=6)
print("Checking EMI 1 and 2 ledgers...")
for emi in sub.emis.filter(status=EmiStatus.PAID):
    payment_total = sum(p.amount for p in emi.payments.all())
    ledger_total = sum(l.amount for l in emi.ledger_entries.filter(entry_type=LedgerEntryType.EMI_PAYMENT))
    if payment_total > 0 and ledger_total == 0:
        print(f"Fixing ledger for EMI {emi.month_no}, payment {payment_total}")
        FinancialLedger.objects.create(
            emi=emi,
            entry_type=LedgerEntryType.EMI_PAYMENT,
            entry_direction=LedgerDirection.CREDIT,
            amount=payment_total,
        )

print("Re-evaluating reconciliations...")
from subscriptions.services.reconciliation_service import reconcile_subscription, reconcile_emi_ledger

res = reconcile_subscription(sub)
print("Sub recon:", res)
for emi in sub.emis.filter(status=EmiStatus.PAID):
    print(f"EMI {emi.month_no} recon:", reconcile_emi_ledger(emi))
