from django.urls import path
from api.v1.views.crm_stats import (
    CrmStatsView,
    SupportRequestStatsView,
    SubscriptionRequestStatsView,
)

urlpatterns = [
    # CRM Stats
    path('admin/crm/stats/', CrmStatsView.as_view(), name='crm-stats'),
    path('admin/crm/leads/stats/', CrmStatsView.as_view(), name='crm-leads-stats'),
    path('admin/crm/pipeline/stats/', CrmStatsView.as_view(), name='crm-pipeline-stats'),
    path('admin/crm/follow-ups/stats/', CrmStatsView.as_view(), name='crm-followups-stats'),
    path('admin/crm/kyc/stats/', CrmStatsView.as_view(), name='crm-kyc-stats'),
    path('admin/crm/aml/stats/', CrmStatsView.as_view(), name='crm-aml-stats'),
    path('admin/crm/disputes/stats/', CrmStatsView.as_view(), name='crm-disputes-stats'),

    # Requests Stats
    # Online Enquiries removed - unified CRM pipeline (Phase 1)
    path('admin/requests/support/stats/', SupportRequestStatsView.as_view(), name='support-stats'),
    path('admin/requests/subscriptions/stats/', SubscriptionRequestStatsView.as_view(), name='subscription-requests-stats'),
]
