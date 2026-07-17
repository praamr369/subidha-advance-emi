from django.db import models
from django.contrib.auth.models import User
from datetime import datetime
import json


class AuditLog(models.Model):
    """Audit trail for all state-changing operations"""

    ACTION_CHOICES = (
        ('APPROVE_LEAD', 'Approve Lead'),
        ('REJECT_LEAD', 'Reject Lead'),
        ('CONVERT_LEAD', 'Convert Lead'),
        ('APPROVE_KYC', 'Approve KYC'),
        ('REJECT_KYC', 'Reject KYC'),
        ('APPROVE_DISPUTE', 'Approve Dispute'),
        ('RESOLVE_DISPUTE', 'Resolve Dispute'),
        ('APPROVE_SUBSCRIPTION_REQUEST', 'Approve Subscription Request'),
        ('REJECT_SUBSCRIPTION_REQUEST', 'Reject Subscription Request'),
        ('APPROVE_SUPPORT_TICKET', 'Approve Support Ticket'),
        ('CLOSE_SUPPORT_TICKET', 'Close Support Ticket'),
        ('APPROVE_ENQUIRY', 'Approve Enquiry'),
        ('REJECT_ENQUIRY', 'Reject Enquiry'),
        ('APPROVE_PARTNER_PAYMENT', 'Approve Partner Payment'),
        ('REJECT_PARTNER_PAYMENT', 'Reject Partner Payment'),
        ('FLAG_AML', 'Flag AML'),
        ('CLEAR_AML', 'Clear AML'),
    )

    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    resource_type = models.CharField(max_length=50)  # e.g., 'Lead', 'KycVerification'
    resource_id = models.IntegerField()
    details = models.JSONField(default=dict)  # Store additional context
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    ip_address = models.CharField(max_length=45, blank=True)  # IPv4 or IPv6

    class Meta:
        db_table = 'audit_log'
        indexes = [
            models.Index(fields=['action', 'timestamp']),
            models.Index(fields=['resource_type', 'resource_id']),
            models.Index(fields=['actor', 'timestamp']),
        ]

    def __str__(self):
        return f"{self.action} on {self.resource_type}#{self.resource_id} by {self.actor} at {self.timestamp}"


class AuditLogMixin:
    """Mixin for ViewSets to automatically log actions"""

    @staticmethod
    def log_action(action, actor, resource_type, resource_id, details=None, request=None):
        """Log an audit action"""
        if details is None:
            details = {}

        ip_address = ''
        if request:
            x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
            if x_forwarded_for:
                ip_address = x_forwarded_for.split(',')[0]
            else:
                ip_address = request.META.get('REMOTE_ADDR', '')

        return AuditLog.objects.create(
            action=action,
            actor=actor,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
        )

    @staticmethod
    def get_audit_trail(resource_type, resource_id):
        """Get audit trail for a specific resource"""
        return AuditLog.objects.filter(
            resource_type=resource_type,
            resource_id=resource_id
        ).order_by('-timestamp')


# Utility functions for common audit log operations
def log_lead_approval(actor, lead_id, reason=None, request=None):
    """Log lead approval"""
    details = {'reason': reason} if reason else {}
    return AuditLogMixin.log_action(
        action='APPROVE_LEAD',
        actor=actor,
        resource_type='Lead',
        resource_id=lead_id,
        details=details,
        request=request,
    )


def log_lead_rejection(actor, lead_id, reason=None, request=None):
    """Log lead rejection"""
    details = {'reason': reason} if reason else {}
    return AuditLogMixin.log_action(
        action='REJECT_LEAD',
        actor=actor,
        resource_type='Lead',
        resource_id=lead_id,
        details=details,
        request=request,
    )


def log_kyc_approval(actor, kyc_id, verified_by=None, request=None):
    """Log KYC approval"""
    details = {'verified_by': verified_by} if verified_by else {}
    return AuditLogMixin.log_action(
        action='APPROVE_KYC',
        actor=actor,
        resource_type='KycVerification',
        resource_id=kyc_id,
        details=details,
        request=request,
    )


def log_dispute_resolution(actor, dispute_id, resolution=None, request=None):
    """Log dispute resolution"""
    details = {'resolution': resolution} if resolution else {}
    return AuditLogMixin.log_action(
        action='RESOLVE_DISPUTE',
        actor=actor,
        resource_type='Dispute',
        resource_id=dispute_id,
        details=details,
        request=request,
    )


def log_subscription_request_approval(actor, request_id, approved_by=None, request_obj=None):
    """Log subscription request approval"""
    details = {'approved_by': approved_by} if approved_by else {}
    return AuditLogMixin.log_action(
        action='APPROVE_SUBSCRIPTION_REQUEST',
        actor=actor,
        resource_type='SubscriptionRequest',
        resource_id=request_id,
        details=details,
        request=request_obj,
    )
