from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from api.v1.views.health import PublicLivenessView, PublicReadinessView

urlpatterns = [
    path("healthz/", PublicLivenessView.as_view(), name="healthz"),
    path("readyz/", PublicReadinessView.as_view(), name="readyz"),
    path("admin/", admin.site.urls),
    # OpenAPI 3 schema + interactive docs (drf-spectacular).
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path(
        "api/redoc/",
        SpectacularRedocView.as_view(url_name="schema"),
        name="redoc",
    ),
    path("api/v1/", include("api.v1.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
