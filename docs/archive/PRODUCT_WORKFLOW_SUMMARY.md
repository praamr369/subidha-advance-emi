# Product Workflow: Classification, Relationships & Costing

## Complete Implementation Summary

### 1. Product Classification (Finished Goods, Raw Materials, Accessories, Services, Add-ons)

**Fields Added:**
- `item_type` (FINISHED_GOOD, RAW_MATERIAL, ACCESSORY, SERVICE, ADD_ON)
- `stock_type` (STOCK_ITEM, MADE_TO_ORDER, NON_STOCK)

**Where to Set:**
- Product Register page: Filter dropdown for quick selection
- Product Create page: Classification section with full type selection
- Product Edit page: Classification section (can change anytime)

---

### 2. Product Relationships & Attachments

**What You Can Do:**
- Link accessories to finished goods (e.g., bed → pillows, bedsheet)
- Link raw materials to finished goods (e.g., bed → foam, springs, fabric)
- Add services to products (e.g., installation, warranty)
- Add add-ons (e.g., delivery, setup)

**Where to Access:**
- Product Edit page → "Related Products" section
- Search for products to attach (filters by name, code, SKU)
- Set quantity and notes per relationship
- View, edit (re-attach with different qty/notes), and remove relationships

**Backend Model:**
```
ProductRelationship
  - product: FK to Product
  - related_product: FK to Product
  - relationship_type: ACCESSORY | RAW_MATERIAL | SERVICE | ADD_ON
  - quantity: Decimal (for materials/accessories)
  - notes: Text (for special instructions)
```

**API Endpoints:**
```
GET    /admin/products/{id}/related-products/              → List attachments
POST   /admin/products/{id}/add-related-product/           → Add attachment
DELETE /admin/products/{id}/remove-related-product/{rel_id}/ → Remove
GET    /admin/products/search-for-attachment/?q=...        → Search products
```

---

### 3. Inventory Costing (Purchase, Manufacturing, Standard)

**Cost Fields by Product Type:**

#### For Raw Materials & Accessories:
- **Purchase Price per Unit** — Cost to buy from suppliers
- **Standard Unit Cost** — General cost basis for valuation

#### For Finished Goods:
- **Standard Unit Cost** — General cost basis
- **Manufacturing Costs (Estimate):**
  - Raw Material Cost (total material to make one unit)
  - Labour Cost (labor to make one unit)
  - Overhead Cost (utilities, equipment allocation per unit)
  - **Total Estimated Cost** = Raw Material + Labour + Overhead

**Important Distinction:**
- **Base Price** (in Product master) = Your **Selling Price** for subscriptions & direct sales
- **Purchase Price** = What you pay suppliers (for raw materials/accessories)
- **Manufacturing Costs** = Estimated cost to produce (for finished goods)
- **Standard Cost** = General valuation basis used in reporting

**Where to Set Costs:**
1. Product Edit page → Click **"Costing"** button (top right)
2. Modal opens with fields based on product type
3. Save costs (separate from product details save)

**Backend:**
```
API: PATCH /admin/products/{id}/inventory-costs/
Payload: {
  purchase_unit_cost: number,
  standard_unit_cost: number,
  manufacturing_raw_material_cost: number,
  manufacturing_labour_cost: number,
  manufacturing_overhead_cost: number
}
```

---

### 4. Complete Product Workflow Example

#### Scenario: Create and Configure a Bed (Finished Good)

**Step 1: Create Product**
- Go to `/admin/products/create`
- Name: "Wooden Queen Bed"
- Product Code: "BED-OAK-Q"
- Item Type: **Finished Good**
- Stock Type: **Stock Item**
- Base Price: ₹45,000 (selling price)
- Save

**Step 2: Set Manufacturing Costs**
- Go to product edit page
- Click **"Costing"** button
- Raw Material Cost: ₹20,000 (wood, springs, foam)
- Labour Cost: ₹3,000 (assembly, finishing)
- Overhead Cost: ₹2,000 (electricity, equipment)
- Total Estimated: ₹25,000
- Save

