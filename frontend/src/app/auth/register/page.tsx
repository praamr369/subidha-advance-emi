"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/constants";
import PortalPage from "@/components/ui/portal-page";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("CUSTOMER");
  const [message, setMessage] = useState<string | null>(null);

  async function handleRegister(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setMessage(null);

    const response = await fetch(`${API_BASE_URL}/auth/register/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, name, phone, role }),
    });

    if (!response.ok) {
      setMessage("Registration failed. Please check details.");
      return;
    }

    setMessage("Registration successful. Redirecting to login...");
    setTimeout(() => router.push("/auth/login"), 700);
  }

  return (
    <PortalPage
      title="User Registration"
      subtitle="Create account → Login → Access dashboard"
      actions={[{ href: "/auth/login", label: "Already have an account? Login" }]}
    >
      <form onSubmit={handleRegister} style={{ display: "grid", gap: 10 }}>
        <input
          placeholder="Full Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <input
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />

        <input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="CUSTOMER">Customer</option>
          <option value="PARTNER">Partner</option>
                  </select>

        <button type="submit">Create Account</button>
      </form>

      {message && <p>{message}</p>}
    </PortalPage>
  );
}