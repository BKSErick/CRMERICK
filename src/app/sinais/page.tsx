"use client";

import { useEffect, useState } from "react";

// Sinais = radar de INTERESSE do funil outbound (nao e mais espelho do Instagram — as
// metricas de IG vivem na aba Instagram). Aqui entra quem deu sinal de vida nas paginas
// de diagnostico: abriu a auditoria, clicou no link, clicou no WhatsApp. Esse e o
// gatilho mais quente do follow-up: quem abriu nas ultimas 48h merece mensagem HOJE.

type Signal = {
  company: string;
  pageUrl: string | null;
  views: number;
  waClicks: number;
  linkClicks: number;
  lastEvent: string;
  hot: boolean;
};

type Payload = {
  ok: boolean;
  totals?: { companies: number; views: number; waClicks: number; linkClicks: number; hot: number };
  signals?: Signal[];
  error?: string;
};

const nf = new Intl.NumberFormat("pt-BR");

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return "ha menos de 1h";
  if (h < 24) return `ha ${h}h`;
  const d = Math.floor(h / 24);
  return `ha ${d} dia(s)`;
}

export default function SinaisPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sinais");
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(body.error ?? "Sinais indisponiveis.");
        if (!cancelled) { setData(body); setStatus("ready"); }
      } catch (e) {
        if (!cancelled) { setData({ ok: false, error: e instanceof Error ? e.message : "indisponivel" }); setStatus("error"); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const totals = data?.totals ?? { companies: 0, views: 0, waClicks: 0, linkClicks: 0, hot: 0 };
  const signals = data?.signals ?? [];

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Sinais</h1>
          <div className="subtitle">
            Radar de interesse do funil: quem abriu sua pagina de diagnostico, clicou no link ou no WhatsApp.
            Quem deu sinal nas ultimas 48h e follow-up de HOJE.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Quentes (48h)</div>
          <div className="value">{status === "ready" ? totals.hot : "--"}</div>
        </div>
      </div>

      {status === "loading" ? (
        <div className="connection-status fallback">Carregando sinais das paginas de diagnostico...</div>
      ) : status === "error" ? (
        <div className="portfolio-status warning">Nao foi possivel carregar os sinais: {data?.error}</div>
      ) : (
        <>
          <div className="kpi-row">
            <article className="kpi-card">
              <div className="kpi-label">Empresas com atividade</div>
              <div className="kpi-value">{nf.format(totals.companies)}</div>
              <div className="kpi-trend">Abriram alguma pagina</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Aberturas de auditoria</div>
              <div className="kpi-value">{nf.format(totals.views)}</div>
              <div className="kpi-trend">DiagnosticoView</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Cliques no WhatsApp</div>
              <div className="kpi-value">{nf.format(totals.waClicks)}</div>
              <div className="kpi-trend up">Lead direto da pagina</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Quentes agora</div>
              <div className="kpi-value">{totals.hot}</div>
              <div className="kpi-trend up">Atividade nas ultimas 48h</div>
            </article>
          </div>

          {signals.length === 0 ? (
            <div className="connection-status fallback">
              Nenhum sinal ainda. Os eventos chegam quando um lead abre a pagina de diagnostico que voce
              mandou (o pixel registra abertura, clique em link e clique no WhatsApp automaticamente).
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Aberturas</th>
                    <th>Cliques link</th>
                    <th>Cliques WhatsApp</th>
                    <th>Ultimo sinal</th>
                    <th>Pagina</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s) => (
                    <tr key={s.company}>
                      <td>
                        {s.company}
                        {s.hot && <span className="status-pill" style={{ marginLeft: "6px", background: "#d32f2f", color: "#fff" }}>QUENTE</span>}
                      </td>
                      <td>{nf.format(s.views)}</td>
                      <td>{nf.format(s.linkClicks)}</td>
                      <td>{s.waClicks > 0 ? <strong>{nf.format(s.waClicks)}</strong> : 0}</td>
                      <td>{s.lastEvent ? `${new Date(s.lastEvent).toLocaleDateString("pt-BR")} (${timeAgo(s.lastEvent)})` : "--"}</td>
                      <td>
                        {s.pageUrl ? (
                          <a className="topbar-btn" href={s.pageUrl} rel="noreferrer" target="_blank">Abrir</a>
                        ) : (
                          "--"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
