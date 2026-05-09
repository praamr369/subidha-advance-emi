from django.conf import settings
from rest_framework.exceptions import APIException
from rest_framework.permissions import BasePermission


class AIAssistantDisabled(APIException):
    status_code = 503
    default_detail = "AI assistant is disabled"
    default_code = "ai_assistant_disabled"


class IsAdminAIEnabled(BasePermission):
    """
    Phase 8B guard for the disabled-by-default AI assistant.

    Non-admin users are forbidden. Admin users receive a controlled 503 while
    the feature flag is disabled.
    """

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False

        role = (getattr(user, "role", "") or "").strip().upper()
        is_admin = bool(getattr(user, "is_staff", False) or role == "ADMIN")
        if not is_admin:
            return False

        if not getattr(settings, "AI_ASSISTANT_ENABLED", False):
            raise AIAssistantDisabled()

        return True
