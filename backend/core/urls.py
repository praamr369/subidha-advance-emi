from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from api.v1.permissions import IsAdmin
from api.v1.views.health import PublicLivenessView, PublicReadinessView

# The OpenAPI schema enumerates the entire ~1,500-endpoint surface. On a public
# repo that is a free map for an attacker, so the schema and the interactive
# docs are admin-only. The Swagger/Redoc HTML pages default to AllowAny in
# drf-spectacular, so we must set permission_classes on each view explicitly —
# the SPECTACULAR_SETTINGS "SERVE_PERMISSIONS" only guards the raw schema view.
_DOCS_PERMISSIONS = [IsAdmin]

urlpatterns = [
    path("healthz/", PublicLivenessView.as_view(), name="healthz"),
    path("readyz/", PublicReadinessView.as_view(), name="readyz"),
    path("admin/", admin.site.urls),
    # OpenAPI 3 schema + interactive docs (drf-spectacular) — admin-only.
    path(
        "api/schema/",
        SpectacularAPIView.as_view(permission_classes=_DOCS_PERMISSIONS),
        name="schema",
    ),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema", permission_classes=_DOCS_PERMISSIONS),
        name="swagger-ui",
    ),
    path(
        "api/redoc/",
        SpectacularRedocView.as_view(url_name="schema", permission_classes=_DOCS_PERMISSIONS),
        name="redoc",
    ),
    path("api/v1/", include("api.v1.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
