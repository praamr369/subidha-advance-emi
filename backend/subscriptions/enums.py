"""
Shared enums for the SUBIDHA CORE domain.

All TextChoices / enum classes that were originally defined in
subscriptions.models are collected here so that domain-split apps
(customers, contracts, payments, lucky_plan, deliveries, commissions,
products, business_setup) can import them without circular dependencies.

Usage:
    from subscriptions.enums import PlanType, SubscriptionStatus
"""

from decimal import Decimal

from django.db import models


# ---------------------------------------------------------------------------
# Plan / Contract type
# ---------------------------------------------------------------------------

class PlanType(models.TextChoices):
    EMI = "EMI", "EMI"
    RENT = "RENT", "Rent"
    LEASE = "LEASE", "Lease"


class ContractReferenceType(models.TextChoices):
    ADVANCE_EMI = "ADVANCE_EMI", "Advance EMI"
    RENT = "RENT", "Rent"
    LEASE = "LEASE", "Lease"
    DIRECT_SALE = "DIRECT_SALE", "Direct Sale"


# ---------------------------------------------------------------------------
# CRM / Lead enums
# ---------------------------------------------------------------------------

class PublicLeadStatus(models.TextChoices):
    NEW = "NEW", "New"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    CONTACTED = "CONTACTED", "Contacted"
    CONVERTED = "CONVERTED", "Converted"
    CLOSED = "CLOSED", "Closed"


class PublicLeadIntent(models.TextChoices):
    GENERAL = "GENERAL", "General"
    QUOTATION = "QUOTATION", "Quotation"
    ESTIMATE = "ESTIMATE", "Estimate"
    DIRECT_SALE = "DIRECT_SALE", "Direct Sale"
    SUBSCRIPTION = "SUBSCRIPTION", "Subscription"


# ---------------------------------------------------------------------------
# Support request enums
# ---------------------------------------------------------------------------

class SupportRequestStatus(models.TextChoices):
    SUBMITTED = "SUBMITTED", "Submitted"
    UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
    CLOSED = "CLOSED", "Closed"


class SupportRequestCategory(models.TextChoices):
    PAYMENT_ISSUE = "PAYMENT_ISSUE", "Payment Issue"
    RECEIPT_ISSUE = "RECEIPT_ISSUE", "Receipt Issue"
    EMI_ISSUE = "EMI_ISSUE", "EMI Issue"
    SUBSCRIPTION_QUERY = "SUBSCRIPTION_QUERY", "Subscription Query"
    DRAW_QUERY = "DRAW_QUERY", "Draw Query"
    OTHER = "OTHER", "Other"


# ---------------------------------------------------------------------------
# Subscription / product request enums
# ---------------------------------------------------------------------------

class SubscriptionRequestStatus(models.TextChoices):
    SUBMITTED = "SUBMITTED", "Submitted"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    CANCELLED = "CANCELLED", "Cancelled"
    # Funnel "can't approve yet" hold states — request stays actionable.
    ON_HOLD_LUCKY_UNAVAILABLE = (
        "ON_HOLD_LUCKY_UNAVAILABLE",
        "On Hold – Lucky ID Unavailable",
    )
    ON_HOLD_PRODUCT_NOT_READY = (
        "ON_HOLD_PRODUCT_NOT_READY",
        "On Hold – Product Not Ready",
    )
    AMENDMENT_REQUESTED = "AMENDMENT_REQUESTED", "Amendment Requested"


class ProductRequestType(models.TextChoices):
    ADVANCE_EMI = "ADVANCE_EMI", "Advance EMI"
    RENT = "RENT", "Rent"
    LEASE = "LEASE", "Lease"
    DIRECT_SALE = "DIRECT_SALE", "Direct Sale"


class ProductRequestStatus(models.TextChoices):
    SUBMITTED = "SUBMITTED", "Submitted"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    CANCELLED = "CANCELLED", "Cancelled"


# ---------------------------------------------------------------------------
# Delivery / fulfillment enums
# ---------------------------------------------------------------------------

class FulfillmentStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    DELIVERED = "DELIVERED", "Delivered"
    RETURN_REQUESTED = "RETURN_REQUESTED", "Return Requested"
    RETURNED = "RETURNED", "Returned"


class DeliveryStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    SCHEDULED = "SCHEDULED", "Scheduled"
    # Phase 2: delivery blocked because stock is unavailable (reserved or physical)
    BLOCKED_STOCK_UNAVAILABLE = "BLOCKED_STOCK_UNAVAILABLE", "Blocked – Stock Unavailable"
    DISPATCHED = "DISPATCHED", "Dispatched"
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY", "Out for Delivery"
    DELIVERED = "DELIVERED", "Delivered"
    FAILED = "FAILED", "Failed"
    CANCELLED = "CANCELLED", "Cancelled"
    RETURN_REQUESTED = "RETURN_REQUESTED", "Return Requested"
    RETURNED = "RETURNED", "Returned"


# ---------------------------------------------------------------------------
# Subscription status
# ---------------------------------------------------------------------------

class SubscriptionStatus(models.TextChoices):
    # Pre-activation states (Phase 3)
    DRAFT = "DRAFT", "Draft"
    REQUESTED = "REQUESTED", "Requested"
    PENDING_APPROVAL = "PENDING_APPROVAL", "Pending Approval"
    APPROVED = "APPROVED", "Approved"
    # Core operational states (pre-existing)
    ACTIVE = "ACTIVE", "Active"
    WON = "WON", "Won"
    COMPLETED = "COMPLETED", "Completed"
    DEFAULTED = "DEFAULTED", "Defaulted"
    # Extended lifecycle states (Phase 3)
    PAYMENT_PENDING = "PAYMENT_PENDING", "Payment Pending"
    DELIVERY_PENDING = "DELIVERY_PENDING", "Delivery Pending"
    HANDED_OVER = "HANDED_OVER", "Handed Over"
    RETURN_PENDING = "RETURN_PENDING", "Return Pending"
    RETURNED = "RETURNED", "Returned"
    CANCELLED = "CANCELLED", "Cancelled"
    CLOSED = "CLOSED", "Closed"


