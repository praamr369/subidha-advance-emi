# HR & Accounting Staff Module Consolidation Plan

**Issue Identified:** HR and Accounting modules both manage employee data, creating route duplication.

**Goal:** Consolidate all staff/employee workflows under single HR module. Accounting keeps only financial reporting views.

---

## Current Duplication Issues

### Duplicated Routes (Must Move to HR)

| Current Path | Issue | Should Move To |
|---|---|---|
| `GET /admin/accounting/employees/` | Employee CRUD | `GET /admin/hr/staff/` |
| `POST /admin/accounting/employees/` | Create employee | `POST /admin/hr/staff/` |
| `GET /admin/accounting/attendance/` | Attendance tracking | `GET /admin/hr/attendance/` |
| `POST /admin/accounting/attendance/` | Record attendance | `POST /admin/hr/attendance/` |
| `GET /admin/accounting/leave-requests/` | Leave management | `GET /admin/hr/leave-requests/` |
| `POST /admin/accounting/leave-requests/` | Request leave | `POST /admin/hr/leave-requests/` |
| `GET /admin/accounting/salary-sheets/` | Payroll sheets | `GET /admin/hr/payroll/` |
| `POST /admin/accounting/salary-sheets/` | Create salary sheet | `POST /admin/hr/payroll/` |
| `GET /admin/accounting/expense-claims/` | Expense claims | `GET /admin/hr/expense-claims/` |
| `POST /admin/accounting/expense-claims/` | Submit expense | `POST /admin/hr/expense-claims/` |

### Accounting Reporting Views (Keep in Accounting)

| Path | Purpose | Keep/Remove |
|---|---|---|
| `GET /reports/staff-ledger/` | Financial report: Staff P&L | **KEEP** (reporting) |
| `POST /admin/accounting/salary-payments/` | Post payment to GL | **KEEP** (GL posting) |
| `GET /admin/accounting/tds-tcs/` | TDS/TCS calculation | **KEEP** (tax compliance) |

---

## Backend Migration (Django Routes & Views)

### Step 1: Update `backend/api/v1/routes/accounting.py`

**Current (Lines 85-101):**
```python
router.register(r"employees", EmployeeProfileViewSet, basename="accounting-employees")
router.register(r"attendance", EmployeeAttendanceViewSet, basename="accounting-attendance")
router.register(r"payroll-periods", PayrollPeriodViewSet, basename="accounting-payroll-periods")
router.register(r"leave-types", LeaveTypeViewSet, basename="accounting-leave-types")
router.register(r"leave-requests", LeaveRequestViewSet, basename="accounting-leave-requests")
router.register(r"salary-sheets", SalarySheetViewSet, basename="accounting-salary-sheets")
router.register(r"expense-claims", EmployeeExpenseClaimViewSet, basename="accounting-expense-claims")
router.register(r"expense-claim-payments", EmployeeExpenseClaimPaymentViewSet, basename="accounting-expense-claim-payments")
```

**Should Be:**
```python
# REMOVED: All employee management routes
# These are now under HR module (admin_hr.py)
# 
# KEPT: Only payroll GL posting and tax compliance
router.register(r"salary-payments", SalaryPaymentViewSet, basename="accounting-salary-payments")
```

### Step 2: Create `backend/api/v1/routes/admin_hr_complete.py`

Move all HR ViewSets from accounting:

