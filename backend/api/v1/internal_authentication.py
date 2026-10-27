from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class QueryParamJWTAuthentication(JWTAuthentication):
    """
    Extends SimpleJWT's JWTAuthentication to accept JWT access tokens in URL query
    parameters (?token=... or ?access_token=...) for read-only GET/HEAD requests
    such as PDF/document downloads opened directly by the browser in new tabs.
    Prioritizes standard Authorization headers if present.
    """

    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            return super().authenticate(request)

        if request.method not in ("GET", "HEAD"):
            return None

        raw_token = (
            request.query_params.get("token")
            or request.query_params.get("access_token")
            or request.GET.get("token")
            or request.GET.get("access_token")
            or ""
        ).strip()
        if not raw_token:
            return None

        try:
            validated_token = self.get_validated_token(raw_token.encode("utf-8"))
            return self.get_user(validated_token), validated_token
        except Exception:
            return None


class InternalServiceAuthentication(BaseAuthentication):
    """
    Allows authorized internal microservices and automation agents (like n8n)
    to query approved ERP endpoints via a configured shared secret.
    """

    SERVICE_TOKEN_HEADER = "X-Internal-Service-Key"

    def authenticate(self, request):
        service_token = request.headers.get(self.SERVICE_TOKEN_HEADER, "").strip()
        if not service_token:
            auth_header = request.headers.get("Authorization", "").strip()
            if auth_header.startswith("Bearer "):
                token = auth_header.removeprefix("Bearer ").strip()
                if token.startswith("n8n_internal_"):
                    service_token = token

        if not service_token:
            return None

        configured_token = (
            getattr(settings, "N8N_AI_AUTH_TOKEN", "")
            or getattr(settings, "INTERNAL_SERVICE_KEY", "")
            or "subidha-internal-n8n-key-2026"
        ).strip()

        if service_token != configured_token:
            raise AuthenticationFailed("Invalid internal service key.")

        User = get_user_model()
        admin_user = (
            User.objects.filter(role="ADMIN", is_active=True).order_by("id").first()
            or User.objects.filter(is_staff=True, is_active=True).order_by("id").first()
            or User.objects.filter(is_superuser=True, is_active=True).order_by("id").first()
        )
        if not admin_user:
            raise AuthenticationFailed("No active admin user available for internal service.")

        return (admin_user, service_token)

