"""Layer-B: secret_crypto (Fernet) contract.

Every stored secret (gateway keys, integration tokens, etc.) goes through this
one helper. Proving its contract once covers every caller: symmetric round-trip,
real ciphertext, graceful handling of tampered input, and that the key is derived
from SECRET_KEY (so ciphertext is unreadable under a different key).
"""
from django.test import SimpleTestCase, override_settings

from subscriptions.services.secret_crypto import decrypt_secret, encrypt_secret


class SecretCryptoContractTest(SimpleTestCase):
    def test_round_trip(self):
        for plain in ("hunter2", "a", "sk_live_" + "x" * 64, "unicode: ✓ ₹ 日本"):
            self.assertEqual(decrypt_secret(encrypt_secret(plain)), plain)

    def test_empty_is_passthrough(self):
        self.assertEqual(encrypt_secret(""), "")
        self.assertEqual(decrypt_secret(""), "")

    def test_ciphertext_is_not_plaintext(self):
        cipher = encrypt_secret("super-secret-value")
        self.assertNotEqual(cipher, "super-secret-value")
        self.assertNotIn("super-secret-value", cipher)

    def test_tampered_ciphertext_returns_empty(self):
        cipher = encrypt_secret("value")
        tampered = ("A" if cipher[0] != "A" else "B") + cipher[1:]
        self.assertEqual(decrypt_secret(tampered), "")
        self.assertEqual(decrypt_secret("not-even-a-token"), "")

    def test_key_is_bound_to_secret_key(self):
        cipher = encrypt_secret("value")
        # A different SECRET_KEY derives a different Fernet key -> cannot decrypt.
        with override_settings(SECRET_KEY="a-totally-different-secret-key"):
            self.assertEqual(decrypt_secret(cipher), "")
