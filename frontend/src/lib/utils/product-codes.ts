/**
 * SKU and barcode generation utilities
 */

export interface GeneratedCodes {
  sku: string;
  barcode: string;
}

/**
 * Generate SKU from product code and optional variant
 * Format: SKU-{PRODUCTCODE}-{VARIANT}
 * Example: SKU-CHAIR-001-BLU (for blue variant)
 */
export function generateSKU(
  productCode: string,
  variantCode?: string,
  sequence?: number
): string {
  const code = productCode.trim().toUpperCase();
  const seq = String(sequence || 1).padStart(3, "0");

  if (variantCode) {
    const variant = variantCode.trim().toUpperCase().substring(0, 3);
    return `SKU-${code}-${seq}-${variant}`;
  }

  return `SKU-${code}-${seq}`;
}

/**
 * Generate barcode from product code
 * Format: BC-{PRODUCTCODE}-{CHECKSUM}
 * Checksum is Luhn algorithm
 */
export function generateBarcode(productCode: string): string {
  const code = productCode.trim().toUpperCase();
  const baseNumber = `${code}`.replace(/[^0-9]/g, "").padEnd(12, "0").substring(0, 12);

  // Calculate Luhn checksum
  const checksum = calculateLuhn(baseNumber);

  return `BC-${code}-${checksum}`;
}

/**
 * Generate both SKU and barcode together
 */
export function generateProductCodes(
  productCode: string,
  variantCode?: string,
  sequence?: number
): GeneratedCodes {
  return {
    sku: generateSKU(productCode, variantCode, sequence),
    barcode: generateBarcode(productCode),
  };
}

/**
 * Calculate Luhn checksum for barcode validation
 */
function calculateLuhn(digits: string): string {
  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  const checksum = (10 - (sum % 10)) % 10;
  return String(checksum);
}

/**
 * Generate batch of SKUs for variants
 */
export function generateVariantSKUs(
  productCode: string,
  variants: Array<{ code: string; name: string }>,
  startSequence: number = 1
): Array<{ variant: string; sku: string }> {
  return variants.map((v, idx) => ({
    variant: v.name,
    sku: generateSKU(productCode, v.code, startSequence + idx),
  }));
}

/**
 * Validate SKU format
 */
export function isValidSKU(sku: string): boolean {
  return /^SKU-[A-Z0-9]+-\d{3}(-[A-Z]{3})?$/.test(sku);
}

/**
 * Validate barcode format
 */
export function isValidBarcode(barcode: string): boolean {
  return /^BC-[A-Z0-9]+-\d$/.test(barcode);
}
