from django.conf import settings
from django.contrib.auth import get_user_model


class PlaywrightLoginBackend:
    ALLOWED_USERNAMES = {"smoke_admin", "smoke_cashier"}

    def authenticate(self, request, username=None, password=None, **kwargs):
        expected_secret = getattr(settings, "PLAYWRIGHT_REAL_LOGIN_SECRET", "")
        normalized_username = (username or "").strip()

        if not expected_secret:
            return None
        if normalized_username not in self.ALLOWED_USERNAMES:
            return None
        if password != expected_secret:
            return None

        User = get_user_model()
        return (
            User.objects.filter(username=normalized_username, is_active=True)
            .only("id", "username", "role", "is_active")
            .first()
        )

    def get_user(self, user_id):
        User = get_user_model()
        return User.objects.filter(pk=user_id, is_active=True).first()
