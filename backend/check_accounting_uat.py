import os
import sys
import django

# Use the test settings but we will override the DB URL to point to UAT
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.development")
os.environ["DATABASE_URL"] = "postgres://postgres:postgres@127.0.0.1:5432/subidha_core_uat"

django.setup()

from django.db.models import Sum
from inventory.models import StockLedgerEntry
from accounting.models import VendorSettlement, VendorLedgerEntry, SalarySheet, SalaryPayment, JournalEntry
from commissions.models import CommissionPayoutBatch, CommissionPayoutLine

print("\n" + "="*80)
print("🔍 UAT ACCOUNTING MODULES CHECK (subidha_core_uat)")
print("="*80)

def safe_sum(queryset, field):
    result = queryset.aggregate(total=Sum(field))['total']
    return result if result else 0

try:
    # 1. Inventory
    inventory_count = StockLedgerEntry.objects.count()
    inventory_in_qty = safe_sum(StockLedgerEntry.objects.filter(movement_type='IN'), 'quantity')
    inventory_out_qty = safe_sum(StockLedgerEntry.objects.filter(movement_type='OUT'), 'quantity')
    print(f"\n📦 INVENTORY ACCOUNTING:")
    print(f"  - Total Stock Ledger Entries: {inventory_count}")
    print(f"  - Total IN Quantity: {inventory_in_qty}")
    print(f"  - Total OUT Quantity: {inventory_out_qty}")

    # 2. Vendor Payout
    vendor_settlement_count = VendorSettlement.objects.count()
    vendor_ledger_count = VendorLedgerEntry.objects.count()
    vendor_ledger_credit = safe_sum(VendorLedgerEntry.objects.filter(entry_type='CREDIT'), 'credit')
    vendor_ledger_debit = safe_sum(VendorLedgerEntry.objects.filter(entry_type='DEBIT'), 'debit')
    print(f"\n🏢 VENDOR PAYOUTS:")
    print(f"  - Vendor Settlements: {vendor_settlement_count}")
    print(f"  - Vendor Ledger Entries: {vendor_ledger_count}")
    print(f"  - Total Payable (Credit): ₹{vendor_ledger_credit}")
    print(f"  - Total Paid (Debit): ₹{vendor_ledger_debit}")

    # 3. Commission
    comm_batch_count = CommissionPayoutBatch.objects.count()
    comm_line_count = CommissionPayoutLine.objects.count()
    comm_total = safe_sum(CommissionPayoutLine.objects.all(), 'amount')
    print(f"\n🤝 COMMISSION ACCOUNTING:")
    print(f"  - Commission Payout Batches: {comm_batch_count}")
    print(f"  - Commission Payout Lines: {comm_line_count}")
    print(f"  - Total Commission Amount: ₹{comm_total}")

    # 4. Staff Payroll
    salary_sheet_count = SalarySheet.objects.count()
    salary_payment_count = SalaryPayment.objects.count()
    salary_total = safe_sum(SalaryPayment.objects.all(), 'amount')
    print(f"\n👥 STAFF PAYROLL ACCOUNTING:")
    print(f"  - Salary Sheets Generated: {salary_sheet_count}")
    print(f"  - Salary Payments Made: {salary_payment_count}")
    print(f"  - Total Salary Disbursed: ₹{salary_total}")

    # 5. Global Accounting Journals
    journal_count = JournalEntry.objects.count()
    posted_count = JournalEntry.objects.filter(status='POSTED').count()
    print(f"\n📔 ACCOUNTING JOURNALS (BRIDGE):")
    print(f"  - Total Journal Entries: {journal_count}")
    print(f"  - POSTED Journals: {posted_count}")

except Exception as e:
    print(f"\n❌ Error probing UAT models: {e}")

print("\n" + "="*80)
