import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { login } from "./auth-client";
import { tokenStore } from "./token-store";
import { APP_NAME } from "@/app/env";

export function LoginPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login({ identifier, password });
      tokenStore.setTokens(result.access, result.refresh);
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface)]">
      <div className="w-full max-w-sm">
        <div className="rounded-lg bg-white p-8 shadow-sm ring-1 ring-stone-200">
          <h1 className="mb-6 text-center text-xl font-bold text-stone-800">
            {APP_NAME}
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-600">
                Username or Phone
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-600">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-brand-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-800 disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
