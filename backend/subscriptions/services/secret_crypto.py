"""At-rest secret encryption (Fernet), with a rotatable, SECRET_KEY-independent key.

History / why this shape
------------------------
Originally the Fernet key was derived from ``SECRET_KEY`` (``SHA256(SECRET_KEY)``).
That coupled two unrelated concerns: rotating ``SECRET_KEY`` — a routine security
action — silently broke decryption of every stored secret (R1/R2 in
docs/DATA_ENCRYPTION_AND_HARDENING.md).

This module now uses a ``MultiFernet``:

* Encryption always uses the **primary** key — the first entry of the
  ``FIELD_ENCRYPTION_KEYS`` setting when it is configured, otherwise the legacy
  ``SECRET_KEY``-derived key (so an environment that has not set the new var
  behaves exactly as before).
* Decryption tries every configured key **and** the legacy ``SECRET_KEY``-derived
  key, so secrets written before key separation still open, and a key can be
  rotated with zero downtime: prepend a new key to ``FIELD_ENCRYPTION_KEYS``,
  deploy, run ``manage.py rotate_field_secrets`` to re-encrypt under it, then drop
  the old key later.

Key format: each ``FIELD_ENCRYPTION_KEYS`` entry is a urlsafe-base64 32-byte
Fernet key, e.g. ``python -c "from cryptography.fernet import Fernet;
print(Fernet.generate_key().decode())"``. Keys live only in the environment,
never in the repo.
"""
import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from django.conf import settings

logger = logging.getLogger("security")


def _legacy_key() -> bytes:
    """The original key derived from SECRET_KEY. Kept last in the decrypt set for
    backward compatibility with secrets written before key separation."""
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _configured_fernets() -> list[Fernet]:
    """Fernets built from FIELD_ENCRYPTION_KEYS (newest first). Invalid entries are
    skipped with a warning rather than taking down the legacy fallback."""
    fernets: list[Fernet] = []
    for raw in getattr(settings, "FIELD_ENCRYPTION_KEYS", None) or []:
        key = raw.encode("utf-8") if isinstance(raw, str) else raw
        try:
            fernets.append(Fernet(key))
        except (ValueError, TypeError):
            logger.warning("secret_crypto.invalid_field_encryption_key_skipped")
    return fernets


def _multifernet() -> MultiFernet:
    # Primary (encrypts) = configured key if present, else the legacy key.
    # Legacy key is always appended so old ciphertexts still decrypt.
    fernets = _configured_fernets()
    fernets.append(Fernet(_legacy_key()))
    return MultiFernet(fernets)


def encrypt_secret(plain_text: str) -> str:
    if not plain_text:
        return ""
    return _multifernet().encrypt(plain_text.encode("utf-8")).decode("utf-8")


def decrypt_secret(cipher_text: str) -> str:
    if not cipher_text:
        return ""
    try:
        return _multifernet().decrypt(cipher_text.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return ""


def rotate_secret(cipher_text: str) -> str:
    """Re-encrypt an existing ciphertext under the current primary key without
    needing the plaintext. Used by the ``rotate_field_secrets`` command. Returns
    the input unchanged if it cannot be decrypted (so a rotation pass never
    destroys an unreadable value)."""
    if not cipher_text:
        return ""
    try:
        return _multifernet().rotate(cipher_text.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return cipher_text
