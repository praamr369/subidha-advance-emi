from decimal import Decimal, ROUND_HALF_UP
import hashlib
from pathlib import Path
from uuid import uuid4
from xml.parsers.expat import errors

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models, transaction
from django.db.models import Q, Sum
from django.utils.text import slugify
from django.utils import timezone

# ---------------------------------------------------------------------------
# Shared enums — canonical definitions live in subscriptions.enums
# Re-exported here for full backward compatibility.
# ---------------------------------------------------------------------------
from subscriptions.enums import *

# ---------------------------------------------------------------------------
# Shared base models & helpers — canonical definitions in subscriptions.base_models
# Re-exported here for full backward compatibility.
# ---------------------------------------------------------------------------
from subscriptions.base_models import (  # noqa: F401
    MONEY_ZERO,
    HUNDRED,
    TimeStampedModel,
    q2,
    _default_branch,
    _normalize_product_image_identity,
    product_image_upload_to,
    subscription_document_upload_to,
    customer_photo_upload_to,
    customer_kyc_doc_upload_to,
)


# =====================================================
# CORE ENTITIES
# =====================================================

# =====================================================

# BATCH
# =====================================================

# =====================================================
# LUCKY ID
# =====================================================

# =====================================================
# SUBSCRIPTION
# =====================================================

# =====================================================
# CONTRACTS (RENT / LEASE)
# =====================================================

def generate_rent_lease_deposit_transaction_number() -> str:
    return f"RLD-{timezone.now():%Y%m%d%H%M%S%f}-{uuid4().hex[:8].upper()}"


# =====================================================
# DELIVERY
# =====================================================

# =====================================================
# EMI
# =====================================================

# =====================================================
# PAYMENT
# =====================================================

# =====================================================
# PAYMENT RECONCILIATION
# =====================================================

# =====================================================
# DRAW COORDINATION (Pass 7 — immutable eligibility + commit)
# =====================================================


# =====================================================
# LUCKY DRAW
# =====================================================

# =====================================================
# AUDIT LOG
# =====================================================

# --- Audit models moved to the `audit` app (Phase F); re-exported for compat ---
from audit.models import AuditLog, BusinessEventType, BusinessEventLog  # noqa: F401


# =====================================================
# BUSINESS EVENT LOG (APPEND-ONLY)
# =====================================================





# =====================================================
# FINANCIAL LEDGER
# =====================================================

# ================================
# COMMISSION SYSTEM (ADDITIVE)
# ================================




User = settings.AUTH_USER_MODEL


# =====================================================
# CUSTOMER REFERRAL
# =====================================================

# =====================================================
# CUSTOMER KYC DOCUMENT
# =====================================================

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
    ID_PROOF = "ID_PROOF", "Identity Proof"
    ADDRESS_PROOF = "ADDRESS_PROOF", "Address Proof"
    CUSTOMER_PHOTO = "CUSTOMER_PHOTO", "Customer Photo"
    PHONE_VERIFICATION = "PHONE_VERIFICATION", "Phone Verification"
    DELIVERY_ADDRESS_PROOF = "DELIVERY_ADDRESS_PROOF", "Delivery Address Proof"
    GUARANTOR_ID_PROOF = "GUARANTOR_ID_PROOF", "Guarantor Identity Proof"
    GUARANTOR_ADDRESS_PROOF = "GUARANTOR_ADDRESS_PROOF", "Guarantor Address Proof"
    OTHER = "OTHER", "Other"


# =============================================================================
# Phase 3: Contract Amendment, Product Possession, Return Inspection
# =============================================================================

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


class InspectionCondition(models.TextChoices):
    NOT_ASSESSED = "NOT_ASSESSED", "Not Assessed"
    GOOD = "GOOD", "Good"
    FAIR = "FAIR", "Fair"
    DAMAGED = "DAMAGED", "Damaged"


# --- AML + DryRun models moved (Phase G); re-exported for compat ---
from customers.models import AMLScreeningResult, AMLScreeningRecord  # noqa: F401
from business_setup.models import DryRunValidationJob  # noqa: F401


