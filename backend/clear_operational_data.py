#!/usr/bin/env python
"""Clear Operational Data - Preserve Business Setup"""

import os
import sys
import django
from datetime import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.production')
django.setup()

from accounts.models import User
from django.contrib.sessions.models import Session
from django.apps import apps

try:
    from token_blacklist.models import OutstandingToken, BlacklistedToken
    HAS_TOKEN_BLACKLIST = True
except ImportError:
    HAS_TOKEN_BLACKLIST = False

print("=" * 50)
print("CLEAR OPERATIONAL DATA - PRESERVING SETUP")
print("=" * 50)
print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print()

try:
    print("[STEP 1] Deleting operational business data...")

    operational_model_names = {
        # Subscriptions operational
        "Customer", "Subscription", "Emi", "Payment", "LuckyId", "PublicLead", "SubscriptionRequest",
        "SubscriptionDocument", "SubscriptionDelivery", "CustomerAdvance", "CustomerAdvanceAllocation",
        "PaymentReconciliation", "PaymentReconciliationEvent", "PartnerCollectionRequest", "DrawEligibilitySnapshot",
        "DrawCommit", "LuckyDraw", "OperationalCancellation", "BusinessEventLog", "FinancialLedger", "Commission",
        "CommissionPayoutBatch", "CommissionPayoutLine", "CustomerReferral", "CustomerKycDocument",
        "ContractAmendment", "ContractRecontractEvent", "ContractRecontractScheduleLine",
        "ContractRecontractFinancialImpactPreview", "ProductPossession", "RentLeaseReturnInspection",
        "DryRunValidationJob", "RentalAsset", "AssetConditionSnapshot", "CustomerRiskProfile",
        "SubscriptionGuarantor", "RecoveryCase", "AMLScreeningRecord", "Delivery",
        "ProofOfDelivery", "CustomerDispute", "BusinessDataBackupJob",
        "BusinessDataRestoreJob", "RentLeaseCollection", "CustomerAdvanceRefund", "KycReviewAction",
        "PartnerKycDocument", "ApprovalRequest", "ControlException", "CashCounterSession", "DailyCloseRun",
        "DailyCloseCheckResult", "MonthEndCloseRun", "MonthEndCloseCheckResult",
        "CustomerGrowthRequest", "GrowthRequestLine", "GrowthRequestDecision",
        
        # Accounting operational
        "JournalEntry", "JournalEntryLine", "VendorLedgerEntry", "VendorQuoteRequest", "VendorQuote",
        "CustomerPurchaseEnquiry", "DepreciationRun", "DepreciationLine", "ExpenseVoucher",
        "LeaveRequest", "EmployeeAttendance", "StaffTask", "SalarySheet",
        "SalarySheetLine", "SalaryPayment", "StaffAdvance", "StaffAdvanceRecovery", "EmployeeExpenseClaim",
        "EmployeeExpenseClaimPayment", "MoneyMovement", "VendorSettlement", "AccountingBridgePosting",
        "TaxInvoice", "TaxInvoiceLine", "CreditNote", "DebitNote", "ExportPackJob",
        "TDSDeduction", "TCSCollection", "LeaseContract", "LeaseSchedule", "FixedAssetDepreciation",
        "DepreciationSchedule", "BridgePostingApproval", "CustomerOpeningOutstanding",
        
        # Inventory operational
        "InventoryLot", "StockLedger", "StockAdjustment", "StockAdjustmentLine",
        "OpeningStockBatch", "OpeningStockEntry", "PurchaseBill", "PurchaseBillLine", "PurchaseOrder",
        "PurchaseOrderLine", "GoodsReceipt", "GoodsReceiptLine", "VendorBill", "VendorBillLine", "VendorPayment",
        "PurchaseRequest", "PurchaseRequestLine", "StockLedgerEntry",
        "StockReservation", "PurchaseNeed", "InventoryAdjustment",
        
        # Manufacturing operational
        "ProductionJob", "ProductionMaterialIssueLine",
        "ProductionReceiptLine", "ProductionScrapLine",
        
        # Billing operational
        "DirectSale", "DirectSaleLine", "BillingInvoice", "BillingInstallmentMirror",
        "BillingSyncEvent", "BillingInvoiceLine", "BillingCreditNote", "BillingCreditNoteLine",
        "BillingDebitNote", "BillingDebitNoteLine", "ReceiptDocument", "DirectSaleReturn",
        "DirectSaleReturnLine", "CustomerCreditLedger", "CustomerRefund", "PurchaseReturn", "PurchaseReturnLine",
        
        # CRM operational
        "PartyInteraction", "Lead", "Opportunity", "FollowUpTask", "CustomerInteraction",
        
        # Service Desk operational
        "ServiceDeskCase", "ServiceDeskCaseLine", "SupportTicket", "SupportTicketEvent",
        "SupportTicketComment", "SupportTicketAttachment", "SupportTicketLink",
        
        # Reminders operational
        "PaymentReminder"
    }

    deleted_count = 0
    all_models = apps.get_models()
    
    # Enable UTF-8 output on Windows
    import sys
    if sys.platform.startswith('win'):
        sys.stdout.reconfigure(encoding='utf-8')
    
    pass_num = 1
    while True:
        print(f"\n--- Pass {pass_num} ---")
        pass_deleted = 0
        
        for model in all_models:
            if model.__name__ in operational_model_names:
                try:
                    count, _ = model.objects.all().delete()
                    if count > 0:
                        pass_deleted += count
                        print(f"  OK {model.__name__}: {count} rows")
                except Exception as e:
                    # Ignore PROTECT errors on this pass, they will be deleted next pass
                    pass
        
        deleted_count += pass_deleted
        if pass_deleted == 0:
            break
        pass_num += 1

    print(f"\n[OK] Operational data deleted: {deleted_count} rows")
    print()

    # Step 2: Delete auth artifacts
    print("[STEP 2] Deleting auth sessions and tokens...")
    session_count = Session.objects.all().delete()[0]
    print(f"  ✓ Sessions: {session_count}")

    outstanding_count = 0
    blacklisted_count = 0

    if HAS_TOKEN_BLACKLIST:
        outstanding_count = OutstandingToken.objects.all().delete()[0]
        blacklisted_count = BlacklistedToken.objects.all().delete()[0]
        print(f"  ✓ Outstanding tokens: {outstanding_count}")
        print(f"  ✓ Blacklisted tokens: {blacklisted_count}")
    
    print(f"[OK] Auth artifacts deleted: {session_count + outstanding_count + blacklisted_count} rows")
    print()

    # Step 3: NOT deleting users
    print("[STEP 3] Users are preserved.")
    
    print("=" * 50)
    print("CLEAR COMPLETE - BUSINESS SETUP PRESERVED!")
    print("=" * 50)

except Exception as e:
    print()
    print("=" * 50)
    print("ERROR DURING SCRIPT")
    print("=" * 50)
    print(f"Error: {str(e)}")
    sys.exit(1)