```python
from django.urls import path
from rest_framework.routers import DefaultRouter

from api.v1.views.accounting import (  # Import from accounting app temporarily
    EmployeeAttendanceViewSet,
    EmployeeProfileViewSet,
    ExpenseVoucherViewSet,
    LeaveRequestViewSet,
    LeaveTypeViewSet,
    PayrollPeriodViewSet,
    SalarySheetViewSet,
    EmployeeExpenseClaimViewSet,
    EmployeeExpenseClaimPaymentViewSet,
)
from api.v1.views.admin_hr import (  # Existing HR views
    AdminHrStaffListCreateView,
    AdminHrStaffPatchView,
    # ... etc
)

router = DefaultRouter()

# Employee Master Data (HR)
router.register(r"staff", EmployeeProfileViewSet, basename="hr-staff")  # Was accounting-employees
router.register(r"staff-documents", ..., basename="hr-staff-documents")

# Attendance (HR)
router.register(r"attendance", EmployeeAttendanceViewSet, basename="hr-attendance")

# Leave Management (HR)
router.register(r"leave-types", LeaveTypeViewSet, basename="hr-leave-types")
router.register(r"leave-requests", LeaveRequestViewSet, basename="hr-leave-requests")

# Payroll (HR)
router.register(r"payroll-periods", PayrollPeriodViewSet, basename="hr-payroll-periods")
router.register(r"payroll", SalarySheetViewSet, basename="hr-payroll")  # Was salary-sheets
router.register(r"expense-claims", EmployeeExpenseClaimViewSet, basename="hr-expense-claims")

urlpatterns = router.urls
```

### Step 3: Update `backend/api/v1/routes/admin.py`

Include new consolidated HR routes:

```python
# Line 1 - Add import
from api.v1.routes import admin_hr_complete

# Line ~50 - Add URL pattern
urlpatterns = [
    # ... existing patterns
    path("hr/", include(admin_hr_complete.router.urls)),  # All HR routes
    # ... rest of patterns
]
```

---

## Frontend Migration (React Pages)

### Step 1: Move Pages from Accounting to HR

```bash
# Current structure (WRONG)
frontend/src/app/(dashboard)/admin/accounting/
  ├─ staff/
  ├─ attendance/
  ├─ leave/
  ├─ salary/
  └─ expense-claims/

# New structure (CORRECT)
frontend/src/app/(dashboard)/admin/hr/
  ├─ staff/
  ├─ attendance/
  ├─ leave/
  ├─ payroll/
  └─ expense-claims/
```

### Step 2: Update Service Layer

**File:** `frontend/src/services/accounting.ts`

**Remove these functions:**
```typescript
// DELETE:
export function listEmployees() { ... }
export function createEmployeeProfile() { ... }
export function listEmployeeAttendance() { ... }
export function recordEmployeeAttendance() { ... }
export function listLeaveRequests() { ... }
// etc.
```

**File:** `frontend/src/services/admin-hr.ts`

**Add these functions (imported from accounting):
```typescript
// ADD to admin-hr.ts:
export { 
  listEmployees,
  createEmployeeProfile,
  updateEmployeeProfile,
  listEmployeeAttendance,
  recordEmployeeAttendance,
  listLeaveRequests,
  createLeaveRequest,
  listSalarySheets,
  createSalarySheet,
  // ... etc
} from "./accounting";

// Alias for consistency
export const listHrStaff = listEmployees;
export const createHrStaff = createEmployeeProfile;
export const patchHrStaff = updateEmployeeProfile;
```

### Step 3: Update Page Imports

**Example: `frontend/src/app/(dashboard)/admin/accounting/staff/page.tsx`**

Move to: `frontend/src/app/(dashboard)/admin/hr/payroll/page.tsx`

Update imports:
```typescript
// OLD (from accounting):
import { 
  createEmployeeProfile, 
  listEmployees, 
  recordEmployeeAttendance 
} from "@/services/accounting";

// NEW (from admin-hr):
import { 
  createHrStaff, 
  listHrStaff, 
  recordEmployeeAttendance 
} from "@/services/admin-hr";
```

---

## Frontend Page Migration Mapping

| Current Accounting Page | Move To | Status |
|---|---|---|
| `/admin/accounting/staff/` | `/admin/hr/staff/` | Move + merge |
| `/admin/accounting/attendance/` | `/admin/hr/attendance/` | Move |
| `/admin/accounting/leave/` | `/admin/hr/leave-requests/` | Move |
| `/admin/accounting/salary/` | `/admin/hr/payroll/` | Move |
| `/admin/accounting/expense-claims/` | `/admin/hr/expense-claims/` | Move |

---

## Updated Navigation Structure

