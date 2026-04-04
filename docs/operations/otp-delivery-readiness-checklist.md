# OTP Delivery Readiness Checklist

This checklist documents the real OTP delivery behavior currently supported in SUBIDHA CORE.

It is based on the current code path in `accounts.services.otp_delivery_service` and `accounts.services.password_reset_service`.

## 1. Confirmed delivery behavior in code

- Public reset endpoints exist:
  - `POST /api/v1/auth/forgot-password/`
  - `POST /api/v1/auth/resend-reset-otp/`
  - `POST /api/v1/auth/reset-password/`
- Eligible public reset roles are:
  - `CUSTOMER`
  - `PARTNER`
- Identifier lookup supports:
  - `phone`
  - `email`
  - `username`
- OTP values are stored as hashes in `PasswordResetRequest`.
- Password reset request activity is auditable through `AuditLog`.

## 2. Confirmed channel status

### SMS

- Current status: not production-ready
- Reason: `send_password_reset_otp_via_sms()` is still a placeholder and raises `OTPDeliveryError("SMS backend is not configured.")`
- Ops rule: do not promise SMS OTP delivery for live onboarding

### Email fallback

- Current status: supported
- Delivery path: Django `send_mail`
- Required settings:
  - `EMAIL_BACKEND`
  - `DEFAULT_FROM_EMAIL`
- Usually required for SMTP deployments:
  - `EMAIL_HOST`
  - `EMAIL_PORT`
  - `EMAIL_USE_TLS` or `EMAIL_USE_SSL`
  - `EMAIL_HOST_USER`
  - `EMAIL_HOST_PASSWORD`
- Ops rule: treat email fallback as live only after one real reset test succeeds in the target environment

### Console delivery

- Current status: development-only
- Used when:
  - `DEBUG=true` and `OTP_DELIVERY_BACKEND=console`
  - or `DEBUG=true` and `OTP_DELIVERY_BACKEND=auto` falls back to console
- Ops rule: never treat console delivery as production-ready customer access

## 3. Required environment variables for readiness

- `OTP_DELIVERY_BACKEND`
  - allowed: `auto`, `sms`, `email`, `console`
  - recommended production value today: `auto`
- `OTP_ALLOW_EMAIL_FALLBACK=true`
- `PASSWORD_RESET_OTP_EXPIRY_MINUTES`
- `PASSWORD_RESET_OTP_MAX_ATTEMPTS`
- `PASSWORD_RESET_RESEND_COOLDOWN_SECONDS`
- `PASSWORD_RESET_MAX_RESENDS`
- `EMAIL_BACKEND`
- `DEFAULT_FROM_EMAIL`

Recommended when using SMTP:

- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_USE_TLS`
- `EMAIL_USE_SSL`
- `EMAIL_HOST_USER`
- `EMAIL_HOST_PASSWORD`

## 4. Admin visibility confirmed in code

- In-app admin visibility now exists at:
  - `/admin/customers/create`
  - `/admin/customers`
  - `/admin/customers/{id}`
- Admin readiness API now exists at:
  - `GET /api/v1/admin/system/otp-delivery-readiness/`
- Admin password reset request APIs already exist at:
  - `GET /api/v1/admin/password-reset-requests/`
  - `GET /api/v1/admin/password-reset-requests/{id}/`
  - `POST /api/v1/admin/password-reset-requests/{id}/resend/`
  - `POST /api/v1/admin/password-reset-requests/{id}/invalidate/`
- Current limitation:
  - password reset request history is still API-only and does not yet have a dedicated admin page

## 5. Pre-live checklist

1. Set `OTP_DELIVERY_BACKEND=auto`.
2. Keep `OTP_ALLOW_EMAIL_FALLBACK=true` until a real SMS provider exists in code.
3. Configure `EMAIL_BACKEND` and `DEFAULT_FROM_EMAIL`.
4. Load real email credentials from your secret manager or ops-managed env file.
5. Confirm `DEBUG=false` in the production environment.
6. Verify the admin readiness card reports `Fallback Ready` or `Ready`.
7. Run one real customer-facing reset using a test customer account.
8. Confirm the customer receives the OTP through the intended channel.
9. Confirm no OTP code is exposed in browser UI, server logs, or shared operator notes.
10. Confirm `AuditLog` and `PasswordResetRequest` records are created for the test reset.

## 6. Safe customer handoff rule

- Preferred live workflow:
  - create or import the customer
  - hand off username or approved identifier
  - direct the customer to OTP reset
- Do not store plaintext passwords in CSV files, shared docs, chat groups, or source control.
- Do not promise portal access if the readiness card shows `Not Ready` or `Dev Only`.

## 7. Honest current blockers

- SMS delivery is not implemented yet.
- Email fallback readiness still depends on real mail transport configuration and a successful live test.
- Admin reset request history and resend actions are still API-only, not a dedicated admin screen.
