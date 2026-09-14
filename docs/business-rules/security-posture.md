# Security Posture (2026-09-14 hardening)

What is enforced in production after the 2026-09-14 security pass. The GitHub
repository is **public**, so every item here closes a weakness that is
discoverable by reading the code. Treat this file as the source of truth for the
security rules; the interactive [Rules & Workflow Playbook](../SUBIDHA_CORE_PROJECT_RULEBOOK.md)
summarises it alongside every other module.

Production reference at time of writing: commit `25dea40c`, kernel `6.8.0-139`,
app runs non-root as `subidha`, SSH key-only.

## Application (deployed in `25dea40c`)

- **Throttle identity is trusted, not spoofable.** `REST_FRAMEWORK["NUM_PROXIES"] = 1`
  (`backend/core/settings/base.py`) plus nginx passing `X-Forwarded-For $remote_addr`
  means DRF derives the client IP from the single trusted proxy hop. A
  client-supplied `X-Forwarded-For` can no longer mint a fresh anon-throttle
  bucket per request, so the login / OTP / password-reset / public-lead rate
  limits actually hold. **Rule:** never read a client-supplied forwarded header
  as the client identity; there is exactly one proxy (nginx), no CDN in front.
- **Uploads are validated by content, not by the client's claim.**
  `core/upload_security.validate_upload` checks the real magic-byte signature
  (JPG/PNG/PDF, or webp/gif where images are allowed) and rewrites the stored
  filename to a safe extension for the detected type. Wired into customer /
  partner / vendor / staff KYC (self + admin), the customer profile photo, and
  the business-logo upload. **SVG is rejected** for images (XML can carry inline
  script). **Rule:** every new upload path goes through `validate_upload`; never
  trust `content_type`; never persist the client filename extension.
- **`/media` cannot execute as script.** nginx serves `/media` with
  `X-Content-Type-Options: nosniff` and a sandbox CSP
  (`default-src 'none'; sandbox; style-src 'unsafe-inline'`), so an uploaded
  HTML/SVG/JS body is inert even on our own origin. This is the belt behind the
  content validation above.
- **KYC/PII documents are not publicly reachable.** nginx denies direct access to
  `/media/(customers|partners|vendors|staff)/kyc/` (403, verified against a real
  file). Those files are served **only** through authenticated Django download
  endpoints (`/api/v1/.../kyc-documents/{id}/download/`, `FileResponse` streamed
  from disk with a permission check), so admin/self review still works while an
  unauthenticated URL cannot fetch them. Profile photos, POD, the document vault,
  HR employee documents, and product media stay served (distinct paths). **Rule:**
  a new PII document path is served through an authenticated endpoint and denied
  under `/media`, never linked as a raw `/media` URL.
- **The API map is not public.** `/api/schema/`, `/api/docs/`, `/api/redoc/` are
  admin-only (`IsAdmin`) and return 401 to anonymous callers. **Rule:** do not
  re-open the schema/docs to anonymous users.
- **OTP uses a CSPRNG.** `accounts/services/password_reset_service.generate_numeric_otp`
  uses `secrets`, not `random`. **Rule:** any security credential (OTP, token,
  nonce) uses `secrets`.
- **Browser security headers on pages.** The Next app sends a production
  Content-Security-Policy (locks `object-src`/`base-uri`/`frame-ancestors`/
  `form-action`; `connect-src` derives from `NEXT_PUBLIC_API_BASE_URL` so it is
  same-origin-tight in prod but works under the Playwright cross-origin smoke),
  plus `Permissions-Policy`. nginx adds HSTS on every response and `server_tokens off`.
  The CSP is production-only so dev HMR keeps its `eval`.
- **Dependencies patched** to OSV-reported fixes: Django 5.2.16, Pillow 12.3.0,
  DRF 3.17.2, PyJWT 2.13, cryptography 50, sqlparse 0.6, plus tooling.

## Server / infrastructure

- **App runs non-root.** gunicorn, next, celery, and celery-beat run as the
  system user `subidha` (systemd drop-ins `/etc/systemd/system/subidha-*.service.d/nonroot.conf`),
  not root. `media`, `.next`, and `/var/lib/subidha` are `subidha`-owned;
  `deploy.sh` re-chowns `.next` + `media` after each build (guarded by
  `id subidha`). gunicorn passes `--no-control-socket` (its default socket path
  is a root-owned dir the non-root user can't write). **Rollback:** remove the
  four drop-ins + `daemon-reload` + restart.
- **SSH is key-only.** `/etc/ssh/sshd_config.d/00-hardening.conf`:
  `PasswordAuthentication no`, `PermitRootLogin prohibit-password`,
  `KbdInteractiveAuthentication no`, `X11Forwarding no`, `MaxAuthTries 3`. The
  root password is kept **only** for the Hostinger VNC recovery console.
- **Firewall** allows 22 / 80 / 443 only (Hostinger firewall 270387); the stray
  port-3000 rule was removed. SSH is intentionally **not** IP-pinned because the
  owner's ISP IP is dynamic — key-only is the control.
- **Backups are restricted.** `scripts/server/backup.sh` writes the DR backups in
  `/var/backups/subidha` owned root/`subidha` with `0750`/`0640` (postgres,
  www-data, and other users are shut out). The in-app backup feature writes to a
  separate `subidha`-owned dir (`BACKUP_ROOT=/var/www/subidha/ondemand-backups`)
  so a compromised app cannot tamper with the DR backups.
- **OS patched** (22 packages), pip 26.2.1, rebooted into kernel 6.8.0-139.

## Verified clean

Live `SECRET_KEY` / JWT signing key / DB password are **not** in git history; the
old admin password leaked in `reset-live-state.env` matches no production user;
DB / Redis / pgbouncer / app ports are localhost-only; TLS 1.2/1.3 only;
`check --deploy` raises no security warnings; `npm audit` is clean; Monarx malware
scanner installed.

## Open / deferred

- **Auth-gated KYC & media downloads — CLOSED 2026-09-14.** KYC subpaths are now
  denied at nginx and served only through authenticated endpoints (see above). No
  frontend change was needed — nothing linked the raw URLs. A wider tightening
  (denying `subscriptions/` contract/receipt docs and `data_requests/` exports)
  is a possible future step, but those already expose no raw `/media` URL and are
  downloaded through endpoints; leave them served until a raw-URL consumer is
  confirmed absent for each.
- **app↔DB TLS** (`sslmode=require`) and **field-level PII encryption at rest**
  remain the open items — tracked in `docs/DATA_ENCRYPTION_AND_HARDENING.md`.

## Rules for future changes

- Never weaken any control above to make a test or feature pass — fix the caller.
- Never build a public/prod feature on a Next `/api/*` route: prod nginx sends all
  `/api/*` to Django, so those handlers 404 in production. Use a Django endpoint
  or client-side state.
- Never commit a real secret; rotate immediately on any suspected exposure.
- Keep the repo's public-ness in mind: assume an attacker has read the code.
