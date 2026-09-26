from django.urls import include, path
from rest_framework.routers import DefaultRouter

from api.v1.views.whatsapp_outbox import WhatsAppMessageViewSet
from api.v1.views.reminders import (
    NotificationTemplateViewSet,
    PaymentReminderGatewayStatusView,
    PaymentReminderRunView,
    PaymentReminderViewSet,
)
from api.v1.views.automated_dunning import AutomatedDunningRunView

router = DefaultRouter()
router.register(r"", PaymentReminderViewSet, basename="payment-reminders")

whatsapp_router = DefaultRouter()
whatsapp_router.register(r"", WhatsAppMessageViewSet, basename="whatsapp-messages")

template_router = DefaultRouter()
template_router.register(r"", NotificationTemplateViewSet, basename="notification-templates")

urlpatterns = [
    path("gateway/status/", PaymentReminderGatewayStatusView.as_view()),
    path("run/", PaymentReminderRunView.as_view()),
    path("run-automated-dunning/", AutomatedDunningRunView.as_view()),
    path("whatsapp/", include(whatsapp_router.urls)),
    path("templates/", include(template_router.urls)),
    path("payment-reminders/", include(router.urls)),
    path("", include(router.urls)),
]
