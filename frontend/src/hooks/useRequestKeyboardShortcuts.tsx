import { useEffect } from "react";

export interface RequestKeyboardShortcutMap {
  "Ctrl+Enter"?: () => void | Promise<void>; // Approve request
  "D"?: () => void | Promise<void>; // Deny/Reject
  "S"?: () => void | Promise<void>; // Send/Submit
  "Q"?: () => void | Promise<void>; // Quote generation
  "R"?: () => void | Promise<void>; // Refresh
  "Escape"?: () => void | Promise<void>; // Close dialogs
  "?"?: () => void | Promise<void>; // Help/Show shortcuts
}

export function useRequestKeyboardShortcuts(shortcuts: RequestKeyboardShortcutMap) {
  useEffect(() => {
    async function handleKeyDown(event: KeyboardEvent) {
      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true"
      ) {
        // Allow Escape always
        if (event.key === "Escape" && shortcuts["Escape"]) {
          event.preventDefault();
          await shortcuts["Escape"]?.();
        }
        return;
      }

      // Ctrl+Enter or Cmd+Enter: Approve
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        if (shortcuts["Ctrl+Enter"]) {
          event.preventDefault();
          await shortcuts["Ctrl+Enter"]?.();
        }
      }

      // D: Deny/Reject
      if (event.key.toLowerCase() === "d") {
        if (shortcuts["D"]) {
          event.preventDefault();
          await shortcuts["D"]?.();
        }
      }

      // S: Send/Submit
      if (event.key.toLowerCase() === "s" && !event.ctrlKey && !event.metaKey) {
        if (shortcuts["S"]) {
          event.preventDefault();
          await shortcuts["S"]?.();
        }
      }

      // Q: Quote generation
      if (event.key.toLowerCase() === "q") {
        if (shortcuts["Q"]) {
          event.preventDefault();
          await shortcuts["Q"]?.();
        }
      }

      // R: Refresh
      if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey) {
        if (shortcuts["R"]) {
          event.preventDefault();
          await shortcuts["R"]?.();
        }
      }

      // Escape: Close dialogs
      if (event.key === "Escape" && shortcuts["Escape"]) {
        event.preventDefault();
        await shortcuts["Escape"]?.();
      }

      // ?: Help/Show shortcuts
      if (event.shiftKey && event.key === "?") {
        if (shortcuts["?"]) {
          event.preventDefault();
          await shortcuts["?"]?.();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts]);
}

// Helper component to show available shortcuts
export function RequestKeyboardShortcutsHelp() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h3 className="font-semibold text-foreground">Keyboard Shortcuts</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Approve request</span>
          <kbd className="px-2 py-1 rounded bg-muted border border-border text-xs font-mono">Ctrl + Enter</kbd>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Deny/Reject</span>
          <kbd className="px-2 py-1 rounded bg-muted border border-border text-xs font-mono">D</kbd>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Send/Submit</span>
          <kbd className="px-2 py-1 rounded bg-muted border border-border text-xs font-mono">S</kbd>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Generate quote</span>
          <kbd className="px-2 py-1 rounded bg-muted border border-border text-xs font-mono">Q</kbd>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Refresh data</span>
          <kbd className="px-2 py-1 rounded bg-muted border border-border text-xs font-mono">R</kbd>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Close dialogs</span>
          <kbd className="px-2 py-1 rounded bg-muted border border-border text-xs font-mono">Esc</kbd>
        </div>
      </div>
    </div>
  );
}
