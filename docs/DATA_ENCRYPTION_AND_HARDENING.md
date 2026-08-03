# Data Encryption & Hardening

How secrets and sensitive data are protected today, the gaps, and a concrete,
future-proof plan for the safest possible posture — sized for a **solo operator**
who must be able to run and reason about it alone.

---

## 1. Current state (as built)

**Application-level secret encryption** — `subscriptions/services/secret_crypto.py`:
- Uses `cryptography.fernet.Fernet` (AES-128-CBC + HMAC-SHA256, authenticated).
- The key is derived at call time: `base64(SHA256(settings.SECRET_KEY))`.
- Used for at-rest secrets such as SMTP passwords (`email_smtp_settings`) via
  `encrypt_secret()` / `decrypt_secret()`.

**Transport & session:**
- JWT auth (SimpleJWT) with short access tokens, refresh rotation, and blacklist.
- `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS` are **enforced** — the app
  refuses to boot with credentials-enabled CORS and no explicit origins outside
  local dev.
- `check_production_readiness` requires, for prod: `DEBUG=False`, `ALLOWED_HOSTS`
  set, `SESSION_COOKIE_SECURE` + `CSRF_COOKIE_SECURE` on, a non-placeholder
  `SECRET_KEY`, no `*` in `CORS_ALLOWED_ORIGINS`, a Redis broker, and an existing
  `BACKUP_ROOT`.

**Access control:** role + capability matrix (server-enforced), role-aware
throttling, and an append-only-style `audit.AuditLog` on mutating actions.

## 2. Risks / gaps to close

| # | Risk | Why it matters |
|---|---|---|
| R1 | **Encryption key is derived from `SECRET_KEY`** | Rotating `SECRET_KEY` (a routine security action) silently **breaks decryption** of every stored secret. Key rotation is impossible without re-encrypting. |
| R2 | **No key versioning** | A single Fernet key; a leak forces a big-bang re-encrypt with downtime. |
| R3 | **PII at rest is not field-encrypted** | Customer phone/KYC identifiers rely on DB/disk security only (some fields are masked, not encrypted). |
| R4 | **Backup encryption not guaranteed** | A backup file is a full copy of the business; if unencrypted it is the softest target. |
| R5 | **Key material lives in env/settings** | Acceptable, but must never be in the repo, and should be rotatable. |

## 3. Target posture (future-proof, safest) — do these in order

### 3.1 Split the encryption key from `SECRET_KEY` (fixes R1/R2) — highest priority
- Introduce a dedicated env var `FIELD_ENCRYPTION_KEYS` (comma-separated Fernet
  keys, newest first) independent of `SECRET_KEY`.
- Change `secret_crypto` to a **`MultiFernet`**: encrypt with the first key,
  decrypt by trying all. This makes rotation a **non-breaking, zero-downtime**
  operation: prepend a new key, re-encrypt lazily on next write (or with a
  one-shot management command), then drop the old key later.
- Migration: on deploy, decrypt-with-old / encrypt-with-new for existing rows via
  a management command; keep the old key present until the pass completes.

```python
# secret_crypto.py (target shape)
from cryptography.fernet import MultiFernet, Fernet
def _mf():
    keys = [k.strip() for k in settings.FIELD_ENCRYPTION_KEYS if k.strip()]
    return MultiFernet([Fernet(k) for k in keys])   # first = primary
```

### 3.2 Encrypt PII at rest (fixes R3)
- Identify the sensitive columns (customer phone, KYC document identifiers,
  guarantor details, bank/UPI handles) and store them with the same
  `MultiFernet` layer, or adopt a field library (`django-fernet-fields`-style)
  bound to `FIELD_ENCRYPTION_KEYS`.
- Keep a **searchable blind index** (HMAC of the normalized value with a separate
  key) for fields you must look up by (e.g. phone), so encryption doesn't break
  lookups. Never index the plaintext.
- Continue to **mask** (not just encrypt) in API responses and logs.

### 3.3 Database & disk (defense in depth)
- **At rest:** enable full-disk/volume encryption on the VPS data disk, and/or
  Postgres cluster encryption. Application-level field encryption (3.1/3.2) is the
  primary control; disk encryption is the backstop.
- **In transit to the DB:** require TLS on the Postgres connection (`sslmode=require`).
- Consider `pgcrypto` only for DB-side needs; prefer app-level so keys never sit
  in the DB.

### 3.4 Transport hardening
- `SECURE_SSL_REDIRECT = True`, `SECURE_HSTS_SECONDS` (long, with
  `includeSubDomains` + preload once stable), `SESSION_COOKIE_SECURE` /
  `CSRF_COOKIE_SECURE = True`, `SECURE_PROXY_SSL_HEADER` behind the reverse proxy.
- Keep `CORS_ALLOWED_ORIGINS` explicit (no wildcard) — already enforced.

### 3.5 Backups (fixes R4)
- Encrypt every backup artifact (age/gpg or the field-encryption key) before it
  leaves the box; store off-box.
- **Test restores** on a clone are part of the go-live checklist — an untested
  backup is not a backup.

### 3.6 Key management & rotation (operational, solo-friendly)
- Keys in environment variables injected at deploy (or a secrets manager) —
  never in the repo, never in `settings/*.py`.
- Document a **rotation runbook**: add new key → deploy → run re-encrypt command →
  verify → remove old key. With `MultiFernet` this is safe and reversible.
- Rotate `SECRET_KEY`, `FIELD_ENCRYPTION_KEYS`, JWT signing key, and DB
  credentials on a schedule and immediately on any suspected exposure.

## 4. Solo-operator control at this stage

The point of the above is that **one person can safely own the whole app**:
- Everything sensitive is behind two clearly-named key sets (`FIELD_ENCRYPTION_KEYS`,
  JWT signing) and a small set of prod settings the readiness command validates.
- Rotation is a documented, non-breaking command — not a scary migration.
- The audit log + role/capability matrix mean the operator can always answer
  "who changed what" and "who can do what".
- The pre-production checklist + inventories mean the operator can prove the whole
  surface still works before each release without re-learning the system.

## 5. Definition of "safe to go live" (encryption/security)

- [ ] `FIELD_ENCRYPTION_KEYS` set (separate from `SECRET_KEY`); `secret_crypto` is `MultiFernet`.
- [ ] Sensitive PII columns encrypted at rest; lookups via blind index, not plaintext.
- [ ] TLS enforced end-to-end (client↔app, app↔DB); HSTS + secure cookies on.
- [ ] `check_production_readiness` passes with production settings.
- [ ] Encrypted, off-box backups with a **verified** restore.
- [ ] Redis cache backend (not LocMemCache) in prod.
- [ ] Key-rotation runbook written and rehearsed once.
- [ ] No secret or key present anywhere in the git repo.
