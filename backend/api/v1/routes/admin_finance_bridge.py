from django.urls import path

from api.v1.views.admin_finance_bridge import (
    AdminAccountingBridgeSummaryView,
    AdminCustomerAdvanceBridgeListView,
    AdminCustomerAdvancePostingExecuteView,
    AdminCustomerAdvancePostingPreviewView,
    AdminDepositDamagePostingExecuteView,
    AdminDepositDamagePostingPreviewView,
    AdminDepositLiabilityPostingExecuteView,
    AdminDepositLiabilityPostingPreviewView,
    AdminDepositRefundPostingExecuteView,
    AdminDepositRefundPostingPreviewView,
    AdminRentLeaseAccountingSummaryView,
    AdminRentLeaseDemandPostingExecuteView,
    AdminRentLeaseDemandPostingPreviewView,
)

urlpatterns = [
    path("accounting/bridge/summary/", AdminAccountingBridgeSummaryView.as_view()),
    path("accounting/customer-advances/", AdminCustomerAdvanceBridgeListView.as_view()),
    path("accounting/customer-advances/<int:pk>/posting-preview/", AdminCustomerAdvancePostingPreviewView.as_view()),
    path("accounting/customer-advances/<int:pk>/post/", AdminCustomerAdvancePostingExecuteView.as_view()),
    path("finance/customer-credits/", AdminCustomerAdvanceBridgeListView.as_view()),
    path("finance/customer-credits/<int:pk>/", AdminCustomerAdvanceDetailView.as_view()),
    path("finance/customer-credits/<int:pk>/posting-preview/", AdminCustomerAdvancePostingPreviewView.as_view()),
    path("finance/customer-credits/<int:pk>/post/", AdminCustomerAdvancePostingExecuteView.as_view()),
    path("finance/deposits/<int:pk>/posting-preview/", AdminDepositLiabilityPostingPreviewView.as_view()),
    path("finance/deposits/<int:pk>/post/", AdminDepositLiabilityPostingExecuteView.as_view()),
    path("finance/deposits/<int:pk>/refund-posting-preview/", AdminDepositRefundPostingPreviewView.as_view()),
    path("finance/deposits/<int:pk>/refund-post/", AdminDepositRefundPostingExecuteView.as_view()),
    path("finance/deposits/<int:pk>/damage-posting-preview/", AdminDepositDamagePostingPreviewView.as_view()),
    path("finance/deposits/<int:pk>/damage-post/", AdminDepositDamagePostingExecuteView.as_view()),
    path("rent-lease/accounting-summary/", AdminRentLeaseAccountingSummaryView.as_view()),
    path("rent-lease/demands/<int:pk>/posting-preview/", AdminRentLeaseDemandPostingPreviewView.as_view()),
    path("rent-lease/demands/<int:pk>/post/", AdminRentLeaseDemandPostingExecuteView.as_view()),
]
