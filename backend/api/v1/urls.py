from api.v1.views.dashboard_calendar import DashboardCalendarEventsView, DashboardMemoView
from django.urls import path, include

from brochures.urls import admin_urlpatterns as brochure_admin_urlpatterns
from brochures.urls import public_urlpatterns as brochure_public_urlpatterns
from brochures.urls import public_quotation_urlpatterns

from api.v1.views.health import PublicApiDeepHealthView, PublicApiHealthView
from api.v1.views.realtime import RealtimeTicketView, realtime_stream
from api.v1.views.admin_payment_collection import IdempotentAdminPaymentCollectView
from api.v1.views.unified_workbench import urlpatterns as workbench_urlpatterns
from api.v1.views.workbench_dashboard import urlpatterns as workbench_dashboard_urlpatterns
from api.v1.views.workbench_lead_workflow import urlpatterns as workbench_lead_urlpatterns
from api.v1.views.lead_conversion_workflow import urlpatterns as lead_conversion_urlpatterns
from api.v1.views.lead_subscription_tracker import urlpatterns as lead_subscription_urlpatterns
from api.v1.views.accounting_bridge_reconciliation import (
    AccountingBridgeBatchPostView,
    AccountingBridgeBatchPreviewView,
    AccountingBridgeCandidatePostView,
    AccountingBridgeCandidatePreviewView,
    AccountingBridgeReconciliationItemVerifyView,
    AccountingBridgeReconciliationView,
)
from api.v1.views.accounting_mapping_audit import (
    AccountingMappingAuditFixEventView,
    AccountingMappingAuditSeedDefaultsView,
    AccountingMappingAuditValidateView,
    AccountingMappingAuditView,
    BridgePostingApprovalView,
)
from api.v1.views.accounting_mapping_remediation import (
    AccountingMappingRemediationAcknowledgeView,
    AccountingMappingRemediationApplyView,
    AccountingMappingRemediationCreateAccountView,
    AccountingMappingRemediationSeedSupportedDefaultsView,
    AccountingMappingRemediationView,
)
from api.v1.views.accounting_year_end_close import AccountingYearEndCloseView, AccountingYearEndReadinessView
from api.v1.views.admin_product_inventory_profile import AdminProductInventoryProfilePrepareView
from api.v1.views.admin_inventory_catalog import (
    AdminAccessoriesListView,
    AdminAccessoryDetailView,
    AdminFGAccessoryLinkDetailView,
    AdminFGAccessoryLinksView,
    AdminFGServiceLinkDetailView,
    AdminFGServiceLinksView,
    AdminFinishedGoodProfileView,
    AdminFinishedGoodsListView,
    AdminInventoryOverviewView,
    AdminRawMaterialsListView,
    AdminRawMaterialDetailView,
    AdminServiceCatalogDetailView,
    AdminServiceCatalogListCreateView,
    AdminServiceTypeChoicesView,
)
from api.v1.views.inventory import (
    AdminStockReservationListView,
    AdminPurchaseNeedsListView,
    AdminLotTrackingListView,
    AdminStockOnHandView,
    AdminStockLedgerListView,
    StockAdjustmentViewSet,
    StockLocationViewSet,
    InventoryItemViewSet,
    InventoryValuationView,
    InventoryDashboardView,
)
from api.v1.views.inventory_phase2 import BulkDemandPlanningView
from api.v1.views.admin_inventory_quick_create import (
    AdminAccessoryVariantGroupDetailView,
    AdminAccessoryVariantGroupListCreateView,
    AdminBillingAccessoryOptionsView,
    AdminFGAccessoryGroupLinkView,
    AdminInventoryItemVariantGroupView,
    AdminQuickCreateAccessoryView,
    AdminQuickCreateRawMaterialView,
    AdminQuickCreateServiceView,
)
from api.v1.views.admin_product_register import AdminProductRegisterView, AdminProductCreateView
from api.v1.views import (
    admin_solopreneur_today,
)
from api.v1.views.solopreneur import SolopreneurUniversalDashboardView
from smart_fields.views import (
    SmartConfirmView,
    SmartHsnSuggestView,
    SmartPincodeLookupView,
    SmartSuggestView,
)

