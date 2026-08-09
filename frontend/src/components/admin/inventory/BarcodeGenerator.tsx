"use client";

import React, { useState } from "react";
import { Copy, RotateCcw, AlertCircle } from "lucide-react";

interface BarcodeGeneratorProps {
  productCode: string;
  sku: string;
  onBarcodesGenerated: (barcode: string, qrCode: string) => void;
  disabled?: boolean;
}

/**
 * Barcode & QR code generator using Luhn checksum algorithm.
 * All computation is client-side (offline-capable).
 */
const BarcodeGenerator: React.FC<BarcodeGeneratorProps> = ({
  productCode,
  sku,
  onBarcodesGenerated,
  disabled = false,
}) => {
  const [barcode, setBarcode] = useState<string>("");
  const [qrCode, setQrCode] = useState<string>("");
  const [copied, setCopied] = useState<"barcode" | "qr" | null>(null);

  // Luhn checksum algorithm
  const calculateLuhnChecksum = (digits: string): string => {
    const numArray = digits.split("").map(Number);
    let sum = 0;
    let isSecond = false;

    for (let i = numArray.length - 1; i >= 0; i--) {
      let digit = numArray[i];
      if (isSecond) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      isSecond = !isSecond;
    }

    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit.toString();
  };

  const generateBarcode = (): void => {
    if (!productCode.trim()) {
      alert("Product code is required");
      return;
    }

    const code = productCode.toUpperCase().trim();
    const digits = code.replace(/\D/g, "").slice(0, 8);
    const checksum = calculateLuhnChecksum(digits);
    const newBarcode = `BC-${code}-${checksum}`;
    setBarcode(newBarcode);

    // QR code: QR-ProductCode-SKU
    const qr = `QR-${code}-${(sku || "").toUpperCase().slice(0, 10)}`;
    setQrCode(qr);

    onBarcodesGenerated(newBarcode, qr);
  };

  const generateRandom = (): void => {
    const randomDigits = Math.random().toString().slice(2, 10).padStart(8, "0");
    const checksum = calculateLuhnChecksum(randomDigits);
    const newBarcode = `BC-RND-${randomDigits.slice(0, 4)}-${checksum}`;
    setBarcode(newBarcode);

    const newQr = `QR-RND-${Date.now().toString().slice(-6)}`;
    setQrCode(newQr);

    onBarcodesGenerated(newBarcode, newQr);
  };

  const copyToClipboard = (text: string, type: "barcode" | "qr") => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const reset = () => {
    setBarcode("");
    setQrCode("");
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <p className="font-semibold">Auto-Generate Barcodes</p>
          <p className="text-xs text-blue-700 mt-1">
            Client-side generation (offline-capable). Barcode uses Luhn checksum for validation.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Barcode Output */}
        {barcode && (
          <div className="p-3 border border-blue-200 rounded-lg bg-white">
            <label className="text-xs font-semibold text-gray-600 mb-2 block">Barcode</label>
            <div className="font-mono text-lg font-bold text-blue-700 mb-2 break-all">
              {barcode}
            </div>
            <button
              onClick={() => copyToClipboard(barcode, "barcode")}
              className="w-full text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition"
            >
              <Copy className="h-3 w-3 inline mr-1" />
              {copied === "barcode" ? "Copied!" : "Copy"}
            </button>
          </div>
        )}

        {/* QR Code Output */}
        {qrCode && (
          <div className="p-3 border border-green-200 rounded-lg bg-white">
            <label className="text-xs font-semibold text-gray-600 mb-2 block">QR Code</label>
            <div className="font-mono text-lg font-bold text-green-700 mb-2 break-all">
              {qrCode}
            </div>
            <button
              onClick={() => copyToClipboard(qrCode, "qr")}
              className="w-full text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 transition"
            >
              <Copy className="h-3 w-3 inline mr-1" />
              {copied === "qr" ? "Copied!" : "Copy"}
            </button>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={generateBarcode}
          disabled={disabled || !productCode.trim()}
          className="flex-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Generate from Code
        </button>
        <button
          onClick={generateRandom}
          disabled={disabled}
          className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Random Set
        </button>
        {(barcode || qrCode) && (
          <button
            onClick={reset}
            className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default BarcodeGenerator;
