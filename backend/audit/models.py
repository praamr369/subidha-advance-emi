"""Audit domain models (split out of subscriptions, Phase F).

AuditLog + BusinessEventLog + BusinessEventType. Tables keep their names
(audit_logs, business_event_logs) so the move is state-only.
"""
from decimal import Decimal, ROUND_HALF_UP
import hashlib
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from subscriptions.enums import *  # noqa: F401,F403  (shared enum utility module)


class AuditLog(models.Model):
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

        PASSWORD_RESET_REQUESTED = "PASSWORD_RESET_REQUESTED", "Password Reset Requested"
        PASSWORD_RESET_VERIFIED = "PASSWORD_RESET_VERIFIED", "Password Reset Verified"
        PASSWORD_RESET_COMPLETED = "PASSWORD_RESET_COMPLETED", "Password Reset Completed"
        PASSWORD_RESET_FAILED = "PASSWORD_RESET_FAILED", "Password Reset Failed"
        PASSWORD_RESET_EXPIRED = "PASSWORD_RESET_EXPIRED", "Password Reset Expired"
        PASSWORD_RESET_LOCKED = "PASSWORD_RESET_LOCKED", "Password Reset Locked"
        PASSWORD_RESET_RESENT = "PASSWORD_RESET_RESENT", "Password Reset Resent"
        PASSWORD_RESET_INVALIDATED = "PASSWORD_RESET_INVALIDATED", "Password Reset Invalidated"

        # Phase 1 – Customer lifecycle audit types
        CUSTOMER_CREATED = "CUSTOMER_CREATED", "Customer Created"
        CUSTOMER_QUICK_CREATED = "CUSTOMER_QUICK_CREATED", "Customer Quick-Created (No Email)"
        CUSTOMER_EMAIL_ADDED = "CUSTOMER_EMAIL_ADDED", "Customer Email Added"
        CUSTOMER_EMAIL_CHANGED = "CUSTOMER_EMAIL_CHANGED", "Customer Email Changed"
        CUSTOMER_PHOTO_UPDATED = "CUSTOMER_PHOTO_UPDATED", "Customer Profile Photo Updated"
        CUSTOMER_KYC_DOCUMENT_SUBMITTED = (
            "CUSTOMER_KYC_DOCUMENT_SUBMITTED",
            "Customer KYC Document Submitted",
        )
        CUSTOMER_KYC_APPROVED = "CUSTOMER_KYC_APPROVED", "Customer KYC Approved"
        CUSTOMER_KYC_REJECTED = "CUSTOMER_KYC_REJECTED", "Customer KYC Rejected"
        CUSTOMER_KYC_EXCEPTION_APPROVED = (
            "CUSTOMER_KYC_EXCEPTION_APPROVED",
            "Customer KYC Exception Approved (Admin Override)",
        )
        CUSTOMER_REFERRAL_CREATED = "CUSTOMER_REFERRAL_CREATED", "Customer Referral Created"
        CUSTOMER_REFERRAL_COMMISSION_APPROVED = (
            "CUSTOMER_REFERRAL_COMMISSION_APPROVED",
            "Customer Referral Commission Approved",
        )
        # Phase 3: contract lifecycle audit events
        CONTRACT_NUMBERED = "CONTRACT_NUMBERED", "Contract Number Assigned"
        CONTRACT_TERMS_LOCKED = "CONTRACT_TERMS_LOCKED", "Contract Financial Terms Locked"
        CONTRACT_APPROVED = "CONTRACT_APPROVED", "Contract Approved"
        CONTRACT_ACTIVATED = "CONTRACT_ACTIVATED", "Contract Activated"
        CONTRACT_CANCELLED = "CONTRACT_CANCELLED", "Contract Cancelled"
        CONTRACT_CLOSED = "CONTRACT_CLOSED", "Contract Closed"
        CONTRACT_AMENDMENT_REQUESTED = "CONTRACT_AMENDMENT_REQUESTED", "Contract Amendment Requested"
        CONTRACT_AMENDMENT_APPROVED = "CONTRACT_AMENDMENT_APPROVED", "Contract Amendment Approved"
        CONTRACT_AMENDMENT_REJECTED = "CONTRACT_AMENDMENT_REJECTED", "Contract Amendment Rejected"
        CONTRACT_AMENDMENT_APPLIED = "CONTRACT_AMENDMENT_APPLIED", "Contract Amendment Applied"
        CONTRACT_AMENDMENT_IMPLEMENTED = "CONTRACT_AMENDMENT_IMPLEMENTED", "Contract Amendment Implemented"
        CONTRACT_POSSESSION_CREATED = "CONTRACT_POSSESSION_CREATED", "Product Possession Record Created"
        CONTRACT_POSSESSION_UPDATED = "CONTRACT_POSSESSION_UPDATED", "Product Possession Status Updated"
        CONTRACT_RETURN_INSPECTION_CREATED = "CONTRACT_RETURN_INSPECTION_CREATED", "Return Inspection Created"
        CONTRACT_RETURN_INSPECTION_APPROVED = "CONTRACT_RETURN_INSPECTION_APPROVED", "Return Inspection Approved"
        CONTRACT_DOCUMENT_REGENERATED = "CONTRACT_DOCUMENT_REGENERATED", "Contract Document Regenerated"
        # P3B – Rental Asset Lifecycle
        RENTAL_ASSET_CREATED = "RENTAL_ASSET_CREATED", "Rental Asset Created"
        RENTAL_ASSET_RESERVED = "RENTAL_ASSET_RESERVED", "Rental Asset Reserved"
        RENTAL_ASSET_HANDED_OVER = "RENTAL_ASSET_HANDED_OVER", "Rental Asset Handed Over"
        RENTAL_ASSET_RETURNED = "RENTAL_ASSET_RETURNED", "Rental Asset Returned"
        RENTAL_ASSET_UNDER_REPAIR = "RENTAL_ASSET_UNDER_REPAIR", "Rental Asset Sent for Repair"
        RENTAL_ASSET_RETIRED = "RENTAL_ASSET_RETIRED", "Rental Asset Retired"
        RENTAL_ASSET_CONDITION_SNAPSHOT = "RENTAL_ASSET_CONDITION_SNAPSHOT", "Asset Condition Snapshot Recorded"
        BACKGROUND_TASK_FAILED = "BACKGROUND_TASK_FAILED", "Background Task Failed"
        # PAYMENT_FLAGGED is used across the codebase as a catch-all for events
        # that have no type of their own — 89 call sites in 41 files, spanning
        # accounting, billing, contracts, payments, inventory and reminders. A
        # journal void is therefore recorded as a flagged payment. The rows are
        # all written, so nothing is lost, but action_type carries no meaning
        # and the only way to find a void is a metadata substring search.
        #
        # Fixing that properly needs a taxonomy across all six domains, not a
        # find-and-replace. These three are added now because journal posting,
        # voiding and reversal are the transitions an auditor asks for by name,
        # and they all flow through one choke point. Everything else keeps
        # PAYMENT_FLAGGED until the wider taxonomy exists.
        ACCOUNTING_JOURNAL_POSTED = "ACCOUNTING_JOURNAL_POSTED", "Journal Entry Posted"
        ACCOUNTING_JOURNAL_VOIDED = "ACCOUNTING_JOURNAL_VOIDED", "Journal Entry Voided"
        ACCOUNTING_JOURNAL_GROUP_REVERSED = (
            "ACCOUNTING_JOURNAL_GROUP_REVERSED",
            "Journal Group Reversed",
        )

        # Back-office queue actions, added for the same reason as the three
        # above: each is a transition someone outside the company asks about by
        # name. A regulator asks when a breach was reported to the Board; a
        # consumer forum asks who approved a late return; an auditor asks who
        # authorised a draw. Recording all of those as PAYMENT_FLAGGED would
        # make each answerable only by substring-searching metadata.
        #
        # These do not attempt the wider taxonomy the comment above describes.
        # They cover one surface — the staff side of customer-facing queues —
        # where the audit row is the entire evidence trail, because nothing
        # else records that a human made the decision.
        PRIVACY_GRIEVANCE_RESOLVED = (
            "PRIVACY_GRIEVANCE_RESOLVED",
            "DPDP Grievance Resolved",
        )
        PRIVACY_BREACH_REPORTED = "PRIVACY_BREACH_REPORTED", "Data Breach Reported"
        PRIVACY_BREACH_INVESTIGATE = (
            "PRIVACY_BREACH_INVESTIGATE",
            "Data Breach Investigation Opened",
        )
        PRIVACY_BREACH_NOTIFY_BOARD = (
            "PRIVACY_BREACH_NOTIFY_BOARD",
            "Data Protection Board Notified",
        )
        PRIVACY_BREACH_NOTIFY_PRINCIPALS = (
            "PRIVACY_BREACH_NOTIFY_PRINCIPALS",
            "Affected Data Principals Notified",
        )
        PRIVACY_BREACH_CLOSE = "PRIVACY_BREACH_CLOSE", "Data Breach Closed"

        CONSUMER_DEFECT_REVIEW = "CONSUMER_DEFECT_REVIEW", "Defect Claim Under Review"
        CONSUMER_DEFECT_ACCEPT = "CONSUMER_DEFECT_ACCEPT", "Defect Claim Accepted"
        CONSUMER_DEFECT_REJECT = "CONSUMER_DEFECT_REJECT", "Defect Claim Rejected"
        CONSUMER_DEFECT_RESOLVE = "CONSUMER_DEFECT_RESOLVE", "Defect Claim Resolved"
        CONSUMER_RETURN_APPROVE = "CONSUMER_RETURN_APPROVE", "Return Request Approved"
        CONSUMER_RETURN_REJECT = "CONSUMER_RETURN_REJECT", "Return Request Rejected"
        CONSUMER_RETURN_COMPLETE = "CONSUMER_RETURN_COMPLETE", "Return Completed"
        CONSUMER_RETURN_CPA_OVERRIDE = (
            "CONSUMER_RETURN_CPA_OVERRIDE",
            "Return Window Overridden (CPA)",
        )

        REPOSSESSION_INITIATE = "REPOSSESSION_INITIATE", "Repossession Initiated"
        REPOSSESSION_COMPLETE = "REPOSSESSION_COMPLETE", "Repossession Completed"
        REPOSSESSION_CANCEL = "REPOSSESSION_CANCEL", "Repossession Cancelled"

        LUCKY_DRAW_AUTHORISATION_AUTHORISED = (
            "LUCKY_DRAW_AUTHORISATION_AUTHORISED",
            "Draw Authorised",
        )
        LUCKY_DRAW_AUTHORISATION_REJECTED = (
            "LUCKY_DRAW_AUTHORISATION_REJECTED",
            "Draw Authorisation Rejected",
        )
        LUCKY_DRAW_AUTHORISATION_REVOKED = (
            "LUCKY_DRAW_AUTHORISATION_REVOKED",
            "Draw Authorisation Revoked",
        )

        WARRANTY_SERVICE_SCHEDULED = (
            "WARRANTY_SERVICE_SCHEDULED",
            "Warranty Service Visit Scheduled",
        )
        WARRANTY_SERVICE_RESCHEDULED = (
            "WARRANTY_SERVICE_RESCHEDULED",
            "Warranty Service Visit Rescheduled",
        )
        WARRANTY_SERVICE_COMPLETED = (
            "WARRANTY_SERVICE_COMPLETED",
            "Warranty Service Visit Completed",
        )

    action_type = models.CharField(
        max_length=50,
        choices=ActionType.choices,
        default=ActionType.SUB_CREATED,
        db_index=True,
    )
    model_name = models.CharField(max_length=100, db_index=True)
    object_id = models.PositiveIntegerField(db_index=True)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="audit_logs",
        null=True,
        blank=True,
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "audit_logs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["action_type", "created_at"]),
            models.Index(fields=["model_name", "object_id"]),
        ]

    def clean(self):
        if not self.model_name or not self.model_name.strip():
            raise ValidationError({"model_name": "Model name is required."})

    def save(self, *args, **kwargs):
        self.model_name = (self.model_name or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.action_type} - {self.model_name}#{self.object_id}"


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