**Step 3: Attach Accessories**
- In same edit page, scroll to "Related Products"
- Click "Attach Product"
- Search: "Pillow"
- Select "Memory Foam Pillow" (ACCESSORY)
- Relationship: Accessory
- Quantity: 2 (comes with 2 pillows)
- Save
- Repeat for Bedsheet, Mattress Protector, etc.

**Step 4: Link Raw Materials (Optional, for Bill of Materials)**
- Click "Attach Product" again
- Search: "Oak Wood Plank"
- Relationship: Raw Material
- Quantity: 12 (meters needed)
- Notes: "4x4 beams for frame"
- Save

**Result:**
- Product is now fully configured
- Customers see it as "Finished Good"
- Staff can see all included accessories
- BOM shows raw materials needed
- Costing shows production cost (₹25,000) vs selling price (₹45,000)

---

### 5. Filtering in Product Register

**Available Filters:**
- **Item Type**: Filter by FINISHED_GOOD, RAW_MATERIAL, ACCESSORY, SERVICE, ADD_ON
- **Stock Type**: Filter by STOCK_ITEM, MADE_TO_ORDER, NON_STOCK
- **Category**: Dropdown of all categories
- **Subcategory**: Auto-filtered by selected category
- Advanced filters: Readiness, Capability, Active status, Image status

**Filter State:**
- All filters saved in URL (reload keeps your filters)
- Export includes item_type and stock_type columns

---

### 6. File Structure

**Backend:**
- Model: `subscriptions/models.py` → `ProductRelationship`, `ProductRelationshipType`
- Serializer: `api/v1/serializers/admin_resources.py` → `ProductRelationshipSerializer`, `ProductSearchSerializer`
- Views: `api/v1/views/admin_resources.py` → ProductAdminViewSet actions
- Migration: `subscriptions/migrations/0123_add_product_relationship_model.py`

**Frontend:**
- Components:
  - `components/admin/products/RelatedProductsSection.tsx` — Manage relationships UI
  - `components/admin/inventory/InventoryProfileCostEditor.tsx` — Edit costs modal
- Pages:
  - `app/(dashboard)/admin/products/page.tsx` — Register with filters
  - `app/(dashboard)/admin/products/[id]/edit/page.tsx` — Full product editor
  - `app/(dashboard)/admin/products/create/page.tsx` — Create new product
- Services: `services/products/index.ts` → All product APIs

---

### 7. Key Features

✅ **Comprehensive Product Classification** — All product types supported
✅ **Flexible Relationships** — Link any product to any other product
✅ **Cost Tracking** — Purchase, manufacturing, standard costs
✅ **Inventory Integration** — Costs stored with inventory profile
✅ **URL-Persisted Filters** — Filter state survives page reload
✅ **Color-Coded Badges** — Quick visual identification of types
✅ **CSV Export** — Includes item_type, stock_type, costing info
✅ **API-Ready** — All relationships & costs accessible via REST

---

### 8. Next Steps (Optional Enhancements)

- [ ] Bill of Materials (BOM) workbench for manufacturing
- [ ] Batch/Lot tracking integration
- [ ] Multi-level hierarchy (kits, bundles, sub-assemblies)
- [ ] Cost variance reporting (actual vs standard)
- [ ] Inventory reconciliation with costing impact
- [ ] Supplier tracking for purchase prices

---

## Testing Checklist

- [x] Backend: `python manage.py check` ✓ 0 issues
- [x] Frontend: `tsc --noEmit` ✓ Clean
- [x] Migrations applied: `0123_add_product_relationship_model` ✓
- [x] Product Edit page: Item Type & Stock Type selects visible
- [x] Related Products: Search & attach UI functional
- [x] Cost Editor: Modal opens from "Costing" button
- [x] API endpoints: All 5 relationship + cost endpoints available
- [ ] Manual testing: Login & verify workflows

---

## Quick Links

**Product Management:**
- Register: `http://localhost:3000/admin/products`
- Create: `http://localhost:3000/admin/products/create`
- Edit (id=15): `http://localhost:3000/admin/products/15/edit`
- Masters: `http://localhost:3000/admin/products/masters`

**Inventory:**
- Profiles: `http://localhost:3000/admin/inventory/profiles`
- Items: `http://localhost:3000/admin/inventory/items`
- Opening Stock: `http://localhost:3000/admin/inventory/opening-stock`
