"use client";

import { useEffect, useState } from "react";

// KPI de posts publicados REAIS (Instagram Graph API). Sem numero inventado:
// mostra a contagem real de midia ou "—" enquanto carrega / em fallback.
export function InstagramPublishedKpi() {
  const [value, setValue] = useState<string>("…");
  const [trend, setTrend] = useState<string>("Instagram API");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/instagram");
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error("indisponivel");
        if (!cancelled) {
          setValue(String(body.profile?.mediaCount ?? body.media?.length ?? 0));
          setTrend(`@${body.profile?.username ?? "instagram"}`);
        }
      } catch {
        if (!cancelled) {
          setValue("—");
          setTrend("IG indisponivel");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <article className="kpi-card">
      <div className="kpi-label">Publicados</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-trend">{trend}</div>
    </article>
  );
}
