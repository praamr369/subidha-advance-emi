from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.db.models import Count, Q
from datetime import datetime, timedelta

from crm.models import Lead, FollowUp, KycVerification, AmlFlag, Dispute
from subscriptions.models import Subscription
from requests.models import OnlineEnquiry, SupportRequest, SubscriptionRequest
from api.v1.serializers.crm_stats import (
    CrmAggregateStatsSerializer,
    LeadStatsSerializer,
    PipelineStatsSerializer,
    FollowUpStatsSerializer,
    KycStatsSerializer,
    AmlStatsSerializer,
    DisputeStatsSerializer,
    OnlineEnquiryStatsSerializer,
    SupportRequestStatsSerializer,
    SubscriptionRequestStatsSerializer,
)


class CrmStatsView(APIView):
    """Get aggregated CRM stats for dashboard"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            stats = {
                'leads': self._get_lead_stats(),
                'pipeline': self._get_pipeline_stats(),
                'follow_ups': self._get_follow_up_stats(),
                'kyc': self._get_kyc_stats(),
                'aml': self._get_aml_stats(),
                'disputes': self._get_dispute_stats(),
            }
            serializer = CrmAggregateStatsSerializer(stats)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @staticmethod
    def _get_lead_stats():
        total = Lead.objects.count()
        new = Lead.objects.filter(stage='NEW').count()
        converted = Lead.objects.filter(stage='CONVERTED').count()
        lost = Lead.objects.filter(stage='LOST').count()
        return {
            'total_count': total,
            'new_count': new,
            'converted_count': converted,
            'lost_count': lost,
        }

    @staticmethod
    def _get_pipeline_stats():
        total = Lead.objects.exclude(stage='LOST').count()
        interested = Lead.objects.filter(stage='INTERESTED').count()
        ready = Lead.objects.filter(stage='READY_TO_CONVERT').count()
        kyc_pending = Lead.objects.filter(stage='KYC_PENDING').count()
        return {
            'total_count': total,
            'interested_count': interested,
            'ready_to_convert_count': ready,
            'kyc_pending_count': kyc_pending,
        }

    @staticmethod
    def _get_follow_up_stats():
        today = datetime.now().date()
        total = FollowUp.objects.count()
        due_today = FollowUp.objects.filter(
            next_follow_up_at__date=today,
            is_completed=False
        ).count()
        overdue = FollowUp.objects.filter(
            next_follow_up_at__date__lt=today,
            is_completed=False
        ).count()
        completed = FollowUp.objects.filter(is_completed=True).count()
        return {
            'total_count': total,
            'due_today_count': due_today,
            'overdue_count': overdue,
            'completed_count': completed,
        }

    @staticmethod
    def _get_kyc_stats():
        total = KycVerification.objects.count()
        pending = KycVerification.objects.filter(status='PENDING').count()
        verified = KycVerification.objects.filter(status='VERIFIED').count()
        expired = KycVerification.objects.filter(
            status='VERIFIED',
            expiry_date__lt=datetime.now().date()
        ).count()
        return {
            'total_count': total,
            'pending_count': pending,
            'verified_count': verified,
            'expired_count': expired,
        }

    @staticmethod
    def _get_aml_stats():
        total = AmlFlag.objects.values('customer').distinct().count()
        flagged = AmlFlag.objects.filter(status='FLAGGED').values('customer').distinct().count()
        reviewed = AmlFlag.objects.filter(status='REVIEWED').values('customer').distinct().count()
        cleared = AmlFlag.objects.filter(status='CLEARED').values('customer').distinct().count()
        return {
            'total_count': total,
            'flagged_count': flagged,
            'reviewed_count': reviewed,
            'cleared_count': cleared,
        }

    @staticmethod
    def _get_dispute_stats():
        total = Dispute.objects.count()
        open_disputes = Dispute.objects.filter(status='OPEN').count()
        pending = Dispute.objects.filter(status='PENDING_REVIEW').count()
        resolved = Dispute.objects.filter(status='RESOLVED').count()
        return {
            'total_count': total,
            'open_count': open_disputes,
            'pending_review_count': pending,
            'resolved_count': resolved,
        }


class OnlineEnquiryStatsView(APIView):
    """Get stats for Online Enquiries page"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            total = OnlineEnquiry.objects.count()
            new = OnlineEnquiry.objects.filter(status='NEW').count()
            in_progress = OnlineEnquiry.objects.filter(status='IN_PROGRESS').count()
            closed = OnlineEnquiry.objects.filter(status='CLOSED').count()

            data = {
                'total_count': total,
                'new_count': new,
                'in_progress_count': in_progress,
                'closed_count': closed,
            }
            serializer = OnlineEnquiryStatsSerializer(data)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SupportRequestStatsView(APIView):
    """Get stats for Support Requests page"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            total = SupportRequest.objects.count()
            open_tickets = SupportRequest.objects.filter(status='OPEN').count()
            in_progress = SupportRequest.objects.filter(status='IN_PROGRESS').count()
            resolved = SupportRequest.objects.filter(status='RESOLVED').count()

            data = {
                'total_count': total,
                'open_count': open_tickets,
                'in_progress_count': in_progress,
                'resolved_count': resolved,
            }
            serializer = SupportRequestStatsSerializer(data)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SubscriptionRequestStatsView(APIView):
    """Get stats for Subscription Requests page"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            total = SubscriptionRequest.objects.count()
            pending = SubscriptionRequest.objects.filter(status='PENDING').count()
            approved = SubscriptionRequest.objects.filter(status='APPROVED').count()
            rejected = SubscriptionRequest.objects.filter(status='REJECTED').count()

            data = {
                'total_count': total,
                'pending_approval_count': pending,
                'approved_count': approved,
                'rejected_count': rejected,
            }
            serializer = SubscriptionRequestStatsSerializer(data)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
