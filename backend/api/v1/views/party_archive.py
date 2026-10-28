from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import permissions
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from crm.models import PartyMaster
from crm.services.party_archive_service import build_party_archive


class AdminCrmPartyArchiveView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        party = get_object_or_404(PartyMaster.objects.prefetch_related("links"), pk=pk)
        content, filename = build_party_archive(party)
        response = HttpResponse(content, content_type="application/zip")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["X-Archive-Source"] = "canonical-live-records"
        return response
