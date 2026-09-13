import type { DetailedHTMLProps, HTMLAttributes } from "react";

// JSX typing for Google's <model-viewer> web component (loaded on demand via
// lib/model-viewer.ts). Only the attributes this app actually sets are listed.
type ModelViewerAttributes = {
  src?: string;
  "ios-src"?: string;
  poster?: string;
  alt?: string;
  ar?: boolean;
  "ar-modes"?: string;
  "ar-scale"?: "auto" | "fixed";
  "ar-placement"?: "floor" | "wall";
  "camera-controls"?: boolean;
  "touch-action"?: string;
  "shadow-intensity"?: string;
  "interaction-prompt"?: "auto" | "none";
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & ModelViewerAttributes;
    }
  }
}
