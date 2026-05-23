export type DocumentCopyLabel = "Original" | "Customer Copy" | "Office Copy" | "Duplicate";

export type DocumentBrandTheme = {
  businessName: string;
  logoPath: string;
  phone: string;
  email: string;
  website: string;
  addressLines: string[];
  panLabel: string;
  gstLabel: string;
  defaultTerms: string[];
  signatureLabels: {
    authorized: string;
    customer: string;
    receiver: string;
    staff: string;
  };
  colors: {
    ink: string;
    muted: string;
    ivory: string;
    brown: string;
    gold: string;
    border: string;
  };
};

export const documentCopyLabels: DocumentCopyLabel[] = [
  "Original",
  "Customer Copy",
  "Office Copy",
  "Duplicate",
];

export const subidhaDocumentTheme: DocumentBrandTheme = {
  businessName: "Subidha Furniture",
  logoPath: "/logo.png",
  phone: "+91 77972 80952",
  email: "support@subidhafurnitureasansol.com",
  website: "subidhafurnitureasansol.com",
  addressLines: [
    "Subidha Furniture, Asansol",
    "West Bengal, India",
  ],
  panLabel: "PAN: —",
  gstLabel: "GSTIN: —",
  defaultTerms: [
    "All amounts and balances are shown from posted business records only.",
    "This document is system generated and valid with authorized signature/stamp where required.",
    "Cancelled, voided, returned, or draft documents must not be treated as normal paid documents.",
  ],
  signatureLabels: {
    authorized: "Authorized Signature",
    customer: "Customer Signature",
    receiver: "Receiver Signature",
    staff: "Staff Signature",
  },
  colors: {
    ink: "#2f2418",
    muted: "#7c6a56",
    ivory: "#fffaf0",
    brown: "#6f4e27",
    gold: "#b8872f",
    border: "#e7d7bd",
  },
};
