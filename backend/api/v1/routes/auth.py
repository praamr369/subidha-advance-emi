from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from api.v1.views.auth_views import register_user
from accounts.serializers import CustomTokenSerializer
from rest_framework_simplejwt.views import TokenObtainPairView


class CustomTokenView(TokenObtainPairView):
    serializer_class = CustomTokenSerializer


urlpatterns = [
    path("login/", CustomTokenView.as_view(), name="login"),
    path("register/", register_user, name="register"),
    path("refresh/", TokenRefreshView.as_view(), name="refresh"),
]