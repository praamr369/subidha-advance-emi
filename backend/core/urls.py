from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from api.v1.views.health import PublicLivenessView, PublicReadinessView

urlpatterns = [
    path("healthz/", PublicLivenessView.as_view(), name="healthz"),
    path("readyz/", PublicReadinessView.as_view(), name="readyz"),
    path("admin/", admin.site.urls),
    path("api/v1/", include("api.v1.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
