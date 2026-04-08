from django.urls import include, path
from rest_framework.routers import DefaultRouter

from api.v1.views.billing import (
    BillingCreditNoteViewSet,
    BillingCashBookView,
    BillingDailyBookView,
    BillingDebitNoteViewSet,
    BillingInvoiceViewSet,
    EmiPaymentReceiptGenerateView,
    ReceiptDocumentViewSet,
)

router = DefaultRouter()
router.register(r"invoices", BillingInvoiceViewSet, basename="billing-invoices")
router.register(r"credit-notes", BillingCreditNoteViewSet, basename="billing-credit-notes")
router.register(r"debit-notes", BillingDebitNoteViewSet, basename="billing-debit-notes")
router.register(r"receipts", ReceiptDocumentViewSet, basename="billing-receipts")

urlpatterns = [
    path("dailybook/", BillingDailyBookView.as_view()),
    path("cashbook/", BillingCashBookView.as_view()),
    path("receipts/emi-payment/<int:payment_id>/generate/", EmiPaymentReceiptGenerateView.as_view()),
    path("", include(router.urls)),
]
