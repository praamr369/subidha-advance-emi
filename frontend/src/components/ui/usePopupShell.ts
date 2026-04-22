"use client";

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function shouldIgnoreEscapeTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

const POPUP_ROOT_ID = "subidha-popup-root";

let popupLockCount = 0;
let previousBodyOverflow = "";
let previousHtmlOverflow = "";
const popupRootListeners = new Set<() => void>();

function emitPopupRootChange() {
  popupRootListeners.forEach((listener) => listener());
}

function subscribePopupRoot(listener: () => void) {
  popupRootListeners.add(listener);
  return () => popupRootListeners.delete(listener);
}

function getPopupRootSnapshot() {
  if (typeof document === "undefined") {
    return null;
  }
  return document.getElementById(POPUP_ROOT_ID) as HTMLElement | null;
}

function ensurePopupRoot() {
  const existing = document.getElementById(POPUP_ROOT_ID);
  if (existing) return existing;

  const root = document.createElement("div");
  root.id = POPUP_ROOT_ID;
  root.className = "subidha-popup-root";
  document.body.appendChild(root);
  emitPopupRootChange();
  return root;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((node) => {
    if (node.getAttribute("aria-hidden") === "true") return false;
    if (node instanceof HTMLInputElement && node.type === "hidden") return false;
    return !node.hasAttribute("disabled");
  });
}

function trapFocusWithin(container: HTMLElement, event: KeyboardEvent) {
  if (event.key !== "Tab") return;

  const focusableElements = getFocusableElements(container);
  if (focusableElements.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }

  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (!activeElement || !container.contains(activeElement)) {
    event.preventDefault();
    if (event.shiftKey) {
      last.focus();
      return;
    }
    first.focus();
    return;
  }

  if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function usePopupPortalRoot() {
  const portalRoot = useSyncExternalStore(
    subscribePopupRoot,
    getPopupRootSnapshot,
    () => null
  );

  useEffect(() => {
    ensurePopupRoot();
  }, []);

  return portalRoot;
}

export function usePopupShell({
  open,
  panelRef,
  onClose,
  closeOnEscape = true,
  disableClose = false,
  ignoreEscapeOnEditableTarget = false,
  lockBody = true,
}: {
  open: boolean;
  panelRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  closeOnEscape?: boolean;
  disableClose?: boolean;
  ignoreEscapeOnEditableTarget?: boolean;
  lockBody?: boolean;
}) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const [firstFocusable] = getFocusableElements(panel);
      (firstFocusable ?? panel).focus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open, panelRef]);

  useEffect(() => {
    if (!open) return;
    return () => {
      previouslyFocused.current?.focus();
      previouslyFocused.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (lockBody) {
      if (popupLockCount === 0) {
        previousBodyOverflow = document.body.style.overflow;
        previousHtmlOverflow = document.documentElement.style.overflow;
      }
      popupLockCount += 1;
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }

    function handleKeyDown(event: KeyboardEvent) {
      const panel = panelRef.current;
      if (!panel) return;

      if (event.key === "Escape") {
        if (!closeOnEscape || disableClose) return;
        if (ignoreEscapeOnEditableTarget && shouldIgnoreEscapeTarget(event.target)) return;
        event.preventDefault();
        onClose();
        return;
      }

      trapFocusWithin(panel, event);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (lockBody) {
        popupLockCount = Math.max(0, popupLockCount - 1);
        if (popupLockCount === 0) {
          document.body.style.overflow = previousBodyOverflow;
          document.documentElement.style.overflow = previousHtmlOverflow;
        }
      }
    };
  }, [
    closeOnEscape,
    disableClose,
    ignoreEscapeOnEditableTarget,
    lockBody,
    onClose,
    open,
    panelRef,
  ]);
}
