from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

class CustomTokenSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        token["is_staff"] = user.is_staff
        token["username"] = user.username
        token["role"] = getattr(user, "role", "")

        return token

    def validate(self, attrs):
        data = super().validate(attrs)

        data["is_staff"] = self.user.is_staff
        data["username"] = self.user.username
        data["role"] = getattr(self.user, "role", "")

        return data