"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { API_BASE_URL, APP_ROUTES } from "@/lib/constants";

import { persistSession } from "@/lib/api";



export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });


    if (!response.ok) throw new Error("Invalid credentials");

    const data = (await response.json()) as { access: string; refresh: string; role?: string; is_staff?: boolean };
    const role = (data.role || (data.is_staff ? "ADMIN" : "CUSTOMER")).toUpperCase();
    persistSession(data.access, data.refresh, role);

    const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
    if (next && ["/dashboard", "/admin", "/partner", "/customer"].some((p) => next.startsWith(p))) {
      router.push(next);
      return;
    }

    if (role === "ADMIN") router.push(APP_ROUTES.adminDashboard);
    else if (role === "PARTNER") router.push(APP_ROUTES.partnerDashboard);
    else router.push(APP_ROUTES.customerDashboard);

    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    }
  };

  return (
    <main style={{ maxWidth: 460, margin: "56px auto", padding: 20 }}>
      <h1>Login</h1>

      <p>Step 1: enter credentials → Step 2: auto-redirect to your dashboard.</p>

      <form onSubmit={handleLogin} style={{ display: "grid", gap: 12 }}>
        <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit">Sign In</button>
        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      </form>
    </main>
  );
}
