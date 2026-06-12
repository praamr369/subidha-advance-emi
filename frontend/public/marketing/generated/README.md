# Generated public marketing assets

Place generated public-site `.webp` images in this directory.

Expected production filenames:

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

Prompt source:

```text
docs/public-site/generated-image-prompts.md
```

Frontend asset manifest:

```text
frontend/src/lib/public-marketing-assets.ts
```

Activation workflow:

1. Generate approved `.webp` files from the prompt source.
2. Place the files in this directory using the exact filenames above.
3. Review every image for safety before committing.
4. Set the matching `imageExists` flag to `true` in `frontend/src/lib/public-marketing-assets.ts`.
5. Run the frontend smoke checks before deployment.

Rules:

- Do not commit customer data or screenshots from authenticated dashboards.
- Do not generate fake receipts, fake winner names, fake payment references, or fake stats.
- Do not imply fake stock availability, fake financing approval, fake delivery proof, or fake branch scale.
- Use decorative visuals only.
