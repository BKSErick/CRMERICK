"use client";

import { useEffect, useMemo, useState } from "react";

// Sinais = leitura REAL de performance do Instagram (Graph API). Substitui o antigo
// modules/sinais.html que mostrava numeros inventados (28.4K alcance, +212%, "melhor
// horario"). Aqui so entra o que a API entrega de verdade. O que a API NAO da
// (crescimento % historico, melhor horario, narrativa de tendencia) foi REMOVIDO.

type Media = {
  id: string;
  caption?: string;
  media_product_type?: string;
  media_type?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  reach?: number;
  saved?: number;
  shares?: number;
  total_interactions?: number;
};
type Payload = {
  ok: boolean;
  profile?: { username?: string };
  metrics?: {
    reach30?: number; views30?: number; profileViews30?: number; accountsEngaged30?: number;
    interactions30?: number; likes30?: number; comments30?: number; saves30?: number; shares30?: number;
  };
  media?: Media[];
  error?: string;
};

const nf = new Intl.NumberFormat("pt-BR");
const firstLine = (c?: string) => {
  const t = c?.split("\n")[0]?.trim() || "Post sem legenda";
  return t.length > 60 ? `${t.slice(0, 57)}...` : t;
};

export default function SinaisPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState<"loading" | "live" | "fallback">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/instagram");
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(body.error ?? "Instagram indisponivel.");
        if (!cancelled) { setData(body); setStatus("live"); }
      } catch (e) {
        if (!cancelled) { setData({ ok: false, error: e instanceof Error ? e.message : "indisponivel" }); setStatus("fallback"); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const m = data?.metrics ?? {};
  const mixTotal = (m.likes30 ?? 0) + (m.comments30 ?? 0) + (m.saves30 ?? 0) + (m.shares30 ?? 0);
  const mix = [
    { label: "Curtidas", value: m.likes30 ?? 0 },
    { label: "Comentarios", value: m.comments30 ?? 0 },
    { label: "Salvos", value: m.saves30 ?? 0 },
    { label: "Compartilhamentos", value: m.shares30 ?? 0 },
  ];

  const topPosts = useMemo(
    () => [...(data?.media ?? [])].sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0)).slice(0, 8),
    [data?.media],
  );

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Sinais</h1>
          <div className="subtitle">
            Leitura real de performance do Instagram (@{data?.profile?.username ?? "euericksena"}) — Graph API, ultimos 30 dias.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Alcance 30d</div>
          <div className="value">{status === "live" ? nf.format(m.reach30 ?? 0) : "--"}</div>
        </div>
      </div>

      <div className={`connection-status ${status === "live" ? "success" : status}`}>
        {status === "live"
          ? "Dados reais do Instagram (Graph API)."
          : status === "loading"
            ? "Buscando metricas reais..."
            : `Instagram indisponivel: ${data?.error}`}
      </div>

      <div className="kpi-row">
        <article className="kpi-card"><div className="kpi-label">Alcance 30d</div><div className="kpi-value">{nf.format(m.reach30 ?? 0)}</div><div className="kpi-trend">Contas alcancadas</div></article>
        <article className="kpi-card"><div className="kpi-label">Visualizacoes</div><div className="kpi-value">{nf.format(m.views30 ?? 0)}</div><div className="kpi-trend">Views 30d</div></article>
        <article className="kpi-card"><div className="kpi-label">Visitas ao perfil</div><div className="kpi-value">{nf.format(m.profileViews30 ?? 0)}</div><div className="kpi-trend">30d</div></article>
        <article className="kpi-card"><div className="kpi-label">Contas engajadas</div><div className="kpi-value">{nf.format(m.accountsEngaged30 ?? 0)}</div><div className="kpi-trend up">30d</div></article>
      </div>

      <div className="grid-2col">
        <article className="card">
          <div className="card-header">
            <div className="card-title">Mix de engajamento (30d)</div>
            <span className="card-badge">{nf.format(mixTotal)} interacoes</span>
          </div>
          {mixTotal === 0 ? (
            <p className="muted-copy">Sem interacoes registradas na janela de 30 dias.</p>
          ) : (
            <div className="stage-list">
              {mix.map((item) => (
                <div className="stage-row" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{nf.format(item.value)} ({((item.value / mixTotal) * 100).toFixed(0)}%)</strong>
                </div>
              ))}
            </div>
          )}
        </article>
        <article className="card">
          <div className="card-header">
            <div className="card-title">O que a API nao entrega</div>
            <span className="card-badge">honesto</span>
          </div>
          <p className="muted-copy">
            Crescimento % mes-a-mes, &quot;melhor horario&quot; e narrativas de tendencia nao vem da Graph API
            e foram removidos para nao inventar numero. Podem ser reintroduzidos se guardarmos snapshots historicos.
          </p>
        </article>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Post</th><th>Tipo</th><th>Alcance</th><th>Interacoes</th><th>Salvos</th><th>Data</th></tr>
          </thead>
          <tbody>
            {topPosts.length ? (
              topPosts.map((item) => (
                <tr key={item.id}>
                  <td>{firstLine(item.caption)}</td>
                  <td>{item.media_product_type ?? item.media_type ?? "MEDIA"}</td>
                  <td>{nf.format(item.reach ?? 0)}</td>
                  <td>{nf.format(item.total_interactions ?? 0)}</td>
                  <td>{nf.format(item.saved ?? 0)}</td>
                  <td>{item.timestamp ? new Date(item.timestamp).toLocaleDateString("pt-BR") : "--"}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={6}>Sem posts carregados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
