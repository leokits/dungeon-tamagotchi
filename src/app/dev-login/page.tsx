"use client";

import { useState } from "react";

export default function DevLoginPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDevLogin() {
    setLoading(true);
    setStatus("Creating dev session...");
    try {
      const res = await fetch("/api/dev-auth", { method: "POST" });
      const data = await res.json();
      if (data.action_link) {
        setStatus("Redirecting to auth...");
        window.location.href = data.action_link;
      } else {
        setStatus("Error: " + (data.error || "Unknown error"));
        setLoading(false);
      }
    } catch (e) {
      setStatus("Error: " + String(e));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm space-y-6 px-4 text-center">
        <h1 className="text-3xl font-bold text-amber-400">Dev Login</h1>
        <p className="text-sm text-zinc-400">Development-only bypass. Not available in production.</p>
        <button
          onClick={handleDevLogin}
          disabled={loading}
          className="w-full rounded-lg bg-amber-600 px-4 py-3 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {loading ? "Logging in..." : "Login as Dev Player"}
        </button>
        {status && <p className="text-sm text-zinc-300">{status}</p>}
        <a href="/" className="block text-xs text-zinc-600 hover:text-zinc-400">← Back to main login</a>
      </div>
    </div>
  );
}
