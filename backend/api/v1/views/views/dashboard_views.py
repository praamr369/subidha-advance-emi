from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from subscriptions.services.dashboard_service import executive_dashboard_summary

CACHE_KEY = "admin_dashboard"
CACHE_TIMEOUT = 60  # seconds


@api_view(["GET"])
@permission_classes([IsAdminUser])
def executive_dashboard(request):

    cached = cache.get(CACHE_KEY)
    if cached:
        return Response(cached)

    data = executive_dashboard_summary()

    cache.set(CACHE_KEY, data, CACHE_TIMEOUT)

    return Response(data)