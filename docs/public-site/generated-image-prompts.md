# Public-site generated image prompts

Purpose: keep public marketing visuals premium and consistent without putting real customer data, fake winners, fake payments, or operational screenshots into source code.

Use these prompts to generate final `.webp` assets and place them under:

```text
frontend/public/marketing/generated/
```

Do not include text, logos, phone numbers, customer names, payment amounts, receipt numbers, Lucky Draw results, or screenshots of the authenticated dashboard in generated images.

After placing reviewed `.webp` files, activate them through the frontend manifest:

```text
frontend/src/lib/public-marketing-assets.ts
```

Set only the matching reviewed asset's `imageExists` value to `true`. Keep unknown, missing, or unreviewed files as `false` so the public UI uses the safe decorative fallback.

## Required files

```text
hero-3d-showroom.webp
lucky-plan-3d-card.webp
rent-lease-3d-room.webp
product-wall-3d.webp
receipt-contract-3d.webp
winner-draw-3d.webp
asansol-family-furniture.webp
showroom-premium-interior.webp
```

## Global style

Use this visual direction for every image:

```text
Premium Indian furniture showroom, warm cream and walnut brown palette, modern 3D rendered furniture, soft studio lighting, clean composition, elegant retail-finance feel, no text, no logo, no watermark, high-quality 3D render, web landing page hero asset
```

## Prompts

### `hero-3d-showroom.webp`

```text
Premium Indian furniture showroom, warm cream and walnut brown interior, modern 3D rendered sofa, bed, wardrobe and dining set, soft studio lighting, elegant finance cards floating around, clean background, premium retail branding mood, no text, no logo, no people, high quality 3D render
```

### `lucky-plan-3d-card.webp`

```text
Modern 3D furniture EMI subscription concept, floating lucky number cards from 00 to 99, premium sofa and bed in background, warm brown and gold color palette, transparent monthly plan mood, clean finance dashboard style, no gambling imagery, no text, no logo, high quality 3D render
```

### `rent-lease-3d-room.webp`

```text
Premium 3D living room with sofa, bed, wardrobe and appliances, rental and leasing concept, floating monthly invoice card and refundable deposit icon, warm cream brown palette, modern Indian showroom design, no text, no logo, no people, high quality 3D render
```

### `product-wall-3d.webp`

```text
Elegant 3D wall of furniture product categories, bed, wardrobe, sofa, dining set, mattress, office chair, refrigerator and washing machine arranged as premium showroom tiles, warm cream and walnut brown background, soft shadows, no text, no logo, high quality render
```

### `receipt-contract-3d.webp`

```text
Modern 3D retail finance documents concept, clean receipt card, contract folder, small furniture model, payment safety mood, warm cream and walnut brown palette, no readable text, no real numbers, no logo, high quality render
```

### `winner-draw-3d.webp`

```text
Transparent public winner announcement concept for furniture EMI plan, glowing lucky number card, soft gold light, premium furniture showroom background, responsible non-gambling presentation, no text, no real winner data, no logo, high quality 3D render
```

### `asansol-family-furniture.webp`

```text
Warm aspirational Indian family home furniture scene, modern sofa and bed setup, premium but affordable retail mood, cream and walnut brown palette, soft natural light, no text, no logo, no identifiable faces, high quality 3D render
```

### `showroom-premium-interior.webp`

```text
Premium furniture showroom interior in India, organized beds, wardrobes, sofas, dining sets and appliances, warm cream wall color and walnut accents, spacious retail lighting, clean walking path, no text, no logo, no people, high quality 3D render
```

## Safety notes

- Generated visuals are decorative only.
- Live stats, winners, products, applications, payments, receipts, and contracts must come from real backend endpoints or customer/admin workflows.
- Do not use generated images to imply fake stock availability, fake winners, fake branch scale, fake financing approval, or fake customer proof.
