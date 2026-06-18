from django.urls import path

from api.v1.views.admin_financial_intelligence import (
    AdminFinancialIntelligenceActionItemsView,
    AdminFinancialIntelligenceBridgePostureView,
    AdminFinancialIntelligenceControlPostureView,
    AdminFinancialIntelligenceReconciliationPostureView,
    AdminFinancialIntelligenceView,
    AdminLiabilityReconciliationView,
    AdminTrialBalanceCheckView,
)

urlpatterns = [
    path("financial-intelligence/", AdminFinancialIntelligenceView.as_view()),
    path("financial-intelligence/bridge-posture/", AdminFinancialIntelligenceBridgePostureView.as_view()),
    path("financial-intelligence/reconciliation-posture/", AdminFinancialIntelligenceReconciliationPostureView.as_view()),
    path("financial-intelligence/control-posture/", AdminFinancialIntelligenceControlPostureView.as_view()),
    path("financial-intelligence/action-items/", AdminFinancialIntelligenceActionItemsView.as_view()),
    path("financial-intelligence/trial-balance/", AdminTrialBalanceCheckView.as_view()),
    path("financial-intelligence/liability-reconciliation/", AdminLiabilityReconciliationView.as_view()),
]
