"use client";

import React from "react";
import { Printer } from "lucide-react";

interface WarehouseLabelProps {
  productCode: string;
  productName: string;
  sku: string;
  barcode: string;
  qrCode: string;
  disabled?: boolean;
}

/**
 * Printable warehouse label (4" x 3" format) with product info, barcode, and QR code.
 * Opens a print dialog that can be sent to thermal printer or PDF.
 */
const WarehouseLabel: React.FC<WarehouseLabelProps> = ({
  productCode,
  productName,
  sku,
  barcode,
  qrCode,
  disabled = false,
}) => {
  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Warehouse Label - ${productCode}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: Arial, sans-serif;
            background: white;
            padding: 20px;
          }
          .label {
            width: 4in;
            height: 3in;
            border: 1px solid #000;
            padding: 8px;
            page-break-after: always;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            font-size: 11px;
            line-height: 1.2;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 4px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 4px;
          }
          .product-code {
            font-size: 14px;
            font-weight: bold;
            color: #d32f2f;
          }
          .product-name {
            font-size: 10px;
            font-weight: bold;
            margin: 2px 0;
            word-break: break-word;
          }
          .sku-line {
            font-size: 9px;
            color: #666;
            margin: 2px 0;
          }
          .tracking-codes {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px;
            margin-top: 4px;
          }
          .code-box {
            border: 1px solid #ccc;
            padding: 2px;
            text-align: center;
          }
          .code-label {
            font-size: 8px;
            font-weight: bold;
            margin-bottom: 1px;
          }
          .code-value {
            font-family: 'Courier New', monospace;
            font-size: 9px;
            font-weight: bold;
            word-break: break-all;
          }
          @media print {
            body {
              margin: 0;
              padding: 0;
            }
            .label {
              page-break-after: always;
              border-width: 0.5pt;
            }
          }
        </style>
      </head>
      <body>
        <div class="label">
          <div>
            <div class="header">
              <div>
                <div class="product-code">${productCode}</div>
                <div class="product-name">${productName}</div>
              </div>
            </div>
            <div class="sku-line">SKU: ${sku || "—"}</div>
          </div>

          <div class="tracking-codes">
            <div class="code-box">
              <div class="code-label">BARCODE</div>
              <div class="code-value">${barcode || "—"}</div>
            </div>
            <div class="code-box">
              <div class="code-label">QR CODE</div>
              <div class="code-value">${qrCode || "—"}</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-3 p-4 border rounded-lg bg-amber-50 border-amber-200">
      <div className="flex items-center gap-2">
        <Printer className="h-4 w-4 text-amber-700" />
        <label className="text-sm font-semibold text-amber-900">Warehouse Label (4x3")</label>
      </div>

      {/* Preview */}
      <div className="bg-white border border-amber-300 rounded p-3 text-xs font-mono space-y-1">
        <div className="font-bold text-red-600">{productCode}</div>
        <div className="text-xs text-gray-800">{productName}</div>
        <div className="text-gray-600">SKU: {sku || "—"}</div>
        <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
          <div className="border border-dashed p-1 text-center">
            <div className="text-gray-600 text-xs mb-1">Barcode</div>
            <div className="font-bold text-gray-800 break-all">{barcode || "—"}</div>
          </div>
          <div className="border border-dashed p-1 text-center">
            <div className="text-gray-600 text-xs mb-1">QR</div>
            <div className="font-bold text-gray-800 break-all">{qrCode || "—"}</div>
          </div>
        </div>
      </div>

      {/* Print Button */}
      <button
        onClick={handlePrint}
        disabled={disabled || !barcode}
        className="w-full px-3 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
      >
        <Printer className="h-4 w-4" />
        Print Labels
      </button>

      <p className="text-xs text-amber-700">
        💡 Tip: Set printer to 4×3" thermal label format. Best with zebra/thermal printer.
      </p>
    </div>
  );
};

export default WarehouseLabel;
