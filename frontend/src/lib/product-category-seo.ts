import type { PublicProduct } from "@/lib/public-api";

/**
 * Curated public SEO category definitions for Subidha Furniture.
 *
 * The backend `Product.category` is a free-form string (there is no category
 * slug or public-visibility field), so each SEO category maps to a set of
 * match terms. A public product belongs to a category page when its category
 * (or name) contains one of those terms. No backend data is invented; products
 * come from the existing public products API (finished goods only).
 */
export type ProductSeoCategory = {
  slug: string;
  name: string; // display + H1 noun (e.g. "Beds")
  metaTitle: string;
  metaDescription: string;
  intro: readonly string[];
  matchTerms: readonly string[]; // lowercase substrings matched against category/name
  faqs: readonly { question: string; answer: string }[];
};

export const PRODUCT_SEO_CATEGORIES: readonly ProductSeoCategory[] = [
  {
    slug: "beds",
    name: "Beds",
    metaTitle: "Beds in Asansol",
    metaDescription:
      "Wooden and storage beds at Subidha Furniture, Asansol. Visit our showroom for current bed designs, availability, and EMI or Lucky Plan options.",
    intro: [
      "Explore beds at Subidha Furniture in Asansol, West Bengal. We keep a range of wooden beds and storage beds suitable for Indian homes.",
      "Designs and availability change over time. Visit our showroom to see current bed models and to discuss EMI or Lucky Plan EMI options as per approved terms.",
    ],
    matchTerms: ["bed", "cot", "diwan"],
    faqs: [
      { question: "What types of beds do you have?", answer: "We stock wooden beds and storage beds in common sizes. Visit our Asansol showroom for the current range and availability." },
      { question: "Can I buy a bed on EMI in Asansol?", answer: "EMI and Lucky Plan EMI options may be available as per approved terms. Contact us or visit the showroom for details." },
    ],
  },
  {
    slug: "sofas",
    name: "Sofas",
    metaTitle: "Sofas in Asansol",
    metaDescription:
      "Sofa sets and seating at Subidha Furniture, Asansol. Visit our showroom for current sofa designs, availability, and EMI or Lucky Plan options.",
    intro: [
      "Browse sofas and seating at Subidha Furniture in Asansol. We keep sofa sets suited to living rooms of different sizes.",
      "Visit our showroom for the latest sofa designs and availability, and to understand EMI or Lucky Plan EMI options as per approved terms.",
    ],
    matchTerms: ["sofa", "couch", "settee", "recliner"],
    faqs: [
      { question: "Do you have sofa sets in Asansol?", answer: "Yes, we keep sofa sets at our Asansol showroom. Designs and stock change, so visit us for the current range." },
      { question: "Can I pay for a sofa in instalments?", answer: "EMI and Lucky Plan EMI options may be available as per approved terms. Ask us at the showroom." },
    ],
  },
  {
    slug: "wardrobes",
    name: "Wardrobes",
    metaTitle: "Wardrobes in Asansol",
    metaDescription:
      "Wardrobes and storage cabinets at Subidha Furniture, Asansol. Visit our showroom for current designs, availability, and EMI or Lucky Plan options.",
    intro: [
      "Find wardrobes and storage cabinets at Subidha Furniture in Asansol. We keep options for bedroom storage in different sizes.",
      "Visit our showroom for current wardrobe designs and availability, and to discuss EMI or Lucky Plan EMI options as per approved terms.",
    ],
    matchTerms: ["wardrobe", "almirah", "cupboard", "cabinet"],
    faqs: [
      { question: "What wardrobe sizes are available?", answer: "We keep wardrobes in common sizes. Visit our Asansol showroom for the current range and availability." },
    ],
  },
  {
    slug: "dining-tables",
    name: "Dining Tables",
    metaTitle: "Dining Tables in Asansol",
    metaDescription:
      "Dining tables and sets at Subidha Furniture, Asansol. Visit our showroom for current designs, availability, and EMI or Lucky Plan options.",
    intro: [
      "Explore dining tables and dining sets at Subidha Furniture in Asansol. We keep options for families of different sizes.",
      "Visit our showroom for the latest dining table designs and availability, and to discuss EMI or Lucky Plan EMI options as per approved terms.",
    ],
    matchTerms: ["dining", "dinner table"],
    faqs: [
      { question: "Do you sell dining sets in Asansol?", answer: "Yes, we keep dining tables and sets at our Asansol showroom. Visit us for the current range and availability." },
    ],
  },
  {
    slug: "mattresses",
    name: "Mattresses",
    metaTitle: "Mattresses in Asansol",
    metaDescription:
      "Mattresses in common sizes at Subidha Furniture, Asansol. Visit our showroom for current options, availability, and EMI or Lucky Plan options.",
    intro: [
      "Browse mattresses at Subidha Furniture in Asansol. We keep mattresses in common bed sizes.",
      "Visit our showroom for the current mattress options and availability, and to discuss EMI or Lucky Plan EMI options as per approved terms.",
    ],
    matchTerms: ["mattress", "matress"],
    faqs: [
      { question: "What mattress sizes do you have?", answer: "We keep mattresses in common sizes. Visit our Asansol showroom for the current options and availability." },
    ],
  },
  {
    slug: "appliances",
    name: "Appliances",
    metaTitle: "Home Appliances in Asansol",
    metaDescription:
      "Selected home appliances at Subidha Furniture, Asansol. Visit our showroom for current options, availability, and EMI or Lucky Plan options.",
    intro: [
      "Find selected home appliances at Subidha Furniture in Asansol, subject to availability.",
      "Visit our showroom for the current appliance options and to discuss EMI or Lucky Plan EMI options as per approved terms.",
    ],
    matchTerms: ["appliance", "refrigerator", "fridge", "washing machine", "television", " tv", "cooler", "microwave"],
    faqs: [
      { question: "Which appliances are available?", answer: "Selected home appliances may be available subject to stock. Visit our Asansol showroom or contact us for the current options." },
    ],
  },
];

export function getSeoCategory(slug: string): ProductSeoCategory | undefined {
  return PRODUCT_SEO_CATEGORIES.find((category) => category.slug === slug);
}

function haystackFor(product: PublicProduct): string {
  return `${product.category || ""} ${product.subcategory || ""} ${product.name || ""}`.toLowerCase();
}

/** Public products that belong to a given SEO category, by match terms. */
export function productsForCategory(category: ProductSeoCategory, products: readonly PublicProduct[]): PublicProduct[] {
  return products.filter((product) => {
    const haystack = haystackFor(product);
    return category.matchTerms.some((term) => haystack.includes(term));
  });
}
