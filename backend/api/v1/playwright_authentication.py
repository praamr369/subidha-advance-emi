from django.contrib.auth import get_user_model
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed


class PlaywrightRoleAuthentication(BaseAuthentication):
    TOKEN_PREFIX = "PLAYWRIGHT_ROLE:"
    USERNAME_BY_ROLE = {
        "ADMIN": "smoke_admin",
        "CASHIER": "smoke_cashier",
        "PARTNER": "smoke_partner",
        "CUSTOMER": "smoke_customer",
    }

    def authenticate(self, request):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return None

        token = auth_header.removeprefix("Bearer ").strip()
        if not token.startswith(self.TOKEN_PREFIX):
            return None

        role = token.removeprefix(self.TOKEN_PREFIX).strip().upper()
        username = self.USERNAME_BY_ROLE.get(role)
        if not username:
            raise AuthenticationFailed("Unsupported Playwright smoke role.")

        User = get_user_model()
        user = User.objects.filter(username=username, role=role, is_active=True).first()
        if not user:
            raise AuthenticationFailed("Playwright smoke user is not available.")

        return (user, token)
