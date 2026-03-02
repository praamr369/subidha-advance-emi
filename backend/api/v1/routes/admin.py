from rest_framework.routers import DefaultRouter
from api.v1.views.admin_resources import (
    BatchAdminViewSet,
    SubscriptionAdminViewSet,
    PaymentAdminViewSet,
    LuckyDrawAdminViewSet,
    LuckyIdAdminViewSet,
    ProductAdminViewSet,
    EmiAdminViewSet,
)
from api.v1.views.admin_dashboard import AdminDashboardView
from django.urls import path, include

router = DefaultRouter()
router.register("batches", BatchAdminViewSet)
router.register("subscriptions", SubscriptionAdminViewSet)
router.register("payments", PaymentAdminViewSet)
router.register("lucky-draws", LuckyDrawAdminViewSet)
router.register("lucky-ids", LuckyIdAdminViewSet)
router.register("products", ProductAdminViewSet)
router.register("emis", EmiAdminViewSet)

urlpatterns = [
    path("dashboard/", AdminDashboardView.as_view()),
    path("", include(router.urls)),
]