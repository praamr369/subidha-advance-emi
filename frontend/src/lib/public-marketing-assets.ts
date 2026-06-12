export type PublicMarketingAssetKey =
  | "heroShowroom"
  | "luckyPlanCard"
  | "rentLeaseRoom"
  | "productWall"
  | "receiptContract"
  | "winnerDraw"
  | "asansolFamilyFurniture"
  | "showroomPremiumInterior";

export type PublicMarketingAsset = {
  key: PublicMarketingAssetKey;
  src: string;
  alt: string;
  label: string;
  imageExists: boolean;
};

export const PUBLIC_MARKETING_ASSETS: Record<PublicMarketingAssetKey, PublicMarketingAsset> = {
  heroShowroom: {
    key: "heroShowroom",
    src: "/marketing/generated/hero-3d-showroom.webp",
    alt: "Decorative 3D furniture showroom visual",
    label: "Showroom visual",
    imageExists: true,
  },
  luckyPlanCard: {
    key: "luckyPlanCard",
    src: "/marketing/generated/lucky-plan-3d-card.webp",
    alt: "Decorative 3D monthly plan furniture visual",
    label: "Plan visual",
    imageExists: true,
  },
  rentLeaseRoom: {
    key: "rentLeaseRoom",
    src: "/marketing/generated/rent-lease-3d-room.webp",
    alt: "Decorative 3D furniture room visual",
    label: "Room visual",
    imageExists: true,
  },
  productWall: {
    key: "productWall",
    src: "/marketing/generated/product-wall-3d.webp",
    alt: "Decorative 3D product category wall visual",
    label: "Product visual",
    imageExists: true,
  },
  receiptContract: {
    key: "receiptContract",
    src: "/marketing/generated/receipt-contract-3d.webp",
    alt: "Decorative 3D document and furniture visual",
    label: "Document visual",
    imageExists: true,
  },
  winnerDraw: {
    key: "winnerDraw",
    src: "/marketing/generated/winner-draw-3d.webp",
    alt: "Decorative 3D public proof visual",
    label: "Proof visual",
    imageExists: true,
  },
  asansolFamilyFurniture: {
    key: "asansolFamilyFurniture",
    src: "/marketing/generated/asansol-family-furniture.webp",
    alt: "Decorative home furniture scene visual",
    label: "Home visual",
    imageExists: true,
  },
  showroomPremiumInterior: {
    key: "showroomPremiumInterior",
    src: "/marketing/generated/showroom-premium-interior.webp",
    alt: "Decorative premium showroom interior visual",
    label: "Interior visual",
    imageExists: true,
  },
};