# =====================================================
# P3B – RENTAL ASSET LIFECYCLE
# =====================================================

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


# ---------------------------------------------------------------------------
# P3C — Customer Risk Scoring
# ---------------------------------------------------------------------------

class CustomerRiskBand(models.TextChoices):
    LOW = "LOW", "Low Risk"
    MEDIUM = "MEDIUM", "Medium Risk"
    HIGH = "HIGH", "High Risk"
    BLOCKED = "BLOCKED", "Blocked"


# ---------------------------------------------------------------------------
# SubscriptionGuarantor — co-applicant / guarantor on an EMI contract
# ---------------------------------------------------------------------------

class GuarantorRelation(models.TextChoices):
    SPOUSE = "SPOUSE", "Spouse"
    PARENT = "PARENT", "Parent"
    SIBLING = "SIBLING", "Sibling"
    FRIEND = "FRIEND", "Friend"
    EMPLOYER = "EMPLOYER", "Employer"
    OTHER = "OTHER", "Other"


# ---------------------------------------------------------------------------
# RecoveryCase — defaulter recovery workflow
# ---------------------------------------------------------------------------

class RecoveryStage(models.TextChoices):
    IDENTIFIED = "IDENTIFIED", "Identified"
    NOTICE_SENT = "NOTICE_SENT", "Notice Sent"
    FIELD_VISIT = "FIELD_VISIT", "Field Visit"
    LEGAL = "LEGAL", "Legal"
    SETTLED = "SETTLED", "Settled"
    WRITTEN_OFF = "WRITTEN_OFF", "Written Off"


# ---------------------------------------------------------------------------
# EMIScheme — festival / promotional scheme engine
# ---------------------------------------------------------------------------

class SchemeDiscountType(models.TextChoices):
    PERCENT = "PERCENT", "Percentage discount"
    FLAT_AMOUNT = "FLAT_AMOUNT", "Flat amount off"
    WAIVE_INSTALLMENTS = "WAIVE_INSTALLMENTS", "Waive N installments"


# ─────────────────────────────────────────────────────────────────────────────
# AML Screening Records
# ─────────────────────────────────────────────────────────────────────────────





# ─────────────────────────────────────────────────────────────────────────────
# Delivery & Proof of Delivery
# ─────────────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────────────
# Customer Dispute Workflow
# ─────────────────────────────────────────────────────────────────────────────

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


# =====================================================
# PHASE 2 COMPLIANCE MODELS
# =====================================================

# ---------------------------------------------------------------------------
# CTRL-LP-1 — DrawAuthorisation
# Every LuckyDraw must be preceded by an explicit sign-off from an authorised
# officer before the cryptographic seed is committed. This creates an immutable
# pre-draw authorisation trail independent of the draw record itself.
# ---------------------------------------------------------------------------

class DrawAuthorisationStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    AUTHORISED = "AUTHORISED", "Authorised"
    REJECTED = "REJECTED", "Rejected"
    REVOKED = "REVOKED", "Revoked"


# ---------------------------------------------------------------------------
# CTRL-LP-4 — EmiWaiverSettlement
# An immutable record created before any EMI waiver is applied as a Lucky Plan
# win benefit. Provides a double-entry evidence trail separate from FinancialLedger.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# CTRL-LP-7 — grace_days on Batch
# Grace period (days after due_date before EMI flips to OVERDUE) is defined per
# batch so it is set at product inception, not silently defaulted.
# ---------------------------------------------------------------------------
# NOTE: grace_days is added to the Batch model via migration (field added below
# as a mixin approach is not available); patched onto the class here.




# ---------------------------------------------------------------------------
# CTRL-RENT-8 — Repossession
# Written-notice-first repossession workflow for rent/lease contracts.
# ---------------------------------------------------------------------------

class RepossessionStatus(models.TextChoices):
    NOTICE_ISSUED = "NOTICE_ISSUED", "Notice Issued"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"


