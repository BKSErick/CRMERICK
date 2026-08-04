"use client";

import { useEffect } from "react";

export function SupabaseAuthBridge() {
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get("access_token");
    if (!accessToken) return;

    const query = new URLSearchParams(window.location.search);
    const next = query.get("next") ?? "/";
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

    void fetch("/api/auth/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken, next }),
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { next?: string };
        if (!response.ok) throw new Error("invalid-link");
        window.location.replace(body.next ?? "/");
      })
      .catch(() => {
        window.location.replace("/login?error=link-invalido");
      });
  }, []);

  return null;
}
