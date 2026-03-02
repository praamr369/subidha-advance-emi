from django.urls import path, include

urlpatterns = [
    path("auth/", include("api.v1.routes.auth")),
    path("admin/", include("api.v1.routes.admin")),
    path("partner/", include("api.v1.routes.partner")),
    path("customer/", include("api.v1.routes.customer")),
    path("cashier/", include("api.v1.routes.cashier")),
    path("public/", include("api.v1.routes.public")),
    path("executive/", include("api.v1.routes.executive")),
    path("winner/", include("api.v1.route_modules.winner_urls")),
]