### BEFORE (Confusing - HR staff in two places)
```
Accounting
  ├─ Chart of Accounts
  ├─ GL Reconciliation
  ├─ Staff ← WRONG LOCATION
  ├─ Attendance ← WRONG LOCATION
  ├─ Leave ← WRONG LOCATION
  ├─ Salary ← WRONG LOCATION
  ├─ Expense Claims ← WRONG LOCATION
  └─ Tax Documents

HR & Staff
  ├─ Staff List
  ├─ Documents
  └─ (Missing attendance, leave, payroll, expenses)
```

### AFTER (Clear - All HR functions under HR)
```
Accounting & Reconciliation
  ├─ General Ledger
  ├─ GL Reconciliation
  ├─ Tax Documents
  ├─ GSTR Reports
  ├─ Chart of Accounts
  └─ Audit Trail

HR & Staff
  ├─ Staff Management
  │  ├─ Employee List
  │  ├─ Documents
  │  └─ KYC Verification
  ├─ Attendance
  │  ├─ Mark Attendance
  │  └─ Attendance Reports
  ├─ Leave Management
  │  ├─ Leave Requests
  │  └─ Leave Balance
  ├─ Payroll
  │  ├─ Salary Sheets
  │  ├─ Salary Payments
  │  └─ Payroll Reports
  └─ Expense Claims
     ├─ Submit Claim
     ├─ Approval Queue
     └─ Claim Reports
```

---

## Implementation Checklist

### Phase 1: Backend Routes (Deduplication)

- [ ] **Step 1.1:** Update `backend/api/v1/routes/accounting.py`
  - Remove employee ViewSet registrations (lines 92-100)
  - Remove attendance, leave, salary registrations
  - Keep only: salary-payments, TDS/TCS, tax reporting
  
- [ ] **Step 1.2:** Create `backend/api/v1/routes/admin_hr_complete.py`
  - Register all employee management ViewSets
  - Use `hr/` prefix instead of `accounting/`
  - Register under HR module
  
- [ ] **Step 1.3:** Update `backend/api/v1/routes/admin.py`
  - Include new HR routes: `path("hr/", include(admin_hr_complete.router.urls))`
  - Verify no route conflicts
  
- [ ] **Step 1.4:** Test backend routes
  - Verify `GET /admin/hr/staff/` works
  - Verify `GET /admin/hr/attendance/` works
  - Verify `GET /admin/hr/leave-requests/` works
  - Verify old `GET /admin/accounting/employees/` returns 404

### Phase 2: Frontend Service Layer

- [ ] **Step 2.1:** Update `frontend/src/services/admin-hr.ts`
  - Add export aliases for accounting employee functions
  - Map old function names to new names
  - Keep backward compatibility
  
- [ ] **Step 2.2:** Update `frontend/src/services/accounting.ts`
  - Remove employee CRUD functions
  - Keep only financial reporting functions (staff-ledger, TDS, etc.)
  
- [ ] **Step 2.3:** Test service layer
  - Verify `listHrStaff()` returns employees
  - Verify `listEmployeeAttendance()` returns attendance
  - Verify `listSalarySheets()` returns payroll data

### Phase 3: Frontend Pages (Move & Update)

- [ ] **Step 3.1:** Move accounting staff page
  - Move: `frontend/src/app/(dashboard)/admin/accounting/staff/` 
  - To: `frontend/src/app/(dashboard)/admin/hr/staff/`
  - Update imports in page.tsx
  
- [ ] **Step 3.2:** Move accounting attendance page
  - Move: `frontend/src/app/(dashboard)/admin/accounting/attendance/`
  - To: `frontend/src/app/(dashboard)/admin/hr/attendance/`
  
- [ ] **Step 3.3:** Move accounting leave page
  - Move: `frontend/src/app/(dashboard)/admin/accounting/leave/`
  - To: `frontend/src/app/(dashboard)/admin/hr/leave-requests/`
  
- [ ] **Step 3.4:** Move accounting salary page
  - Move: `frontend/src/app/(dashboard)/admin/accounting/salary/`
  - To: `frontend/src/app/(dashboard)/admin/hr/payroll/`
  
