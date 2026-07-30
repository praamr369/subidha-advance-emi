# PIM Taxonomy Analysis — 257 Products

Derived from your real `products.csv`. This maps every product to the **categories,
subcategories, and attributes** it needs, so you can build the PIM tree that lights
up the attribute editor.

## Summary

| Category | Subcategories | ~Products |
|---|---|---|
| **Furniture** | 16 | ~144 |
| **Home Appliances** | 11 | ~85 |
| **Kitchen Appliances** | 7 | ~28 |
| **Total** | **34 subcategories** | **257** |

> Note: your CSV uses **"Home Appliances"** (fridge, AC, TV, fan, washing machine…),
> not "Electronics". The current PIM DB has an "Electronics" category — you'll want a
> **"Home Appliances"** category to match your data.

## Key finding — Furniture descriptions are hidden attribute sets

Your Bed descriptions are comma-separated attribute values in a fixed order, e.g.:

```
Head Board & Foot Board, 2 Inch, Sagwan / Sheesham, Sal Wood, 16 Inch,
Sagwan / Sheesham, Commercial Ply, 18mm / 12mm, Hand Polished, Wooden Bed
```

Decoded, that's **10 attributes**: Design → Frame Thickness → Frame Material → Base
Material → Storage Height → Storage Material → Board Type → Board Thickness → Finish →
Bed Type. So the attribute schema is already in your data — it just needs to become
real PIM attributes instead of a text blob.

---

## FURNITURE — attributes

**Shared across all furniture subcategories:**
| Attribute | Type | Sample values (from your data) |
|---|---|---|
| Material | CHOICE | Sagwan, Sonajhuri, Plyboard & Laminates, MDF, Particle Board, Stainless Steel, Sheet, Fibre, Steel |
| Dimensions | TEXT | 6ft×7ft, 5ft×7ft, 2.5ftx1.5ft, 3ftx2ft … |
| Finish | CHOICE | Hand Polished, Powder Coated, Printed, Unpolished |

**Subcategory-specific:**
| Subcategory | Extra attributes |
|---|---|
| **Bed** | Storage (BOOLEAN), Frame Material, Base Material (Sal Wood/Iron/Stainless Steel), Board Type (Commercial Ply/MDF/Particle Board), Board Thickness (18mm/12mm/16mm), Bed Type (Wooden/MDF/Particle Board/Steel/Hybrid Steel), Foldable (BOOLEAN) |
| **Wardrobe** | Doors/"Palla" (CHOICE: 2 Palla / 3 Palla), Storage (BOOLEAN) |
| **Sofa**, **Sofa Cum Bed** | Seater (CHOICE: 1/2/3 Seater), Storage (BOOLEAN, sofa-cum-bed) |
| **Dinning Table**, **Office Table**, **Center Table** | Seater (4/6 Seater — dining), Dimensions |
| **Dressing Table**, **Alna**, **Showcase**, **Cabinet**, **TV Unit**, **Bedside Tool** | Storage (BOOLEAN), Dimensions |
| **Chair**, **Easy Chair** | Type (Ergonomic / Standard / Foam), Material |
| **Mattress** | Type (Foam / L&S Bondaid), Size (78x72 / 78x60), Thickness (4"/6") |

Subcategories: Bed · Bedside Tool · Mattress · Wardrobe · Dressing Table · Sofa · Sofa
Cum Bed · Center Table · Dinning Table · Office Table · Alna · Showcase · Chair · Easy
Chair · Cabinet · TV Unit

---

## HOME APPLIANCES — attributes

**Shared across all appliance subcategories:**
| Attribute | Type | Sample values |
|---|---|---|
| Brand | CHOICE | Godrej, LG, Samsung, Whirlpool, Blue Star, Havells, Bajaj, Crompton, Orient, Sony, MI, Realme, Philips, Ahuja, Motorola, Zebronics, Symphony, V Guard, Kent, Pigeon, Genus, Luminous, RR, Roxy, GM, Edifier |

