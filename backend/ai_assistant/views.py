from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ai_assistant.permissions import IsAdminAIEnabled
from ai_assistant.serializers import AIQueryRequestSerializer


class AIAssistantBaseView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminAIEnabled]


class AIAssistantHealthView(AIAssistantBaseView):
    def get(self, request):
        return Response({"detail": "AI assistant not yet active"})


class AIKnowledgeSourceListCreateView(AIAssistantBaseView):
    def get(self, request):
        return Response({"detail": "AI assistant not yet active"})


class AIAssistantQueryView(AIAssistantBaseView):
    def post(self, request):
        serializer = AIQueryRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response({"detail": "AI assistant not yet active"}, status=status.HTTP_200_OK)
