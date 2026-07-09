#!/usr/bin/env python
"""Complete Business Reset Script - Delete all data except admin user"""

import os
import sys
import django
from datetime import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.production')
django.setup()

from accounts.models import User  # Custom User model
from django.contrib.sessions.models import Session
from django.db import connection

# Try to import token_blacklist models if available
try:
    from token_blacklist.models import OutstandingToken, BlacklistedToken
    HAS_TOKEN_BLACKLIST = True
except ImportError:
    HAS_TOKEN_BLACKLIST = False

print("=" * 50)
print("COMPLETE BUSINESS RESET - PYTHON EXECUTION")
print("=" * 50)
print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print()

try:
    # Step 1: Verify admin user exists
    print("[STEP 1] Verifying admin user...")
    admin_user = User.objects.get(username='pradip')
    print(f"[OK] Admin user found: {admin_user.username} (ID: {admin_user.id})")
    print(f"     Superuser: {admin_user.is_superuser}")
    print()

    # Step 2: Delete business data
    print("[STEP 2] Deleting business data...")

    from subscriptions.models import (
        Customer, Subscription, Product, Emi, Payment,
        Batch, LuckyId, PublicLead, SubscriptionRequest,
        SubscriptionDocument, SubscriptionDelivery,
        CustomerAdvance, CustomerAdvanceAllocation,
        PaymentReconciliation, PaymentReconciliationEvent,
        PartnerCollectionRequest, DrawEligibilitySnapshot,
        DrawCommit, LuckyDraw, OperationalCancellation,
        BusinessEventLog, FinancialLedger, Commission,
        CommissionPayoutBatch, CommissionPayoutLine,
        CustomerReferral, CustomerKycDocument,
        ContractAmendment, ContractRecontractEvent,
        ContractRecontractScheduleLine,
        ContractRecontractFinancialImpactPreview,
        ProductPossession, RentLeaseReturnInspection,
        DryRunValidationJob, RentalAsset,
        AssetConditionSnapshot, CustomerRiskProfile,
        SubscriptionGuarantor, RecoveryCase,
        EMIScheme, AMLScreeningRecord, Delivery,
        ProofOfDelivery, CustomerDispute,
        BusinessProfile, BusinessRulePolicy,
        PublicBusinessProfile, PolicyPage,
        BusinessComplianceDocument,
        BrandDataSource, BrandImportBatch,
        BrandImportedItem, BrandProfileSnapshot,
        SocialLink, BusinessMediaAsset,
        PublicContentBlock, Branch, FinanceAccount,
        CashDesk, StaffOperationalAssignment,
        ChartAccount, BusinessDataBackupJob,
        BusinessDataRestoreJob, DocumentPrintSettings,
        EmailSMTPSettings, BusinessComplianceDocumentReviewState,
        PolicyGovernanceMetadata, RentLeaseCollection,
        CustomerAdvanceRefund, KycReviewAction,
        PartnerKycDocument, ApprovalRequest,
        BusinessPolicy, ControlException,
        CashCounterSession, DailyCloseRun,
        DailyCloseCheckResult, MonthEndCloseRun,
        MonthEndCloseCheckResult, PlanTemplate,
        OfferPackage, OfferPackageLine,
        CustomerGrowthRequest, GrowthRequestLine,
        GrowthRequestDecision
    )

    from accounting.models import (
        JournalEntry, JournalEntryLine, Vendor, VendorCategory,
        VendorAddress, VendorServiceArea, VendorProduct,
        VendorLedgerEntry, VendorQuoteRequest, VendorQuote,
        CustomerPurchaseEnquiry, AssetCategory, Asset,
        DepreciationRun, DepreciationLine, ExpenseVoucher,
        EmployeeProfile, EmployeeDocument, PayrollPeriod,
        EmployeeCompensationComponent, LeaveType, LeaveRequest,
        EmployeeAttendance, StaffTask, SalarySheet,
        SalarySheetLine, SalaryPayment, StaffAdvance,
        StaffAdvanceRecovery, EmployeeExpenseClaim,
        EmployeeExpenseClaimPayment, MoneyMovement,
        VendorSettlement, AccountingBridgePosting,
        TaxInvoice, TaxInvoiceLine, CreditNote, DebitNote,
        ExportPackJob, VendorKycDocument, StaffKycDocument,
        TDSDeduction, TCSCollection, CostCentre,
        LeaseContract, LeaseSchedule, FixedAssetDepreciation,
        DepreciationSchedule, DeferredTax, CostAllocationRule,
        CostAllocationDetail, BridgePostingApproval,
        CustomerOpeningOutstanding
    )

    from inventory.models import (
        StockLocation, InventoryItem, InventoryLot,
        StockLedger, StockAdjustment, StockAdjustmentLine,
        OpeningStockBatch, OpeningStockEntry, PurchaseBill,
        PurchaseBillLine, VendorContact, PurchaseOrder,
        PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine,
        VendorBill, VendorBillLine, VendorPayment,
        VendorAgreement, PurchaseRequest, PurchaseRequestLine,
        InventoryValuation, Warehouse, StockLedgerEntry,
        StockReservation, ReorderRule, PurchaseNeed,
        InventoryAdjustment
    )

    from manufacturing.models import (
        ManufacturingBom, ManufacturingBomLine,
        ProductionJob, ProductionMaterialIssueLine,
        ProductionReceiptLine, ProductionScrapLine
    )

    from billing.models import (
        DirectSale, DirectSaleLine, BillingInvoice,
        BillingProfile, BillingInstallmentMirror,
        BillingSyncEvent, BillingInvoiceLine,
        BillingCreditNote, BillingCreditNoteLine,
        BillingDebitNote, BillingDebitNoteLine,
        ReceiptDocument, DirectSaleReturn,
        DirectSaleReturnLine, CustomerCreditLedger,
        CustomerRefund, PurchaseReturn, PurchaseReturnLine
    )

    from crm.models import (
        PartyMaster, PartyLink, PartyInteraction,
        CustomerTag, CustomerRiskFlag, Lead,
        Opportunity, FollowUpTask, CustomerInteraction,
        StaffSalesTarget
    )

    from service_desk.models import (
        ServiceDeskCase, ServiceDeskCaseLine,
        SupportTicket, SupportTicketEvent,
        SupportTicketComment, SupportTicketAttachment,
        SupportTicketLink
    )

    from reminders.models import PaymentReminder, NotificationTemplate

    models_to_delete = [
        Customer, Subscription, Product, Emi, Payment,
        Batch, LuckyId, PublicLead, SubscriptionRequest,
        SubscriptionDocument, SubscriptionDelivery,
        CustomerAdvance, CustomerAdvanceAllocation,
        PaymentReconciliation, PaymentReconciliationEvent,
        PartnerCollectionRequest, DrawEligibilitySnapshot,
        DrawCommit, LuckyDraw, OperationalCancellation,
        BusinessEventLog, FinancialLedger, Commission,
        CommissionPayoutBatch, CommissionPayoutLine,
        CustomerReferral, CustomerKycDocument,
        ContractAmendment, ContractRecontractEvent,
        ContractRecontractScheduleLine,
        ContractRecontractFinancialImpactPreview,
        ProductPossession, RentLeaseReturnInspection,
        DryRunValidationJob, RentalAsset,
        AssetConditionSnapshot, CustomerRiskProfile,
        SubscriptionGuarantor, RecoveryCase,
        EMIScheme, AMLScreeningRecord, Delivery,
        ProofOfDelivery, CustomerDispute,
        BusinessProfile, BusinessRulePolicy,
        PublicBusinessProfile, PolicyPage,
        BusinessComplianceDocument,
        BrandDataSource, BrandImportBatch,
        BrandImportedItem, BrandProfileSnapshot,
        SocialLink, BusinessMediaAsset,
        PublicContentBlock, Branch, FinanceAccount,
        CashDesk, StaffOperationalAssignment,
        ChartAccount, BusinessDataBackupJob,
        BusinessDataRestoreJob, DocumentPrintSettings,
        EmailSMTPSettings, BusinessComplianceDocumentReviewState,
        PolicyGovernanceMetadata, RentLeaseCollection,
        CustomerAdvanceRefund, KycReviewAction,
        PartnerKycDocument, ApprovalRequest,
        BusinessPolicy, ControlException,
        CashCounterSession, DailyCloseRun,
        DailyCloseCheckResult, MonthEndCloseRun,
        MonthEndCloseCheckResult, PlanTemplate,
        OfferPackage, OfferPackageLine,
        CustomerGrowthRequest, GrowthRequestLine,
        GrowthRequestDecision,
        # Accounting models
        JournalEntry, JournalEntryLine, Vendor, VendorCategory,
        VendorAddress, VendorServiceArea, VendorProduct,
        VendorLedgerEntry, VendorQuoteRequest, VendorQuote,
        CustomerPurchaseEnquiry, AssetCategory, Asset,
        DepreciationRun, DepreciationLine, ExpenseVoucher,
        EmployeeProfile, EmployeeDocument, PayrollPeriod,
        EmployeeCompensationComponent, LeaveType, LeaveRequest,
        EmployeeAttendance, StaffTask, SalarySheet,
        SalarySheetLine, SalaryPayment, StaffAdvance,
        StaffAdvanceRecovery, EmployeeExpenseClaim,
        EmployeeExpenseClaimPayment, MoneyMovement,
        VendorSettlement, AccountingBridgePosting,
        TaxInvoice, TaxInvoiceLine, CreditNote, DebitNote,
        ExportPackJob, VendorKycDocument, StaffKycDocument,
        TDSDeduction, TCSCollection, CostCentre,
        LeaseContract, LeaseSchedule, FixedAssetDepreciation,
        DepreciationSchedule, DeferredTax, CostAllocationRule,
        CostAllocationDetail, BridgePostingApproval,
        CustomerOpeningOutstanding,
        # Inventory models
        StockLocation, InventoryItem, InventoryLot,
        StockLedger, StockAdjustment, StockAdjustmentLine,
        OpeningStockBatch, OpeningStockEntry, PurchaseBill,
        PurchaseBillLine, VendorContact, PurchaseOrder,
        PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine,
        VendorBill, VendorBillLine, VendorPayment,
        VendorAgreement, PurchaseRequest, PurchaseRequestLine,
        InventoryValuation, Warehouse, StockLedgerEntry,
        StockReservation, ReorderRule, PurchaseNeed,
        InventoryAdjustment,
        # Manufacturing models
        ManufacturingBom, ManufacturingBomLine,
        ProductionJob, ProductionMaterialIssueLine,
        ProductionReceiptLine, ProductionScrapLine,
        # Billing models
        DirectSale, DirectSaleLine, BillingInvoice,
        BillingProfile, BillingInstallmentMirror,
        BillingSyncEvent, BillingInvoiceLine,
        BillingCreditNote, BillingCreditNoteLine,
        BillingDebitNote, BillingDebitNoteLine,
        ReceiptDocument, DirectSaleReturn,
        DirectSaleReturnLine, CustomerCreditLedger,
        CustomerRefund, PurchaseReturn, PurchaseReturnLine,
        # CRM models
        PartyMaster, PartyLink, PartyInteraction,
        CustomerTag, CustomerRiskFlag, Lead,
        Opportunity, FollowUpTask, CustomerInteraction,
        StaffSalesTarget,
        # Service Desk models
        ServiceDeskCase, ServiceDeskCaseLine,
        SupportTicket, SupportTicketEvent,
        SupportTicketComment, SupportTicketAttachment,
        SupportTicketLink,
        # Reminders models
        PaymentReminder, NotificationTemplate
    ]

    deleted_count = 0
    for model in models_to_delete:
        count, _ = model.objects.all().delete()
        deleted_count += count
        if count > 0:
            print(f"  ✓ {model.__name__}: {count} rows")

    print(f"[OK] Business data deleted: {deleted_count} rows")
    print()

    # Step 3: Delete auth artifacts
    print("[STEP 3] Deleting auth artifacts...")

    session_count = Session.objects.all().delete()[0]
    print(f"  ✓ Sessions: {session_count}")

    outstanding_count = 0
    blacklisted_count = 0

    if HAS_TOKEN_BLACKLIST:
        outstanding_count = OutstandingToken.objects.all().delete()[0]
        blacklisted_count = BlacklistedToken.objects.all().delete()[0]
        print(f"  ✓ Outstanding tokens: {outstanding_count}")
        print(f"  ✓ Blacklisted tokens: {blacklisted_count}")
    else:
        print(f"  ⊘ Token blacklist app not installed (skipped)")

    print(f"[OK] Auth artifacts deleted: {session_count + outstanding_count + blacklisted_count} rows")
    print()

    # Step 4: Delete non-admin users
    print("[STEP 4] Cleaning up user accounts...")
    user_count = User.objects.exclude(username='pradip').delete()[0]
    print(f"  ✓ Non-admin users deleted: {user_count}")
    print(f"[OK] Preserved admin user: pradip (ID: {admin_user.id})")
    print()

    # Final summary
    print("=" * 50)
    print("RESET COMPLETE - SUCCESS!")
    print("=" * 50)
    print()
    print("[OK] Admin user 'pradip' preserved")
    print(f"[OK] Total rows deleted: {deleted_count + session_count + outstanding_count + blacklisted_count + user_count}")
    print("[OK] Database is clean")
    print()
    print("Status: READY FOR FRESH SETUP")
    print()

except Exception as e:
    print()
    print("=" * 50)
    print("ERROR DURING RESET")
    print("=" * 50)
    print(f"Error: {str(e)}")
    print()
    print("IMPORTANT: If you had a backup, restore it now:")
    print("  mysql -u root -p subidha < C:\\backups\\subidha_before_complete_reset_*.sql")
    sys.exit(1)
