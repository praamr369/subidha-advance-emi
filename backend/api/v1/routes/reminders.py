from django.urls import include, path
from rest_framework.routers import DefaultRouter

from api.v1.views.reminders import (
    NotificationTemplateViewSet,
    PaymentReminderGatewayStatusView,
    PaymentReminderRunView,
    PaymentReminderViewSet,
)

router = DefaultRouter()
router.register(r"", PaymentReminderViewSet, basename="payment-reminders")

template_router = DefaultRouter()
template_router.register(r"", NotificationTemplateViewSet, basename="notification-templates")

urlpatterns = [
    path("gateway/status/", PaymentReminderGatewayStatusView.as_view()),
    path("run/", PaymentReminderRunView.as_view()),
    path("templates/", include(template_router.urls)),
    path("payment-reminders/", include(router.urls)),
    path("", include(router.urls)),
]