- [ ] **Step 3.5:** Move accounting expense-claims page
  - Move: `frontend/src/app/(dashboard)/admin/accounting/expense-claims/`
  - To: `frontend/src/app/(dashboard)/admin/hr/expense-claims/`

### Phase 4: Navigation & Links Update

- [ ] **Step 4.1:** Update sidebar navigation links
  - Remove staff/attendance/leave/salary/expenses from Accounting module
  - Add to HR module
  - Update frontend ROUTES configuration
  
- [ ] **Step 4.2:** Update breadcrumbs
  - Update all link references from `accounting/staff` to `hr/staff`
  - Update page titles and descriptions
  
- [ ] **Step 4.3:** Update internal links
  - Search for all references to `accounting/staff/*`
  - Replace with `hr/staff/*`

### Phase 5: Testing & Validation

- [ ] **Step 5.1:** Smoke test
  - Access `/admin/hr/staff/` → lists employees
  - Access `/admin/hr/attendance/` → shows attendance
  - Access `/admin/hr/leave-requests/` → shows leave requests
  - Access `/admin/hr/payroll/` → shows salary sheets
  - Access `/admin/hr/expense-claims/` → shows expense claims
  
- [ ] **Step 5.2:** Old routes (should 404)
  - Access `/admin/accounting/staff/` → should redirect or 404
  - Access `/admin/accounting/attendance/` → should redirect or 404
  - Access `/admin/accounting/leave/` → should redirect or 404
  - Access `/admin/accounting/salary/` → should redirect or 404
  
- [ ] **Step 5.3:** Accounting reporting (should still work)
  - Access `/reports/staff-ledger/` → still works
  - Access `/admin/accounting/salary-payments/` → still works
  - Payroll GL posting → still posts correctly
  
- [ ] **Step 5.4:** User workflows
  - Create new employee via `/admin/hr/staff/`
  - Record attendance via `/admin/hr/attendance/`
  - Request leave via `/admin/hr/leave-requests/`
  - Create salary sheet via `/admin/hr/payroll/`
  - Submit expense claim via `/admin/hr/expense-claims/`

### Phase 6: Documentation Update

- [ ] **Step 6.1:** Update NAVIGATION_STRUCTURE_DESIGN.md
  - Move payroll/attendance/leave/expense-claims from Accounting to HR
  - Update route listings
  - Update module descriptions
  
- [ ] **Step 6.2:** Update PRODUCTION_READINESS_REPORT.md
  - Update module matrix (HR routes increase, Accounting decrease)
  - Update route distribution table
  
- [ ] **Step 6.3:** Add migration notes
  - Document old route redirects
  - Document deprecation timeline

---

## Success Criteria

✅ **Route Deduplication:**
- All HR workflows under `/admin/hr/*` prefix
- Accounting kept only GL posting & tax compliance
- Zero route conflicts

✅ **Navigation Clarity:**
- Admin sees HR module with all employee functions
- No confusion between accounting/staff and hr/staff
- Sidebar shows clear module boundaries

✅ **Backward Compatibility:**
- Old accounting URLs redirect to HR equivalents
- API clients can use both old & new URLs during transition
- Gradual deprecation (2-4 week timeline)

✅ **Testing:**
- All workflows tested end-to-end
- GL posting still works for salary payments
- Financial reports unchanged

---

## Timeline Estimate

- **Phase 1 (Backend Routes):** 1-2 hours
- **Phase 2 (Service Layer):** 1 hour
- **Phase 3 (Frontend Pages):** 2-3 hours
- **Phase 4 (Navigation):** 1 hour
- **Phase 5 (Testing):** 2-3 hours
- **Phase 6 (Documentation):** 1 hour

**Total:** ~10 hours (1.25 days)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Breaking GL posting workflows | High | Test salary payment GL posting before/after |
| API clients using old routes | Medium | Provide redirect for 30 days, then deprecate |
| Frontend link breakage | Medium | Find & replace all `accounting/staff` → `hr/staff` |
| User confusion during transition | Low | Update admin dashboard notification about route changes |

---

**Plan Prepared:** June 24, 2026  
**Ready for Implementation:** Yes ✓
