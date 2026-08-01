from django.urls import include, path
from api.v1.views.admin_crm_module import AdminCrmCustomerInteractionView
from api.v1.views.admin_crm_module import AdminCrmFollowUpCallNoteView
from api.v1.views.admin_crm_module import AdminCrmFollowUpCancelView
from api.v1.views.admin_crm_module import AdminCrmFollowUpCompleteView
from api.v1.views.admin_crm_module import AdminCrmFollowUpDueView
from api.v1.views.admin_crm_module import AdminCrmFollowUpListView
from api.v1.views.admin_crm_module import AdminCrmFollowUpSnoozeView
from api.v1.views.admin_crm_module import AdminCrmFunnelView
from api.v1.views.admin_crm_module import AdminCrmLeadAssignView
from api.v1.views.admin_crm_module import AdminCrmLeadConvertView
from api.v1.views.admin_crm_module import AdminCrmLeadDetailView
from api.v1.views.admin_crm_module import AdminCrmLeadListCreateView
from api.v1.views.admin_crm_module import AdminCrmLeadOpportunityListCreateView
from api.v1.views.admin_crm_module import AdminCrmLeadReconcileAllView
from api.v1.views.admin_crm_module import AdminCrmLeadReconcileView
from api.v1.views.admin_crm_module import AdminCrmLeadStageUpdateView
from api.v1.views.admin_crm_module import AdminCrmLeadTaskListCreateView
from api.v1.views.admin_crm_module import AdminCrmOpportunityStageView
from api.v1.views.admin_crm_module import AdminCrmPromotePublicLeadView
from api.v1.views.admin_crm_module import AdminCrmStaffListView
from api.v1.views.admin_crm_module import AdminCustomerCrmProfileView
from api.v1.views.admin_erp import AdminCrmWorkspaceView
from api.v1.views.admin_erp import AdminDeliveryWorkspaceView
from api.v1.views.admin_erp import AdminErpTodayWorkView
from api.v1.views.admin_erp import AdminFinanceWorkspaceView
from api.v1.views.admin_erp import AdminInventoryWorkspaceView
from api.v1.views.admin_erp import AdminPartnerOperationsWorkspaceView
from api.v1.views.admin_erp import AdminProductOperationsWorkspaceView
from api.v1.views.admin_erp import AdminSalesWorkspaceView
from api.v1.views.admin_inventory_ops import AdminInventoryProfileDetailView
from api.v1.views.admin_inventory_ops import AdminInventoryProfileListView
from api.v1.views.admin_inventory_ops import AdminInventoryProfileManufacturingCostView
from api.v1.views.admin_inventory_ops import AdminInventoryProfileStockByLocationView
from api.v1.views.admin_inventory_ops import AdminInventoryReadinessView
from api.v1.views.admin_inventory_ops import AdminInventoryStockNeedCancelView
from api.v1.views.admin_inventory_ops import AdminInventoryStockNeedListCreateView
from api.v1.views.admin_inventory_ops import AdminInventoryStockNeedPatchView
from api.v1.views.admin_inventory_ops import AdminInventoryStockNeedRecheckView
from api.v1.views.admin_opening_stock import AdminOpeningStockBatchHistoryView
from api.v1.views.admin_opening_stock import AdminOpeningStockBulkApplyView
from api.v1.views.admin_opening_stock import AdminOpeningStockBulkPreviewView
from api.v1.views.admin_opening_stock import AdminOpeningStockTemplateView
from api.v1.views.admin_sales_ops import AdminSalesDirectSaleDetailView
from api.v1.views.admin_sales_ops import AdminSalesDirectSaleListCreateView
from api.v1.views.inventory import AdminInventoryCategoriesView
from api.v1.views.inventory import AdminInventoryItemSearchView
from api.v1.views.inventory import AdminReturnLocationsSetupView

