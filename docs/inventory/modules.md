# Backend Module Inventory (auto-generated)

**33** local Django apps. Columns: models / migrations / service files / management commands.

**Per-module pre-production check:** (1) `manage.py check` clean, (2) migrations applied and `makemigrations --check` clean, (3) each service's happy + guard paths covered, (4) each mutating action is audited + permission-gated, (5) money/stock invariants hold (no negative balances, one payment per EMI intent, etc.).

| Module | Models | Migrations | Services | Mgmt cmds |
|---|--:|--:|--:|--:|
| `accounts` | 8 | 12 | 4 | 0 |
| `ai_assistant` | 5 | 3 | 8 | 0 |
| `branch_control` | 3 | 2 | 3 | 2 |
| `crm` | 19 | 11 | 12 | 1 |
| `service_desk` | 8 | 9 | 3 | 0 |
| `accounting` | 73 | 60 | 84 | 8 |
| `inventory` | 34 | 26 | 30 | 8 |
| `manufacturing` | 8 | 3 | 2 | 0 |
| `billing` | 21 | 18 | 10 | 2 |
| `catalog` | 3 | 2 | 3 | 0 |
| `brochures` | 8 | 5 | 7 | 0 |
| `reminders` | 3 | 6 | 4 | 1 |
| `system_jobs` | 3 | 2 | 0 | 0 |
| `customers` | 13 | 5 | 11 | 0 |
| `contracts` | 13 | 3 | 31 | 0 |
| `payments` | 21 | 3 | 17 | 0 |
| `lucky_plan` | 8 | 3 | 10 | 0 |
| `deliveries` | 9 | 3 | 4 | 0 |
| `commissions` | 3 | 2 | 5 | 0 |
| `growth` | 7 | 1 | 0 | 0 |
| `business_setup` | 20 | 4 | 0 | 0 |
| `finance_control` | 7 | 1 | 0 | 0 |
| `audit` | 2 | 3 | 0 | 0 |
| `products_core` | 7 | 4 | 1 | 0 |
| `subscriptions` | 0 | 148 | 48 | 27 |
| `reconciliation` | 6 | 4 | 2 | 0 |
| `settlements` | 7 | 2 | 5 | 0 |
| `smart_fields` | 4 | 1 | 2 | 2 |
| `migration_center` | 5 | 2 | 7 | 0 |
| `privacy` | 9 | 3 | 1 | 0 |
| `documents` | 1 | 2 | 2 | 0 |
| `products_pim` | 9 | 11 | 3 | 6 |
| `reviews` | 2 | 2 | 1 | 0 |
| **TOTAL** | **351** | **366** | **369** | **57** |
