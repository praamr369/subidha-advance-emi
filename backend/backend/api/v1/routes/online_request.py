from django.urls import path
from api.v1.views.online_request import (
    # Customer endpoints
    CustomerRequestListView,
    CustomerRequestDetailView,
    CustomerRequestGenerateQuoteView,
    CustomerRequestAcceptQuoteView,
    # Admin endpoints
    AdminRequestListView,
    AdminRequestDetailView,
    AdminGenerateQuoteView,
    AdminSendQuoteView,
    AdminApproveRequestView,
    AdminRejectRequestView,
    AdminCompleteRequestView,
)

urlpatterns = [
    # Customer endpoints
    path('customer/requests/online/', CustomerRequestListView.as_view(), name='customer-request-list'),
    path(
        'customer/requests/online/<int:pk>/',
        CustomerRequestDetailView.as_view(),
        name='customer-request-detail',
    ),
    path(
        'customer/requests/online/<int:pk>/generate-quote/',
        CustomerRequestGenerateQuoteView.as_view(),
        name='customer-request-generate-quote',
    ),
    path(
        'customer/requests/online/<int:pk>/accept-quote/',
        CustomerRequestAcceptQuoteView.as_view(),
        name='customer-request-accept-quote',
    ),
    # Admin endpoints
    path('admin/requests/online/', AdminRequestListView.as_view(), name='admin-request-list'),
    path('admin/requests/online/<int:pk>/', AdminRequestDetailView.as_view(), name='admin-request-detail'),
    path(
        'admin/requests/online/<int:pk>/generate-quote/',
        AdminGenerateQuoteView.as_view(),
        name='admin-generate-quote',
    ),
    path(
        'admin/requests/online/<int:pk>/send-quote/',
        AdminSendQuoteView.as_view(),
        name='admin-send-quote',
    ),
    path(
        'admin/requests/online/<int:pk>/approve/',
        AdminApproveRequestView.as_view(),
        name='admin-approve-request',
    ),
    path(
        'admin/requests/online/<int:pk>/reject/',
        AdminRejectRequestView.as_view(),
        name='admin-reject-request',
    ),
    path(
        'admin/requests/online/<int:pk>/complete/',
        AdminCompleteRequestView.as_view(),
        name='admin-complete-request',
    ),
]
