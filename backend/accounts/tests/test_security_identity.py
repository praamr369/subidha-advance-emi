from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
import pyotp
import uuid

from accounts.models import UserRole, VendorIdentity, PartnerIdentity, LoginAudit, UserSession, TOTPDevice
from accounting.models import Vendor, PartnerProfile

User = get_user_model()

class SecurityIdentityTests(TestCase):
    def setUp(self):
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

