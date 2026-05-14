# Policy Publishing Workflow

## Objective
Publish legal/policy pages with admin-only governance and public read safety.

## Steps
1. Seed editable defaults (draft)
   - Admin page: `/admin/settings/policies`
   - API: `POST /api/v1/admin/public-site/policies/seed-defaults/`
   - Command: `python manage.py seed_policy_pages`
2. Edit draft
   - Admin route: `/admin/settings/policies/[slug]`
   - API: `PATCH /api/v1/admin/public-site/policies/<id>/`
3. Legal review checkpoint
   - Confirm wording, category, and effective date.
   - Confirm no fake registration claims and no unsupported promises.
4. Publish
   - API: `POST /api/v1/admin/public-site/policies/<id>/publish/`
   - Result: policy becomes publicly readable.
5. Update after publication
   - Create a new draft version from published row:
   - API: `POST /api/v1/admin/public-site/policies/<id>/create-draft/`
   - Edit and publish the new version.
6. Archive when retired
   - API: `POST /api/v1/admin/public-site/policies/<id>/archive/`

## Public behavior guarantee
- Only `PUBLISHED` rows are returned by:
  - `GET /api/v1/public/policies/`
  - `GET /api/v1/public/policies/<slug>/`
- Draft/archived rows are not exposed publicly.

## Audit
- Publish/archive/draft creation and edits are logged through audit service events under `PUBLIC_SITE_UPDATED` metadata.