urlpatterns = [
    path("erp/today-work/", AdminErpTodayWorkView.as_view()),
    path("crm/workspace/", AdminCrmWorkspaceView.as_view()),
    path("crm/internal/leads/", AdminCrmLeadListCreateView.as_view()),
    path("crm/internal/leads/<int:pk>/", AdminCrmLeadDetailView.as_view()),
    path("crm/internal/leads/<int:pk>/stage/", AdminCrmLeadStageUpdateView.as_view()),
    path("crm/internal/leads/<int:pk>/assign/", AdminCrmLeadAssignView.as_view()),
    path("crm/internal/leads/<int:pk>/convert/", AdminCrmLeadConvertView.as_view()),
    path("crm/internal/leads/<int:pk>/reconcile/", AdminCrmLeadReconcileView.as_view()),
    path("crm/internal/leads/reconcile-all/", AdminCrmLeadReconcileAllView.as_view()),
    path("crm/internal/leads/<int:pk>/tasks/", AdminCrmLeadTaskListCreateView.as_view()),
    path("crm/internal/leads/<int:pk>/opportunities/", AdminCrmLeadOpportunityListCreateView.as_view()),
    path("crm/internal/follow-ups/", AdminCrmFollowUpListView.as_view()),
    path("crm/internal/follow-ups/<int:pk>/call-note/", AdminCrmFollowUpCallNoteView.as_view()),
    path("crm/internal/follow-ups/<int:pk>/complete/", AdminCrmFollowUpCompleteView.as_view()),
    path("crm/internal/follow-ups/<int:pk>/cancel/", AdminCrmFollowUpCancelView.as_view()),
    path("crm/internal/follow-ups/<int:pk>/snooze/", AdminCrmFollowUpSnoozeView.as_view()),
    path("crm/follow-ups/due/", AdminCrmFollowUpDueView.as_view()),
    path("crm/internal/opportunities/<int:pk>/stage/", AdminCrmOpportunityStageView.as_view()),
    path("crm/funnel/", AdminCrmFunnelView.as_view()),
    path("crm/internal/customers/<int:pk>/profile/", AdminCustomerCrmProfileView.as_view()),
    path("crm/internal/customers/<int:pk>/interactions/", AdminCrmCustomerInteractionView.as_view()),
    path("crm/internal/staff/", AdminCrmStaffListView.as_view()),
    path("crm/internal/public-leads/<int:pk>/promote/", AdminCrmPromotePublicLeadView.as_view()),
    path("sales/workspace/", AdminSalesWorkspaceView.as_view()),
    path("product-operations/workspace/", AdminProductOperationsWorkspaceView.as_view()),
    path("inventory/workspace/", AdminInventoryWorkspaceView.as_view()),
    path("inventory/readiness/", AdminInventoryReadinessView.as_view()),
    path("inventory/profiles/", AdminInventoryProfileListView.as_view()),
    path("inventory/profiles/<int:pk>/", AdminInventoryProfileDetailView.as_view()),
    path("inventory/profiles/<int:pk>/stock-by-location/", AdminInventoryProfileStockByLocationView.as_view()),
    path("inventory/profiles/<int:pk>/manufacturing-cost/", AdminInventoryProfileManufacturingCostView.as_view()),
    path("inventory/items/search/", AdminInventoryItemSearchView.as_view()),
    path("inventory/categories/", AdminInventoryCategoriesView.as_view()),
    path("inventory/locations/setup-return-locations/", AdminReturnLocationsSetupView.as_view()),
    path("inventory/stock-needs/", AdminInventoryStockNeedListCreateView.as_view()),
    path("inventory/stock-needs/<int:pk>/", AdminInventoryStockNeedPatchView.as_view()),
    path("inventory/stock-needs/<int:pk>/recheck/", AdminInventoryStockNeedRecheckView.as_view()),
    path("inventory/stock-needs/<int:pk>/cancel/", AdminInventoryStockNeedCancelView.as_view()),
    path("sales/direct-sales/", AdminSalesDirectSaleListCreateView.as_view()),
    path("sales/direct-sales/<int:pk>/", AdminSalesDirectSaleDetailView.as_view()),
    path(
        "inventory/opening-stock/import/preview/",
        AdminOpeningStockBulkPreviewView.as_view(),
    ),
    path(
        "inventory/opening-stock/import/apply/",
        AdminOpeningStockBulkApplyView.as_view(),
    ),
    path("inventory/opening-stock/template/", AdminOpeningStockTemplateView.as_view()),
    path("inventory/opening-stock/batches/", AdminOpeningStockBatchHistoryView.as_view()),
    path("finance/workspace/", AdminFinanceWorkspaceView.as_view()),
    path("delivery/workspace/", AdminDeliveryWorkspaceView.as_view()),
    path("partner-operations/workspace/", AdminPartnerOperationsWorkspaceView.as_view()),
]
