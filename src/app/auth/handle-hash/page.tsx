"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Client-side page that handles the implicit OAuth flow.
 * Supabase sends session tokens in the URL hash (#access_token=...&refresh_token=...)
 * which cannot be read server-side. This page reads them and calls setSession().
 */
export default function HandleHashPage() {
  const [status, setStatus] = useState("Processing authentication...");

  useEffect(() => {
    async function handleHash() {
      const hash = window.location.hash.slice(1); // remove leading '#'
      if (!hash) {
        setStatus("No auth data found. Redirecting...");
        setTimeout(() => { window.location.href = "/?error=auth"; }, 1500);
        return;
      }

      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (!accessToken || !refreshToken) {
        setStatus("Missing tokens. Redirecting...");
        setTimeout(() => { window.location.href = "/?error=auth"; }, 1500);
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        setStatus("Auth error: " + error.message);
        setTimeout(() => { window.location.href = "/?error=auth"; }, 2000);
      } else {
        setStatus("Logged in! Redirecting to game...");
        window.location.href = "/dashboard";
      }
    }

    handleHash();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="text-center space-y-4">
        <div className="text-amber-400 text-2xl font-bold">🏰 Dungeon Tamagotchi</div>
        <p className="text-zinc-300 text-sm">{status}</p>
      </div>
    </div>
  );
}
