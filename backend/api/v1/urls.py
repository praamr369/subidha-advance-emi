from django.urls import path, include

from api.v1.views.health import PublicApiDeepHealthView, PublicApiHealthView

urlpatterns = [
    path("health/", PublicApiHealthView.as_view()),
    path("health/deep/", PublicApiDeepHealthView.as_view()),
    path("auth/", include("api.v1.routes.auth")),
    path("admin/", include("api.v1.routes.contract_amendments_admin")),
    path("admin/", include("api.v1.routes.admin")),
    path("admin/", include("api.v1.routes.setup_readiness")),
    path("admin/", include("api.v1.routes.collection_control_center")),
    path("branch-control/", include("api.v1.routes.branch_control")),
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
    # Phase 1: shared customer lookup/create (admin + partner access)
    path("customers/", include("api.v1.routes.customers")),
    path("cashier/", include("api.v1.routes.cashier")),
    path("notifications/", include("api.v1.routes.notifications")),
    path("public/", include("api.v1.routes.public")),
    path("executive/", include("api.v1.routes.executive")),
    path("winner/", include("api.v1.route_modules.winner_urls")),
]