**Subcategory-specific:**
| Subcategory | Attributes |
|---|---|
| **Refrigerator** | Capacity (NUMBER, Ltr), Door Type (CHOICE: Single/Double Door), Star Rating (CHOICE: 3/4/5 Star) |
| **Air Conditioner** | Capacity (CHOICE: 1 Ton / 1.5 Ton), Type (CHOICE: Split/Window), Star Rating |
| **Air Cooler** | Capacity (NUMBER, Ltr), Type (CHOICE: Desert/Personal/Tower) |
| **Television** | Screen Size (CHOICE: 32"/43"…), Resolution (CHOICE: HD Ready/4K UHD), Smart TV (BOOLEAN) |
| **Sound System** | Power (NUMBER, W), Model (TEXT) |
| **Water Geyser** | Capacity (NUMBER, Ltr), Type (CHOICE: Instant/Storage) |
| **Heater** | Power (NUMBER, W), Type (CHOICE: Quartz/Blower) |
| **Induction** | Power (NUMBER, W), Type (CHOICE: Radiant/Induction) |
| **Washing Machine** | Capacity (NUMBER, Kg), Type (CHOICE: Semi Automatic/Fully Automatic) |
| **Fan** | Size (NUMBER, mm), Type (CHOICE: Ceiling/Wall/Pedestal/Table/Exhaust) |
| **Inverter** ("Inviter") | Capacity (NUMBER, VA), Battery Type (CHOICE: Li-ion/Tubular) |

---

## KITCHEN APPLIANCES — attributes

**Shared:** Brand (CHOICE — same brand pool + MarQ, Borosil, Midea, Haier, Milton, Kenstar, Kutchina, Laopala)

| Subcategory | Attributes |
|---|---|
| **OTG / Microwave Ovens** | Capacity (NUMBER, Ltr), Type (CHOICE: OTG/Microwave) |
| **Electric Kettle & Cooker** | Capacity (NUMBER, Ltr), Type (CHOICE: Travel Kettle/Rice Cooker) |
| **Kitchen Chimney** | Size (TEXT), Suction (NUMBER, m³/hr) |
| **Mixer Grinder** | Power (NUMBER, W: 500/750) |
| **Juicer** | Power (NUMBER, W: 400/500) |
| **Dinner Set** | Size (CHOICE: Small/Medium/Large/Coffee Set), Pieces (NUMBER: 10/20/27) |
| **Kitchen Rack** | Dimensions (TEXT: 39×36, 36×30, 30×30) |

---

## Recommended shared "global" attributes (reuse everywhere)

To avoid re-defining, these three appear across many subcategories — define once per
category and reuse:
- **Brand** (CHOICE) — all appliances
- **Material** (CHOICE) — all furniture
- **Capacity** / **Power** (NUMBER) — appliances
- **Type** (CHOICE) — meaning varies per subcategory (Split, Instant, Ceiling, Semi Auto…)

## Data hygiene flags found in your CSV
- **Duplicate names**: "Fibre Wardrobe 2 Palla" (rows 50–51, different prices), "Sagwan Cabinet 3ftx2ftx12inch" (rows 129 & 135) — dedupe or vary by SKU.
- **Encoding artifacts**: `3�6 ft`, `78x72x4"` quoting, `1?` (should be `1"`) in some descriptions — clean on import.
- **"Inviter"** should read **Inverter**; **"Dinning"** → **Dining** (cosmetic).

---

## Next step (your call)
1. **Auto-build this tree** — I can write a one-time management command / seeded run
   that creates the 3 categories, 34 subcategories, and all attributes above with
   their CHOICE options, then **assigns each of your 257 products to its
   subcategory** and **parses the Bed/appliance attributes from name+description into
   real attribute values**. One pass, fully populated PIM.
2. Or **you build it in the UI** now that category/subcategory/attribute creation
   works, using this document as the spec.

Recommend option 1 — it turns your CSV's hidden attributes into real, editable PIM
data automatically. Say the word and I'll build the importer.
