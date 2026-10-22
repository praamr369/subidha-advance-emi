from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import UserRole
from subscriptions.models import Customer
from tests.helpers import (
    create_admin_user,
    create_partner_user,
)

User = get_user_model()


class AuthApiTests(APITestCase):
    def setUp(self):
        cache.clear()  # reset throttle counters between tests
        self.admin = create_admin_user(
            username="auth_admin",
            phone="9000000201",
            email="auth_admin@example.com",
        )
        self.partner = create_partner_user(
            username="auth_partner",
            phone="9000000202",
            email="Auth_Partner@Example.com",
        )

        # Known helper passwords:
        # create_admin_user   -> AdminPass123!
        # create_partner_user -> PartnerPass123!

    # -------------------------------------------------
    # LOGIN
    # -------------------------------------------------

    def test_login_returns_access_refresh_and_user(self):
        response = self.client.post(
            "/api/v1/auth/login/",
            {
                "username": "auth_partner",
                "password": "PartnerPass123!",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected login response: {response.status_code} {response.data}",
        )
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertIn("user", response.data)

    def test_login_user_payload_contains_role(self):
        response = self.client.post(
            "/api/v1/auth/login/",
            {
                "username": "auth_partner",
                "password": "PartnerPass123!",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected login response: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["user"]["username"], "auth_partner")
        self.assertEqual(response.data["user"]["role"], "PARTNER")
        self.assertEqual(response.data["user"]["phone"], "9000000202")
        self.assertIn("is_staff", response.data["user"])
        self.assertIn("is_superuser", response.data["user"])

    def test_login_rejects_invalid_password(self):
        response = self.client.post(
            "/api/v1/auth/login/",
            {
                "username": "auth_partner",
                "password": "WrongPassword123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("detail", response.data)
        self.assertEqual(
            response.data["detail"],
            "Unable to log in with provided credentials.",
        )

    def test_login_accepts_identifier_payload_with_username(self):
        response = self.client.post(
            "/api/v1/auth/login/",
            {
                "identifier": "auth_partner",
                "password": "PartnerPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["username"], "auth_partner")

    def test_login_accepts_identifier_payload_with_email_case_insensitive(self):
        response = self.client.post(
            "/api/v1/auth/login/",
            {
                "identifier": "auth_partner@example.com",
                "password": "PartnerPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["username"], "auth_partner")

    def test_login_accepts_identifier_payload_with_phone_normalized(self):
        response = self.client.post(
            "/api/v1/auth/login/",
            {
                "identifier": "900-000-0202",
                "password": "PartnerPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["username"], "auth_partner")

    def test_login_rejects_unknown_identifier_with_generic_error(self):
        response = self.client.post(
            "/api/v1/auth/login/",
            {
                "identifier": "does-not-exist@example.com",
                "password": "PartnerPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(
            response.data["detail"],
            "Unable to log in with provided credentials.",
        )

    def test_login_rejects_inactive_user(self):
        self.partner.is_active = False
        self.partner.save(update_fields=["is_active"])

        response = self.client.post(
            "/api/v1/auth/login/",
            {
                "identifier": "auth_partner",
                "password": "PartnerPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(
            response.data["detail"],
            "Unable to log in with provided credentials.",
        )

    def test_login_rejects_ambiguous_email_identifier_safely(self):
        User.objects.create_user(
            username="auth_partner_dup",
            password="PartnerPass123!",
            phone="9000000299",
            email="auth_partner@example.com",
            role=UserRole.PARTNER,
        )

        response = self.client.post(
            "/api/v1/auth/login/",
            {
                "identifier": "auth_partner@example.com",
                "password": "PartnerPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(
            response.data["detail"],
            "Unable to log in with provided credentials.",
        )

    # -------------------------------------------------
    # ME
    # -------------------------------------------------

    def test_auth_me_returns_authenticated_partner_identity(self):
        login = self.client.post(
            "/api/v1/auth/login/",
            {
                "username": "auth_partner",
                "password": "PartnerPass123!",
            },
            format="json",
        )
        self.assertEqual(
            login.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected login response before /me/: {login.status_code} {login.data}",
        )

        access_token = login.data["access"]

        response = self.client.get(
            "/api/v1/auth/me/",
            HTTP_AUTHORIZATION=f"Bearer {access_token}",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected /me/ response: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["username"], "auth_partner")
        self.assertEqual(response.data["role"], "PARTNER")
        self.assertEqual(response.data["phone"], "9000000202")
        self.assertIn("is_staff", response.data)
        self.assertIn("is_superuser", response.data)

    def test_auth_me_returns_authenticated_admin_identity(self):
        login = self.client.post(
            "/api/v1/auth/login/",
            {
                "username": "auth_admin",
                "password": "AdminPass123!",
            },
            format="json",
        )
        self.assertEqual(
            login.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected admin login response before /me/: {login.status_code} {login.data}",
        )

        access_token = login.data["access"]

        response = self.client.get(
            "/api/v1/auth/me/",
            HTTP_AUTHORIZATION=f"Bearer {access_token}",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected admin /me/ response: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["username"], "auth_admin")
        self.assertEqual(response.data["role"], "ADMIN")
        self.assertEqual(response.data["phone"], "9000000201")

    def test_auth_me_requires_authentication(self):
        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # -------------------------------------------------
    # REFRESH
    # -------------------------------------------------

    def test_refresh_returns_new_access_token(self):
        login = self.client.post(
            "/api/v1/auth/login/",
            {
                "username": "auth_partner",
                "password": "PartnerPass123!",
            },
            format="json",
        )
        self.assertEqual(
            login.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected login response before refresh: {login.status_code} {login.data}",
        )

        refresh_token = login.data["refresh"]

        response = self.client.post(
            "/api/v1/auth/refresh/",
            {"refresh": refresh_token},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected refresh response: {response.status_code} {response.data}",
        )
        self.assertIn("access", response.data)
        self.assertTrue(bool(response.data["access"]))

    # -------------------------------------------------
    # REGISTER
    # -------------------------------------------------

    def test_register_customer_returns_tokens_and_creates_customer_profile(self):
        payload = {
            "username": "registered_customer",
            "password": "CustomerPass123!",
            "phone": "9000000291",
            "email": "registered_customer@example.com",
            "first_name": "Registered",
            "last_name": "Customer",
            "role": UserRole.CUSTOMER,
        }

        response = self.client.post(
            "/api/v1/auth/register/",
            payload,
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            msg=f"Unexpected customer register response: {response.status_code} {response.data}",
        )
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertIn("user", response.data)
        self.assertEqual(response.data["user"]["username"], payload["username"])
        self.assertEqual(response.data["user"]["role"], UserRole.CUSTOMER)
        self.assertEqual(response.data["user"]["phone"], payload["phone"])

        user = User.objects.get(username=payload["username"])
        self.assertEqual(user.role, UserRole.CUSTOMER)
        self.assertEqual(user.phone, payload["phone"])

        self.assertTrue(
            Customer.objects.filter(user=user).exists(),
            msg="Customer registration must create customer_profile.",
        )

        customer_profile = Customer.objects.get(user=user)
        self.assertEqual(customer_profile.phone, payload["phone"])
        self.assertTrue(bool(customer_profile.name))

    def test_register_partner_is_rejected_for_public_signup(self):
        payload = {
            "username": "registered_partner",
            "password": "PartnerPass123!",
            "phone": "9000000292",
            "email": "registered_partner@example.com",
            "first_name": "Registered",
            "last_name": "Partner",
            "role": UserRole.PARTNER,
        }

        response = self.client.post(
            "/api/v1/auth/register/",
            payload,
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            msg=f"Unexpected partner register response: {response.status_code} {getattr(response, 'data', response.content)}",
        )
        self.assertIn("role", response.data)
        self.assertFalse(
            User.objects.filter(username=payload["username"]).exists(),
            msg="Partner self-registration must not create an internal user.",
        )
        self.assertFalse(
            Customer.objects.filter(phone=payload["phone"]).exists(),
            msg="Rejected partner self-registration must not create customer_profile.",
        )

    def test_register_rejects_internal_admin_role(self):
        payload = {
            "username": "bad_admin_register",
            "password": "AdminPass123!",
            "phone": "9000000293",
            "role": UserRole.ADMIN,
        }

        response = self.client.post(
            "/api/v1/auth/register/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_rejects_internal_cashier_role(self):
        payload = {
            "username": "bad_cashier_register",
            "password": "CashierPass123!",
            "phone": "9000000294",
            "role": UserRole.CASHIER,
        }

        response = self.client.post(
            "/api/v1/auth/register/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_requires_phone(self):
        payload = {
            "username": "phone_missing_user",
            "password": "CustomerPass123!",
            "role": UserRole.CUSTOMER,
        }

        response = self.client.post(
            "/api/v1/auth/register/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", response.data)

    def test_register_requires_email(self):
        payload = {
            "username": "email_missing_user",
            "password": "CustomerPass123!",
            "phone": "9000000295",
            "role": UserRole.CUSTOMER,
        }

        response = self.client.post(
            "/api/v1/auth/register/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    # -------------------------------------------------
    # LOGOUT
    # -------------------------------------------------

    def test_logout_without_refresh_still_returns_success(self):
        response = self.client.post(
            "/api/v1/auth/logout/",
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected logout response without refresh: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["detail"], "Logout completed.")

    def test_logout_with_invalid_refresh_still_returns_success(self):
        response = self.client.post(
            "/api/v1/auth/logout/",
            {"refresh": "invalid.token.value"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected logout response with invalid refresh: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["detail"], "Logout completed.")

    def test_logout_with_valid_refresh_returns_success(self):
        login = self.client.post(
            "/api/v1/auth/login/",
            {
                "username": "auth_partner",
                "password": "PartnerPass123!",
            },
            format="json",
        )
        self.assertEqual(
            login.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected login response before logout: {login.status_code} {login.data}",
        )

        refresh_token = login.data["refresh"]

        response = self.client.post(
            "/api/v1/auth/logout/",
            {"refresh": refresh_token},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected logout response with valid refresh: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["detail"], "Logout completed.")

    # -------------------------------------------------
    # LAYER 3: TOKEN EXPIRATION, REFRESH, AND SESSIONS
    # -------------------------------------------------

    def test_expired_jwt_access_token_returns_401(self):
        from datetime import timedelta
        from rest_framework_simplejwt.tokens import AccessToken
        
        token = AccessToken.for_user(self.partner)
        token.set_exp(lifetime=-timedelta(minutes=5))
        
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(token)}")
        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data.get("code"), "token_not_valid")

    def test_refresh_token_with_invalid_or_expired_token_returns_401(self):
        # Invalid signature
        response = self.client.post(
            "/api/v1/auth/refresh/",
            {"refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        # Expired refresh token
        from datetime import timedelta
        from rest_framework_simplejwt.tokens import RefreshToken
        expired_refresh = RefreshToken.for_user(self.partner)
        expired_refresh.set_exp(lifetime=-timedelta(days=1))
        
        response = self.client.post(
            "/api/v1/auth/refresh/",
            {"refresh": str(expired_refresh)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_multi_device_session_tracking_and_revocation(self):
        # Device A Login
        res_a = self.client.post(
            "/api/v1/auth/login/",
            {"username": "auth_partner", "password": "PartnerPass123!", "device_name": "Device A (Chrome)"},
            format="json",
        )
        self.assertEqual(res_a.status_code, status.HTTP_200_OK)
        token_a = res_a.data["access"]
        
        # Device B Login
        res_b = self.client.post(
            "/api/v1/auth/login/",
            {"username": "auth_partner", "password": "PartnerPass123!", "device_name": "Device B (Safari Mobile)"},
            format="json",
        )
        self.assertEqual(res_b.status_code, status.HTTP_200_OK)
        token_b = res_b.data["access"]

        # View active sessions
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_a}")
        sessions_res = self.client.get("/api/v1/auth/sessions/")
        self.assertEqual(sessions_res.status_code, status.HTTP_200_OK)
        active_sessions = sessions_res.data
        self.assertGreaterEqual(len(active_sessions), 2)
        
        device_names = [s["device_name"] for s in active_sessions]
        self.assertIn("Device A (Chrome)", device_names)
        self.assertIn("Device B (Safari Mobile)", device_names)

        # Revoke Device A's session from Device B
        session_a_id = next(s["id"] for s in active_sessions if s["device_name"] == "Device A (Chrome)")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_b}")
        revoke_res = self.client.post(f"/api/v1/auth/sessions/{session_a_id}/revoke/")
        self.assertEqual(revoke_res.status_code, status.HTTP_200_OK)
        
        # Verify Session A is no longer active
        sessions_after = self.client.get("/api/v1/auth/sessions/")
        remaining_ids = [s["id"] for s in sessions_after.data]
        self.assertNotIn(session_a_id, remaining_ids)
