from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        if user.is_superuser:
            role = "admin"
        elif user.groups.filter(name="partner").exists():
            role = "partner"
        else:
            role = "unknown"

        return Response({
            "username": user.username,
            "role": role
        })