# ---------------------------------------------------------------------------
# Lucky ID / Batch
# ---------------------------------------------------------------------------

class LuckyIdStatus(models.TextChoices):
    AVAILABLE = "AVAILABLE", "Available"
    ASSIGNED = "ASSIGNED", "Assigned"
    WON = "WON", "Won"


class BatchStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    OPEN = "OPEN", "Open"
    FULL = "FULL", "Full"
    # Pass-7 coordination: preparatory gate before cryptographic lock + snapshot freeze.
    READY_TO_LOCK = "READY_TO_LOCK", "Ready To Lock"
    LOCKED = "LOCKED", "Locked"
    DRAW_IN_PROGRESS = "DRAW_IN_PROGRESS", "Draw In Progress"
    DRAW_COMMITTED = "DRAW_COMMITTED", "Draw Committed"
    DRAW_COMPLETED = "DRAW_COMPLETED", "Draw Completed"
    COMPLETED = "COMPLETED", "Completed"
    CLOSED = "CLOSED", "Closed"
    CANCELLED = "CANCELLED", "Cancelled"


# ---------------------------------------------------------------------------
# EMI / Payment
# ---------------------------------------------------------------------------

class EmiStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    OVERDUE = "OVERDUE", "Overdue"
    PAID = "PAID", "Paid"
    WAIVED = "WAIVED", "Waived"
    CANCELLED = "CANCELLED", "Cancelled"


class PaymentMethod(models.TextChoices):
    CASH = "CASH", "Cash"
    UPI = "UPI", "UPI"
    BANK = "BANK", "Bank"
    CARD = "CARD", "Card"
    # Instrument-level detail for the single Bank/UPI holding account. Every
    # non-cash instrument settles into the same bank account; only the process
    # differs. CARD is retained only for historical records (not offered in UI).
    TRANSFER = "TRANSFER", "Bank Transfer"
    CHEQUE = "CHEQUE", "Cheque"
    DEPOSIT = "DEPOSIT", "Bank Deposit"


# Instruments offered in the UI for a solopreneur: cash + one bank/UPI account
# reached through several processes. CARD and gateway are intentionally excluded.
SELECTABLE_PAYMENT_METHODS = ["CASH", "UPI", "TRANSFER", "CHEQUE", "DEPOSIT"]

# Non-cash instruments all settle into the single Bank/UPI holding account.
NON_CASH_PAYMENT_METHODS = {"UPI", "BANK", "CARD", "TRANSFER", "CHEQUE", "DEPOSIT"}


def settlement_channel_for_method(method: str | None) -> str:
    """Collapse any payment instrument to its settlement channel: CASH or BANK.

    All non-cash instruments (UPI/transfer/cheque/deposit) live in one Bank/UPI
    holding account, so reporting and account resolution treat them as BANK.
    """
    normalized = (method or "CASH").strip().upper()
    return "CASH" if normalized == "CASH" else "BANK"


# ---------------------------------------------------------------------------
# KYC
# ---------------------------------------------------------------------------

class KycStatus(models.TextChoices):
    NOT_PROVIDED = "NOT_PROVIDED", "Not Provided"
    PENDING = "PENDING", "Pending Verification"
    SUBMITTED = "SUBMITTED", "Submitted – Awaiting Review"
    VERIFIED = "VERIFIED", "Verified"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    # Additive: admin override that records an explicit, audited exception so a
    # contract can proceed without full KYC verification. Never set silently.
    EXCEPTION_APPROVED = "EXCEPTION_APPROVED", "Exception Approved (Admin Override)"


class CustomerSource(models.TextChoices):
    PUBLIC = "PUBLIC", "Public Self-Registration"
    ADMIN = "ADMIN", "Admin Created"
    PARTNER = "PARTNER", "Partner Created"
    IMPORT = "IMPORT", "Imported"
    ONLINE = "ONLINE", "Online"
    ONLINE_ENQUIRY = "ONLINE_ENQUIRY", "Online Enquiry"
    DIRECT_SALE = "DIRECT_SALE", "Direct Sale"


# ---------------------------------------------------------------------------
# Ledger / Commission
# ---------------------------------------------------------------------------

class LedgerEntryType(models.TextChoices):
    EMI_PAYMENT = "EMI_PAYMENT", "EMI Payment"
    EMI_WAIVER = "EMI_WAIVER", "EMI Waiver"
    PAYMENT_REVERSAL = "PAYMENT_REVERSAL", "Payment Reversal"
    ADJUSTMENT = "ADJUSTMENT", "Adjustment"


class LedgerDirection(models.TextChoices):
    DEBIT = "DEBIT", "Debit"
    CREDIT = "CREDIT", "Credit"


class CommissionStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    SETTLED = "SETTLED", "Settled"
    REVERSED = "REVERSED", "Reversed"


# ---------------------------------------------------------------------------
# Contract returns / refunds
# ---------------------------------------------------------------------------

class ContractReturnConditionStatus(models.TextChoices):
    NOT_ASSESSED = "NOT_ASSESSED", "Not Assessed"
    GOOD = "GOOD", "Good"
    FAIR = "FAIR", "Fair"
    DAMAGED = "DAMAGED", "Damaged"


class ContractRefundStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    PARTIAL = "PARTIAL", "Partial"
    REFUNDED = "REFUNDED", "Refunded"
    WITHHELD = "WITHHELD", "Withheld"


# ---------------------------------------------------------------------------
# Document enums
# ---------------------------------------------------------------------------

