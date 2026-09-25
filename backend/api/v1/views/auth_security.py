import pyotp
import qrcode
import io
import base64
from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from accounts.models import TOTPDevice, UserSession

class MFASetupView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        device, created = TOTPDevice.objects.get_or_create(user=user)
        if created or not device.secret_key:
            device.secret_key = pyotp.random_base32()
            device.is_verified = False
            device.save()

        totp = pyotp.TOTP(device.secret_key)
        provisioning_uri = totp.provisioning_uri(name=user.email or user.username, issuer_name="Subidha")

        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(provisioning_uri)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode()

        return Response({
            "secret_key": device.secret_key,
            "qr_code": f"data:image/png;base64,{img_str}",
            "is_verified": device.is_verified
        })

    def post(self, request):
        user = request.user
        mfa_code = request.data.get("mfa_code")
        if not mfa_code:
            return Response({"detail": "MFA code is required."}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            device = user.totp_device
            if device.is_verified:
                return Response({"detail": "MFA is already verified."}, status=status.HTTP_400_BAD_REQUEST)
            
            totp = pyotp.TOTP(device.secret_key)
            if totp.verify(mfa_code):
                device.is_verified = True
                device.save()
                return Response({"detail": "MFA verified successfully."})
            else:
                return Response({"detail": "Invalid MFA code."}, status=status.HTTP_400_BAD_REQUEST)
        except TOTPDevice.DoesNotExist:
            return Response({"detail": "MFA not set up."}, status=status.HTTP_400_BAD_REQUEST)


class SessionListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # We allow admins to view any user's sessions if a user_id is provided, else their own
        user_id = request.query_params.get("user_id")
        if user_id and getattr(request.user, "role", "") == "ADMIN":
            sessions = UserSession.objects.filter(user_id=user_id, is_active=True).order_by("-last_active_at")
        else:
            sessions = UserSession.objects.filter(user=request.user, is_active=True).order_by("-last_active_at")

        data = [{
            "id": session.id,
            "device_name": session.device_name,
            "ip_address": session.ip_address,
            "user_agent": session.user_agent,
            "created_at": session.created_at,
            "last_active_at": session.last_active_at
        } for session in sessions]
        return Response(data)

class SessionRevokeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            # If admin, can revoke any session. Otherwise, only own.
            if getattr(request.user, "role", "") == "ADMIN":
                session = UserSession.objects.get(pk=pk, is_active=True)
            else:
                session = UserSession.objects.get(pk=pk, user=request.user, is_active=True)
            
            session.is_active = False
            session.save()
            return Response({"detail": "Session revoked successfully."})
        except UserSession.DoesNotExist:
            return Response({"detail": "Session not found."}, status=status.HTTP_404_NOT_FOUND)

class SessionRevokeAllView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user_id = request.data.get("user_id")
        if getattr(request.user, "role", "") == "ADMIN":
            target_user_id = user_id or request.user.id
            UserSession.objects.filter(user_id=target_user_id, is_active=True).update(is_active=False)
        else:
            UserSession.objects.filter(user=request.user, is_active=True).update(is_active=False)
        
        return Response({"detail": "All sessions revoked successfully."})

