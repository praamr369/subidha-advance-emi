from rest_framework import serializers
from django.db.models import Count, Q
from crm.models import Lead, FollowUp, KycVerification, AmlFlag, Dispute
from subscriptions.models import Subscription


class LeadStatsSerializer(serializers.Serializer):
    """Stats for CRM Leads page"""
    total_count = serializers.IntegerField(read_only=True)
    new_count = serializers.IntegerField(read_only=True)
    converted_count = serializers.IntegerField(read_only=True)
    lost_count = serializers.IntegerField(read_only=True)


class PipelineStatsSerializer(serializers.Serializer):
    """Stats for CRM Pipeline page"""
    total_count = serializers.IntegerField(read_only=True)
    interested_count = serializers.IntegerField(read_only=True)
    ready_to_convert_count = serializers.IntegerField(read_only=True)
    kyc_pending_count = serializers.IntegerField(read_only=True)


class FollowUpStatsSerializer(serializers.Serializer):
    """Stats for CRM Follow-ups page"""
    total_count = serializers.IntegerField(read_only=True)
    due_today_count = serializers.IntegerField(read_only=True)
    overdue_count = serializers.IntegerField(read_only=True)
    completed_count = serializers.IntegerField(read_only=True)


class KycStatsSerializer(serializers.Serializer):
    """Stats for CRM KYC page"""
    total_count = serializers.IntegerField(read_only=True)
    pending_count = serializers.IntegerField(read_only=True)
    verified_count = serializers.IntegerField(read_only=True)
    expired_count = serializers.IntegerField(read_only=True)


class AmlStatsSerializer(serializers.Serializer):
    """Stats for CRM AML page"""
    total_count = serializers.IntegerField(read_only=True)
    flagged_count = serializers.IntegerField(read_only=True)
    reviewed_count = serializers.IntegerField(read_only=True)
    cleared_count = serializers.IntegerField(read_only=True)


class DisputeStatsSerializer(serializers.Serializer):
    """Stats for CRM Disputes page"""
    total_count = serializers.IntegerField(read_only=True)
    open_count = serializers.IntegerField(read_only=True)
    pending_review_count = serializers.IntegerField(read_only=True)
    resolved_count = serializers.IntegerField(read_only=True)


# Online Enquiries removed - unified CRM pipeline (Phase 1)


class SupportRequestStatsSerializer(serializers.Serializer):
    """Stats for Support Requests page"""
    total_count = serializers.IntegerField(read_only=True)
    open_count = serializers.IntegerField(read_only=True)
    in_progress_count = serializers.IntegerField(read_only=True)
    resolved_count = serializers.IntegerField(read_only=True)


class SubscriptionRequestStatsSerializer(serializers.Serializer):
    """Stats for Subscription Requests page"""
    total_count = serializers.IntegerField(read_only=True)
    pending_approval_count = serializers.IntegerField(read_only=True)
    approved_count = serializers.IntegerField(read_only=True)
    rejected_count = serializers.IntegerField(read_only=True)


class CrmAggregateStatsSerializer(serializers.Serializer):
    """Unified stats endpoint for all CRM metrics"""
    leads = LeadStatsSerializer(read_only=True)
    pipeline = PipelineStatsSerializer(read_only=True)
    follow_ups = FollowUpStatsSerializer(read_only=True)
    kyc = KycStatsSerializer(read_only=True)
    aml = AmlStatsSerializer(read_only=True)
    disputes = DisputeStatsSerializer(read_only=True)
