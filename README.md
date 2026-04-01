

# SUBIDHA ADVANCE EMI

Production-oriented Lucky Plan EMI system for Subidha Furniture.

This project is designed for real daily business operations with a clean path for future expansion into furniture rental, leasing, and partner-driven commerce without breaking existing EMI data or workflows.

---

## Core Purpose

SUBIDHA ADVANCE EMI manages:

- Customers
- Products
- Batches
- Lucky IDs
- Subscriptions
- EMI schedules
- Payments
- Waivers for winners
- Partner-related business workflows
- Admin and cashier operations

The system is built to support:

- Financial correctness
- Auditability
- Simplicity for shop staff
- Future extensibility

---

## Business Model Summary

- A customer joins an EMI plan for a selected product
- A batch contains Lucky IDs
- Each subscription is linked to one Lucky ID in a batch
- EMI is paid monthly
- One winner may be selected based on the business rules of the Lucky Plan
- The winner receives waiver of future EMI only
- All payment, waiver, and subscription transitions must remain auditable

---

## Project Goals

- Stable daily operations for local business use
- Role-based workflows for admin, cashier, partner, and customer
- Clear backend and frontend separation
- Additive improvements only
- Backward compatibility for future furniture rental / lease support

---

## Tech Stack

### Backend
- Python
- Django
- Django REST Framework
- PostgreSQL
- JWT Authentication

### Frontend
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui

---

## Main Modules

### Backend Domain Modules
- Accounts and authentication
- Customers
- Products
- Batches
- Lucky IDs
- Subscriptions
- EMI schedules
- Payments
- Reports
- Audit logs
- Partner workflows

### Frontend Workspaces
- Public website
- Admin dashboard
- Cashier dashboard
- Partner dashboard
- Customer dashboard

---

## Key Principles

- No destructive business logic changes without review
- Schema changes should be additive and non-breaking
- Payment and EMI state transitions must be traceable
- UI must support fast daily business use
- Future rental/leasing features must not break EMI flows

---

## Backend environment setup

The backend reads environment variables from `backend/.env` in local development.

Safe setup path:

1. Copy `backend/.env.example` to `backend/.env`
2. Set `DJANGO_SECRET_KEY`
3. For PostgreSQL, set either:
   - `DATABASE_URL`, or
   - `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`

Production rule:

- Do not rely on code defaults for database credentials
- In production-style mode, missing DB environment variables now fail fast with a clear runtime error

Local development rule:

- If no DB environment variables are provided and the app is in local/development mode, the backend falls back to local SQLite for safe startup
- This avoids committing database credentials in code while keeping local bootstrapping simple

---

## Suggested Repository Structure

```text
subidha-lucky-plan/
├── backend/
├── frontend/
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── business-rules/
│   ├── deployment/
│   └── release-notes/
├── scripts/
├── .github/
│   └── workflows/
├── README.md
├── .gitignore
├── LICENSE
└── CHANGELOG.md
```