class SubscriptionDocumentType(models.TextChoices):
    CUSTOMER_KYC_ID = "CUSTOMER_KYC_ID", "Customer KYC ID"
    CUSTOMER_SIGNATURE = "CUSTOMER_SIGNATURE", "Customer Signature"
    ADMIN_SIGNATURE = "ADMIN_SIGNATURE", "Admin / Company Signature"
    RENT_CONTRACT_PDF = "RENT_CONTRACT_PDF", "Rent Contract PDF"
    LEASE_CONTRACT_PDF = "LEASE_CONTRACT_PDF", "Lease Contract PDF"
    ADVANCE_EMI_CONTRACT_PDF = "ADVANCE_EMI_CONTRACT_PDF", "Advance EMI Contract PDF"
    PAYMENT_RECEIPT_PDF = "PAYMENT_RECEIPT_PDF", "Payment Receipt PDF"
    DELIVERY_HANDOVER_NOTE = "DELIVERY_HANDOVER_NOTE", "Delivery / Handover Note"
    RETURN_INSPECTION_REPORT = "RETURN_INSPECTION_REPORT", "Return Inspection Report"
    AMENDMENT_RECORD = "AMENDMENT_RECORD", "Contract Amendment Record"
    DIRECT_SALE_INVOICE_PDF = "DIRECT_SALE_INVOICE_PDF", "Direct Sale Invoice PDF"
    SECURITY_DEPOSIT_RECEIPT_PDF = "SECURITY_DEPOSIT_RECEIPT_PDF", "Security Deposit Receipt PDF"
    # Additive: signed acknowledgement that the rent/lease asset was handed over.
    ASSET_HANDOVER_ACKNOWLEDGEMENT = (
        "ASSET_HANDOVER_ACKNOWLEDGEMENT",
        "Asset Handover Acknowledgement",
    )


class DocumentVerificationStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    VERIFIED = "VERIFIED", "Verified"
    REJECTED = "REJECTED", "Rejected"


class DocumentSignedStatus(models.TextChoices):
    UNSIGNED = "UNSIGNED", "Unsigned"
    SIGNED = "SIGNED", "Signed"
    NOT_REQUIRED = "NOT_REQUIRED", "Not Required"
    UNKNOWN = "UNKNOWN", "Unknown"


class DocumentAccessLevel(models.TextChoices):
    INTERNAL = "INTERNAL", "Internal"
    SENSITIVE = "SENSITIVE", "Sensitive"
    HIGHLY_SENSITIVE = "HIGHLY_SENSITIVE", "Highly Sensitive"


class DocumentAccessAction(models.TextChoices):
    VIEW = "VIEW", "View"
    DOWNLOAD = "DOWNLOAD", "Download"
    VERIFY = "VERIFY", "Verify"
    REJECT = "REJECT", "Reject"
    REPLACE = "REPLACE", "Replace"
    UPLOAD = "UPLOAD", "Upload"


# ---------------------------------------------------------------------------
# Product enums
# ---------------------------------------------------------------------------

class ProductItemType(models.TextChoices):
    FINISHED_GOOD = "FINISHED_GOOD", "Finished Good"
    RAW_MATERIAL = "RAW_MATERIAL", "Raw Material"
    ACCESSORY = "ACCESSORY", "Accessory"
    SERVICE = "SERVICE", "Service"
    ADD_ON = "ADD_ON", "Add-on"


class ProductStockType(models.TextChoices):
    STOCK_ITEM = "STOCK_ITEM", "Stock Item"
    MADE_TO_ORDER = "MADE_TO_ORDER", "Made to Order"
    NON_STOCK = "NON_STOCK", "Non-Stock"


