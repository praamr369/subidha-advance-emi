/**
 * On-demand loader for Google's <model-viewer> (Android Scene Viewer / iOS Quick Look AR).
 * The viewer (~1 MB incl. three.js) is only fetched when someone taps "View in your room",
 * so product pages stay light.
 */
/** AR payload from the public and portal product APIs (backend: products_pim.services.ar_service). */
export type ArModel = {
  /** MODEL = uploaded 3D model; SIZE_PREVIEW = auto-built real-size box with the product photo. */
  kind: "MODEL" | "SIZE_PREVIEW";
  src: string;
  ios_src: string | null;
  title: string;
  size_cm: { width: number; depth: number; height: number | null } | null;
};

export type ModelViewerElement = HTMLElement & {
  canActivateAR?: boolean;
  /** Bounding box of the model in metres, as authored. */
  getDimensions?: () => { x: number; y: number; z: number };
};

let pending: Promise<unknown> | null = null;

export function loadModelViewer(): Promise<unknown> {
  pending ??= import("@google/model-viewer").catch((err) => {
    pending = null; // allow a retry after a network blip
    throw err;
  });
  return pending;
}

/** Width × depth × height in whole centimetres (glTF is Y-up). */
export function formatModelSize(d: { x: number; y: number; z: number }): string {
  const cm = (m: number) => Math.round(m * 100);
  return `${cm(d.x)} W × ${cm(d.z)} D × ${cm(d.y)} H cm`;
}
