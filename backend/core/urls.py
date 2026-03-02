from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView,TokenObtainPairView
from accounts.serializers import CustomTokenSerializer

from api.v1.views.auth_views import register_user


class CustomTokenView(TokenObtainPairView):
    serializer_class = CustomTokenSerializer


urlpatterns = [
    path("admin/", admin.site.urls),

    # Main API routes
    path("api/v1/", include("api.v1.urls")),
]  