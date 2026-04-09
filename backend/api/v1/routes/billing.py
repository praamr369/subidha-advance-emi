from django.urls import include, path
from rest_framework.routers import DefaultRouter

from api.v1.views.billing import (
    BillingCreditNoteViewSet,
    BillingCashBookView,
    BillingDailyBookView,
    BillingDebitNoteViewSet,
    BillingInstallmentMirrorViewSet,
    BillingInvoiceViewSet,
    BillingPaymentSyncView,
    BillingProfileViewSet,
    BillingSyncEventViewSet,
    DirectSaleViewSet,
    EmiPaymentReceiptGenerateView,
    ReceiptDocumentViewSet,
)

router = DefaultRouter()
router.register(r"direct-sales", DirectSaleViewSet, basename="billing-direct-sales")
router.register(r"invoices", BillingInvoiceViewSet, basename="billing-invoices")
router.register(r"credit-notes", BillingCreditNoteViewSet, basename="billing-credit-notes")
router.register(r"debit-notes", BillingDebitNoteViewSet, basename="billing-debit-notes")
router.register(r"receipts", ReceiptDocumentViewSet, basename="billing-receipts")
router.register(r"profiles", BillingProfileViewSet, basename="billing-profiles")
router.register(r"installments", BillingInstallmentMirrorViewSet, basename="billing-installments")
router.register(r"sync-events", BillingSyncEventViewSet, basename="billing-sync-events")

urlpatterns = [
    path("dailybook/", BillingDailyBookView.as_view()),
    path("cashbook/", BillingCashBookView.as_view()),
    path("receipts/emi-payment/<int:payment_id>/generate/", EmiPaymentReceiptGenerateView.as_view()),
    path("payments/<int:payment_id>/sync/", BillingPaymentSyncView.as_view()),
    path("", include(router.urls)),
]
