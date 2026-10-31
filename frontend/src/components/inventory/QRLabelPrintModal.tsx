"use client";

import { useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Globe,
  Grid,
  Layers,
  Printer,
  QrCode as QrIcon,
  Tag,
  X,
} from "lucide-react";

export interface QRLabelItem {
  id?: number;
  productName: string;
  productCode: string;
  sku?: string;
  category?: string;
  price?: string | number;
  qrValue: string;
  publicUrl?: string;
  unitOfMeasure?: string;
  brand?: string;
  specs?: Record<string, string>;
}

export type QRLabelLayout = "thermal_4x3" | "a4_grid" | "showroom_stand";

interface Props {
  item?: QRLabelItem | null;
  items?: QRLabelItem[];
  onClose: () => void;
}

function escapeHtml(str: string | number | undefined | null): string {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Automatically builds an OS-safe, human-readable filename for product QR downloads.
 * Format: [Product Code or SKU] - [Product Full Name with Attributes].png
 * Example: "BAHU-BED_BAHU-BED-MET-K(FX7F) - Bahubali Bed - Metal, King (6 ft x 7 ft), Stainless Steel.png"
 */
export function buildDownloadFilename(item: QRLabelItem): string {
  let codePart = "";
  if (item.productCode && item.sku && item.productCode !== item.sku) {
    codePart = `${item.productCode}_${item.sku}`;
  } else {
    codePart = item.sku || item.productCode || (item.id ? `PROD-${item.id}` : "PRODUCT");
  }

  const safeCode = codePart
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .trim();

  const fullName = (item.productName || "Product").trim();
  const safeName = fullName
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s*—\s*/g, " - ")
    .replace(/\s*–\s*/g, " - ")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .trim();

  const combined = `${safeCode} - ${safeName}`.slice(0, 180).trim();
  return `${combined}.png`;
}

