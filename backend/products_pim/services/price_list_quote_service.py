"""
Price List Quote Service for PIM Products.

Provides customer-tailored, multi-scheme pricing quotations across:
- Direct Sale (MRP / Cash)
- Flexible Rental broken down per tenure (e.g. 6m, 9m, 12m, 24m)
- Long-Term Lease broken down per tenure (e.g. 12m, 18m, 24m, 36m)
- SFEMI Advance EMI Special Promotional Plans (specifically 15-month tenure, plus 12-month)

Supports blueprint base products and child variant SKUs with price variations and
direct public catalog URLs for scannable QR codes.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.db.models import Q

from products_pim.models import PimProduct, ProductAttribute, ProductVariant
from products_pim.serializers import get_pim_stock_map

MONEY = Decimal("0.01")
ZERO = Decimal("0.00")
DEFAULT_RENT_YIELD_PERCENT = Decimal("5.00")
DEFAULT_LEASE_YIELD_PERCENT = Decimal("3.50")

# Security deposit bands
DEPOSIT_BAND_LOW_MAX = Decimal("20000.00")   # under this -> 20%
DEPOSIT_BAND_MID_MAX = Decimal("50000.00")   # up to this -> 25%, above -> 30%
DEPOSIT_PERCENT_LOW = Decimal("20.00")
DEPOSIT_PERCENT_MID = Decimal("25.00")
DEPOSIT_PERCENT_HIGH = Decimal("30.00")


def _q2(value) -> Decimal:
    """Quantize to 2 decimal places using standard financial rounding."""
    return Decimal(str(value or 0)).quantize(MONEY, rounding=ROUND_HALF_UP)


def _deposit_percent_for_price(price: Decimal) -> Decimal:
    """Security deposit percentage for a product value, by price band."""
    if price < DEPOSIT_BAND_LOW_MAX:
        return DEPOSIT_PERCENT_LOW
    if price <= DEPOSIT_BAND_MID_MAX:
        return DEPOSIT_PERCENT_MID
    return DEPOSIT_PERCENT_HIGH


def _resolve_specs(product: PimProduct) -> list[str]:
    """Extract human-readable specification badges for a product or child variant."""
    specs: list[str] = []

    # Check variant attribute values if this product is linked as a variant
    for variant in product.variants.all():
        for va in variant.attribute_values.select_related("attribute").all():
            if va.value_text:
                attr_name = va.attribute.name if va.attribute else "Spec"
                specs.append(f"{attr_name}: {va.value_text}")

    # Check product attributes
    for pa in product.attributes.select_related("attribute").all():
        val = pa.display_value or pa.value_text
        if val and not any(pa.attribute.name in s for s in specs):
            specs.append(f"{pa.attribute.name}: {val}")

    return specs


def generate_price_list_quote(
    *,
    product_ids: list[int],
    include_variants: bool = True,
    schemes: list[str] | None = None,
    rent_tenures: list[int] | None = None,
    lease_tenures: list[int] | None = None,
    sfemi_tenures: list[int] | None = None,
    deposit_percent: Decimal | None = None,
    customer_name: str = "",
    customer_phone: str = "",
    currency_symbol: str = "₹",
    public_origin: str = "https://subidhafurnitureasansol.com",
    category_id: int | None = None,
    exclude_unpriced: bool = False,
    in_stock_only: bool = False,
) -> dict[str, Any]:
    """
    Generate authoritative multi-scheme, multi-tenure price list quote for products.

    Encodes strict financial invariants and approved legal terminology:
    - Strictly 'SFEMI' / 'SFEMI Advance EMI' (never 'Lucky Plan')
    - 15-month tenure is the primary promotional SFEMI plan (remaining future EMIs waived for promotional benefit)
    - Rent & Lease monthly amounts = price * yield * 12 / tenure / 100
    - Refundable security deposits strictly follow 20-30% bands or explicit override
    """
    normalized_schemes = set()
    raw_schemes = schemes or ["DIRECT_SALE", "RENT", "LEASE", "SFEMI"]
    for s in raw_schemes:
        su = str(s).strip().upper()
        if su in ("CASH", "DIRECT_SALE"):
            normalized_schemes.add("DIRECT_SALE")
        elif su in ("RENT", "RENTAL"):
            normalized_schemes.add("RENT")
        elif su in ("LEASE", "LEASING"):
            normalized_schemes.add("LEASE")
        elif su in ("SFEMI", "EMI", "ADVANCE_EMI"):
            normalized_schemes.add("SFEMI")

    if not normalized_schemes:
        normalized_schemes = {"DIRECT_SALE", "RENT", "LEASE", "SFEMI"}

    # Normalize requested tenures
    selected_rent_tenures = sorted({int(t) for t in (rent_tenures or [6, 9, 12, 24]) if 3 <= int(t) <= 60})
    if not selected_rent_tenures:
        selected_rent_tenures = [6, 9, 12, 24]

    selected_lease_tenures = sorted({int(t) for t in (lease_tenures or [12, 24, 36]) if 6 <= int(t) <= 60})
    if not selected_lease_tenures:
        selected_lease_tenures = [12, 24, 36]

    selected_sfemi_tenures = sorted({int(t) for t in (sfemi_tenures or [12, 15]) if int(t) in (12, 15)})
    if not selected_sfemi_tenures:
        selected_sfemi_tenures = [12, 15]

    # Fetch initial requested products
    initial_products = list(
        PimProduct.objects.filter(id__in=product_ids)
        .select_related("category", "subcategory", "parent")
        .prefetch_related(
            "attributes__attribute",
            "variants__attribute_values__attribute",
            "media_items",
            "assets",
            "parent__variants",
            "parent__media_items",
            "parent__assets",
        )
    )

    all_products: list[PimProduct] = []
    seen_ids: set[int] = set()

    # If including variants, resolve child variants under any base blueprint
    if include_variants:
        base_ids = [p.id for p in initial_products if not p.parent_id]
        child_qs = list(
            PimProduct.objects.filter(parent_id__in=base_ids)
            .select_related("category", "subcategory", "parent")
            .prefetch_related(
                "attributes__attribute",
                "variants__attribute_values__attribute",
                "media_items",
                "assets",
                "parent__variants",
                "parent__media_items",
                "parent__assets",
            )
            .order_by("code")
        )
        children_by_parent: dict[int, list[PimProduct]] = {}
        for child in child_qs:
            children_by_parent.setdefault(child.parent_id, []).append(child)

        sibling_index_map: dict[int, tuple[int, int]] = {}
        for p_id, c_list in children_by_parent.items():
            for idx, c in enumerate(c_list):
                sibling_index_map[c.id] = (idx, len(c_list))

        for p in initial_products:
            if not p.parent_id:
                if p.id not in seen_ids:
                    all_products.append(p)
                    seen_ids.add(p.id)
                for child in children_by_parent.get(p.id, []):
                    if child.id not in seen_ids:
                        all_products.append(child)
                        seen_ids.add(child.id)
            else:
                if p.id not in seen_ids:
                    all_products.append(p)
                    seen_ids.add(p.id)
    else:
        all_products = initial_products

    # Category Filter (if requested)
    if category_id:
        all_products = [
            p for p in all_products
            if p.category_id == category_id or getattr(p.parent, "category_id", None) == category_id
        ]

    # Exclude unpriced filter (if requested, hide base_price <= 0)
    if exclude_unpriced:
        all_products = [p for p in all_products if (p.base_price or Decimal("0.00")) > Decimal("0.00")]

    # Pre-fetch stock map for all products
    stock_map = get_pim_stock_map(all_products)

    # In-stock only filter (if requested)
    if in_stock_only:
        all_products = [p for p in all_products if stock_map.get(p.id, 0) > 0]

    items: list[dict[str, Any]] = []
    origin = public_origin.rstrip("/")

    for p in all_products:
        is_child = bool(p.parent_id)
        parent_code = p.parent.code if p.parent else p.code
        price = _q2(p.base_price)
        stock_qty = stock_map.get(p.id, 0)
        specs = _resolve_specs(p)

        # Build public URL for QR Code
        if is_child and p.code and p.code != parent_code:
            public_url = f"{origin}/products/{parent_code}?sku={p.code}"
        else:
            public_url = f"{origin}/products/{parent_code}"

        cat_parts = [p.category.name if p.category else None, p.subcategory.name if p.subcategory else None]
        cat_label = " / ".join(filter(None, cat_parts))

        # Rent yield & deposit
        rent_yield = _q2(p.rent_monthly_yield_percent or DEFAULT_RENT_YIELD_PERCENT)
        lease_yield = _q2(p.lease_monthly_yield_percent or DEFAULT_LEASE_YIELD_PERCENT)
        dep_percent = deposit_percent if deposit_percent is not None else _deposit_percent_for_price(price)
        deposit_amount = _q2(price * dep_percent / Decimal("100"))

        # 1. Direct Sale Quote
        direct_sale_quote = {
            "available": "DIRECT_SALE" in normalized_schemes and price > ZERO,
            "price": str(price),
            "label": "Direct Sale (MRP)",
            "description": "Full outright payment. Immediate ownership.",
        }

        # 2. Rent Quotes per tenure
        rent_quotes: dict[str, Any] = {}
        if "RENT" in normalized_schemes and price > ZERO:
            for t in selected_rent_tenures:
                monthly = _q2(price * rent_yield * Decimal("12") / Decimal(t) / Decimal("100"))
                rent_quotes[str(t)] = {
                    "tenure_months": t,
                    "monthly_amount": str(monthly),
                    "deposit_percent": str(dep_percent),
                    "deposit_amount": str(deposit_amount),
                    "upfront_amount": str(monthly + deposit_amount),
                    "total_rent": str(monthly * Decimal(t)),
                }

        # 3. Lease Quotes per tenure
        lease_quotes: dict[str, Any] = {}
        if "LEASE" in normalized_schemes and price > ZERO:
            for t in selected_lease_tenures:
                monthly = _q2(price * lease_yield * Decimal("12") / Decimal(t) / Decimal("100"))
                lease_quotes[str(t)] = {
                    "tenure_months": t,
                    "monthly_amount": str(monthly),
                    "deposit_percent": str(dep_percent),
                    "deposit_amount": str(deposit_amount),
                    "upfront_amount": str(monthly + deposit_amount),
                    "total_lease": str(monthly * Decimal(t)),
                }

        # 4. SFEMI Advance EMI Quotes (specifically 12m & 15m)
        sfemi_quotes: dict[str, Any] = {}
        if "SFEMI" in normalized_schemes and price > ZERO:
            for t in selected_sfemi_tenures:
                monthly = _q2(price / Decimal(t))
                is_promo_15m = (t == 15)
                sfemi_quotes[str(t)] = {
                    "tenure_months": t,
                    "monthly_amount": str(monthly),
                    "total_contract_amount": str(price),
                    "is_special_promotion": is_promo_15m,
                    "plan_label": "15-Month SFEMI Special Promotional Plan" if is_promo_15m else f"{t}-Month SFEMI Plan",
                    "promotional_benefit": (
                        "SFEMI Monthly Promotional Benefit: Remaining Future EMIs Waived for Selected Customer"
                        if is_promo_15m
                        else "Standard Advance EMI Installment Schedule"
                    ),
                }

        # Resolve image URL with robust cascading fallbacks
        image_url = None

        def _fmt_url(raw: str | None) -> str | None:
            if not raw or not str(raw).strip():
                return None
            s = str(raw).strip()
            if s.startswith("http://") or s.startswith("https://") or s.startswith("data:"):
                return s
            return f"{origin}{'' if s.startswith('/') else '/'}{s}"

        # 1. Direct p.image
        if bool(getattr(p, "image", None)):
            try:
                image_url = _fmt_url(p.image.url)
            except Exception:
                image_url = _fmt_url(str(p.image))

        # 2. Operational source product image
        if not image_url and getattr(p, "source_product", None):
            sp = p.source_product
            if bool(getattr(sp, "image", None)):
                try:
                    image_url = _fmt_url(sp.image.url)
                except Exception:
                    image_url = _fmt_url(str(sp.image))

        # 3. Own media_items (IMAGE kind only, prioritize hero)
        if not image_url and hasattr(p, "media_items"):
            for m in p.media_items.all():
                if getattr(m, "kind", None) == "IMAGE" and getattr(m, "is_hero", False) and getattr(m, "file", None):
                    image_url = _fmt_url(m.file)
                    break
            if not image_url:
                for m in p.media_items.all():
                    if getattr(m, "kind", None) == "IMAGE" and getattr(m, "file", None):
                        image_url = _fmt_url(m.file)
                        break

        # 4. If child variant SKU: check parent's ProductVariant matching this SKU code
        matching_v = None
        if p.parent and hasattr(p.parent, "variants"):
            p_code_clean = (p.code or "").strip().lower()
            for v in p.parent.variants.all():
                v_sku_clean = (getattr(v, "sku", None) or "").strip().lower()
                if v_sku_clean == p_code_clean or (v_sku_clean and p_code_clean and (v_sku_clean in p_code_clean or p_code_clean in v_sku_clean)):
                    matching_v = v
                    if not image_url and getattr(v, "image", None):
                        image_url = _fmt_url(v.image)
                        break
                    if not image_url and getattr(v, "operational_product", None) and getattr(v.operational_product, "image", None):
                        try:
                            image_url = _fmt_url(v.operational_product.image.url)
                            break
                        except Exception:
                            image_url = _fmt_url(str(v.operational_product.image))
                            break

        # 5. Check parent media items linked to this variant (by variant FK, SKU code, or keyword)
        if not image_url and p.parent and hasattr(p.parent, "media_items"):
            parent_images = [
                m for m in p.parent.media_items.all()
                if getattr(m, "kind", None) == "IMAGE" and getattr(m, "file", None)
            ]
            # 5a. Linked variant FK
            if matching_v:
                for m in parent_images:
                    if getattr(m, "variant_id", None) == matching_v.id:
                        image_url = _fmt_url(m.file)
                        break
            # 5b. Title or file containing SKU code
            if not image_url and p.code:
                p_code_lower = p.code.strip().lower()
                for m in parent_images:
                    t = (getattr(m, "title", None) or "").lower()
                    f = (str(getattr(m, "file", None)) or "").lower()
                    if p_code_lower in t or p_code_lower in f:
                        image_url = _fmt_url(m.file)
                        break

            # 5c. Attribute keyword scoring
            if not image_url:
                import re
                name_tokens = set(re.findall(r"[a-z0-9]+", (p.name or "").lower()))
                code_tokens = set(re.findall(r"[a-z0-9]+", (p.code or "").lower()))
                all_tokens = name_tokens | code_tokens
                # Filter out generic family words that all siblings share
                common_words = {"product", "model", "standard", "item", (p.parent.name or "").lower()}
                distinctive_tokens = {tok for tok in all_tokens if tok not in common_words and len(tok) >= 1}

                best_m = None
                best_score = 0
                for m in parent_images:
                    m_str = f"{getattr(m, 'title', '')} {getattr(m, 'file', '')}".lower()
                    m_tokens = set(re.findall(r"[a-z0-9]+", m_str))
                    score = len(distinctive_tokens & m_tokens) * 3 + len(all_tokens & m_tokens)
                    if score > best_score:
                        best_score = score
                        best_m = m

                if best_m and best_score >= 3:
                    image_url = _fmt_url(best_m.file)

            # 5d. Distribute distinct gallery images across sibling variants by index
            if not image_url and len(parent_images) > 1 and p.id in sibling_index_map:
                s_idx, _ = sibling_index_map[p.id]
                assigned_m = parent_images[s_idx % len(parent_images)]
                image_url = _fmt_url(assigned_m.file)

        # 6. If base blueprint: check own ProductVariant images
        if not image_url and not p.parent and hasattr(p, "variants"):
            for v in p.variants.all():
                if getattr(v, "image", None):
                    image_url = _fmt_url(v.image)
                    break

        # 7. Own assets (prioritize hero)
        if not image_url and hasattr(p, "assets"):
            for a in p.assets.all():
                if getattr(a, "is_hero", False) and bool(getattr(a, "image", None)):
                    try:
                        image_url = _fmt_url(a.image.url)
                        break
                    except Exception:
                        pass
            if not image_url:
                for a in p.assets.all():
                    if bool(getattr(a, "image", None)):
                        try:
                            image_url = _fmt_url(a.image.url)
                            break
                        except Exception:
                            pass

        # 8. Fallback to parent blueprint's hero image, media_items, and assets
        if not image_url and p.parent:
            if bool(getattr(p.parent, "image", None)):
                try:
                    image_url = _fmt_url(p.parent.image.url)
                except Exception:
                    pass
            if not image_url and hasattr(p.parent, "media_items"):
                for m in p.parent.media_items.all():
                    if getattr(m, "kind", None) == "IMAGE" and getattr(m, "is_hero", False) and getattr(m, "file", None):
                        image_url = _fmt_url(m.file)
                        break
                if not image_url:
                    for m in p.parent.media_items.all():
                        if getattr(m, "kind", None) == "IMAGE" and getattr(m, "file", None):
                            image_url = _fmt_url(m.file)
                            break
            if not image_url and hasattr(p.parent, "assets"):
                for a in p.parent.assets.all():
                    if getattr(a, "is_hero", False) and bool(getattr(a, "image", None)):
                        try:
                            image_url = _fmt_url(a.image.url)
                            break
                        except Exception:
                            pass
                if not image_url:
                    for a in p.parent.assets.all():
                        if bool(getattr(a, "image", None)):
                            try:
                                image_url = _fmt_url(a.image.url)
                                break
                            except Exception:
                                pass

        items.append({
            "id": p.id,
            "is_child": is_child,
            "parent_id": p.parent_id,
            "parent_code": parent_code,
            "parent_name": p.parent.name if p.parent else None,
            "code": p.code,
            "sku": p.code,
            "name": p.name,
            "full_name": f"{p.parent.name} — {p.name}" if is_child and p.parent else p.name,
            "category": cat_label,
            "category_id": p.category_id,
            "category_name": p.category.name if p.category else "",
            "subcategory_id": p.subcategory_id,
            "subcategory_name": p.subcategory.name if p.subcategory else "",
            "brand": p.brand or "",
            "base_price": str(price),
            "has_price": price > ZERO,
            "current_stock_qty": stock_qty,
            "specs": specs,
            "public_url": public_url,
            "image_url": image_url,
            "quotes": {
                "direct_sale": direct_sale_quote,
                "rent": {
                    "available": bool(rent_quotes),
                    "annual_yield_percent": str(rent_yield),
                    "deposit_percent": str(dep_percent),
                    "deposit_amount": str(deposit_amount),
                    "tenures": rent_quotes,
                },
                "lease": {
                    "available": bool(lease_quotes),
                    "annual_yield_percent": str(lease_yield),
                    "deposit_percent": str(dep_percent),
                    "deposit_amount": str(deposit_amount),
                    "tenures": lease_quotes,
                },
                "sfemi": {
                    "available": bool(sfemi_quotes),
                    "tenures": sfemi_quotes,
                    "promotional_terms": "Approved transparent promotional benefits. Zero hidden interest or charges.",
                },
            },
        })

    # Resolve authentic business profile & document print settings
    b_name = "Subidha Furniture"
    b_phone = "+91 94764 90946"
    b_address = "South Dhadka Sukantapally, Near Rupkatha Cinema Hall, Dakhin Dhadka, Asansol, Paschim Barddhaman, West Bengal 713302, India"
    b_email = "subidhafurnitureofficial@gmail.com"
    b_logo_url = "/brand/logo.png"

    try:
        from business_setup.models import BusinessProfile, DocumentPrintSettings
        print_settings = DocumentPrintSettings.objects.filter(is_active=True).first()
        profile = BusinessProfile.objects.first()

        if print_settings:
            if print_settings.business_name:
                b_name = print_settings.business_name.strip()
            if print_settings.print_phone:
                b_phone = print_settings.print_phone.strip()
            if print_settings.print_address:
                b_address = ", ".join([line.strip() for line in print_settings.print_address.splitlines() if line.strip()])
            if print_settings.print_email:
                b_email = print_settings.print_email.strip()
            if print_settings.business_logo:
                b_logo_url = getattr(print_settings.business_logo, "url", "") or b_logo_url
        elif profile:
            if profile.trade_name:
                b_name = profile.trade_name.strip()
            if profile.primary_phone:
                b_phone = profile.primary_phone.strip()
            if profile.primary_email:
                b_email = profile.primary_email.strip()
            if profile.logo_url:
                b_logo_url = profile.logo_url.strip()
            addr_parts = [
                profile.address_line_1,
                profile.address_line_2,
                profile.landmark,
                profile.city,
                profile.district,
                f"{profile.state} {profile.postal_code}".strip() if profile.postal_code else profile.state,
                profile.country,
            ]
            valid_parts = [p.strip() for p in addr_parts if p and p.strip()]
            if valid_parts:
                b_address = ", ".join(valid_parts)
    except Exception:
        pass

    # Generate customer-tailored WhatsApp Message
    whatsapp_lines: list[str] = [
        f"✨ *{b_name.upper()} — OFFICIAL PRICE LIST*",
    ]
    if customer_name.strip():
        whatsapp_lines.append(f"👤 *Prepared for:* {customer_name.strip()}")
    whatsapp_lines.extend([
        f"📍 {b_address}",
        f"📞 {b_phone} · 🌐 {origin}",
        "------------------------------------------",
        "Hello! Here is the custom price list with tenure breakdowns for your selected products:",
        "",
    ])

    roots = [i for i in items if not i["is_child"]]
    orphans = [i for i in items if i["is_child"] and not any(r["id"] == i["parent_id"] for r in roots)]

    def _render_item_text(item: dict[str, Any], indent: str = "") -> list[str]:
        lines: list[str] = []
        quotes = item["quotes"]
        if "DIRECT_SALE" in normalized_schemes and quotes["direct_sale"]["available"]:
            lines.append(f"{indent}💰 *Direct Sale (MRP):* {currency_symbol}{Decimal(quotes['direct_sale']['price']):,.2f}")

        if "RENT" in normalized_schemes and quotes["rent"]["available"]:
            lines.append(f"{indent}🏠 *Monthly Rent:* (Refundable Deposit: {currency_symbol}{Decimal(quotes['rent']['deposit_amount']):,.2f})")
            for t_str, q in sorted(quotes["rent"]["tenures"].items(), key=lambda x: int(x[0])):
                lines.append(f"{indent}   • {q['tenure_months']} Months Tenure: *{currency_symbol}{Decimal(q['monthly_amount']):,.2f}/mo*")

        if "LEASE" in normalized_schemes and quotes["lease"]["available"]:
            lines.append(f"{indent}🏢 *Monthly Lease:* (Refundable Deposit: {currency_symbol}{Decimal(quotes['lease']['deposit_amount']):,.2f})")
            for t_str, q in sorted(quotes["lease"]["tenures"].items(), key=lambda x: int(x[0])):
                lines.append(f"{indent}   • {q['tenure_months']} Months Tenure: *{currency_symbol}{Decimal(q['monthly_amount']):,.2f}/mo*")

        if "SFEMI" in normalized_schemes and quotes["sfemi"]["available"]:
            for t_str, q in sorted(quotes["sfemi"]["tenures"].items(), key=lambda x: int(x[0])):
                if q.get("is_special_promotion"):
                    lines.append(
                        f"{indent}⭐ *SFEMI 15-Month Special Promotion:* *{currency_symbol}{Decimal(q['monthly_amount']):,.2f}/mo* "
                        f"(15 mos · Remaining Future EMIs Waived!)"
                    )
                else:
                    lines.append(
                        f"{indent}⭐ *SFEMI {q['tenure_months']}-Month Plan:* *{currency_symbol}{Decimal(q['monthly_amount']):,.2f}/mo*"
                    )
        return lines

    item_idx = 1
    for root in roots:
        whatsapp_lines.append(f"{item_idx}. 📌 *{root['name']}* (Code: `{root['code']}`)")
        if root["category"]:
            whatsapp_lines.append(f"   📁 Category: {root['category']}")
        if root["specs"]:
            whatsapp_lines.append(f"   ℹ️ Specs: {' | '.join(root['specs'])}")

        children = [i for i in items if i["parent_id"] == root["id"]]
        if not children:
            whatsapp_lines.extend(_render_item_text(root, "   "))
            whatsapp_lines.append(f"   🔗 *View & Enquire:* {root['public_url']}")
        else:
            whatsapp_lines.append(f"   📦 *Available Variations & Models ({len(children)}):*")
            for child in children:
                whatsapp_lines.append(f"\n   🔹 *{child['full_name']}* (SKU: `{child['sku']}`)")
                if child["specs"]:
                    whatsapp_lines.append(f"      Specs: {' | '.join(child['specs'])}")
                whatsapp_lines.extend(_render_item_text(child, "      "))
                whatsapp_lines.append(f"      🔗 *Open Link / Scan QR:* {child['public_url']}")

        whatsapp_lines.append("")
        item_idx += 1

    for orphan in orphans:
        whatsapp_lines.append(f"{item_idx}. 🔹 *{orphan['full_name']}* (SKU: `{orphan['sku']}`)")
        if orphan["category"]:
            whatsapp_lines.append(f"   📁 Category: {orphan['category']}")
        if orphan["specs"]:
            whatsapp_lines.append(f"   ℹ️ Specs: {' | '.join(orphan['specs'])}")
        whatsapp_lines.extend(_render_item_text(orphan, "   "))
        whatsapp_lines.append(f"   🔗 *View & Enquire:* {orphan['public_url']}")
        whatsapp_lines.append("")
        item_idx += 1

    whatsapp_lines.extend([
        "------------------------------------------",
        "📲 *Scan QR codes or tap any product link above to view high-res photos, specs, and confirm terms.*",
        "✅ Quick KYC · Fast approval · Showroom warranty & delivery",
    ])
    whatsapp_message = "\n".join(whatsapp_lines)

    # Generate a compact, URL-safe summary message that never exceeds browser limits
    summary_lines: list[str] = [
        f"✨ *{b_name.upper()} — PRICE LIST*",
    ]
    if customer_name.strip():
        summary_lines.append(f"👤 *Prepared for:* {customer_name.strip()}")
    summary_lines.extend([
        f"📍 {b_address}",
        f"📞 {b_phone} · 🌐 {origin}",
        "------------------------------------------",
        f"Hello! Here is the pricing overview for your selected {len(items)} product(s):",
        "",
    ])
    sample_items = items[:3]
    for idx, s in enumerate(sample_items, 1):
        s_price = Decimal(s["base_price"])
        q = s["quotes"]
        summary_lines.append(f"{idx}. 📌 *{s['full_name']}* (Code: `{s['sku']}`)")
        if q["direct_sale"]["available"]:
            summary_lines.append(f"   💰 Direct Sale: {currency_symbol}{s_price:,.2f}")
        if q["rent"]["available"] and q["rent"]["tenures"]:
            t_first = sorted(q["rent"]["tenures"].keys(), key=int)[0]
            summary_lines.append(f"   🏠 Rent ({t_first}m): {currency_symbol}{Decimal(q['rent']['tenures'][t_first]['monthly_amount']):,.2f}/mo")
        if q["sfemi"]["available"] and "15" in q["sfemi"]["tenures"]:
            q15 = q["sfemi"]["tenures"]["15"]
            summary_lines.append(f"   ⭐ SFEMI 15m Promo: {currency_symbol}{Decimal(q15['monthly_amount']):,.2f}/mo (Future EMIs Waived!)")
        summary_lines.append("")

    if len(items) > 3:
        summary_lines.append(f"*(+ {len(items) - 3} more products in your complete quotation)*")
        summary_lines.append("📋 *Full itemized price list copied to clipboard! Paste below to view all.*")
        summary_lines.append("")

    summary_lines.extend([
        f"🔗 *Browse Online Catalog:* {origin}/products",
        "------------------------------------------",
        "✅ Transparent terms · Doorstep delivery · Quick approval",
    ])
    whatsapp_summary_message = "\n".join(summary_lines)

    return {
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "business_name": b_name,
        "business_phone": b_phone,
        "business_address": b_address,
        "business_email": b_email,
        "business_logo_url": b_logo_url,
        "requested_schemes": sorted(normalized_schemes),
        "rent_tenures": selected_rent_tenures,
        "lease_tenures": selected_lease_tenures,
        "sfemi_tenures": selected_sfemi_tenures,
        "item_count": len(items),
        "base_count": len(roots),
        "variant_count": len([i for i in items if i["is_child"]]),
        "items": items,
        "whatsapp_message": whatsapp_message,
        "whatsapp_summary_message": whatsapp_summary_message,
    }
