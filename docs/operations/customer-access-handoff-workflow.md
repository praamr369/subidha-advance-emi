# Customer Access Handoff Workflow

This document describes the current supported customer credential handoff path in SUBIDHA CORE after the customer access onboarding pass.

It is based on the code that exists today. It does not assume any fake password email or unsupported bulk credential workflow.

## 1. Confirmed capability in code

### Manual admin customer create

- Admin customer create requires a customer login at creation time.
- Backend contract: `POST /api/v1/admin/customers/`
- Required login fields in that flow:
  - `username`
  - `password`

This means manual create can provision immediate customer login access, but the password exists only at the moment the admin enters it.

### Customer CSV import

- Backend import exists:
  - preview: `POST /api/v1/admin/customers/import/preview/`
  - commit: `POST /api/v1/admin/customers/import-csv/`
- CSV import creates a customer user with:
  - generated username
  - generated random password
- The generated password is not returned by the backend response.

This means CSV import is safe for profile preload, but not enough by itself for direct password handoff.

### Public OTP reset flow

Confirmed backend endpoints:

- `POST /api/v1/auth/forgot-password/`
- `POST /api/v1/auth/resend-reset-otp/`
- `POST /api/v1/auth/reset-password/`

Confirmed identifier lookup rules in backend:

- phone
- email
- username

Confirmed eligible public reset roles:

- `CUSTOMER`
- `PARTNER`

Confirmed delivery behavior in backend:

- SMS when configured
- email fallback when enabled and an email exists
- console only in local debug mode

## 2. Recommended live workflow

### Preferred ongoing handoff

Use OTP reset as the standard ongoing customer access handoff.

Why:

- no plaintext password needs to be stored after onboarding
- works for both manually created and CSV-imported customers
- creates an auditable reset request record in backend

### Manual create workflow

1. Create the customer in `/admin/customers/create`.
2. Give the customer the username through the approved staff-to-customer channel.
3. If the initial password was not handed off securely, or if you want the customer to choose their own password immediately, open the OTP reset flow using the customer phone, email, or username.
4. Ask the customer to complete the reset on:
   - `/forgot-password`
   - then `/reset-password`

### CSV import workflow

1. Import customer rows from `/admin/customers`.
2. Use the generated username for operator reference only.
3. Do not try to recover or guess the generated password. The backend does not return it.
4. Start OTP reset for the customer using the phone number shown in the import result or the customer detail page.

## 3. Current operator entry points

These surfaces now expose the access handoff path:

- `/admin/customers/create`
  - success panel shows username, reset identifier, and `Start OTP Reset`
- `/admin/customers`
  - CSV import result shows `Start OTP Reset` for imported rows
- `/admin/customers/{id}`
  - detail page shows `Access Handoff` with login username, reset identifier, and OTP reset action
- `/forgot-password`
  - accepts phone, email, or username
- `/reset-password`
  - accepts manual OTP entry and supports OTP resend

## 4. What ops should tell the customer

Use this sequence:

1. Go to the login page.
2. If you do not know your password, choose `Forgot password`.
3. Enter your phone number, email, or username.
4. Wait for the 6-digit reset code.
5. Enter that code and choose a new password.

Do not tell customers that a password-reset link will arrive unless your delivery channel actually sends one. The current backend sends OTP codes, not reset links.

## 5. Safe fallback rules

- Preferred: OTP reset.
- Acceptable only when necessary: admin creates or changes a password directly and hands it off through a controlled one-to-one channel.
- Do not store plaintext passwords in shared spreadsheets, chat groups, tickets, or source files.
- Do not promise instant customer portal access if OTP delivery is not configured for the active environment.

## 6. Current blockers and limits

- There is still no dedicated admin UI for password reset request history even though backend admin endpoints exist.
- OTP delivery depends on environment configuration.
- If production SMS is not configured and the customer has no valid email, OTP reset cannot be delivered.
- Customer CSV import remains a preload workflow, not a complete credential handoff workflow by itself.
