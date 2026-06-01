from django.urls import path

from api.v1.views.admin_rent_lease_accounting_bridge import (
    AdminAccountingReadinessView,
    AdminCustomerAdvanceDetailView,
    AdminCustomerAdvanceListCreateView,
    AdminCustomerAdvancePostingExecuteView,
    AdminCustomerAdvancePostingPreviewView,
    AdminDepositDamagePostingExecuteView,
    AdminDepositDamagePostingPreviewView,
    AdminDepositPostingExecuteView,
    AdminDepositPostingPreviewView,
    AdminDepositRefundPostingExecuteView,
    AdminDepositRefundPostingPreviewView,
    AdminRentLeaseAccountMappingBridgeView,
    AdminRentLeaseAccountingSummaryView,
    AdminRentLeaseDemandPostingExecuteView,
    AdminRentLeaseDemandPostingPreviewView,
)

urlpatterns = [
    path("accounting/readiness/", AdminAccountingReadinessView.as_view()),
    path("finance/account-mapping/", AdminRentLeaseAccountMappingBridgeView.as_view()),
    path("finance/deposits/<int:pk>/posting-preview/", AdminDepositPostingPreviewView.as_view()),
    path("finance/deposits/<int:pk>/posting-execute/", AdminDepositPostingExecuteView.as_view()),
    path("finance/deposits/<int:pk>/refund-posting-preview/", AdminDepositRefundPostingPreviewView.as_view()),
    path("finance/deposits/<int:pk>/refund-posting-execute/", AdminDepositRefundPostingExecuteView.as_view()),
    path("finance/deposits/<int:pk>/damage-posting-preview/", AdminDepositDamagePostingPreviewView.as_view()),
    path("finance/deposits/<int:pk>/damage-posting-execute/", AdminDepositDamagePostingExecuteView.as_view()),
    path("rent-lease/accounting-summary/", AdminRentLeaseAccountingSummaryView.as_view()),
    path("rent-lease/demands/<int:pk>/posting-preview/", AdminRentLeaseDemandPostingPreviewView.as_view()),
    path("rent-lease/demands/<int:pk>/posting-execute/", AdminRentLeaseDemandPostingExecuteView.as_view()),
    path("customer-advances/", AdminCustomerAdvanceListCreateView.as_view()),
    path("customer-advances/<int:pk>/", AdminCustomerAdvanceDetailView.as_view()),
    path("customer-advances/<int:pk>/posting-preview/", AdminCustomerAdvancePostingPreviewView.as_view()),
    path("customer-advances/<int:pk>/posting-execute/", AdminCustomerAdvancePostingExecuteView.as_view()),
]
