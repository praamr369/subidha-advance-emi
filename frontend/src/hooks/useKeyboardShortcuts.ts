import { useEffect } from "react";

type ShortcutHandler = () => void;

interface ShortcutMap {
  [key: string]: ShortcutHandler;
}

/**
 * Hook to handle keyboard shortcuts in the admin dashboard
 * Supported shortcuts:
 * - Ctrl+R / Cmd+R: Refresh dashboard
 * - S: Focus search
 * - /: Global search
 * - C: Collapse/expand all sections
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true"
      ) {
        return;
      }

      // Ctrl+R / Cmd+R: Refresh
      if ((event.ctrlKey || event.metaKey) && event.key === "r") {
        event.preventDefault();
        shortcuts["refresh"]?.();
        return;
      }

      // S: Focus search
      if (event.key.toLowerCase() === "s" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        shortcuts["search"]?.();
        return;
      }

      // /: Global search
      if (event.key === "/") {
        event.preventDefault();
        shortcuts["global-search"]?.();
        return;
      }

      // C: Collapse/expand all
      if (event.key.toLowerCase() === "c" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        shortcuts["toggle-collapse"]?.();
        return;
      }

      // Escape: Close modals/menus
      if (event.key === "Escape") {
        shortcuts["escape"]?.();
        return;
      }

      // Arrow keys: Navigate modules
      if (event.key === "ArrowUp") {
        event.preventDefault();
        shortcuts["nav-up"]?.();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        shortcuts["nav-down"]?.();
      } else if (event.key === "Enter") {
        shortcuts["activate"]?.();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [shortcuts]);
}

/**
 * Default dashboard shortcuts
 */
export const DEFAULT_DASHBOARD_SHORTCUTS: ShortcutMap = {
  refresh: () => window.location.reload(),
  search: () => {
    const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  },
  "global-search": () => {
    // Navigate to global search or focus search
    const search = document.querySelector('input[placeholder*="Search business"]') as HTMLInputElement;
    if (search) search.focus();
  },
  "toggle-collapse": () => {
    // This will be handled by parent component
  },
  escape: () => {
    // Close any open modals/menus
    const closeButtons = document.querySelectorAll('[aria-label="Close"]');
    const lastButton = closeButtons[closeButtons.length - 1] as HTMLButtonElement;
    if (lastButton) lastButton.click();
  },
  "nav-up": () => {
    // Navigate to previous module
    const modules = document.querySelectorAll('[data-module]');
    const current = document.activeElement;
    const currentIndex = Array.from(modules).indexOf(current as any);
    if (currentIndex > 0) {
      (modules[currentIndex - 1] as HTMLElement).focus();
    }
  },
  "nav-down": () => {
    // Navigate to next module
    const modules = document.querySelectorAll('[data-module]');
    const current = document.activeElement;
    const currentIndex = Array.from(modules).indexOf(current as any);
    if (currentIndex < modules.length - 1) {
      (modules[currentIndex + 1] as HTMLElement).focus();
    }
  },
  activate: () => {
    // Click focused module
    const current = document.activeElement as HTMLElement;
    if (current && current.hasAttribute("data-module")) {
      current.click();
    }
  },
};
