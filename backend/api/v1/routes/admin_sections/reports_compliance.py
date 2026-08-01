from django.urls import include, path
from api.v1.views.admin_accounting_setup import AccountingMappingSuggestionsView
from api.v1.views.admin_accounting_setup import AccountingRepairSuggestedMappingsView
from api.v1.views.admin_accounting_setup import AccountingSetupBootstrapView
from api.v1.views.admin_accounting_setup import AccountingSetupDefaultsApplyView
from api.v1.views.admin_accounting_setup import AccountingSetupDefaultsPreviewView
from api.v1.views.admin_accounting_setup import AccountingSetupHealthView
from api.v1.views.admin_accounting_setup import AccountingSetupReadinessView
from api.v1.views.admin_accounting_setup import AccountingSetupStatusView
from api.v1.views.admin_accounting_setup import FinanceAccountMappingListCreateView
from api.v1.views.admin_accounting_setup import FinanceAccountMappingPatchView
from api.v1.views.admin_accounting_setup import FinanceAccountPrimaryMappingPatchView
from api.v1.views.admin_compliance import CompliancePartyTaxProfilesView
from api.v1.views.admin_compliance import ComplianceProductTaxProfilesView
from api.v1.views.admin_compliance import ComplianceTaxProfileActivateView
from api.v1.views.admin_compliance import ComplianceTaxProfileView
from api.v1.views.admin_compliance import ComplianceTaxReadinessView
from api.v1.views.admin_compliance import ComplianceTurnoverSummaryView
from api.v1.views.admin_erp import AdminErpSummaryView
from api.v1.views.admin_phase5_control import AdminReportExportView
from api.v1.views.admin_phase5_control import AdminReportsAdvanceEmiPerformanceView
from api.v1.views.admin_phase5_control import AdminReportsCollectionTrendView
from api.v1.views.admin_phase5_control import AdminReportsContractPerformanceView
from api.v1.views.admin_phase5_control import AdminReportsCustomerCrmPerformanceView
from api.v1.views.admin_phase5_control import AdminReportsDeliveryPerformanceView
from api.v1.views.admin_phase5_control import AdminReportsDirectSalePerformanceView
from api.v1.views.admin_phase5_control import AdminReportsExecutiveSummaryView
from api.v1.views.admin_phase5_control import AdminReportsFinancePerformanceView
from api.v1.views.admin_phase5_control import AdminReportsInventoryPerformanceView
from api.v1.views.admin_phase5_control import AdminReportsOverdueAgingView
from api.v1.views.admin_phase5_control import AdminReportsPartnerPerformanceView
from api.v1.views.admin_phase5_control import AdminReportsProductDemandAnalysisView
from api.v1.views.admin_phase5_control import AdminReportsReconciliationAnalysisView
from api.v1.views.admin_phase5_control import AdminReportsRentLeasePerformanceView
from api.v1.views.admin_phase5_control import AdminReportsRevenueTrendView
from api.v1.views.admin_phase5_control import AdminReportsSourceMapView
from api.v1.views.admin_phase5_control import AdminReportsWaiverLossAnalysisView
from api.v1.views.reports_center import AdminReportsCenterCatalogView
from api.v1.views.reports_center import AdminReportsCenterExportView
from api.v1.views.reports_center import AdminReportsCenterReportView

urlpatterns = [
    # Phase 5: report and analytics suite
    path("reports/executive-summary/", AdminReportsExecutiveSummaryView.as_view()),
    path("reports/finance-performance/", AdminReportsFinancePerformanceView.as_view()),
    path("reports/contract-performance/", AdminReportsContractPerformanceView.as_view()),
    path("reports/advance-emi-performance/", AdminReportsAdvanceEmiPerformanceView.as_view()),
    path("reports/rent-lease-performance/", AdminReportsRentLeasePerformanceView.as_view()),
    path("reports/direct-sale-performance/", AdminReportsDirectSalePerformanceView.as_view()),
    path("reports/inventory-performance/", AdminReportsInventoryPerformanceView.as_view()),
    path("reports/delivery-performance/", AdminReportsDeliveryPerformanceView.as_view()),
    path("reports/customer-crm-performance/", AdminReportsCustomerCrmPerformanceView.as_view()),
    path("reports/partner-performance/", AdminReportsPartnerPerformanceView.as_view()),
    path("reports/waiver-loss-analysis/", AdminReportsWaiverLossAnalysisView.as_view()),
    path("reports/reconciliation-analysis/", AdminReportsReconciliationAnalysisView.as_view()),
    path("reports/overdue-aging/", AdminReportsOverdueAgingView.as_view()),
    path("reports/revenue-trend/", AdminReportsRevenueTrendView.as_view()),
    path("reports/collection-trend/", AdminReportsCollectionTrendView.as_view()),
    path("reports/product-demand-analysis/", AdminReportsProductDemandAnalysisView.as_view()),
    path("reports/source-map/", AdminReportsSourceMapView.as_view()),
    path("reports-center/catalog/", AdminReportsCenterCatalogView.as_view()),
    path("reports-center/reports/<str:report_key>/export/", AdminReportsCenterExportView.as_view()),
    path("reports-center/reports/<str:report_key>/", AdminReportsCenterReportView.as_view()),
    path("reports/export/", AdminReportExportView.as_view()),
    path("accounting/setup/status/", AccountingSetupStatusView.as_view()),
    path("accounting/setup/readiness/", AccountingSetupReadinessView.as_view()),
    path("accounting/setup/bootstrap/", AccountingSetupBootstrapView.as_view()),
    path("accounting/setup-health/", AccountingSetupHealthView.as_view()),
    path("accounting/setup-defaults/preview/", AccountingSetupDefaultsPreviewView.as_view()),
    path("accounting/setup-defaults/apply/", AccountingSetupDefaultsApplyView.as_view()),
    path("accounting/finance-account-mappings/", FinanceAccountMappingListCreateView.as_view()),
    path("accounting/finance-account-mappings/<int:pk>/", FinanceAccountMappingPatchView.as_view()),
    path("accounting/finance-accounts/<int:pk>/mapping/", FinanceAccountPrimaryMappingPatchView.as_view()),
    path("accounting/mapping-suggestions/", AccountingMappingSuggestionsView.as_view()),
    path("accounting/mapping-suggestions/repair/", AccountingRepairSuggestedMappingsView.as_view()),
    path("compliance/tax-profile/", ComplianceTaxProfileView.as_view()),
    path("compliance/tax-profile/activate/", ComplianceTaxProfileActivateView.as_view()),
    path("compliance/tax-readiness/", ComplianceTaxReadinessView.as_view()),
    path("compliance/turnover-summary/", ComplianceTurnoverSummaryView.as_view()),
    path("compliance/product-tax-profiles/", ComplianceProductTaxProfilesView.as_view()),
    path("compliance/party-tax-profiles/", CompliancePartyTaxProfilesView.as_view()),
    path("erp/summary/", AdminErpSummaryView.as_view()),
]
