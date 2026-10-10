from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from django.core.management import call_command
from io import StringIO
from api.v1.permissions import IsAdmin

class AutomatedDunningRunView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        dry_run = request.data.get("dry_run", False)
        out = StringIO()
        try:
            if dry_run:
                call_command("automated_dunning", "--dry-run", stdout=out, stderr=out)
            else:
                call_command("automated_dunning", stdout=out, stderr=out)
            return Response({"output": out.getvalue()}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"detail": str(e), "output": out.getvalue()}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
