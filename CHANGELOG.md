# Changelog

All notable changes to this project will be documented here.

## [Unreleased] - 2026-09-14

### Security (deployed `25dea40c`)
- Closed an X-Forwarded-For throttle bypass (`NUM_PROXIES=1` + nginx passes the real peer IP) — login/OTP/lead rate limits now hold.
- Upload → stored-XSS closed: `core/upload_security.validate_upload` validates by magic bytes and stores a safe extension across all KYC/photo/logo paths; SVG rejected; `/media` served `nosniff` + sandbox CSP.
- OpenAPI schema + Swagger/Redoc restricted to admins (401 to anon).
- Password-reset OTP now uses `secrets`; production CSP + `Permissions-Policy` + HSTS added.
- Dependency patches: Django 5.2.16, Pillow 12.3.0, DRF 3.17.2, PyJWT 2.13, cryptography 50, sqlparse 0.6, + tooling.
- Server: app runs non-root as `subidha` (gunicorn/next/celery/beat); SSH key-only; firewall 22/80/443; DR backups root/`subidha`-only; OS patched, rebooted to kernel 6.8.0-139.
- KYC/PII media auth-gated: nginx denies `/media/.../kyc/`; served only via authenticated download endpoints.
- At-rest secret encryption key separation: `secret_crypto` is now `MultiFernet` keyed by `FIELD_ENCRYPTION_KEYS` (legacy `SECRET_KEY` fallback), rotatable via `manage.py rotate_field_secrets`. Fixes the "rotating SECRET_KEY breaks stored secrets" gap. Regression test added.

### Docs
- New interactive **Rules & Workflow Playbook** consolidating the rulebook + `docs/business-rules/*` per module.
- New `docs/business-rules/security-posture.md`; rulebook §41, hardening doc, and docs index updated.

## [0.1.0] - 2026-04-01

### Added
- Initial repository setup
- Backend and frontend project structure
- Base documentation
- Initial GitHub remote and main branch setup

### Focus
- Admin workflow refinement
- Payment correctness
- EMI operational stability
- Deployment readiness