class ActionType(models.TextChoices):
        USER_CREATED = "USER_CREATED", "User Created"   
        USER_UPDATED = "USER_UPDATED", "User Updated"
        PUBLIC_SITE_UPDATED = "PUBLIC_SITE_UPDATED", "Public Site Updated"
        EMAIL_SMTP_SETTINGS_UPDATED = "EMAIL_SMTP_SETTINGS_UPDATED", "Email SMTP Settings Updated"
        EMAIL_SMTP_TEST_SENT = "EMAIL_SMTP_TEST_SENT", "Email SMTP Test Sent"
        USER_ACTIVATED = "USER_ACTIVATED", "User Activated"
        USER_DEACTIVATED = "USER_DEACTIVATED", "User Deactivated"
        USER_PASSWORD_RESET = "USER_PASSWORD_RESET", "User Password Reset"
        PARTNER_COMMISSION_SET = "PARTNER_COMMISSION_SET", "Partner Commission Set"
        PARTNER_COMMISSION_UPDATED = "PARTNER_COMMISSION_UPDATED", "Partner Commission Updated"
        LEAD_CREATED = "LEAD_CREATED", "Lead Created"
        LEAD_STATUS_UPDATED = "LEAD_STATUS_UPDATED", "Lead Status Updated"
        LEAD_ASSIGNED = "LEAD_ASSIGNED", "Lead Assigned"
        LEAD_NOTE_UPDATED = "LEAD_NOTE_UPDATED", "Lead Notes Updated"
        LEAD_CUSTOMER_LINKED = "LEAD_CUSTOMER_LINKED", "Lead Customer Linked"
        LEAD_SUBSCRIPTION_LINKED = "LEAD_SUBSCRIPTION_LINKED", "Lead Subscription Linked"
        LEAD_DIRECT_SALE_LINKED = "LEAD_DIRECT_SALE_LINKED", "Lead Direct Sale Linked"
        LEAD_CONVERTED = "LEAD_CONVERTED", "Lead Converted"
        CRM_PARTY_CREATED = "CRM_PARTY_CREATED", "CRM Party Created"
        CRM_PARTY_LINKED = "CRM_PARTY_LINKED", "CRM Party Linked"
        CRM_INTERACTION_CREATED = "CRM_INTERACTION_CREATED", "CRM Interaction Created"
        CRM_INTERACTION_UPDATED = "CRM_INTERACTION_UPDATED", "CRM Interaction Updated"
        SUPPORT_REQUEST_CREATED = "SUPPORT_REQUEST_CREATED", "Support Request Created"
        SUPPORT_REQUEST_STATUS_UPDATED = "SUPPORT_REQUEST_STATUS_UPDATED", "Support Request Status Updated"
        SUPPORT_REQUEST_ASSIGNED = "SUPPORT_REQUEST_ASSIGNED", "Support Request Assigned"
        SUPPORT_REQUEST_NOTE_UPDATED = "SUPPORT_REQUEST_NOTE_UPDATED", "Support Request Notes Updated"
        SUPPORT_REQUEST_RESOLVED = "SUPPORT_REQUEST_RESOLVED", "Support Request Resolved"
        SUPPORT_REQUEST_RESOLUTION_RECORDED = (
            "SUPPORT_REQUEST_RESOLUTION_RECORDED",
            "Support Request Resolution Recorded",
        )
        SERVICE_DESK_CASE_CREATED = "SERVICE_DESK_CASE_CREATED", "Service Desk Case Created"
        SERVICE_DESK_CASE_UPDATED = "SERVICE_DESK_CASE_UPDATED", "Service Desk Case Updated"
        SERVICE_DESK_CASE_STATUS_UPDATED = "SERVICE_DESK_CASE_STATUS_UPDATED", "Service Desk Case Status Updated"
        SERVICE_DESK_CASE_DELIVERY_RETURN_REQUESTED = (
            "SERVICE_DESK_CASE_DELIVERY_RETURN_REQUESTED",
            "Service Desk Case Delivery Return Requested",
        )
        SERVICE_DESK_CASE_DELIVERY_RETURNED = (
            "SERVICE_DESK_CASE_DELIVERY_RETURNED",
            "Service Desk Case Delivery Returned",
        )
        SERVICE_DESK_CASE_CREDIT_NOTE_POSTED = (
            "SERVICE_DESK_CASE_CREDIT_NOTE_POSTED",
            "Service Desk Case Credit Note Posted",
        )
        SERVICE_DESK_CASE_DEBIT_NOTE_POSTED = (
            "SERVICE_DESK_CASE_DEBIT_NOTE_POSTED",
            "Service Desk Case Debit Note Posted",
        )
        SERVICE_DESK_CASE_REPLACEMENT_LINKED = (
            "SERVICE_DESK_CASE_REPLACEMENT_LINKED",
            "Service Desk Case Replacement Linked",
        )
        DELIVERY_CREATED = "DELIVERY_CREATED", "Delivery Created"
        DELIVERY_UPDATED = "DELIVERY_UPDATED", "Delivery Updated"
        DELIVERY_STATUS_CHANGED = "DELIVERY_STATUS_CHANGED", "Delivery Status Changed"
        DELIVERY_DISPATCHED = "DELIVERY_DISPATCHED", "Delivery Dispatched"
        DELIVERY_COMPLETED = "DELIVERY_COMPLETED", "Delivery Completed"
        DELIVERY_FAILED = "DELIVERY_FAILED", "Delivery Failed"
        DELIVERY_CANCELLED = "DELIVERY_CANCELLED", "Delivery Cancelled"
        DELIVERY_RETURN_REQUESTED = "DELIVERY_RETURN_REQUESTED", "Delivery Return Requested"
        DELIVERY_RETURNED = "DELIVERY_RETURNED", "Delivery Returned"
        SUB_CREATED = "SUB_CREATED", "Subscription Created"
        SUBSCRIPTION_REQUEST_CREATED = (
            "SUBSCRIPTION_REQUEST_CREATED",
            "Subscription Request Created",
        )
        SUBSCRIPTION_REQUEST_APPROVED = (
            "SUBSCRIPTION_REQUEST_APPROVED",
            "Subscription Request Approved",
        )
        SUBSCRIPTION_REQUEST_REJECTED = (
            "SUBSCRIPTION_REQUEST_REJECTED",
            "Subscription Request Rejected",
        )
        SUBSCRIPTION_REQUEST_CANCELLED = (
            "SUBSCRIPTION_REQUEST_CANCELLED",
            "Subscription Request Cancelled",
        )
        SUBSCRIPTION_REQUEST_HELD = (
            "SUBSCRIPTION_REQUEST_HELD",
            "Subscription Request Put On Hold",
        )
        SUBSCRIPTION_REQUEST_AMENDMENT_REQUESTED = (
            "SUBSCRIPTION_REQUEST_AMENDMENT_REQUESTED",
            "Subscription Request Amendment Requested",
        )
        PRODUCT_REQUEST_APPROVED = (
            "PRODUCT_REQUEST_APPROVED",
            "Product Request Approved",
        )
        PRODUCT_REQUEST_REJECTED = (
            "PRODUCT_REQUEST_REJECTED",
            "Product Request Rejected",
        )
        PRODUCT_REQUEST_CANCELLED = (
            "PRODUCT_REQUEST_CANCELLED",
            "Product Request Cancelled",
        )
        PRODUCT_REQUEST_EDITED = (
            "PRODUCT_REQUEST_EDITED",
            "Product Request Edited",
        )
        EMI_PAID = "EMI_PAID", "EMI Paid"
        EMI_WAIVED = "EMI_WAIVED", "EMI Waived"
        DRAW_EXECUTED = "DRAW_EXECUTED", "Draw Executed"
        DRAW_COMMITTED = "DRAW_COMMITTED", "Draw Committed"
        DRAW_REVEALED = "DRAW_REVEALED", "Draw Revealed"
        DRAW_CERTIFICATE_PUBLISHED = "DRAW_CERTIFICATE_PUBLISHED", "Draw Certificate Published"
        LUCKY_ID_BULK_ASSIGNED = "LUCKY_ID_BULK_ASSIGNED", "Lucky ID Bulk Assigned"
        LUCKY_ID_REASSIGNED = "LUCKY_ID_REASSIGNED", "Lucky ID Reassigned"
        DRAW_PUBLIC_VERIFIED = "DRAW_PUBLIC_VERIFIED", "Public Draw Verification Generated"
        DRAW_PUBLIC_RESULT_PUBLISHED = "DRAW_PUBLIC_RESULT_PUBLISHED", "Public Draw Result Published"
        WINNER_WAIVER_APPLIED = "WINNER_WAIVER_APPLIED", "Winner Waiver Applied"
        WINNER_STATE_SYNCED = "WINNER_STATE_SYNCED", "Winner State Synced"
        COMMISSION_CREATED = "COMMISSION_CREATED", "Commission Created"
        COMMISSION_SETTLED = "COMMISSION_SETTLED", "Commission Settled"
        COMMISSION_PAYOUT_BATCH_CREATED = (
            "COMMISSION_PAYOUT_BATCH_CREATED",
            "Commission Payout Batch Created",
        )
        COMMISSION_PAYOUT_BATCH_FINALIZED = (
            "COMMISSION_PAYOUT_BATCH_FINALIZED",
            "Commission Payout Batch Finalized",
        )
        COMMISSION_PAYOUT_BATCH_CANCELLED = (
            "COMMISSION_PAYOUT_BATCH_CANCELLED",
            "Commission Payout Batch Cancelled",
        )
        COMMISSION_PAYOUT_BATCH_PAID = (
            "COMMISSION_PAYOUT_BATCH_PAID",
            "Commission Payout Batch Paid",
        )
        CREDIT_NOTE_APPLIED = (
            "CREDIT_NOTE_APPLIED",
            "Credit Note Applied to Invoice",
        )
        PAYMENT_RECONCILED = "PAYMENT_RECONCILED", "Payment Reconciled"
        PAYMENT_FLAGGED = "PAYMENT_FLAGGED", "Payment Flagged"
        PRODUCT_INVENTORY_PROFILE_PREPARED = (
            "PRODUCT_INVENTORY_PROFILE_PREPARED",
            "Product Inventory Profile Prepared",
        )
        CATALOG_CREATED = "CATALOG_CREATED", "Catalog Record Created"
        CATALOG_UPDATED = "CATALOG_UPDATED", "Catalog Record Updated"
        INVENTORY_ITEM_CREATED = "INVENTORY_ITEM_CREATED", "Inventory Item Created"
        INVENTORY_ITEM_UPDATED = "INVENTORY_ITEM_UPDATED", "Inventory Item Updated"
        STOCK_LOCATION_CREATED = "STOCK_LOCATION_CREATED", "Stock Location Created"
        STOCK_LOCATION_UPDATED = "STOCK_LOCATION_UPDATED", "Stock Location Updated"
        STOCK_ADJUSTMENT_CREATED = "STOCK_ADJUSTMENT_CREATED", "Stock Adjustment Created"
        STOCK_ADJUSTMENT_UPDATED = "STOCK_ADJUSTMENT_UPDATED", "Stock Adjustment Updated"
        STOCK_ADJUSTMENT_APPROVED = "STOCK_ADJUSTMENT_APPROVED", "Stock Adjustment Approved"
        STOCK_ADJUSTMENT_POSTED = "STOCK_ADJUSTMENT_POSTED", "Stock Adjustment Posted"
        VENDOR_CONTACT_CREATED = "VENDOR_CONTACT_CREATED", "Vendor Contact Created"
        PURCHASE_ORDER_CREATED = "PURCHASE_ORDER_CREATED", "Purchase Order Created"
        PURCHASE_ORDER_UPDATED = "PURCHASE_ORDER_UPDATED", "Purchase Order Updated"
        PURCHASE_ORDER_CANCELLED = "PURCHASE_ORDER_CANCELLED", "Purchase Order Cancelled"
        GOODS_RECEIPT_CREATED = "GOODS_RECEIPT_CREATED", "Goods Receipt Created"
        GOODS_RECEIPT_POSTED = "GOODS_RECEIPT_POSTED", "Goods Receipt Posted"
        VENDOR_BILL_CREATED = "VENDOR_BILL_CREATED", "Vendor Bill Created"
        VENDOR_BILL_POSTED = "VENDOR_BILL_POSTED", "Vendor Bill Posted"
        VENDOR_PAYMENT_CREATED = "VENDOR_PAYMENT_CREATED", "Vendor Payment Created"
        VENDOR_PAYMENT_POSTED = "VENDOR_PAYMENT_POSTED", "Vendor Payment Posted"
        OPENING_STOCK_IMPORTED = "OPENING_STOCK_IMPORTED", "Opening Stock Imported"
        DELIVERY_INVENTORY_BRIDGE_SYNCED = (
            "DELIVERY_INVENTORY_BRIDGE_SYNCED",
            "Delivery Inventory Bridge Synced",
        )
        MANUFACTURING_BOM_CREATED = "MANUFACTURING_BOM_CREATED", "Manufacturing BOM Created"
        MANUFACTURING_BOM_UPDATED = "MANUFACTURING_BOM_UPDATED", "Manufacturing BOM Updated"
        MANUFACTURING_BOM_STATUS_UPDATED = (
            "MANUFACTURING_BOM_STATUS_UPDATED",
            "Manufacturing BOM Status Updated",
        )
        PRODUCTION_JOB_CREATED = "PRODUCTION_JOB_CREATED", "Production Job Created"
        PRODUCTION_JOB_UPDATED = "PRODUCTION_JOB_UPDATED", "Production Job Updated"
        PRODUCTION_JOB_STATUS_UPDATED = (
            "PRODUCTION_JOB_STATUS_UPDATED",
            "Production Job Status Updated",
        )
        PRODUCTION_MATERIAL_MOVEMENT_POSTED = (
            "PRODUCTION_MATERIAL_MOVEMENT_POSTED",
            "Production Material Movement Posted",
        )
        PRODUCTION_OUTPUT_POSTED = "PRODUCTION_OUTPUT_POSTED", "Production Output Posted"
        SOLOPRENEUR_DAILY_CLOSE = "SOLOPRENEUR_DAILY_CLOSE", "Solopreneur Daily Close"


