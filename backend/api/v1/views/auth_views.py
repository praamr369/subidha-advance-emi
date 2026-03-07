from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.models import User, UserRole
from subscriptions.models import Customer

SELF_REGISTRATION_ROLES = {UserRole.CUSTOMER, UserRole.PARTNER}


@api_view(["POST"])
@permission_classes([AllowAny])
def register_user(request):
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""
    role = (request.data.get("role") or UserRole.CUSTOMER).upper()
    phone = (request.data.get("phone") or "").strip()
    name = (request.data.get("name") or "").strip()

    if not username or not password:
        return Response({"error": "username and password are required"}, status=status.HTTP_400_BAD_REQUEST)

    if role not in SELF_REGISTRATION_ROLES:
        return Response({"error": "only CUSTOMER or PARTNER self-registration is allowed"}, status=status.HTTP_400_BAD_REQUEST)

    if not phone:
        return Response({"error": "phone is required"}, status=status.HTTP_400_BAD_REQUEST)

    if not name:
        return Response({"error": "name is required"}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(username=username).exists():
        return Response({"error": "username already exists"}, status=status.HTTP_400_BAD_REQUEST)

    if role == UserRole.CUSTOMER and Customer.objects.filter(phone=phone).exists():
        return Response({"error": "customer with this phone already exists"}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        user = User.objects.create_user(
            username=username,
            password=password,
            role=role,
            phone=phone,
            first_name=name,
            is_staff=False,
        )

        if role == UserRole.CUSTOMER:
            Customer.objects.create(user=user, name=name, phone=phone)

    return Response(
        {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "is_staff": user.is_staff,
            "message": "Registration successful",
        },
        status=status.HTTP_201_CREATED,
    )
