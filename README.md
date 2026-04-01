

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
