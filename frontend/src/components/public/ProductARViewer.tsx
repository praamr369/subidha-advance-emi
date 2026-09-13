"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import QRCode from "react-qr-code";
import { AlertCircle, Box, Loader2, Ruler, ScanLine } from "lucide-react";

import { toBrowserReachableMediaUrl } from "@/lib/media";
import { formatModelSize, loadModelViewer, type ModelViewerElement } from "@/lib/model-viewer";
import type { ArModel } from "@/lib/model-viewer";

type Props = {
  model: ArModel;
  productName: string;
  poster?: string | null;
};

type Phase = "idle" | "loading" | "ready" | "error";

const noopSubscribe = () => () => {};

/** QR target for desktop visitors: this page, opening straight into the viewer. Null while server-rendering. */
function usePhoneUrl(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      const url = new URL(window.location.href);
      url.searchParams.set("ar", "1");
      return url.toString();
    },
    () => null,
  );
}

/**
 * "View in your room" — places the real-size product on the customer's floor through
 * the phone camera: Android Scene Viewer / WebXR, iPhone Quick Look. Nothing loads
 * until the customer taps, and nothing moves on its own.
 */
export default function ProductARViewer({ model, productName, poster }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [arSupported, setArSupported] = useState<boolean | null>(null);
  const [arFailed, setArFailed] = useState(false);
  const [size, setSize] = useState<string | null>(null);
  const phoneUrl = usePhoneUrl();
  const viewerRef = useRef<ModelViewerElement | null>(null);

  const open = useCallback(async () => {
    setPhase("loading");
    try {
      await loadModelViewer();
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, []);

  // Arriving from the desktop QR code (?ar=1): open the viewer straight away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("ar") !== "1") return;
    loadModelViewer().then(
      () => setPhase("ready"),
      () => setPhase("error"),
    );
  }, []);

  useEffect(() => {
    const el = viewerRef.current;
    if (phase !== "ready" || !el) return;
    const onLoad = () => {
      setArSupported(Boolean(el.canActivateAR));
      const dims = el.getDimensions?.();
      if (dims) setSize(formatModelSize(dims));
    };
    const onArStatus = (event: Event) => {
      if ((event as CustomEvent<{ status?: string }>).detail?.status === "failed") setArFailed(true);
    };
    const onError = () => setPhase("error");
    el.addEventListener("load", onLoad);
    el.addEventListener("ar-status", onArStatus);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("load", onLoad);
      el.removeEventListener("ar-status", onArStatus);
      el.removeEventListener("error", onError);
    };
  }, [phase]);

  const isSizePreview = model.kind === "SIZE_PREVIEW";
  // The saved product size beats the measured box: a footprint preview is only 2 cm tall.
  const declaredSize = model.size_cm
    ? `${Math.round(model.size_cm.width)} W × ${Math.round(model.size_cm.depth)} D` +
      (model.size_cm.height ? ` × ${Math.round(model.size_cm.height)} H` : "") +
      " cm"
    : null;
  const src = toBrowserReachableMediaUrl(model.src) ?? model.src;
  const iosSrc = toBrowserReachableMediaUrl(model.ios_src) ?? undefined;
  const posterSrc = toBrowserReachableMediaUrl(poster) ?? undefined;

  const qr = phoneUrl ? (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-border">
        <QRCode value={phoneUrl} size={104} aria-label="QR code to open this product on your phone" />
      </div>
      <span className="text-[11px] font-medium text-muted-foreground">Scan with your phone</span>
    </div>
  ) : null;

  if (phase !== "ready") {
    return (
      <section className="rounded-[1.5rem] border border-border bg-card p-5 shadow-sm" aria-label="View in your room">
        <div className="flex items-start gap-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Box className="h-4 w-4" aria-hidden />
              </span>
              <h3 className="text-sm font-semibold text-foreground">See it in your room</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {isSizePreview
                ? `Point your phone camera at the floor to see exactly how much space this ${productName} takes, shown as a true-size block with its photo. No app needed.`
                : `Point your phone camera at the floor and this ${productName} appears at its real size, so you can check the fit before you buy. No app needed.`}
            </p>
            {declaredSize && <p className="mt-1.5 text-xs font-medium text-foreground">{declaredSize}</p>}
            <button
              type="button"
              onClick={() => void open()}
              disabled={phase === "loading"}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2 disabled:opacity-70"
            >
              {phase === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ScanLine className="h-4 w-4" aria-hidden />
              )}
              {phase === "loading" ? "Loading 3D view…" : "View in your room"}
            </button>
            {phase === "error" && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400" role="alert">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                The 3D view could not load. Check your connection and try again.
              </p>
            )}
          </div>
          <div className="hidden md:block">{qr}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[1.5rem] border border-border bg-card p-4 shadow-sm" aria-label="View in your room">
      <div className="relative aspect-[5/4] w-full overflow-hidden rounded-[1.1rem] bg-muted/40">
        <model-viewer
          ref={viewerRef}
          src={src}
          ios-src={iosSrc}
          poster={posterSrc}
          alt={`3D model of ${productName}`}
          ar
          ar-modes="webxr scene-viewer quick-look"
          ar-scale="fixed"
          ar-placement="floor"
          camera-controls
          touch-action="pan-y"
          shadow-intensity="1"
          style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
        >
          <button
            slot="ar-button"
            type="button"
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md"
          >
            <ScanLine className="h-4 w-4" aria-hidden />
            View in your room
          </button>
        </model-viewer>
      </div>

      <div className="mt-3 space-y-2 px-1">
        {(declaredSize ?? size) && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Ruler className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            {declaredSize ?? size}
          </p>
        )}
        {isSizePreview ? (
          <p className="text-xs text-muted-foreground">
            Size preview: a block the exact size of this product with its photo on the front, to check it fits your
            space. It does not show the final shape or finish.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Drag to turn the model. Size is true to scale; colour and finish may look slightly different on screen.
          </p>
        )}
        {arFailed && (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400" role="alert">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            The room view could not start. Allow camera access and try again. Android phones need Google Play
            Services for AR.
          </p>
        )}
        {arSupported === false && (
          <div className="flex items-center gap-4 rounded-xl border border-border bg-background p-3">
            <p className="flex-1 text-xs text-muted-foreground">
              This device can&apos;t place furniture in the room. Scan the code with an Android phone or iPhone
              to try it at home.
            </p>
            {qr}
          </div>
        )}
      </div>
    </section>
  );
}
