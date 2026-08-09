"""Layer-B: permission-gate contracts (verify the shared gates once).

Hundreds of endpoints inherit their auth from a handful of permission classes.
Layer A proves *endpoints* don't leak; this proves the *gates themselves* admit
exactly the intended roles and nobody else. Together they mean: once a gate is
green here, every endpoint that uses it is correct by inheritance.
"""
from types import SimpleNamespace

from django.test import SimpleTestCase, TestCase, override_settings

from ai_assistant.permissions import AIAssistantDisabled, IsAdminAIEnabled
from api.v1.permissions import (
    IsAdmin,
    IsCashier,
    IsCashierOrAdmin,
    IsCustomer,
    IsPartner,
    IsPartnerOrAdmin,
    IsStaff,
    IsVendor,
)
from api.v1.views.admin_password_reset_requests import IsInternalAdmin

ALL_ROLES = ("ADMIN", "PARTNER", "CUSTOMER", "CASHIER", "VENDOR", "STAFF")

# gate class -> exact set of roles it must admit (everyone else + anon blocked).
GATE_ALLOWED = {
    IsAdmin: {"ADMIN"},
    IsPartner: {"PARTNER"},
    IsCustomer: {"CUSTOMER"},
    IsPartnerOrAdmin: {"PARTNER", "ADMIN"},
    IsCashier: {"CASHIER"},
    IsVendor: {"VENDOR"},
    IsStaff: {"STAFF"},
    IsCashierOrAdmin: {"CASHIER", "ADMIN"},
    IsInternalAdmin: {"ADMIN"},
}


def _request(role):
    """A minimal request whose user has `role` (role=None => anonymous)."""
    user = SimpleNamespace(
        is_authenticated=role is not None,
        role=role,
        is_staff=False,
        is_superuser=False,
    )
    return SimpleNamespace(user=user)


class PermissionGateContractTest(SimpleTestCase):
    def test_role_gates_admit_exactly_their_roles(self):
        failures = []
        for gate_cls, allowed in GATE_ALLOWED.items():
            gate = gate_cls()
            # every concrete role
            for role in ALL_ROLES:
                got = bool(gate.has_permission(_request(role), view=None))
                want = role in allowed
                if got != want:
                    failures.append(f"{gate_cls.__name__}: role={role} got={got} want={want}")
            # anonymous must always be denied
            if gate.has_permission(_request(None), view=None):
                failures.append(f"{gate_cls.__name__}: anonymous was ADMITTED")
        self.assertEqual(failures, [], msg="Gate contract violations:\n" + "\n".join(failures))

    def test_ai_gate_blocks_non_admin(self):
        gate = IsAdminAIEnabled()
        for role in ("PARTNER", "CUSTOMER", "CASHIER", "VENDOR", "STAFF"):
            self.assertFalse(gate.has_permission(_request(role), view=None))
        self.assertFalse(gate.has_permission(_request(None), view=None))

    @override_settings(AI_ASSISTANT_ENABLED=False)
    def test_ai_gate_admin_gets_controlled_503_when_disabled(self):
        gate = IsAdminAIEnabled()
        with self.assertRaises(AIAssistantDisabled):
            gate.has_permission(_request("ADMIN"), view=None)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_ai_gate_admin_allowed_when_enabled(self):
        gate = IsAdminAIEnabled()
        self.assertTrue(gate.has_permission(_request("ADMIN"), view=None))


class CapabilityGateContractTest(TestCase):
    """@require_capability: deny without the capability, allow with it."""

    def _run(self, user):
        from accounts.capabilities import require_capability

        class _View:
            @require_capability("verification.contract.probe")
            def act(self, request):
                return "ok"

        return _View().act(SimpleNamespace(user=user, path="/x", method="GET"))

    def test_denies_user_without_capability(self):
        from rest_framework.exceptions import PermissionDenied

        from django.contrib.auth import get_user_model

        user = get_user_model().objects.create_user(
            username="cap_denied", password="x", role="CUSTOMER", phone="9990010001",
        )
        with self.assertRaises(PermissionDenied):
            self._run(user)

    def test_allows_superuser(self):
        from django.contrib.auth import get_user_model

        user = get_user_model().objects.create_user(
            username="cap_super", password="x", role="ADMIN",
            phone="9990010002", is_staff=True, is_superuser=True,
        )
        self.assertEqual(self._run(user), "ok")
