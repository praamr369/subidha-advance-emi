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
  clearSession,
  getSession,
  setSession,
  type StoredSession,
} from "@/lib/auth/session";

type Role = "ADMIN" | "PARTNER" | "CUSTOMER" | "CASHIER" | string;

type AuthUser = StoredSession & {
  role: Role;
};

type LoginPayload = {
  id: number;
  name: string;
  role: Role;
  accessToken: string;
  refreshToken: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  role: Role | null;
  isLoading: boolean;
  login: (payload: LoginPayload) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;

    function syncSession() {
      if (!active) return;

      const latest = getSession();
      setUser(latest);
      setHydrated(true);
    }

    syncSession();

    window.addEventListener("storage", syncSession);
    window.addEventListener("subidha:session", syncSession);
    return () => {
      active = false;
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("subidha:session", syncSession);
    };
  }, []);

  const login = useCallback((payload: LoginPayload) => {
    const nextUser: AuthUser = {
      id: payload.id,
      name: payload.name,
      role: payload.role,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
    };

    setUser(nextUser);
    setSession(nextUser);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    clearSession();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      role: user?.role ?? null,
      isLoading: !hydrated,
      login,
      logout,
    }),
    [user, hydrated, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
