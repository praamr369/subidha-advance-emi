"""Regression tests for at-rest secret encryption key separation + rotation.

Locks in that FIELD_ENCRYPTION_KEYS is used when set, that secrets written under
the legacy SECRET_KEY-derived key still decrypt (backward compat), and that
`rotate_secret` actually moves a value onto the new key — the core of the
zero-downtime rotation runbook. Pure logic, no DB (SimpleTestCase).
"""
from cryptography.fernet import Fernet
from django.test import SimpleTestCase, override_settings

from subscriptions.services import secret_crypto

KEY_A = Fernet.generate_key().decode()
KEY_B = Fernet.generate_key().decode()


class SecretCryptoTests(SimpleTestCase):
    def test_roundtrip_legacy_no_configured_keys(self):
        with override_settings(SECRET_KEY="secret-one", FIELD_ENCRYPTION_KEYS=[]):
            c = secret_crypto.encrypt_secret("hunter2")
            self.assertNotEqual(c, "hunter2")
            self.assertEqual(secret_crypto.decrypt_secret(c), "hunter2")

    def test_roundtrip_with_configured_key(self):
        with override_settings(SECRET_KEY="secret-one", FIELD_ENCRYPTION_KEYS=[KEY_A]):
            c = secret_crypto.encrypt_secret("app-pass")
            self.assertEqual(secret_crypto.decrypt_secret(c), "app-pass")

    def test_legacy_ciphertext_still_decrypts_after_key_added(self):
        # Written with only the SECRET_KEY-derived key...
        with override_settings(SECRET_KEY="secret-one", FIELD_ENCRYPTION_KEYS=[]):
            legacy_ct = secret_crypto.encrypt_secret("old-secret")
        # ...must still open once a dedicated key is configured (legacy fallback).
        with override_settings(SECRET_KEY="secret-one", FIELD_ENCRYPTION_KEYS=[KEY_A]):
            self.assertEqual(secret_crypto.decrypt_secret(legacy_ct), "old-secret")

    def test_rotation_moves_secret_onto_new_key(self):
        with override_settings(SECRET_KEY="secret-one", FIELD_ENCRYPTION_KEYS=[]):
            legacy_ct = secret_crypto.encrypt_secret("rotate-me")
        with override_settings(SECRET_KEY="secret-one", FIELD_ENCRYPTION_KEYS=[KEY_A]):
            rotated = secret_crypto.rotate_secret(legacy_ct)
        # After SECRET_KEY changes, the legacy fallback can no longer open the old
        # token — but the rotated token opens via the configured key, proving the
        # rotation actually re-keyed it.
        with override_settings(SECRET_KEY="secret-TWO", FIELD_ENCRYPTION_KEYS=[KEY_A]):
            self.assertEqual(secret_crypto.decrypt_secret(rotated), "rotate-me")
            self.assertEqual(secret_crypto.decrypt_secret(legacy_ct), "")

    def test_multi_key_decrypts_either(self):
        with override_settings(SECRET_KEY="s", FIELD_ENCRYPTION_KEYS=[KEY_B]):
            ct_b = secret_crypto.encrypt_secret("with-b")
        # New primary prepended, old key kept second: both must still decrypt.
        with override_settings(SECRET_KEY="s", FIELD_ENCRYPTION_KEYS=[KEY_A, KEY_B]):
            self.assertEqual(secret_crypto.decrypt_secret(ct_b), "with-b")
            ct_a = secret_crypto.encrypt_secret("with-a")
        with override_settings(SECRET_KEY="s", FIELD_ENCRYPTION_KEYS=[KEY_A, KEY_B]):
            self.assertEqual(secret_crypto.decrypt_secret(ct_a), "with-a")

    def test_invalid_configured_key_is_skipped_not_fatal(self):
        with override_settings(SECRET_KEY="s", FIELD_ENCRYPTION_KEYS=["not-a-valid-fernet-key"]):
            # Falls back to the legacy key rather than raising.
            c = secret_crypto.encrypt_secret("still-works")
            self.assertEqual(secret_crypto.decrypt_secret(c), "still-works")

    def test_empty_and_garbage(self):
        with override_settings(SECRET_KEY="s", FIELD_ENCRYPTION_KEYS=[KEY_A]):
            self.assertEqual(secret_crypto.encrypt_secret(""), "")
            self.assertEqual(secret_crypto.decrypt_secret(""), "")
            self.assertEqual(secret_crypto.decrypt_secret("not-a-token"), "")
