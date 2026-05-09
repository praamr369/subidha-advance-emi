# Phase 9F Go-Live Operational Dry Run

Date: 2026-04-29

Scope: final pre-deployment verification for SUBIDHA CORE. This is not a feature expansion phase. The dry run must use real endpoints and staging/operator data only; do not commit large generated datasets or fake business rows to source code.

## Verdict Inputs

- Backend reset, BI, AI, permission, and collection readiness are covered by automated tests and service/API inspection.
- Frontend readiness depends on `npm --prefix frontend run typecheck`, `lint`, `build`, and release-candidate smoke.
- Full shop workflow confirmation must be run on staging after the zero-data reset, because it validates PDFs, browser routing, public pages, operator permissions, and deployment-specific storage.

## Part A - Zero-Data Reset Dry Run

Endpoints:

- Preview: `GET /api/v1/admin/business-setup/reset-preview/?preserve_username=<admin_username>`
- Execute: `POST /api/v1/admin/business-setup/reset/`
- UI: `/admin/settings/business-setup/checklist`

Confirmed behavior:

- Preview is read-only and returns `reset_plan.targets`, `reset_plan.auth_artifacts`, `preserved_users`, and warnings.
- Execution is admin-only and can only be run by the admin username being preserved.
- Execution now requires `confirm` to be a JSON boolean `true`; string values such as `"true"` are rejected.
- With `delete_non_preserved_users=true`, only the preserved admin user remains.
- Operational app data covered by reset policy is cleared.
- The post-reset setup checklist returns missing required items instead of silently passing.

Dry-run steps:

1. Log in as the admin account that must survive reset.
2. Run reset preview and save the response summary outside git.
3. Confirm `preserved_users` contains exactly one row and it is the intended admin.
4. Confirm planned deletion counts include operational apps.
5. Attempt execution with missing `confirm` and with `confirm=false`; both must fail.
6. Attempt execution with `"confirm": "true"`; it must fail.
7. Execute with `"confirm": true`.
8. Confirm only the chosen admin can log in.
9. Confirm setup checklist shows required items missing.
10. Confirm covered operational models have no rows.

## Part B - Setup From Zero Dry Run

Required setup order:

1. Business profile: `/admin/settings/business-setup/profile`
2. Branch: `/admin/branches`
3. Cash desk/counter: `/admin/counters`
4. Staff/cashier: `/admin/settings/users`
5. Finance accounts: `/admin/accounting/chart-of-accounts`
6. COA/account mapping: `/admin/accounting/setup`
7. Product: `/admin/products/create`
8. Batch: `/admin/batches/create`
9. Lucky ID availability: `/admin/lucky-ids`
10. Public site profile: `/admin/settings/business-setup/public-site`

Readiness gate:

- `/api/v1/admin/business-setup/checklist/` must show all required items complete before live collection.
- Recommended items such as accounting periods, document sequences, cashier users, and batches should be completed before first real counter opening.

## Part C - Advance EMI Workflow

Dry-run path:

1. Create customer.
2. Create product.
3. Create batch.
4. Create Advance EMI contract.
5. Confirm `ContractReference` is generated.
6. Confirm EMI schedule is generated.
7. Collect an EMI as admin.
8. Collect an EMI as cashier.
9. Generate receipt PDF.
10. Confirm customer dashboard/payment visibility.
11. Run lucky draw.
12. Confirm winner benefit waives future EMI only.
13. Generate delivery/handover PDF.

Automated coverage:

- EMI financial integrity and future-only winner waiver are covered in `subscriptions.tests`.
- Customer dashboard payment/winner visibility is covered in customer API tests.
- Receipt and delivery PDFs are rendered from bytes, not raw file paths.

## Part D - Direct Sale Workflow

Dry-run path:

1. Create or select customer.
2. Create direct sale.
3. Confirm invoice is generated.
4. Confirm `ContractReference` is generated.
5. Post partial payment.
6. Post full payment.
7. Generate receipt PDF.
8. Generate invoice PDF.
9. Generate delivery/PDF if delivery is required.
10. Confirm customer dashboard visibility where the customer is linked.

Confirmed behavior:

- Direct-sale collection stays separate from EMI allocation.
- Direct-sale later collection requires an invoiced sale and posted retail invoice.
- Direct-sale references are searchable through unified receivables.

## Part E - Rent/Lease Workflow

Dry-run path:

1. Create rent contract.
2. Create lease contract.
3. Record security deposit.
4. Generate deposit PDF.
5. Confirm monthly demand visibility.
6. Generate return inspection PDF.
7. Generate refund/deduction PDFs.
8. Confirm rent/lease unified collection remains disabled.

Confirmed behavior:

- Rent/lease receivables can be searched and viewed.
- Unified rent/lease collection is intentionally disabled until a production-safe posting service exists.
- Disabled rows show a reason.

## Part F - Unified Collection Workflow

Admin search must support:

- Phone
- Contract reference
- Lucky ID
- Batch
- Direct-sale reference

Cashier search must support:

- Phone
- Contract reference

Confirmed behavior:

- Unsupported rent/lease payment action is not exposed.
- Disabled actions include a reason.
- Double-submit protection exists through idempotency handling and duplicate reference detection in posting services.
- Slow-network timeout handling exists in admin and cashier collection pages.
- Last payment summary is shown after successful admin/cashier EMI collection.

## Part G - BI Control Center Readiness

Route:

- `/admin/bi`

API:

- `GET /api/v1/admin/bi/summary/`

Confirmed behavior:

- Admin-only backend access.
- Frontend now calls the correct canonical `/admin/bi/summary/` API path through the normalized API client.
- BI chart cards show report/navigation links only; the prior "Take Action" link was removed.
- Charts/cards consume real API payloads and expose empty states.
- Reserved stock is not shown as a fake BI metric.
- AI explanation panel uses AI only when enabled and handles disabled state safely.
- BI has no mutation endpoint.

## Part H - AI Phase 8 Readiness

Routes:

- `/admin/ai`
- `/admin/ai/sources`
- `/admin/ai/query-log`
- `/admin/ai/readiness`

API:

- `/api/v1/admin/ai/health/`
- `/api/v1/admin/ai/sources/`
- `/api/v1/admin/ai/query/`
- `/api/v1/admin/ai/feedback/`
- `/api/v1/admin/ai/bi-explain/`
- `/api/v1/admin/ai/readiness/`

Confirmed behavior:

- AI is disabled by default with `AI_ASSISTANT_ENABLED=false`.
- Admin receives controlled disabled state when AI is off.
- Non-admin users are blocked.
- Query endpoint is read-only and logs the answer, retrieved chunks, and safety state.
- Grounded answers require approved chunks/citations; no-source queries return low-confidence no-source response.
- Feedback endpoint records admin feedback.
- Ingestion blocks secret-like filenames/content.
- Customer/private contract ingestion is blocked by policy.
- No financial action API exists under AI.

## Part I - Permissions/Security

Required checks:

- Customer cannot access another customer's data or PDFs.
- Partner cannot access unrelated customer/subscription/payment records.
- Cashier cannot access admin-only APIs.
- Public cannot access protected APIs.
- PDF endpoints stream generated PDFs and do not expose raw filesystem paths.
- JWT refresh/logout work.
- Admin-only setup/reset endpoints are protected.

Confirmed coverage:

- Existing customer, partner, cashier, auth, and business setup tests cover these boundaries.
- Phase 9F adds reset boolean and admin-only BI/unified collection coverage to `api.v1.tests`.

## Part J - Backup/Restore Dry Run

Runbook:

- `docs/operations/backup-restore-runbook.md`
- `docs/deployment/vps-deployment-guide.md`

Required commands:

```bash
pg_dump --format=custom --file=/var/backups/subidha/db-$(date +%F).dump "$DATABASE_URL"
rsync -a --delete /srv/subidha-core/media/ /var/backups/subidha/media/
pg_restore --clean --if-exists --no-owner --dbname="$STAGING_DATABASE_URL" /var/backups/subidha/db-YYYY-MM-DD.dump
rsync -a /var/backups/subidha/media/ /srv/subidha-core/media/
```

After restore:

- `GET /healthz/` returns 200.
- `GET /readyz/` returns 200.
- Admin login succeeds.
- Customer/partner scoped checks still pass.

## Part K - Performance/Readiness Smoke

Do not commit generated load data.

Staging-only targets:

- 1000 customers
- 100 batches
- 10000 EMI rows
- 5000 payments
- 1000 invoices/receipts

Record:

- dashboard load time
- receivable search speed
- customer profile speed
- cashier payment speed
- PDF generation time

Acceptance guidance:

- Dashboard and customer profile should remain operational under staff use.
- Receivable search should return within the operator's normal counter flow.
- Payment posting and PDF generation must remain auditable even if slower than dashboard reads.

## Part L - Deployment Readiness

Verify before deploy:

- `DJANGO_DEBUG=false`
- `DJANGO_ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `DJANGO_SECRET_KEY` and `JWT_SIGNING_KEY`
- PostgreSQL env via `DATABASE_URL` or explicit DB keys
- static/media paths and Nginx aliases
- PDF/media storage paths
- Gunicorn command
- Next.js build/start command
- Nginx reverse proxy
- HTTPS/Certbot
- systemd services
- backup cron
- restore runbook
- health checks

## Phase 9F Validation Commands

Run from repo root unless noted:

```bash
cd backend
../.venv/bin/python manage.py check
../.venv/bin/python manage.py makemigrations --check --dry-run
../.venv/bin/python manage.py test api.v1.tests subscriptions.tests ai_assistant --settings core.settings.test
cd ..
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
bash scripts/run-release-candidate.sh
```

