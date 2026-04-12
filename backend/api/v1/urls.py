from django.urls import path, include

urlpatterns = [
    path("auth/", include("api.v1.routes.auth")),
    path("admin/", include("api.v1.routes.admin")),
    path("branch-control/", include("api.v1.routes.branch_control")),
    path("accounting/", include("api.v1.routes.accounting")),
    path("inventory/", include("api.v1.routes.inventory")),
    path("manufacturing/", include("api.v1.routes.manufacturing")),
    path("billing/", include("api.v1.routes.billing")),
    path("crm/", include("api.v1.routes.crm")),
    path("service-desk/", include("api.v1.routes.service_desk")),
    path("reminders/", include("api.v1.routes.reminders")),
    path("dashboards/", include("api.v1.routes.dashboard_surfaces")),
    path("partner/", include("api.v1.routes.partner")),
    path("customer/", include("api.v1.routes.customer")),
    path("cashier/", include("api.v1.routes.cashier")),
    path("public/", include("api.v1.routes.public")),
    path("executive/", include("api.v1.routes.executive")),
    path("winner/", include("api.v1.route_modules.winner_urls")),
]