urlpatterns = [
    path("health/", PublicApiHealthView.as_view()),
    path("health/deep/", PublicApiDeepHealthView.as_view()),
    path("realtime/ticket/", RealtimeTicketView.as_view()),
    path("realtime/stream/", realtime_stream),
    path("auth/", include("api.v1.routes.auth")),
    # DPDP 2023 customer privacy rights. The privacy app has had models since
    # 2026-07-10 and the portal has called these paths since 2026-07-11, but
    # nothing ever mounted them — every request 404'd until this line.
    path("privacy/", include("api.v1.routes.privacy")),
    # Customer warranty. Same story as privacy: the portal has called these
    # paths since July 2026 and they were never mounted. The admin warranty
    # surface already exists under admin/warranty-claims/.
    path("warranty/", include("api.v1.routes.warranty")),
    path("admin/payments/collect/", IdempotentAdminPaymentCollectView.as_view()),
    path("admin/solopreneur/today/", admin_solopreneur_today.AdminSolopreneurTodayView.as_view()),
    path("admin/solopreneur-dashboard/", SolopreneurUniversalDashboardView.as_view()),
    path("admin/products/", AdminProductCreateView.as_view()),
    path("admin/products/register/", AdminProductRegisterView.as_view()),
    path("admin/catalog/", include("api.v1.routes.catalog")),
    path("admin/smart/pincode/<str:pincode>/", SmartPincodeLookupView.as_view()),
    path("admin/smart/hsn/suggest/", SmartHsnSuggestView.as_view()),
    path("admin/smart/suggest/", SmartSuggestView.as_view()),
    path("admin/smart/confirm/", SmartConfirmView.as_view()),
    path("admin/products/<int:pk>/prepare-inventory-profile/", AdminProductInventoryProfilePrepareView.as_view()),
    # Inventory catalog: finished goods, raw materials, accessories, services
    path("admin/inventory/lots/", AdminLotTrackingListView.as_view()),
    path("admin/inventory/overview/", AdminInventoryOverviewView.as_view()),
    path("admin/inventory/finished-goods/", AdminFinishedGoodsListView.as_view()),
    path("admin/inventory/finished-goods/<int:pk>/profile/", AdminFinishedGoodProfileView.as_view()),
    path("admin/inventory/finished-goods/<int:fg_pk>/accessories/", AdminFGAccessoryLinksView.as_view()),
    path("admin/inventory/finished-goods/<int:fg_pk>/accessories/<int:pk>/", AdminFGAccessoryLinkDetailView.as_view()),
    path("admin/inventory/finished-goods/<int:fg_pk>/services/", AdminFGServiceLinksView.as_view()),
    path("admin/inventory/finished-goods/<int:fg_pk>/services/<int:pk>/", AdminFGServiceLinkDetailView.as_view()),
    path("admin/inventory/raw-materials/", AdminRawMaterialsListView.as_view()),
    path("admin/inventory/raw-materials/<int:pk>/", AdminRawMaterialDetailView.as_view()),
    path("admin/inventory/accessories/", AdminAccessoriesListView.as_view()),
    path("admin/inventory/accessories/<int:pk>/", AdminAccessoryDetailView.as_view()),
    path("admin/inventory/service-catalog/", AdminServiceCatalogListCreateView.as_view()),
    path("admin/inventory/service-catalog/<int:pk>/", AdminServiceCatalogDetailView.as_view()),
    path("admin/inventory/service-type-choices/", AdminServiceTypeChoicesView.as_view()),
    path("admin/inventory/reservations/", AdminStockReservationListView.as_view()),
    path("admin/inventory/requirements/", AdminPurchaseNeedsListView.as_view()),
    path("admin/inventory/stock-on-hand/", AdminStockOnHandView.as_view()),
    path("admin/inventory/ledger/", AdminStockLedgerListView.as_view()),
    # Accessory variant groups
    path("admin/inventory/accessory-variant-groups/", AdminAccessoryVariantGroupListCreateView.as_view()),
    path("admin/inventory/accessory-variant-groups/<int:pk>/", AdminAccessoryVariantGroupDetailView.as_view()),
    # FG → variant-group link
    path("admin/inventory/finished-goods/<int:fg_pk>/accessory-group-links/", AdminFGAccessoryGroupLinkView.as_view()),
    # Assign variant group to an accessory item
    path("admin/inventory/accessories/<int:pk>/assign-variant-group/", AdminInventoryItemVariantGroupView.as_view()),
    # Quick create
    path("admin/inventory/quick-create/accessory/", AdminQuickCreateAccessoryView.as_view()),
    path("admin/inventory/quick-create/raw-material/", AdminQuickCreateRawMaterialView.as_view()),
    path("admin/inventory/quick-create/service/", AdminQuickCreateServiceView.as_view()),
    # Billing accessory options (used at billing/contract time)
    path("admin/inventory/finished-goods/<int:product_id>/billing-accessories/", AdminBillingAccessoryOptionsView.as_view()),
    path("admin/brochures/", include(brochure_admin_urlpatterns)),
    path("admin/accounting/mapping-audit/", AccountingMappingAuditView.as_view()),
    path("admin/accounting/mapping-audit/seed-safe-defaults/", AccountingMappingAuditSeedDefaultsView.as_view()),
    path("admin/accounting/mapping-audit/fix-event/", AccountingMappingAuditFixEventView.as_view()),
    path("admin/accounting/mapping-audit/validate/", AccountingMappingAuditValidateView.as_view()),
    path("admin/accounting/bridge-posting-approvals/", BridgePostingApprovalView.as_view()),
    path("admin/accounting/mapping-remediation/", AccountingMappingRemediationView.as_view()),
    path("admin/accounting/mapping-remediation/create-account/", AccountingMappingRemediationCreateAccountView.as_view()),
    path("admin/accounting/mapping-remediation/apply/", AccountingMappingRemediationApplyView.as_view()),
    path("admin/accounting/mapping-remediation/seed-supported-defaults/", AccountingMappingRemediationSeedSupportedDefaultsView.as_view()),
    path("admin/accounting/mapping-remediation/acknowledge/", AccountingMappingRemediationAcknowledgeView.as_view()),
    path("admin/accounting/bridge-reconciliation/", AccountingBridgeReconciliationView.as_view()),
    path("admin/accounting/bridge-reconciliation/candidates/<str:candidate_id>/preview/", AccountingBridgeCandidatePreviewView.as_view()),
    path("admin/accounting/bridge-reconciliation/candidates/<str:candidate_id>/post/", AccountingBridgeCandidatePostView.as_view()),
    path("admin/accounting/bridge-reconciliation/batch-preview/", AccountingBridgeBatchPreviewView.as_view()),
    path("admin/accounting/bridge-reconciliation/batch-post/", AccountingBridgeBatchPostView.as_view()),
    path("admin/accounting/bridge-reconciliation/items/<int:pk>/verify/", AccountingBridgeReconciliationItemVerifyView.as_view()),
    path("admin/accounting/year-end/readiness/", AccountingYearEndReadinessView.as_view()),
    path("admin/accounting/year-end/close/", AccountingYearEndCloseView.as_view()),
    path("admin/", include("api.v1.routes.admin_control_foundation")),
    path("admin/", include("api.v1.routes.admin_control_cash_desk")),
    path("admin/", include("api.v1.routes.admin_control_month_end")),
    path("admin/", include("api.v1.routes.admin_business_compliance")),
    path("admin/", include("api.v1.routes.admin_policy_governance")),
    path("admin/", include("api.v1.routes.admin_accounting_bridge_readiness")),
    path("admin/", include("api.v1.routes.admin_rent_lease_accounting_bridge")),
    path("admin/", include("api.v1.routes.contract_amendments_admin")),
    path("admin/", include("api.v1.routes.admin_staff_identity")),
    path("admin/", include("api.v1.routes.admin_hr_staff")),
    path("admin/", include("api.v1.routes.admin")),
    path("admin/", include("api.v1.routes.setup_readiness")),
    path("admin/", include("api.v1.routes.admin_migration_center")),
    path("admin/", include("api.v1.routes.admin_documents")),
    path("admin/", include("reviews.routes.admin_reviews")),
    path("admin/", include("api.v1.routes.admin_customer_risk")),
    path("admin/", include("api.v1.routes.admin_customer_timeline")),
    path("admin/", include("api.v1.routes.admin_financial_intelligence")),
    path("admin/", include("api.v1.routes.admin_accounting_close_cockpit")),
    path("admin/", include("api.v1.routes.admin_solopreneur_finance")),
    path("admin/", include("api.v1.routes.admin_smart_collection")),
    path("admin/", include("api.v1.routes.admin_logistics")),
    path("admin/", include("api.v1.routes.admin_solopreneur_today")),
    path("admin/", include("api.v1.routes.admin_growth_offers")),
    path("admin/", include("api.v1.routes.admin_customer_offers")),
    path("admin/", include("api.v1.routes.admin_photo_coverage")),
    path("admin/", include("api.v1.routes.admin_growth_requests")),
    path("admin/", include("api.v1.routes.admin_partner_performance")),
    path("admin/", include("api.v1.routes.admin_retention_intelligence")),
    path("admin/", include("api.v1.routes.admin_accounting_export_reports")),
    path("admin/", include("api.v1.routes.collection_control_center")),
    path("branch-control/", include("api.v1.routes.branch_control")),
    path("accounting/year-end/readiness/", AccountingYearEndReadinessView.as_view()),
    path("accounting/year-end/close/", AccountingYearEndCloseView.as_view()),
    path("accounting/", include("api.v1.routes.accounting")),
    path("inventory/", include("api.v1.routes.inventory")),
    # admin/inventory/* aliases so frontend /admin/inventory/... calls resolve correctly.
    # The router in routes/inventory.py is registered under "inventory/" prefix only, so
    # these explicit aliases bridge the gap for endpoints the frontend expects under admin/.
    path("admin/inventory/items/", InventoryItemViewSet.as_view({"get": "list"})),
    path("admin/inventory/items/<int:pk>/", InventoryItemViewSet.as_view({"get": "retrieve", "patch": "partial_update", "put": "update"})),
    path("admin/inventory/locations/", StockLocationViewSet.as_view({"get": "list"})),
    path("admin/inventory/locations/<int:pk>/", StockLocationViewSet.as_view({"get": "retrieve", "patch": "partial_update", "put": "update"})),
    path("admin/inventory/adjustments/", StockAdjustmentViewSet.as_view({"get": "list", "post": "create"})),
    path("admin/inventory/adjustments/<int:pk>/", StockAdjustmentViewSet.as_view({"get": "retrieve", "patch": "partial_update"})),
    path("admin/inventory/adjustments/<int:pk>/approve/", StockAdjustmentViewSet.as_view({"post": "approve"})),
    path("admin/inventory/adjustments/<int:pk>/post/", StockAdjustmentViewSet.as_view({"post": "post_adjustment"})),
    path("admin/inventory/adjustments/<int:pk>/set-line-costs/", StockAdjustmentViewSet.as_view({"post": "set_line_costs"})),
    path("admin/inventory/valuation/", InventoryValuationView.as_view()),
    path("admin/inventory/demand-planning/", BulkDemandPlanningView.as_view()),
    path("admin/inventory/dashboard/", InventoryDashboardView.as_view()),
    path("manufacturing/", include("api.v1.routes.manufacturing")),
    path("billing/", include("api.v1.routes.billing")),
    path("crm/", include("api.v1.routes.crm")),
    path("crm-pipeline/", include("api.v1.routes.crm_pipeline")),
    path("service-desk/", include("api.v1.routes.service_desk")),
    path("reminders/", include("api.v1.routes.reminders")),
    path("dashboards/", include("api.v1.routes.dashboard_surfaces")),
    path("dashboard/calendar-events", DashboardCalendarEventsView.as_view()),
    path("dashboard/calendar-memos", DashboardMemoView.as_view()),
    path("partner/", include("api.v1.routes.contract_amendments_partner")),
    path("partner/", include("api.v1.routes.partner")),
    path("vendor/", include("api.v1.routes.vendor")),
    path("customer/", include("api.v1.routes.contract_amendments_customer")),
    path("customer/", include("api.v1.routes.customer")),
    path("customer/", include("api.v1.routes.customer_offers")),
    path("customer/", include("reviews.routes.customer_reviews")),
    path("staff/", include("api.v1.routes.staff")),
    path("customers/", include("api.v1.routes.customers")),
    path("cashier/", include("api.v1.routes.cashier")),
    path("notifications/", include("api.v1.routes.notifications")),
    path("public/", include("api.v1.routes.public")),
    path("public/", include("reviews.routes.public_reviews")),
    path("public/brochures/", include(brochure_public_urlpatterns)),
    path("public/quotations/", include(public_quotation_urlpatterns)),
    path("executive/", include("api.v1.routes.executive")),
    path("winner/", include("api.v1.route_modules.winner_urls")),
    path("pim/", include("products_pim.urls")),
    path("reviews/", include("product_reviews.urls")),
]

urlpatterns += workbench_urlpatterns
urlpatterns += workbench_dashboard_urlpatterns
urlpatterns += workbench_lead_urlpatterns
urlpatterns += lead_conversion_urlpatterns
urlpatterns += lead_subscription_urlpatterns
