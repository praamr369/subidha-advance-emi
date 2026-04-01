from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


class MeView(APIView):
    """
    Canonical authenticated user identity endpoint.

    Enterprise rule:
    - Role must come from accounts.User.role
    - Do not derive business role from Django groups
    - Do not map superuser to admin for business APIs unless role is actually set
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        role = getattr(user, "role", "") or ""

        customer_profile = getattr(user, "customer_profile", None)

        return Response(
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "phone": getattr(user, "phone", "") or "",
                "first_name": getattr(user, "first_name", "") or "",
                "last_name": getattr(user, "last_name", "") or "",
                "role": role,
                "is_staff": bool(getattr(user, "is_staff", False)),
                "is_superuser": bool(getattr(user, "is_superuser", False)),
                "customer_profile_id": getattr(customer_profile, "id", None),
            }
        )