function formatPrice(val: string | number | undefined | null): string {
  if (val == null || val === "") return "";
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function QRLabelPrintModal({ item, items, onClose }: Props) {
  const [layout, setLayout] = useState<QRLabelLayout>("thermal_4x3");
  const [encodeMode, setEncodeMode] = useState<"url" | "sku">("url");
  const [activeIdx, setActiveIdx] = useState(0);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://subidhafurnitureasansol.com";

  // Normalize single item vs array
  const labelList = useMemo<QRLabelItem[]>(() => {
    if (items && items.length > 0) return items;
    if (item) return [item];
    return [];
  }, [items, item]);

  const activeItem = labelList[activeIdx] ?? labelList[0];

  function getItemPublicUrl(it: QRLabelItem): string {
    if (it.publicUrl && it.publicUrl.startsWith("http")) {
      return it.publicUrl;
    }
    const code = it.productCode || it.sku || "";
    if (!code) return it.qrValue;
    const base = `${origin}/products/${encodeURIComponent(code)}`;
    return it.sku && it.sku !== it.productCode
      ? `${base}?sku=${encodeURIComponent(it.sku)}`
      : base;
  }

  function getItemQrValue(it: QRLabelItem): string {
    if (encodeMode === "url") {
      return getItemPublicUrl(it);
    }
    return it.sku || it.productCode || it.qrValue;
  }

  // Draw high-resolution PNG on Canvas with product name & code included
  async function generatePNGDataUrl(it: QRLabelItem): Promise<string> {
    const qrValue = getItemQrValue(it);
    const svgEl = document.getElementById(`qr-svg-item-${it.productCode || it.sku || it.id}`);
    const svgString = svgEl
      ? new XMLSerializer().serializeToString(svgEl)
      : `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280"></svg>`;

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
      img.src = url;
    });

    const width = 640;
    const maxWidth = width - 80;
    const words = (it.productName || "Product").split(" ");
    const nameLines: string[] = [];
    let curLine = "";

    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.font = "bold 22px sans-serif";
    for (let n = 0; n < words.length; n++) {
      const testLine = curLine ? `${curLine} ${words[n]}` : words[n];
      if (tempCtx.measureText(testLine).width > maxWidth && curLine) {
        nameLines.push(curLine);
        curLine = words[n];
      } else {
        curLine = testLine;
      }
    }
    if (curLine) nameLines.push(curLine);

    const qrSize = 300;
    const priceFormatted = formatPrice(it.price);
    const codeDisplay = it.productCode && it.sku && it.productCode !== it.sku
      ? `${it.productCode} • SKU: ${it.sku}`
      : (it.sku || it.productCode || "");
    const catStr = it.category ? ` • ${it.category}` : "";

    const nameBlockHeight = nameLines.length * 28;
    const height = Math.max(820, 100 + nameBlockHeight + 35 + (priceFormatted ? 36 : 0) + qrSize + 110);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    // Card background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, width - 32, height - 32);

    // Brand Header
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SUBIDHA FURNITURE ASANSOL", width / 2, 54);

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(40, 68);
    ctx.lineTo(width - 40, 68);
    ctx.stroke();

    // Product Name with attributes (wrapped)
    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "#0f172a";
    let y = 100;
    for (const l of nameLines) {
      ctx.fillText(l, width / 2, y);
      y += 28;
    }

    // Code & SKU & Category
    y += 6;
    ctx.font = "14px monospace";
    ctx.fillStyle = "#475569";
    ctx.fillText(`${codeDisplay}${catStr}`, width / 2, y);

    // Price
    if (priceFormatted) {
      y += 34;
      ctx.font = "bold 24px sans-serif";
      ctx.fillStyle = "#047857";
      ctx.fillText(priceFormatted, width / 2, y);
    }

    // QR Code
    const qrX = (width - qrSize) / 2;
    const qrY = y + 20;

    // QR white container
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.strokeRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);

    ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
    URL.revokeObjectURL(url);

    // Footer callout
    y = qrY + qrSize + 36;
    ctx.font = "bold 13px sans-serif";
    ctx.fillStyle = "#0369a1";
    ctx.fillText(
      encodeMode === "url"
        ? "Scan with phone camera for Full Specs, Price & 3D AR"
        : "Warehouse SKU Barcode Label",
      width / 2,
      y
    );

    y += 22;
    ctx.font = "11px monospace";
    ctx.fillStyle = "#64748b";
    ctx.fillText(qrValue, width / 2, y);

    return canvas.toDataURL("image/png");
  }

  // Download individual QR PNG with Product Code/SKU and Full Name with Attributes in filename
  async function handleDownloadSinglePNG(it: QRLabelItem) {
    const dataUrl = await generatePNGDataUrl(it);
    if (!dataUrl) return;
    const filename = buildDownloadFilename(it);
    const a = document.createElement("a");
    a.download = filename;
    a.href = dataUrl;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Download all QRs sequentially with auto-configured filenames
  async function handleDownloadAllPNGs() {
    if (labelList.length === 0 || downloadingAll) return;
    setDownloadingAll(true);
    for (let i = 0; i < labelList.length; i++) {
      const it = labelList[i];
      await handleDownloadSinglePNG(it);
      // Brief delay to allow browser download queue to process cleanly
      await new Promise((res) => setTimeout(res, 280));
    }
    setDownloadingAll(false);
  }

  // Download complete standalone HTML print sheet
  function handleDownloadHTMLSheet() {
    const docHtml = buildPrintHtml();
    const blob = new Blob([docHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `subidha-showroom-qr-labels-${labelList.length}-products.html`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Build the complete printable HTML document
  function buildPrintHtml(): string {
    const renderedCards = labelList.map((it) => {
      const svgEl = document.getElementById(`qr-svg-item-${it.productCode || it.sku || it.id}`);
      const svgHtml = svgEl?.outerHTML || "";
      const priceFormatted = formatPrice(it.price);
      const code = escapeHtml(it.productCode || it.sku);
      const sku = it.sku && it.sku !== it.productCode ? ` · ${escapeHtml(it.sku)}` : "";
      const name = escapeHtml(it.productName);
      const category = escapeHtml(it.category);
      const qrVal = escapeHtml(getItemQrValue(it));

      if (layout === "a4_grid") {
        return `
          <div class="a4-card">
            <div class="brand">SUBIDHA FURNITURE ASANSOL</div>
            <div class="name">${name}</div>
            <div class="meta">${code}${sku}${category ? ` &bull; ${category}` : ""}</div>
            ${priceFormatted ? `<div class="price">${escapeHtml(priceFormatted)}</div>` : ""}
            <div class="qr">${svgHtml}</div>
            <div class="callout">${encodeMode === "url" ? "Scan with phone for full specs, price &amp; 3D AR" : "Warehouse SKU"}</div>
            <div class="code-val">${qrVal}</div>
          </div>
        `;
      }

      if (layout === "showroom_stand") {
        return `
          <div class="stand-card">
            <div class="stand-brand">SUBIDHA FURNITURE &bull; SHOWROOM SPECIFICATION</div>
            <div class="stand-name">${name}</div>
            <div class="stand-meta">${code}${sku}${category ? ` &bull; ${category}` : ""}</div>
            ${priceFormatted ? `<div class="stand-price">${escapeHtml(priceFormatted)}</div>` : ""}
            <div class="stand-qr">${svgHtml}</div>
            <div class="stand-callout">${encodeMode === "url" ? "Point phone camera to view full specs, photos &amp; 3D AR in your room" : "Showroom Code"}</div>
            <div class="stand-sub">Compatible with Showroom POS &amp; Billing Scanner</div>
          </div>
        `;
      }

      // Default: 4×3 Thermal / Sticker
      return `
        <div class="thermal-label">
          <div class="brand">SUBIDHA FURNITURE ASANSOL</div>
          <div class="name">${name}</div>
          <div class="meta">${code}${sku}</div>
          ${priceFormatted ? `<div class="price">${escapeHtml(priceFormatted)}</div>` : ""}
          <div class="qr">${svgHtml}</div>
          <div class="callout">${encodeMode === "url" ? "Scan for full specs, price &amp; 3D AR" : "Warehouse SKU"}</div>
          <div class="code-val">${qrVal}</div>
        </div>
      `;
    });

    let layoutStyles = "";
    if (layout === "a4_grid") {
      layoutStyles = `
        @page { size: A4 portrait; margin: 10mm; }
        .grid-container {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8mm;
        }
        .a4-card {
          border: 2px dashed #94a3b8;
          border-radius: 12px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          text-align: center;
          background: #ffffff;
          page-break-inside: avoid;
          min-height: 82mm;
        }
        .brand { font-size: 8.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #0369a1; border-bottom: 1px solid #e2e8f0; width: 100%; padding-bottom: 3px; }
        .name { font-size: 13px; font-weight: 800; color: #0f172a; line-height: 1.25; margin: 4px 0 2px 0; word-break: break-word; }
        .meta { font-size: 10px; color: #475569; font-weight: 600; font-family: monospace; }
        .price { font-size: 15px; font-weight: 900; color: #047857; margin: 2px 0; }
        .qr { display: flex; align-items: center; justify-content: center; margin: 4px 0; background: #fff; padding: 4px; border-radius: 6px; border: 1px solid #e2e8f0; }
        .callout { font-size: 8.5px; font-weight: 700; color: #0284c7; text-transform: uppercase; letter-spacing: 0.04em; }
        .code-val { font-size: 8px; font-family: monospace; color: #64748b; margin-top: 1px; word-break: break-all; }
      `;
    } else if (layout === "showroom_stand") {
      layoutStyles = `
        @page { size: 5in 4in; margin: 0; }
        .grid-container { display: flex; flex-direction: column; }
        .stand-card {
          width: 5in;
          height: 4in;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 18px 22px;
          border: 2px solid #0f172a;
          page-break-after: always;
          background: #ffffff;
        }
        .stand-brand { font-size: 9.5px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: #0f172a; border-bottom: 2px solid #0f172a; width: 100%; padding-bottom: 5px; text-align: center; }
        .stand-name { font-size: 17px; font-weight: 900; color: #0f172a; line-height: 1.2; text-align: center; margin: 6px 0 2px 0; }
        .stand-meta { font-size: 11px; font-weight: 600; font-family: monospace; color: #475569; }
        .stand-price { font-size: 19px; font-weight: 900; color: #047857; }
        .stand-qr { display: flex; align-items: center; justify-content: center; margin: 4px 0; }
        .stand-callout { font-size: 9.5px; font-weight: 700; color: #0284c7; text-transform: uppercase; letter-spacing: 0.04em; text-align: center; }
        .stand-sub { font-size: 8px; font-family: monospace; color: #64748b; }
      `;
    } else {
      // 4×3 Thermal Sticker
      layoutStyles = `
        @page { size: 4in 3in; margin: 0; }
        .grid-container { display: flex; flex-direction: column; }
        .thermal-label {
          width: 4in;
          height: 3in;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          page-break-after: always;
          border: 1px dashed #94a3b8;
          background: #ffffff;
        }
        .brand { font-size: 8px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #475569; width: 100%; text-align: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; }
        .name { font-size: 13px; font-weight: 800; color: #0f172a; text-align: center; line-height: 1.2; max-width: 3.6in; word-break: break-word; margin: 2px 0; }
        .meta { font-size: 9.5px; font-weight: 600; font-family: monospace; color: #334155; }
        .price { font-size: 13px; font-weight: 900; color: #047857; }
        .qr { display: flex; align-items: center; justify-content: center; margin: 2px 0; }
        .callout { font-size: 8px; font-weight: 700; color: #0284c7; text-transform: uppercase; letter-spacing: 0.04em; text-align: center; }
        .code-val { font-size: 8px; font-family: monospace; color: #64748b; max-width: 3.5in; word-break: break-all; }
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Subidha Showroom QR Labels (${labelList.length} products)</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background: #ffffff;
              color: #0f172a;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            ${layoutStyles}
          </style>
        </head>
        <body>
          <div class="grid-container">
            ${renderedCards.join("\n")}
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;
  }

  // Trigger print dialog
  function handlePrint() {
    const html = buildPrintHtml();
    const win = window.open("", "_blank", "width=850,height=750");
    if (!win) {
      alert("Please allow popups to open the print dialog.");
      return;
    }
    win.document.write(html);
    win.document.close();
  }

  if (labelList.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-card/60">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <QrIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                {labelList.length > 1
                  ? `Bulk Showroom QR Labels (${labelList.length} Products)`
                  : "Product Showroom QR Label"}
              </h2>
              <p className="text-xs text-muted-foreground">
                Prints label with product name, code, price &amp; public AR webpage
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Hidden Container Rendering All SVGs for Print / Canvas Extraction */}
        <div className="hidden" aria-hidden="true">
          {labelList.map((it) => (
            <div
              key={it.productCode || it.sku || it.id}
              id={`qr-svg-item-${it.productCode || it.sku || it.id}`}
            >
              <QRCode
                value={getItemQrValue(it)}
                size={layout === "a4_grid" ? 115 : layout === "showroom_stand" ? 140 : 125}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
              />
            </div>
          ))}
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {/* Controls: Destination & Layout Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Destination Mode */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Scanned QR Target
              </label>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-muted/50 p-1 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setEncodeMode("url")}
                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 px-2 transition ${
                    encodeMode === "url"
                      ? "bg-background text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Globe className="h-3 w-3 text-primary" />
                  <span>Public Webpage</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEncodeMode("sku")}
                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 px-2 transition ${
                    encodeMode === "sku"
                      ? "bg-background text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Tag className="h-3 w-3" />
                  <span>Raw SKU Only</span>
                </button>
              </div>
            </div>

            {/* Print Layout */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Grid className="h-3.5 w-3.5" /> Print Layout Sheet
              </label>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/50 p-1 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setLayout("thermal_4x3")}
                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 px-1.5 transition ${
                    layout === "thermal_4x3"
                      ? "bg-background text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Individual 4x3 inch thermal sticker labels"
                >
                  <Tag className="h-3 w-3" />
                  <span>4×3&quot; Sticker</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayout("a4_grid")}
                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 px-1.5 transition ${
                    layout === "a4_grid"
                      ? "bg-background text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="A4 paper grid (6 products per sheet)"
                >
                  <Grid className="h-3 w-3" />
                  <span>A4 Grid (6)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayout("showroom_stand")}
                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 px-1.5 transition ${
                    layout === "showroom_stand"
                      ? "bg-background text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Showroom Table Stand / Display Card"
                >
                  <Layers className="h-3 w-3" />
                  <span>Stand Card</span>
                </button>
              </div>
            </div>
          </div>

          {/* Multiple items carousel / navigation */}
          {labelList.length > 1 && (
            <div className="flex items-center justify-between gap-2 border-y border-border py-2 px-1 text-xs">
              <span className="font-medium text-muted-foreground">
                Previewing product <strong>{activeIdx + 1}</strong> of <strong>{labelList.length}</strong>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={activeIdx <= 0}
                  onClick={() => setActiveIdx((prev) => Math.max(0, prev - 1))}
                  className="rounded-lg border border-border p-1.5 hover:bg-muted disabled:opacity-40 transition"
                  title="Previous product"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="font-mono tabular-nums px-1">
                  {activeIdx + 1} / {labelList.length}
                </span>
                <button
                  type="button"
                  disabled={activeIdx >= labelList.length - 1}
                  onClick={() => setActiveIdx((prev) => Math.min(labelList.length - 1, prev + 1))}
                  className="rounded-lg border border-border p-1.5 hover:bg-muted disabled:opacity-40 transition"
                  title="Next product"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Label Preview Card */}
          <div className="flex flex-col items-center justify-center p-4 bg-muted/20 rounded-2xl border border-border/80">
            <div className="w-[300px] flex flex-col items-center justify-between rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white p-4 shadow-sm text-center min-h-[340px]">
              <div className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 border-b border-slate-200 w-full pb-1">
                SUBIDHA FURNITURE ASANSOL
              </div>

              {/* Product Title (Bold, prominent) */}
              <div className="my-1.5">
                <h3 className="text-sm font-extrabold text-slate-900 leading-tight">
                  {activeItem.productName}
                </h3>
                <p className="text-[10.5px] font-mono font-semibold text-slate-600 mt-0.5">
                  {activeItem.productCode}
                  {activeItem.sku && activeItem.sku !== activeItem.productCode ? ` · ${activeItem.sku}` : ""}
                </p>
                {activeItem.category && (
                  <p className="text-[9.5px] text-slate-500 font-medium">
                    {activeItem.category}
                  </p>
                )}
                {formatPrice(activeItem.price) && (
                  <p className="text-base font-extrabold text-emerald-700 mt-1">
                    {formatPrice(activeItem.price)}
                  </p>
                )}
              </div>

              {/* QR Code */}
              <div className="my-1 p-2 bg-white rounded-lg border border-slate-200 shadow-xs">
                <QRCode
                  value={getItemQrValue(activeItem)}
                  size={120}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="M"
                />
              </div>

              {/* Scan Callout */}
              <div className="border-t border-slate-200 w-full pt-1.5 mt-1 space-y-0.5">
                <p className="text-[9px] font-bold text-sky-700 uppercase tracking-tight">
                  {encodeMode === "url"
                    ? "Scan with phone for full specs, price & 3D AR"
                    : "Warehouse SKU Label"}
                </p>
                <p className="text-[8px] font-mono text-slate-400 truncate max-w-[260px] mx-auto">
                  {getItemQrValue(activeItem)}
                </p>
              </div>
            </div>

            {/* Destination Link */}
            {encodeMode === "url" && (
              <div className="mt-3 flex items-center justify-between w-full max-w-[340px] text-xs text-muted-foreground px-1">
                <span className="font-semibold text-foreground truncate mr-2">
                  Dest: <span className="font-mono text-[11px] text-primary">{getItemPublicUrl(activeItem)}</span>
                </span>
                <a
                  href={getItemPublicUrl(activeItem)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-primary hover:underline shrink-0"
                >
                  Test <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4 bg-card/60">
          <div className="flex flex-wrap items-center gap-2">
            {/* Download single PNG with auto-configured filename */}
            <button
              type="button"
              onClick={() => handleDownloadSinglePNG(activeItem)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-sm hover:bg-muted transition max-w-[340px]"
              title={`Download ${buildDownloadFilename(activeItem)}`}
            >
              <Download className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">Download: {buildDownloadFilename(activeItem)}</span>
            </button>

            {/* Download all as PNGs if bulk */}
            {labelList.length > 1 && (
              <button
                type="button"
                disabled={downloadingAll}
                onClick={handleDownloadAllPNGs}
                className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary shadow-sm hover:bg-primary/10 transition disabled:opacity-50"
                title="Download all QR images automatically named with Product Code, SKU, and Full Name Attributes"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{downloadingAll ? "Downloading QRs with Names..." : `Download All ${labelList.length} PNGs (Auto-Named)`}</span>
              </button>
            )}

            {/* Download offline HTML sheet */}
            <button
              type="button"
              onClick={handleDownloadHTMLSheet}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition"
              title="Download standalone offline HTML file ready to print"
            >
              <Grid className="h-3.5 w-3.5" />
              <span>Save Sheet (HTML)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition"
            >
              <Printer className="h-4 w-4" />
              <span>
                {labelList.length > 1
                  ? `Print ${labelList.length} Labels`
                  : "Print Label"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
