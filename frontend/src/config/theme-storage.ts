/** Browser theme preference for Subidha UI (independent of sidebar/workspace keys). */
export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "subidha:theme:v1";

export function readStoredTheme(): ThemePreference | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // storage blocked
  }
  return null;
}

export function writeStoredTheme(value: ThemePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // ignore
  }
}

export function getSystemDarkPreference(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Whether the document should use the `.dark` class for the current preference. */
export function resolveDarkClass(theme: ThemePreference): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return getSystemDarkPreference();
}

export function applyThemeClassToDocument(theme: ThemePreference) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolveDarkClass(theme));
}

/** Inline bootstrap for root layout (must stay in sync with key + values). */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY
)};var t=localStorage.getItem(k);var r=document.documentElement;if(t==="dark"){r.classList.add("dark");}else if(t==="system"){if(window.matchMedia("(prefers-color-scheme: dark)").matches){r.classList.add("dark");}else{r.classList.remove("dark");}}else{r.classList.remove("dark");}}catch(e){}})();`;