# ---------------------------------------------------------------------------
# CTRL-CONS-1/2/3 — Consumer return window + defect classification + refund SLA
# CPA 2019 s.2(47) defect + Subidha's 7-day return window + refund SLA timer.
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# CTRL-RENT-5 — DepositForfeitureTaxInvoice
# When a security deposit is forfeited (tenant default / damage beyond wear),
# GST output tax must be raised on the forfeited amount.
# ---------------------------------------------------------------------------

class DepositForfeitureStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    ISSUED = "ISSUED", "Issued"
    CANCELLED = "CANCELLED", "Cancelled"


# ============================================================
# Partner → Customer KYC / Login Request
# ============================================================

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


# Import models so Django registers them
from subscriptions.models_address import ServiceZone, PincodeDatabase  # noqa
from subscriptions.models_workbench import WorkbenchItem, WorkbenchAction  # noqa
from crm.models import OnlineRequestAction  # noqa

# deliveries
from deliveries.models import SubscriptionDelivery, ProductPossession, RentLeaseReturnInspection, AssetConditionSnapshot, Delivery, ProofOfDelivery, Repossession, DefectClaim, ConsumerReturnRequest

# commissions
from commissions.models import Commission, CommissionPayoutBatch, CommissionPayoutLine

# products_core
from products_core.models import ProductCategoryMaster, ProductSubcategoryMaster, ProductUnitOfMeasureMaster, Product, ProductRelationship, RentalAsset

# lucky_plan
from lucky_plan.models import Batch, LuckyId, DrawEligibilitySnapshot, DrawCommit, LuckyDraw, DrawAuthorisation, LuckyDrawBatch, LuckyIDDraw

# customers
from customers.models import Customer, CustomerReferral, CustomerKycDocument, CustomerRiskProfile, CustomerDispute, PartnerCustomerKycRequest, CustomerSupportRequest, Address, KycReviewAction, PartnerKycDocument

# contracts
from contracts.models import Subscription, RentSubscriptionProfile, LeaseSubscriptionProfile, ContractReferenceSequence, ContractReference, SubscriptionDocument, DocumentAccessLog, OperationalCancellation, ContractAmendment, ContractRecontractEvent, ContractRecontractScheduleLine, ContractRecontractFinancialImpactPreview, SubscriptionGuarantor

# payments
from payments.models import UnifiedCollectionIdempotency, RentLeaseBillingDemand, RentLeaseDepositTransaction, Emi, Payment, CustomerAdvance, CustomerAdvanceAllocation, PaymentReconciliation, PaymentReconciliationEvent, PartnerCollectionRequest, FinancialLedger, RecoveryCase, EMIScheme, EmiWaiverSettlement, DepositForfeitureTaxInvoice, CashDeskTimeStampedModel, CashCounterSession, DailyCloseRun, CustomerAdvanceRefund, RentLeaseCollection

# crm
from crm.models import PublicLead, SubscriptionRequest, ProductRequest, OnlineRequest, CRMPipeline, PartyMaster, PartyLink, PartyInteraction, OnlineRequestAction

# growth
from growth.models import PlanTemplate, OfferPackage, OfferPackageLine, CustomerGrowthRequest, GrowthRequestLine, GrowthRequestDecision  # noqa

# business_setup (Phase B)
from business_setup.models import (  # noqa
    BusinessProfile, BusinessRulePolicy, PublicBusinessProfile, PolicyPage,
    BusinessComplianceDocument, BrandDataSource, BrandImportBatch, BrandImportedItem,
    BrandProfileSnapshot, SocialLink, BusinessMediaAsset, PublicContentBlock,
    BusinessDataBackupJob, BusinessDataRestoreJob, PolicyGovernanceMetadata,
    BusinessComplianceDocumentReviewState, DocumentPrintSettings, EmailSMTPSettings,
)

# finance_control (Phase C)
from finance_control.models import (  # noqa
    ApprovalRequest, BusinessPolicy, ControlException,
    MonthEndCloseRun, MonthEndCloseCheckResult, DailyCloseCheckResult,
)
