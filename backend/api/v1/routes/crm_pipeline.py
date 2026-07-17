"""
CRM Pipeline Routes
PublicLead → OnlineRequest → ProductRequest/SubscriptionRequest → Subscription/Sale
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from api.v1.views.crm_pipeline import (
    PublicLeadViewSet,
    OnlineRequestToProductRequestViewSet,
)

router = DefaultRouter()
router.register(r'leads/public', PublicLeadViewSet, basename='public-lead')

# Public lead routes
public_lead_urlpatterns = [
    path('', include(router.urls)),
    # Convert PublicLead to OnlineRequest
    path('leads/public/<int:pk>/convert-to-online-request/',
         PublicLeadViewSet.as_view({'post': 'convert_to_online_request'}),
         name='convert-to-online-request'),
    # View conversion history
    path('leads/public/<int:pk>/conversion-history/',
         PublicLeadViewSet.as_view({'get': 'conversion_history'}),
         name='public-lead-conversion-history'),
    # Accept quote: OnlineRequest → ProductRequest/SubscriptionRequest
    path('requests/online/<int:online_request_id>/accept-quote/',
         OnlineRequestToProductRequestViewSet.as_view({'post': 'accept_quote'}),
         name='accept-online-request-quote'),
]

urlpatterns = public_lead_urlpatterns
