#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$BASE_DIR/frontend/src/app/(dashboard)"

echo -e "${BLUE}Building all 18 frontend pages...${NC}\n"

# Create directories
mkdir -p "$FRONTEND_DIR/customer/payments/history"
mkdir -p "$FRONTEND_DIR/customer/payments/receipt/[id]"
mkdir -p "$FRONTEND_DIR/customer/refunds/request"
mkdir -p "$FRONTEND_DIR/customer/refunds/assess/[id]"
mkdir -p "$FRONTEND_DIR/customer/refunds/status/[id]"
mkdir -p "$FRONTEND_DIR/customer/refunds/history"
mkdir -p "$FRONTEND_DIR/customer/warranty/check"
mkdir -p "$FRONTEND_DIR/customer/warranty/claim"
mkdir -p "$FRONTEND_DIR/customer/warranty/status/[id]"
mkdir -p "$FRONTEND_DIR/customer/warranty/service-history"
mkdir -p "$FRONTEND_DIR/customer/warranty/extended"
mkdir -p "$FRONTEND_DIR/customer/privacy/settings"
mkdir -p "$FRONTEND_DIR/customer/privacy/data-access"
mkdir -p "$FRONTEND_DIR/customer/privacy/export"
mkdir -p "$FRONTEND_DIR/customer/privacy/grievance"
mkdir -p "$FRONTEND_DIR/customer/privacy/dashboard"
mkdir -p "$FRONTEND_DIR/admin/payments/collect"
mkdir -p "$FRONTEND_DIR/admin/payments/reconcile"
mkdir -p "$FRONTEND_DIR/admin/refunds/process"
mkdir -p "$FRONTEND_DIR/admin/warranty/claims"
mkdir -p "$FRONTEND_DIR/admin/warranty/records"
mkdir -p "$FRONTEND_DIR/admin/lucky-plan/manage"
mkdir -p "$FRONTEND_DIR/admin/lucky-plan/verify"
mkdir -p "$FRONTEND_DIR/admin/privacy/compliance"
mkdir -p "$FRONTEND_DIR/admin/privacy/breaches"
mkdir -p "$FRONTEND_DIR/admin/privacy/grievances"
mkdir -p "$FRONTEND_DIR/admin/privacy/audit"

echo -e "${GREEN}✓ All directories created${NC}\n"

echo -e "${BLUE}Pages ready to build:${NC}\n"

# Payment Pages
echo "PAYMENT PAGES (3):"
echo "  1. src/app/(dashboard)/customer/payments/history/page.tsx"
echo "  2. src/app/(dashboard)/customer/payments/receipt/[id]/page.tsx"
echo "  3. src/app/(dashboard)/admin/payments/collect/page.tsx"

echo -e "\nREFUND PAGES (4):"
echo "  4. src/app/(dashboard)/customer/refunds/request/page.tsx"
echo "  5. src/app/(dashboard)/customer/refunds/assess/[id]/page.tsx"
echo "  6. src/app/(dashboard)/customer/refunds/status/[id]/page.tsx"
echo "  7. src/app/(dashboard)/customer/refunds/history/page.tsx"

echo -e "\nWARRANTY PAGES (5):"
echo "  8. src/app/(dashboard)/customer/warranty/check/page.tsx"
echo "  9. src/app/(dashboard)/customer/warranty/claim/page.tsx"
echo "  10. src/app/(dashboard)/customer/warranty/status/[id]/page.tsx"
echo "  11. src/app/(dashboard)/customer/warranty/service-history/page.tsx"
echo "  12. src/app/(dashboard)/customer/warranty/extended/page.tsx"

echo -e "\nPRIVACY PAGES (6):"
echo "  13. src/app/(dashboard)/customer/privacy/settings/page.tsx"
echo "  14. src/app/(dashboard)/customer/privacy/data-access/page.tsx"
echo "  15. src/app/(dashboard)/customer/privacy/export/page.tsx"
echo "  16. src/app/(dashboard)/customer/privacy/grievance/page.tsx"
echo "  17. src/app/(dashboard)/customer/privacy/dashboard/page.tsx"
echo "  18. src/components/CookieBanner.tsx (banner component)"

echo -e "\nADMIN DASHBOARDS (7):"
echo "  19. src/app/(dashboard)/admin/payments/reconcile/page.tsx"
echo "  20. src/app/(dashboard)/admin/refunds/process/page.tsx"
echo "  21. src/app/(dashboard)/admin/warranty/claims/page.tsx"
echo "  22. src/app/(dashboard)/admin/lucky-plan/manage/page.tsx"
echo "  23. src/app/(dashboard)/admin/lucky-plan/verify/page.tsx"
echo "  24. src/app/(dashboard)/admin/privacy/compliance/page.tsx"
echo "  25. src/app/(dashboard)/admin/privacy/grievances/page.tsx"

echo -e "\n${BLUE}All directories created! Next: Run page generation script.${NC}"
