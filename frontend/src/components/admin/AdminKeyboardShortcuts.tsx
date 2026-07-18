"use client";

import React, { useEffect, useState } from "react";
import { Command, Keyboard, X } from "lucide-react";

export interface KeyboardShortcut {
  keys: string[];
  description: string;
  action: () => void | Promise<void>;
  category?: string;
}

interface AdminKeyboardShortcutsContextType {
  shortcuts: Map<string, KeyboardShortcut>;
  register: (id: string, shortcut: KeyboardShortcut) => void;
  unregister: (id: string) => void;
  showHelp: boolean;
  setShowHelp: (show: boolean) => void;
}

export const AdminKeyboardShortcutsContext = React.createContext<AdminKeyboardShortcutsContextType | null>(null);

export const AdminKeyboardShortcutsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [shortcuts, setShortcuts] = useState(new Map<string, KeyboardShortcut>());
  const [showHelp, setShowHelp] = useState(false);

  const register = (id: string, shortcut: KeyboardShortcut) => {
    setShortcuts((prev) => new Map(prev).set(id, shortcut));
  };

  const unregister = (id: string) => {
    setShortcuts((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  // Global keyboard event listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Show help on Ctrl+?
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "?") {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }

      // Match shortcuts
      shortcuts.forEach((shortcut) => {
        const matchesKeys = shortcut.keys.every((key) => {
          if (key === "ctrl" || key === "cmd") return e.ctrlKey || e.metaKey;
          if (key === "shift") return e.shiftKey;
          if (key === "alt") return e.altKey;
          return e.key.toLowerCase() === key.toLowerCase();
        });

        if (matchesKeys) {
          e.preventDefault();
          shortcut.action();
        }
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts]);

  return (
    <AdminKeyboardShortcutsContext.Provider
      value={{
        shortcuts,
        register,
        unregister,
        showHelp,
        setShowHelp,
      }}
    >
      {children}
      <KeyboardShortcutsHelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} shortcuts={shortcuts} />
    </AdminKeyboardShortcutsContext.Provider>
  );
};

// Hook to use shortcuts
export const useAdminKeyboardShortcuts = () => {
  const context = React.useContext(AdminKeyboardShortcutsContext);
  if (!context) {
    throw new Error("useAdminKeyboardShortcuts must be used within AdminKeyboardShortcutsProvider");
  }
  return context;
};

// Help Modal Component
const KeyboardShortcutsHelpModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  shortcuts: Map<string, KeyboardShortcut>;
}> = ({ isOpen, onClose, shortcuts }) => {
  if (!isOpen) return null;

  // Group shortcuts by category
  const grouped = Array.from(shortcuts.values()).reduce(
    (acc, shortcut) => {
      const category = shortcut.category || "General";
      if (!acc[category]) acc[category] = [];
      acc[category].push(shortcut);
      return acc;
    },
    {} as Record<string, KeyboardShortcut[]>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom-4">
        {/* Header */}
        <div className="border-b border-slate-200 p-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-6 h-6 text-slate-700" />
            <h2 className="text-2xl font-bold text-slate-900">Keyboard Shortcuts</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(grouped).map(([category, categoryShortcuts]) => (
              <div key={category}>
                <h3 className="font-semibold text-slate-900 mb-3 text-sm uppercase tracking-wide">{category}</h3>
                <div className="space-y-2">
                  {categoryShortcuts.map((shortcut, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{shortcut.description}</span>
                      <div className="flex gap-1">
                        {shortcut.keys.map((key) => (
                          <kbd
                            key={key}
                            className="px-2.5 py-1.5 bg-slate-100 border border-slate-300 rounded text-xs font-semibold text-slate-700"
                          >
                            {key === "cmd" ? (
                              <Command className="w-3 h-3 inline" />
                            ) : key === "ctrl" ? (
                              "Ctrl"
                            ) : key === "shift" ? (
                              "Shift"
                            ) : key === "alt" ? (
                              "Alt"
                            ) : (
                              key.toUpperCase()
                            )}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 p-6 bg-slate-50 text-sm text-slate-600">
          <p>Press <kbd className="px-2 py-1 bg-slate-200 rounded text-xs font-semibold">Ctrl+Shift+?</kbd> to toggle this help dialog</p>
        </div>
      </div>
    </div>
  );
};

export default AdminKeyboardShortcutsProvider;
