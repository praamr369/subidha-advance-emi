"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  type ThemePreference,
  applyThemeClassToDocument,
  readStoredTheme,
  writeStoredTheme,
} from "@/config/theme-storage";

type ThemeContextValue = {
  /** User-selected mode; default light when unset in storage. */
  theme: ThemePreference;
  setTheme: (value: ThemePreference) => void;
  /** True after client has read storage (for toggle UI). */
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribeSystemPreference(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>("light");
  const [ready, setReady] = useState(false);

  /* Client-only: align React state with localStorage after SSR (inline script already set html class). */
  useEffect(() => {
    const stored = readStoredTheme();
    const initial: ThemePreference = stored ?? "light";
    applyThemeClassToDocument(initial);
    const id = window.requestAnimationFrame(() => {
      setThemeState(initial);
      setReady(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyThemeClassToDocument(theme);
  }, [ready, theme]);

  useEffect(() => {
    if (!ready || theme !== "system") return;
    const sync = () => applyThemeClassToDocument("system");
    sync();
    return subscribeSystemPreference(sync);
  }, [ready, theme]);

  const setTheme = useCallback((value: ThemePreference) => {
    setThemeState(value);
    writeStoredTheme(value);
    applyThemeClassToDocument(value);
  }, []);

  const value = useMemo(() => ({ theme, setTheme, ready }), [theme, setTheme, ready]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