class BusinessEventType(models.TextChoices):
    CUSTOMER_CREATED = "CUSTOMER_CREATED", "Customer Created"
    CONTRACT_CREATED = "CONTRACT_CREATED", "Contract Created"
    EMI_CREATED = "EMI_CREATED", "EMI Created"
    PAYMENT_PREVIEWED = "PAYMENT_PREVIEWED", "Payment Previewed"
    PAYMENT_RECEIVED = "PAYMENT_RECEIVED", "Payment Received"
    EMI_PAID = "EMI_PAID", "EMI Paid"
    RENT_PAYMENT_RECEIVED = "RENT_PAYMENT_RECEIVED", "Rent Payment Received"
    DIRECT_SALE_PAYMENT_RECEIVED = "DIRECT_SALE_PAYMENT_RECEIVED", "Direct Sale Payment Received"
    DRAW_SNAPSHOT_FROZEN = "DRAW_SNAPSHOT_FROZEN", "Draw Snapshot Frozen"
    DRAW_COMMITTED = "DRAW_COMMITTED", "Draw Committed"
    WINNER_SELECTED = "WINNER_SELECTED", "Winner Selected"
    WAIVER_APPLIED = "WAIVER_APPLIED", "Waiver Applied"
    DELIVERY_CREATED = "DELIVERY_CREATED", "Delivery Created"
    DELIVERY_COMPLETED = "DELIVERY_COMPLETED", "Delivery Completed"
    LEDGER_POSTED = "LEDGER_POSTED", "Ledger Posted"
    REVERSAL_CREATED = "REVERSAL_CREATED", "Reversal Created"