class BusinessEventLog(models.Model):
    event_type = models.CharField(max_length=64, choices=BusinessEventType.choices, db_index=True)
    actor_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="business_events",
        null=True,
        blank=True,
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.PROTECT,
        related_name="business_events",
        null=True,
        blank=True,
    )
    subscription = models.ForeignKey(
        "contracts.Subscription",
        on_delete=models.PROTECT,
        related_name="business_events",
        null=True,
        blank=True,
    )
    contract_reference = models.ForeignKey(
        "contracts.ContractReference",
        on_delete=models.PROTECT,
        related_name="business_events",
        null=True,
        blank=True,
    )
    payment = models.ForeignKey(
        "payments.Payment",
        on_delete=models.PROTECT,
        related_name="business_events",
        null=True,
        blank=True,
    )
    batch = models.ForeignKey(
        "lucky_plan.Batch",
        on_delete=models.PROTECT,
        related_name="business_events",
        null=True,
        blank=True,
    )
    lucky_id = models.ForeignKey(
        "lucky_plan.LuckyId",
        on_delete=models.PROTECT,
        related_name="business_events",
        null=True,
        blank=True,
    )
    ledger_reference = models.CharField(max_length=128, blank=True, default="")
    source_module = models.CharField(max_length=160, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(default=timezone.now, db_index=True)
    request_id = models.CharField(max_length=128, null=True, blank=True, db_index=True)
    idempotency_key = models.CharField(max_length=160, null=True, blank=True, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, null=True, blank=True)

    class Meta:
        db_table = "business_event_logs"
        ordering = ["-occurred_at", "-id"]
        indexes = [
            models.Index(fields=["event_type", "occurred_at"]),
            models.Index(fields=["customer", "occurred_at"]),
            models.Index(fields=["subscription", "occurred_at"]),
            models.Index(fields=["payment", "occurred_at"]),
            models.Index(fields=["contract_reference", "occurred_at"]),
            models.Index(fields=["batch", "occurred_at"]),
            models.Index(fields=["lucky_id", "occurred_at"]),
        ]

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValidationError("BusinessEventLog is append-only and cannot be updated.")
        super().save(*args, **kwargs)

