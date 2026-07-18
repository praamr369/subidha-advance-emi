"""
Modern Workbench Dashboard API
Comprehensive CRM metrics and analytics
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from decimal import Decimal
from django.db.models import Count, Q, F, Sum, Avg, Value, DecimalField
from django.db.models.functions import Coalesce

from subscriptions.models import Customer, OnlineRequest, ProductRequest, Subscription, PublicLead
from billing.models import DirectSale
from api.v1.permissions import IsAdmin


class WorkbenchDashboardView(APIView):
    """Get comprehensive workbench dashboard with KPIs and metrics"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        """Get complete dashboard data"""
        try:
            # KPI Data
            kpis = self._get_kpis()

            # Metrics
            lead_metrics = self._get_lead_metrics()
            request_metrics = self._get_request_metrics()

            # Pipeline
            pipeline = self._get_pipeline()

            # Top Leads
            top_leads = self._get_top_leads()

            # Recent Requests
            recent_requests = self._get_recent_requests()

            # Customers
            customers = self._get_customers()

            return Response({
                "status": "success",
                "data": {
                    "kpis": kpis,
                    "lead_metrics": lead_metrics,
                    "request_metrics": request_metrics,
                    "pipeline": pipeline,
                    "top_leads": top_leads,
                    "recent_requests": recent_requests,
                    "customers": customers,
                }
            })
        except Exception as e:
            return Response(
                {"error": f"Failed to load dashboard: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @staticmethod
    def _get_kpis():
        """Get key performance indicators"""
        total_customers = Customer.objects.count()

        # Active leads (leads not converted)
        active_leads = PublicLead.objects.filter(
            converted_customer__isnull=True
        ).count()

        # Pending requests
        pending_requests = ProductRequest.objects.filter(
            status__in=['DRAFT', 'SUBMITTED']
        ).count()

        # Conversion rate
        total_leads = PublicLead.objects.count()
        converted_leads = PublicLead.objects.filter(
            converted_customer__isnull=False
        ).count()
        conversion_rate = (
            (converted_leads / total_leads * 100) if total_leads > 0 else 0
        )

        # Average deal size
        invoices = DirectSale.objects.aggregate(
            avg=Avg(Coalesce('grand_total', Value(Decimal('0')), output_field=DecimalField()))
        )
        average_deal_size = float(invoices['avg'] or 0)

        # Pending approvals
        pending_approvals = ProductRequest.objects.filter(
            status='SUBMITTED'
        ).count()

        return {
            "total_customers": total_customers,
            "active_leads": active_leads,
            "pending_requests": pending_requests,
            "conversion_rate": round(conversion_rate, 1),
            "average_deal_size": float(average_deal_size),
            "pending_approvals": pending_approvals,
        }

    @staticmethod
    def _get_lead_metrics():
        """Get lead funnel metrics"""
        total = PublicLead.objects.count()

        converted = PublicLead.objects.filter(
            converted_customer__isnull=False
        ).count()

        in_pipeline = PublicLead.objects.filter(
            status__in=['OPEN', 'CONTACTED', 'QUALIFIED'],
            converted_customer__isnull=True
        ).count()

        follow_up_needed = PublicLead.objects.filter(
            status__in=['OPEN', 'FOLLOW_UP'],
            converted_customer__isnull=True
        ).count()

        return {
            "total": total,
            "converted": converted,
            "in_pipeline": in_pipeline,
            "follow_up_needed": follow_up_needed,
        }

    @staticmethod
    def _get_request_metrics():
        """Get request lifecycle metrics"""
        total = ProductRequest.objects.count()

        pending = ProductRequest.objects.filter(
            status__in=['DRAFT', 'SUBMITTED']
        ).count()

        approved = ProductRequest.objects.filter(
            status__in=['APPROVED', 'COMPLETED']
        ).count()

        rejected = ProductRequest.objects.filter(
            status='REJECTED'
        ).count()

        in_progress = ProductRequest.objects.filter(
            status__in=['IN_PROGRESS', 'PROCESSING']
        ).count()

        return {
            "total": total,
            "pending": pending,
            "approved": approved,
            "rejected": rejected,
            "in_progress": in_progress,
        }

    @staticmethod
    def _get_pipeline():
        """Get sales pipeline by stage"""
        # Define pipeline stages
        stages = [
            {"name": "Qualification", "status": ["OPEN", "CONTACTED"]},
            {"name": "Proposal Sent", "status": ["QUALIFIED"]},
            {"name": "Negotiation", "status": ["PROPOSAL_SENT"]},
            {"name": "Won", "status": ["CONVERTED"]},
        ]

        pipeline_stages = []
        total_value = 0

        for stage in stages:
            # Count leads in this stage
            leads_count = PublicLead.objects.filter(
                status__in=stage["status"],
                converted_customer__isnull=True
            ).count()

            # Estimate value based on average deal size
            avg_deal = DirectSale.objects.aggregate(
                avg=Avg(Coalesce('grand_total', Value(Decimal('100000')), output_field=DecimalField()))
            )['avg'] or Decimal('100000')
            avg_deal = float(avg_deal)

            stage_value = leads_count * avg_deal
            total_value += stage_value

            pipeline_stages.append({
                "name": stage["name"],
                "leads_count": leads_count,
                "value": float(stage_value),
            })

        # Calculate percentages
        for stage in pipeline_stages:
            stage["percentage"] = (
                (stage["value"] / total_value * 100) if total_value > 0 else 0
            )

        return {
            "stages": pipeline_stages,
            "total_pipeline_value": float(total_value),
        }

    @staticmethod
    def _get_top_leads():
        """Get top leads in pipeline"""
        leads = PublicLead.objects.filter(
            converted_customer__isnull=True
        ).select_related('assigned_to').order_by('-created_at')[:5]

        return [
            {
                "id": lead.id,
                "name": lead.name,
                "status": lead.status,
                "assigned_to": lead.assigned_to.get_full_name() if lead.assigned_to else None,
                "created_at": lead.created_at.isoformat(),
            }
            for lead in leads
        ]

    @staticmethod
    def _get_recent_requests():
        """Get recent requests"""
        requests = ProductRequest.objects.select_related('customer').values(
            'id',
            'customer__name',
            'request_type',
            'status',
            'created_at'
        ).order_by('-created_at')[:5]

        return [
            {
                "id": req['id'],
                "customer_name": req['customer__name'],
                "type": req['request_type'],
                "status": req['status'],
                "created_at": req['created_at'].isoformat(),
            }
            for req in requests
        ]

    def _get_customers(self):
        """Get all customers (registered + unregistered, without duplicates)"""
        # Get all registered customers
        registered = Customer.objects.select_related('user').order_by('-id')

        customers = [
            {
                "id": cust.id,
                "name": cust.name,
                "phone": cust.phone,
                "email": cust.user.email if cust.user else '',
                "city": cust.city,
                "kyc_status": cust.kyc_status or 'PENDING',
                "type": "REGISTERED",
            }
            for cust in registered
        ]

        # Get all registered phone numbers to avoid duplicates
        registered_phones = {c['phone'] for c in customers if c['phone']}
        registered_emails = {c['email'] for c in customers if c['email']}

        # Unregistered customers (leads/prospects) - exclude those already registered
        unregistered = PublicLead.objects.filter(
            converted_customer__isnull=True
        ).select_related('assigned_to').order_by('-created_at')

        unregistered_customers = [
            {
                "id": lead.id,
                "name": lead.name,
                "phone": lead.phone or 'N/A',
                "email": lead.email or 'N/A',
                "city": lead.city or 'N/A',
                "kyc_status": f"LEAD - {lead.status}",
                "type": "UNREGISTERED",
            }
            for lead in unregistered
            # Exclude if phone or email already exists in registered customers
            if (not lead.phone or lead.phone not in registered_phones) and \
               (not lead.email or lead.email not in registered_emails)
        ]

        # Combine and return
        all_customers = customers + unregistered_customers
        return all_customers[:100]


# URL Configuration
from django.urls import path

urlpatterns = [
    path(
        'admin/workbench/dashboard/',
        WorkbenchDashboardView.as_view(),
        name='workbench-dashboard'
    ),
]
