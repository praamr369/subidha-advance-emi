from rest_framework import permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.business_setup import DocumentPrintSettingsSerializer
from subscriptions.services.document_print_settings_service import get_or_create_document_print_settings


class AdminDocumentPrintSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        settings = get_or_create_document_print_settings()
        serializer = DocumentPrintSettingsSerializer(settings, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        settings = get_or_create_document_print_settings()
        serializer = DocumentPrintSettingsSerializer(
            settings,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(DocumentPrintSettingsSerializer(instance, context={"request": request}).data, status=status.HTTP_200_OK)
