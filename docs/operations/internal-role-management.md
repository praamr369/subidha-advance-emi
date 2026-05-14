# Internal Role Management

## Roles in system
Core user roles include `ADMIN`, `CASHIER`, `PARTNER`, `CUSTOMER`, and `VENDOR`.

## Internal user management contract
Internal user management is handled through admin-only routes:
- `/api/v1/admin/internal-users/`
- `/api/v1/admin/internal-users/create/`
- `/api/v1/admin/internal-users/<id>/`

Admin flow controls:
- only admin can create/modify internal users
- self-deactivation and last-active-admin demotion are guarded
- `is_staff` is derived from role for internal roles

## Capability matrix contract
Role permissions are managed through admin-only endpoints:
- `/api/v1/admin/settings/roles-permissions/`
- `/api/v1/admin/settings/roles-permissions/roles/<ROLE>/`

Per-user overrides are also admin-only and include creator/updater attribution fields.

## HR route isolation
HR workspace APIs under `/api/v1/admin/hr/*` are admin-only.
Customer/partner/vendor users are not allowed to access internal HR endpoints.

## Operational recommendation
- Keep admin and cashier onboarding fully internal.
- Keep partner/customer registration in their separate approved flows.
- Use role matrix updates through controlled admin settings API only.