class CustomerKycDocumentType(models.TextChoices):
    AADHAAR = "AADHAAR", "Aadhaar Card"
    PAN = "PAN", "PAN Card"
    PASSPORT = "PASSPORT", "Passport"
    DRIVING_LICENSE = "DRIVING_LICENSE", "Driving License"
    VOTER_ID = "VOTER_ID", "Voter ID"
    OTHER = "OTHER", "Other"


class CustomerKycDocumentStatus(models.TextChoices):
    PENDING = "PENDING", "Pending Review"
    SUBMITTED = "SUBMITTED", "Submitted"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    RESUBMISSION_REQUIRED = "RESUBMISSION_REQUIRED", "Resubmission Required"


class KycDocumentCategory(models.TextChoices):
    """
    Additive readiness category for customer KYC documents.

    Lets an uploaded document be classified into the readiness buckets used by
    the contract KYC gate (ID proof, address proof, etc.) without rewriting the
    existing document_type storage. When left UNSPECIFIED the readiness service
    infers a category from ``document_type`` (e.g. AADHAAR -> ID/address proof).
    """

    UNSPECIFIED = "UNSPECIFIED", "Unspecified"
    ID_PROOF = "ID_PROOF", "ID Proof"
    ADDRESS_PROOF = "ADDRESS_PROOF", "Address Proof"
    INCOME_PROOF = "INCOME_PROOF", "Income Proof"
    SIGNATURE = "SIGNATURE", "Signature"
    PHOTO = "PHOTO", "Photograph"


class ContractAmendmentType(models.TextChoices):
    TENURE_EXTENSION = "TENURE_EXTENSION", "Tenure Extension"
    PRODUCT_UPGRADE = "PRODUCT_UPGRADE", "Product Upgrade"
    ADDRESS_CHANGE = "ADDRESS_CHANGE", "Address Change"
    SCHEDULE_CORRECTION = "SCHEDULE_CORRECTION", "Schedule Correction"
    DEPOSIT_ADJUSTMENT = "DEPOSIT_ADJUSTMENT", "Deposit Adjustment"
    LEGAL_DOCUMENT_CORRECTION = "LEGAL_DOCUMENT_CORRECTION", "Legal Document Correction"
    OTHER = "OTHER", "Other"


class ContractAmendmentStatus(models.TextChoices):
    REQUESTED = "REQUESTED", "Requested"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    APPLIED = "APPLIED", "Applied"


class PossessionStatus(models.TextChoices):
    PENDING_HANDOVER = "PENDING_HANDOVER", "Pending Handover"
    WITH_CUSTOMER = "WITH_CUSTOMER", "With Customer"
    RETURN_DUE = "RETURN_DUE", "Return Due"
    RETURNED = "RETURNED", "Returned"
    UNDER_INSPECTION = "UNDER_INSPECTION", "Under Inspection"
    MAINTENANCE = "MAINTENANCE", "Maintenance"
    CLOSED = "CLOSED", "Closed"


class ProductRelationshipType(models.TextChoices):
    ACCESSORY = "ACCESSORY", "Accessory"
    RAW_MATERIAL = "RAW_MATERIAL", "Raw Material"
    SERVICE = "SERVICE", "Service"
    ADD_ON = "ADD_ON", "Add-on"


class InspectionStatus(models.TextChoices):
    PENDING = "PENDING", "Pending Inspection"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    COMPLETED = "COMPLETED", "Completed"
    APPROVED = "APPROVED", "Inspection Approved"


class InspectionOutcome(models.TextChoices):
    SELLABLE = "SELLABLE", "Sellable – Return to stock"
    MAINTENANCE_REQUIRED = "MAINTENANCE_REQUIRED", "Maintenance Required"
    DAMAGED = "DAMAGED", "Damaged – Damage recovery"
    SCRAPPED = "SCRAPPED", "Scrapped – Write off"


class DamageGrade(models.TextChoices):
    """Condition grades for a returned item, and the refund deduction each carries.

    Policy set by the business owner on 2026-09-07: a fixed percentage per
    grade rather than a per-item repair valuation. The point is that the rule
    is written down and identical for every customer — a consumer forum asks
    what the deduction was and why, and "25% because it was graded Major" is
    answerable in a way that a discretionary figure is not.

    The percentages live in DAMAGE_DEDUCTION_PERCENT below rather than on the
    member, so changing a band is one edit in one place and every historical
    assessment keeps the amount that was actually applied (the amount is stored
    on the row, not recomputed).
    """

    GOOD = "GOOD", "Good — no deduction"
    MINOR = "MINOR", "Minor wear"
    MAJOR = "MAJOR", "Major damage"
    SEVERE = "SEVERE", "Severe damage"


