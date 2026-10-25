"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";

interface SignatureCanvasProps {
  onChange: (file: File | null, dataUrl: string | null) => void;
  height?: number;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}

export default function SignatureCanvas({
  onChange,
  height = 180,
  label = "Customer Digital Signature",
  required = false,
  disabled = false,
}: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Initialize canvas with proper scale for high-DPI displays
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#0f172a"; // slate-900
  }, []);

  useEffect(() => {
    initCanvas();
    const handleResize = () => {
      // Re-init on resize only if empty to avoid erasing active signature
      if (!hasSignature) {
        initCanvas();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [initCanvas, hasSignature]);

  const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);
    setIsDrawing(true);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return;
    setIsDrawing(false);

    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer might already be released
    }

    // Export signature as PNG file
    canvas.toBlob((blob) => {
      if (blob && hasSignature) {
        const file = new File([blob], `signature_${Date.now()}.png`, { type: "image/png" });
        const dataUrl = canvas.toDataURL("image/png");
        onChange(file, dataUrl);
      }
    }, "image/png");
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange(null, null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-foreground">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {hasSignature && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs font-medium text-rose-600 hover:text-rose-700 underline"
          >
            Clear signature
          </button>
        )}
      </div>

      <div
        className={`relative rounded-xl border-2 border-dashed transition-colors bg-white ${
          hasSignature ? "border-emerald-500/70" : "border-slate-300 hover:border-slate-400"
        }`}
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-full h-full cursor-crosshair touch-none select-none rounded-xl"
        />

        {!hasSignature && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-slate-400">
            <span className="text-2xl mb-1">✍️</span>
            <span className="text-xs font-medium">Draw signature here with finger or stylus</span>
            <span className="text-[10px] text-slate-400 mt-0.5">(Sign directly on screen)</span>
          </div>
        )}

        {hasSignature && (
          <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
            <span>✓</span> Captured
          </div>
        )}
      </div>
    </div>
  );
}
