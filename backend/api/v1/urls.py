from django.urls import path, include

from api.v1.views.health import PublicApiDeepHealthView, PublicApiHealthView
from api.v1.views.admin_payment_collection import IdempotentAdminPaymentCollectView
from api.v1.views.accounting_bridge_reconciliation import AccountingBridgeReconciliationView
from api.v1.views.accounting_mapping_remediation import (
    AccountingMappingRemediationAcknowledgeView,
    AccountingMappingRemediationApplyView,
    AccountingMappingRemediationCreateAccountView,
    AccountingMappingRemediationSeedSupportedDefaultsView,
    AccountingMappingRemediationView,
)
from api.v1.views.accounting_year_end_close import AccountingYearEndCloseView, AccountingYearEndReadinessView
from api.v1.views.admin_product_inventory_profile import AdminProductInventoryProfilePrepareView
from api.v1.views.admin_product_register import AdminProductRegisterView

urlpatterns = [
    path("health/", PublicApiHealthView.as_view()),
    path("health/deep/", PublicApiDeepHealthView.as_view()),
    path("auth/", include("api.v1.routes.auth")),
    path("admin/payments/collect/", IdempotentAdminPaymentCollectView.as_view()),
    path("admin/products/register/", AdminProductRegisterView.as_view()),
    path("admin/products/<int:pk>/prepare-inventory-profile/", AdminProductInventoryProfilePrepareView.as_view()),
    path("admin/accounting/mapping-remediation/", AccountingMappingRemediationView.as_view()),
    path("admin/accounting/mapping-remediation/create-account/", AccountingMappingRemediationCreateAccountView.as_view()),
    path("admin/accounting/mapping-remediation/apply/", AccountingMappingRemediationApplyView.as_view()),
    path("admin/accounting/mapping-remediation/seed-supported-defaults/", AccountingMappingRemediationSeedSupportedDefaultsView.as_view()),
    path("admin/accounting/mapping-remediation/acknowledge/", AccountingMappingRemediationAcknowledgeView.as_view()),
    path("admin/", include("api.v1.routes.admin_accounting_bridge_readiness")),
    path("admin/", include("api.v1.routes.admin_rent_lease_accounting_bridge")),
    path("admin/", include("api.v1.routes.contract_amendments_admin")),
    path("admin/", include("api.v1.routes.admin_staff_identity")),
    path("admin/", include("api.v1.routes.admin")),
    path("admin/", include("api.v1.routes.setup_readiness")),
    path("admin/", include("api.v1.routes.collection_control_center")),
    path("branch-control/", include("api.v1.routes.branch_control")),
    path("accounting/bridge-reconciliation/", AccountingBridgeReconciliationView.as_view()),
    path("accounting/year-end/readiness/", AccountingYearEndReadinessView.as_view()),
    path("accounting/year-end/close/", AccountingYearEndCloseView.as_view()),
    path("accounting/", include("api.v1.routes.accounting")),
    path("inventory/", include("api.v1.routes.inventory")),
    path("manufacturing/", include("api.v1.routes.manufacturing")),
    path("billing/", include("api.v1.routes.billing")),
    path("crm/", include("api.v1.routes.crm")),
    path("service-desk/", include("api.v1.routes.service_desk")),
    path("reminders/", include("api.v1.routes.reminders")),
    path("dashboards/", include("api.v1.routes.dashboard_surfaces")),
    path("partner/", include("api.v1.routes.contract_amendments_partner")),
    path("partner/", include("api.v1.routes.partner")),
    path("vendor/", include("api.v1.routes.vendor")),
    path("customer/", include("api.v1.routes.contract_amendments_customer")),
    path("customer/", include("api.v1.routes.customer")),
    path("staff/", include("api.v1.routes.staff")),
    path("customers/", include("api.v1.routes.customers")),
    path("cashier/", include("api.v1.routes.cashier")),
    path("notifications/", include("api.v1.routes.notifications")),
    path("public/", include("api.v1.routes.public")),
    path("executive/", include("api.v1.routes.executive")),
]