# Grade -> percentage of the refundable base withheld.
DAMAGE_DEDUCTION_PERCENT = {
    DamageGrade.GOOD: Decimal("0"),
    DamageGrade.MINOR: Decimal("10"),
    DamageGrade.MAJOR: Decimal("25"),
    DamageGrade.SEVERE: Decimal("50"),
}


class InspectionCondition(models.TextChoices):
    NOT_ASSESSED = "NOT_ASSESSED", "Not Assessed"
    GOOD = "GOOD", "Good"
    FAIR = "FAIR", "Fair"
    DAMAGED = "DAMAGED", "Damaged"


class Status(models.TextChoices):
        COMPLETED = "COMPLETED", "Completed"
        FAILED = "FAILED", "Failed"


class RentalAssetStatus(models.TextChoices):
    AVAILABLE = "AVAILABLE", "Available"
    RESERVED = "RESERVED", "Reserved"
    HANDED_OVER = "HANDED_OVER", "Handed Over"
    RETURNED = "RETURNED", "Returned"
    UNDER_REPAIR = "UNDER_REPAIR", "Under Repair"
    RETIRED = "RETIRED", "Retired"


class AssetConditionGrade(models.TextChoices):
    NEW = "NEW", "New"
    GOOD = "GOOD", "Good"
    FAIR = "FAIR", "Fair"
    DAMAGED = "DAMAGED", "Damaged"
    SCRAP = "SCRAP", "Scrap"
    UNKNOWN = "UNKNOWN", "Unknown"


class AssetConditionSnapshotStage(models.TextChoices):
    BEFORE_HANDOVER = "BEFORE_HANDOVER", "Before Handover"
    AFTER_RETURN = "AFTER_RETURN", "After Return"
    DAMAGE_REVIEW = "DAMAGE_REVIEW", "Damage Review"
    MAINTENANCE_REVIEW = "MAINTENANCE_REVIEW", "Maintenance Review"


class CustomerRiskBand(models.TextChoices):
    LOW = "LOW", "Low Risk"
    MEDIUM = "MEDIUM", "Medium Risk"
    HIGH = "HIGH", "High Risk"
    BLOCKED = "BLOCKED", "Blocked"


class GuarantorRelation(models.TextChoices):
    SPOUSE = "SPOUSE", "Spouse"
    PARENT = "PARENT", "Parent"
    SIBLING = "SIBLING", "Sibling"
    FRIEND = "FRIEND", "Friend"
    EMPLOYER = "EMPLOYER", "Employer"
    OTHER = "OTHER", "Other"


class RecoveryStage(models.TextChoices):
    IDENTIFIED = "IDENTIFIED", "Identified"
    NOTICE_SENT = "NOTICE_SENT", "Notice Sent"
    FIELD_VISIT = "FIELD_VISIT", "Field Visit"
    LEGAL = "LEGAL", "Legal"
    SETTLED = "SETTLED", "Settled"
    WRITTEN_OFF = "WRITTEN_OFF", "Written Off"


class SchemeDiscountType(models.TextChoices):
    PERCENT = "PERCENT", "Percentage discount"
    FLAT_AMOUNT = "FLAT_AMOUNT", "Flat amount off"
    WAIVE_INSTALLMENTS = "WAIVE_INSTALLMENTS", "Waive N installments"


class AMLScreeningResult(models.TextChoices):
    CLEAR = "CLEAR", "Clear — no match found"
    WATCHLIST_HIT = "WATCHLIST_HIT", "Watchlist hit — requires review"
    PEP_CONFIRMED = "PEP_CONFIRMED", "PEP confirmed"
    SANCTIONED = "SANCTIONED", "Sanctioned — blocked"
    PENDING = "PENDING", "Pending screening"


class DeliveryOrderStatus(models.TextChoices):
    PENDING = "PENDING", "Pending — awaiting delivery"
    SCHEDULED = "SCHEDULED", "Scheduled"
    IN_TRANSIT = "IN_TRANSIT", "In transit"
    DELIVERED = "DELIVERED", "Delivered"
    FAILED = "FAILED", "Delivery failed"
    CANCELLED = "CANCELLED", "Cancelled"


class PODStatus(models.TextChoices):
    CAPTURED = "CAPTURED", "Captured"
    VERIFIED = "VERIFIED", "Verified"
    ARCHIVED = "ARCHIVED", "Archived"


class DisputeType(models.TextChoices):
    PAYMENT_DISPUTE = "PAYMENT_DISPUTE", "Payment Dispute"
    DELIVERY_DISPUTE = "DELIVERY_DISPUTE", "Delivery Dispute"
    PRODUCT_DEFECT = "PRODUCT_DEFECT", "Product Defect"
    BILLING_ERROR = "BILLING_ERROR", "Billing Error"
    KYC_ISSUE = "KYC_ISSUE", "KYC Issue"
    OTHER = "OTHER", "Other"


class DisputeStage(models.TextChoices):
    OPEN = "OPEN", "Open"
    UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
    RESOLVED = "RESOLVED", "Resolved"
    REJECTED = "REJECTED", "Rejected"
    ESCALATED = "ESCALATED", "Escalated"


class DrawAuthorisationStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    AUTHORISED = "AUTHORISED", "Authorised"
    REJECTED = "REJECTED", "Rejected"
    REVOKED = "REVOKED", "Revoked"


class RepossessionStatus(models.TextChoices):
    NOTICE_ISSUED = "NOTICE_ISSUED", "Notice Issued"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"


class DefectSeverity(models.TextChoices):
    MINOR = "MINOR", "Minor"
    MAJOR = "MAJOR", "Major"
    SAFETY_CRITICAL = "SAFETY_CRITICAL", "Safety Critical"


class DefectClaimStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
    ACCEPTED = "ACCEPTED", "Accepted"
    REJECTED = "REJECTED", "Rejected"
    RESOLVED = "RESOLVED", "Resolved"


class ReturnRequestStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    WITHIN_WINDOW = "WITHIN_WINDOW", "Within Return Window"
    OUTSIDE_WINDOW = "OUTSIDE_WINDOW", "Outside Return Window"
    CPA_OVERRIDE = "CPA_OVERRIDE", "CPA Override Accepted"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    COMPLETED = "COMPLETED", "Completed"


class DepositForfeitureStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    ISSUED = "ISSUED", "Issued"
    CANCELLED = "CANCELLED", "Cancelled"


class PartnerCustomerKycRequestType(models.TextChoices):
    KYC_UPGRADE = "KYC_UPGRADE", "KYC Verification Request"
    LOGIN_ID_SETUP = "LOGIN_ID_SETUP", "Login ID Setup Request"
    KYC_DOCUMENT_UPLOAD = "KYC_DOCUMENT_UPLOAD", "KYC Document Upload Request"


class PartnerCustomerKycRequestStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    MORE_INFO = "MORE_INFO", "More Information Needed"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"

class UnifiedCollectionIdempotencyStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    DRY_RUN = 'DRY_RUN', 'Dry Run'
    COMPLETED = 'COMPLETED', 'Completed'
    FAILED = 'FAILED', 'Failed'

class RentLeaseDemandType(models.TextChoices):
    RENT_MONTHLY = 'RENT_MONTHLY', 'Rent Monthly Demand'
    LEASE_MONTHLY = 'LEASE_MONTHLY', 'Lease Monthly Demand'
    SECURITY_DEPOSIT = 'SECURITY_DEPOSIT', 'Security Deposit Demand'

class RentLeaseDemandStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    DRY_RUN = 'DRY_RUN', 'Dry Run'
    PARTIAL = 'PARTIAL', 'Partially Paid'
    PAID = 'PAID', 'Paid'
    WAIVED = 'WAIVED', 'Waived'
    OVERDUE = 'OVERDUE', 'Overdue'
    CANCELLED = 'CANCELLED', 'Cancelled'

class RentLeaseDepositTransactionType(models.TextChoices):
    DEMAND_CREATED = 'DEMAND_CREATED', 'Demand Created'
    COLLECTED = 'COLLECTED', 'Deposit Collected'
    REFUND_APPROVED = 'REFUND_APPROVED', 'Refund Approved'
    REFUNDED = 'REFUNDED', 'Refunded'
    DEDUCTION = 'DEDUCTION', 'Deduction'
    DEPOSIT_RECEIPT = 'DEPOSIT_RECEIPT', 'Deposit Receipt'
    DEPOSIT_REFUND = 'DEPOSIT_REFUND', 'Deposit Refund'
    DEPOSIT_ADJUSTMENT = 'DEPOSIT_ADJUSTMENT', 'Deposit Adjustment'

class RentLeaseDepositTransactionStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Active'
    VOIDED = 'VOIDED', 'Voided'
    REVERSED = 'REVERSED', 'Reversed'

class CustomerAdvanceStatus(models.TextChoices):
    UNAPPLIED = 'UNAPPLIED', 'Unapplied'
    PARTIALLY_APPLIED = 'PARTIALLY_APPLIED', 'Partially Applied'
    FULLY_APPLIED = 'FULLY_APPLIED', 'Fully Applied'

class ReconciliationStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    DRY_RUN = 'DRY_RUN', 'Dry Run'
    MATCHED = 'MATCHED', 'Matched'
    PARTIAL = 'PARTIAL', 'Partial'
    OVERPAID = 'OVERPAID', 'Overpaid'
    UNLINKED = 'UNLINKED', 'Unlinked'
    MISMATCH = 'MISMATCH', 'Mismatch'
    FLAGGED = 'FLAGGED', 'Flagged'
    LOCKED = 'LOCKED', 'Locked'

class ReconciliationEventType(models.TextChoices):
    CREATED = 'CREATED', 'Created'
    AUTO_MATCHED = 'AUTO_MATCHED', 'Auto Matched'
    MANUAL_MATCHED = 'MANUAL_MATCHED', 'Manual Matched'
    FLAGGED = 'FLAGGED', 'Flagged'
    NOTE_ADDED = 'NOTE_ADDED', 'Note Added'
    LOCKED = 'LOCKED', 'Locked'
    UNLOCKED = 'UNLOCKED', 'Unlocked'
    STATUS_CHANGED = 'STATUS_CHANGED', 'Status Changed'

class PartnerCollectionRequestStatus(models.TextChoices):
    SUBMITTED = 'SUBMITTED', 'Submitted'
    UNDER_REVIEW = 'UNDER_REVIEW', 'Under Review'
    APPROVED = 'APPROVED', 'Approved'
    REJECTED = 'REJECTED', 'Rejected'
    CANCELLED = 'CANCELLED', 'Cancelled'

class CashCounterSessionStatus(models.TextChoices):
    OPEN = 'OPEN', 'Open'
    CLOSED = 'CLOSED', 'Closed'

class DailyCloseStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    DRY_RUN = 'DRY_RUN', 'Dry Run'
    IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
    COMPLETED = 'COMPLETED', 'Completed'
    FAILED = 'FAILED', 'Failed'

class MonthEndCloseStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    DRY_RUN = 'DRY_RUN', 'Dry Run'
    IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
    COMPLETED = 'COMPLETED', 'Completed'
    FAILED = 'FAILED', 'Failed'

class CustomerAdvanceRefundStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    APPROVED = 'APPROVED', 'Approved'
    REJECTED = 'REJECTED', 'Rejected'
    PROCESSED = 'PROCESSED', 'Processed'
    FAILED = 'FAILED', 'Failed'

class CustomerAdvanceRefundStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Active'
    VOIDED = 'VOIDED', 'Voided'
    REVERSED = 'REVERSED', 'Reversed'

class RentLeaseCollectionStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Active'
    VOIDED = 'VOIDED', 'Voided'
    REVERSED = 'REVERSED', 'Reversed'
