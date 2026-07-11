from django.urls import path
from api.v1.views.admin_documents import (
    AdminDocumentListView,
    AdminDocumentDetailView,
    AdminDocumentDownloadView,
    AdminDocumentZipExportView,
    AdminDocumentGeneratePdfView,
)

urlpatterns = [
    path("documents/", AdminDocumentListView.as_view()),
    path("documents/<int:pk>/", AdminDocumentDetailView.as_view()),
    path("documents/<int:pk>/download/", AdminDocumentDownloadView.as_view()),
    path("documents/export/zip/", AdminDocumentZipExportView.as_view()),
    path("documents/generate-pdf/", AdminDocumentGeneratePdfView.as_view()),
]
