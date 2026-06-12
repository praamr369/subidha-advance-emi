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
    alt: "Decorative 3D premium furniture showroom visual for Subidha Furniture public homepage",
    label: "3D showroom visual",
    imageExists: false,
  },
  luckyPlanCard: {
    key: "luckyPlanCard",
    src: "/marketing/generated/lucky-plan-3d-card.webp",
    alt: "Decorative 3D Lucky Plan furniture EMI visual",
    label: "Lucky Plan visual",
    imageExists: false,
  },
  rentLeaseRoom: {
    key: "rentLeaseRoom",
    src: "/marketing/generated/rent-lease-3d-room.webp",
    alt: "Decorative 3D rent and lease furniture room visual",
    label: "Rent / Lease visual",
    imageExists: false,
  },
  productWall: {
    key: "productWall",
    src: "/marketing/generated/product-wall-3d.webp",
    alt: "Decorative 3D product category wall for furniture, electronics, and appliances",
    label: "Product wall visual",
    imageExists: false,
  },
  receiptContract: {
    key: "receiptContract",
    src: "/marketing/generated/receipt-contract-3d.webp",
    alt: "Decorative 3D retail contract and receipt concept visual",
    label: "Contract + receipt visual",
    imageExists: false,
  },
  winnerDraw: {
    key: "winnerDraw",
    src: "/marketing/generated/winner-draw-3d.webp",
    alt: "Decorative 3D public winner draw proof visual for Lucky Plan explanation",
    label: "Draw proof visual",
    imageExists: false,
  },
  asansolFamilyFurniture: {
    key: "asansolFamilyFurniture",
    src: "/marketing/generated/asansol-family-furniture.webp",
    alt: "Decorative aspirational Indian family furniture scene visual",
    label: "Family furniture visual",
    imageExists: false,
  },
  showroomPremiumInterior: {
    key: "showroomPremiumInterior",
    src: "/marketing/generated/showroom-premium-interior.webp",
    alt: "Decorative premium furniture showroom interior visual",
    label: "Showroom interior visual",
    imageExists: false,
  },
};
