from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.core.management import call_command
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework import status
import pyotp
import uuid

from accounts.models import UserRole, VendorIdentity, PartnerIdentity, LoginAudit, UserSession, TOTPDevice
from accounting.models import Vendor, PartnerProfile

User = get_user_model()

class SecurityIdentityTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin_user = User.objects.create_user(username="admin", password="password", role=UserRole.ADMIN, email="admin@test.com", phone="1111111111")
        self.vendor_user = User.objects.create_user(username="vendor1", password="password", role=UserRole.VENDOR, email="vendor@test.com", phone="2222222222")
        self.partner_user = User.objects.create_user(username="partner1", password="password", role=UserRole.PARTNER, email="partner@test.com", phone="3333333333")
        
        self.vendor_profile = Vendor.objects.create(name="Vendor Profile")
        self.partner_profile = PartnerProfile.objects.create(name="Partner Profile")

    def test_vendor_identity_creation(self):
        ident = VendorIdentity.objects.create(user=self.vendor_user, vendor=self.vendor_profile)
        self.assertEqual(ident.user.role, UserRole.VENDOR)

    def test_partner_identity_creation(self):
        ident = PartnerIdentity.objects.create(user=self.partner_user, partner=self.partner_profile)
        self.assertEqual(ident.user.role, UserRole.PARTNER)

    def test_login_audit_and_session(self):
        client = APIClient()
        response = client.post(reverse("login"), {"identifier": "admin", "password": "password"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check audit
        self.assertTrue(LoginAudit.objects.filter(user=self.admin_user, status="SUCCESS").exists())
        
        # Check session
        self.assertTrue(UserSession.objects.filter(user=self.admin_user, is_active=True).exists())

    def test_mfa_flow(self):
        # Set up MFA for admin
        secret = pyotp.random_base32()
        device = TOTPDevice.objects.create(user=self.admin_user, secret_key=secret, is_verified=True)
        
        client = APIClient()
        
        # Login without MFA should fail (or return MFA required)
        response = client.post(reverse("login"), {"identifier": "admin", "password": "password"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertTrue(response.data.get("mfa_required"))
        
        # Login with wrong MFA
        response = client.post(reverse("login"), {"identifier": "admin", "password": "password", "mfa_code": "000000"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
        # Login with correct MFA
        totp = pyotp.TOTP(secret)
        code = totp.now()
        response = client.post(reverse("login"), {"identifier": "admin", "password": "password", "mfa_code": code})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get("mfa_enabled"))

    def test_mfa_setup_and_reset_endpoints(self):
        client = APIClient()
        client.force_authenticate(user=self.admin_user)

        # GET setup when unverified
        resp = client.get(reverse("mfa-setup"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data.get("is_verified"))
        self.assertIn("qr_code", resp.data)
        secret_key = resp.data["secret_key"]

        # Activate with valid code
        totp = pyotp.TOTP(secret_key)
        code = totp.now()
        activate_resp = client.post(reverse("mfa-setup"), {"mfa_code": code})
        self.assertEqual(activate_resp.status_code, status.HTTP_200_OK)

        # Test code on verified device
        test_resp = client.post(reverse("mfa-setup"), {"mfa_code": totp.now(), "action": "test"})
        self.assertEqual(test_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(test_resp.data.get("valid"))

        # DELETE reset without password should fail
        del_fail = client.delete(reverse("mfa-setup"), {"password": "wrong"})
        self.assertEqual(del_fail.status_code, status.HTTP_400_BAD_REQUEST)

        # DELETE reset with correct password should succeed
        del_ok = client.delete(reverse("mfa-setup"), {"password": "password"})
        self.assertEqual(del_ok.status_code, status.HTTP_200_OK)
        self.assertFalse(TOTPDevice.objects.filter(user=self.admin_user).exists())

    def test_emergency_reset_mfa_command(self):
        TOTPDevice.objects.create(user=self.admin_user, secret_key=pyotp.random_base32(), is_verified=True)
        UserSession.objects.create(user=self.admin_user, session_token=str(uuid.uuid4()), is_active=True)
        self.assertTrue(TOTPDevice.objects.filter(user=self.admin_user).exists())
        self.assertTrue(UserSession.objects.filter(user=self.admin_user, is_active=True).exists())

        call_command("reset_admin_mfa", username="admin")
        self.assertFalse(TOTPDevice.objects.filter(user=self.admin_user).exists())
        self.assertFalse(UserSession.objects.filter(user=self.admin_user, is_active=True).exists())

    def test_mfa_replay_attack_prevention(self):
        secret = pyotp.random_base32()
        TOTPDevice.objects.create(user=self.admin_user, secret_key=secret, is_verified=True)
        client = APIClient()

        totp = pyotp.TOTP(secret)
        code = totp.now()

        # First attempt with code succeeds
        resp1 = client.post(reverse("login"), {"identifier": "admin", "password": "password", "mfa_code": code})
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)

        # Second attempt with the SAME code must be rejected as replayed
        resp2 = client.post(reverse("login"), {"identifier": "admin", "password": "password", "mfa_code": code})
        self.assertEqual(resp2.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("already been used", resp2.data.get("detail", ""))

    def test_mfa_brute_force_lockout(self):
        from django.core.cache import cache
        cache.clear()

        secret = pyotp.random_base32()
        TOTPDevice.objects.create(user=self.admin_user, secret_key=secret, is_verified=True)
        client = APIClient()

        # 5 failed attempts
        for _ in range(5):
            resp = client.post(reverse("login"), {"identifier": "admin", "password": "password", "mfa_code": "000000"})
            self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

        # 6th attempt must be locked out with HTTP 429
        locked_resp = client.post(reverse("login"), {"identifier": "admin", "password": "password", "mfa_code": "000000"})
        self.assertEqual(locked_resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertTrue(locked_resp.data.get("locked_out"))

    def test_mfa_malformed_code_handling(self):
        secret = pyotp.random_base32()
        TOTPDevice.objects.create(user=self.admin_user, secret_key=secret, is_verified=True)
        client = APIClient()

        # Non-numeric code
        resp_alpha = client.post(reverse("login"), {"identifier": "admin", "password": "password", "mfa_code": "abcdef"})
        self.assertEqual(resp_alpha.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("exactly 6 digits", resp_alpha.data.get("detail", ""))

        # Too short
        resp_short = client.post(reverse("login"), {"identifier": "admin", "password": "password", "mfa_code": "123"})
        self.assertEqual(resp_short.status_code, status.HTTP_400_BAD_REQUEST)

        # Too long
        resp_long = client.post(reverse("login"), {"identifier": "admin", "password": "password", "mfa_code": "123456789"})
        self.assertEqual(resp_long.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mfa_whitespace_and_dashes_sanitization(self):
        from django.core.cache import cache
        cache.clear()

        secret = pyotp.random_base32()
        TOTPDevice.objects.create(user=self.admin_user, secret_key=secret, is_verified=True)
        client = APIClient()

        totp = pyotp.TOTP(secret)
        code = totp.now()
        spaced_code = f" {code[:3]} - {code[3:]} "

        resp = client.post(reverse("login"), {"identifier": "admin", "password": "password", "mfa_code": spaced_code})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

