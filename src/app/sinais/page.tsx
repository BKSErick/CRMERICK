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

// Volume por pagina: de ONDE vem o acesso (modelo de site, diagnostico, etc.).
type PageStat = {
  pageUrl: string;
  label: string;
  host: string;
  views: number;
  waClicks: number;
  linkClicks: number;
  companies: number;
  lastEvent: string;
  hot: boolean;
};

// Linha de trafego = cada propriedade que traz acesso (bio, quiz, site OStrack,
// modelo de LP, diagnostico). destinations mostra para onde a linha empurra gente.
type TrafficSource = {
  key: string;
  label: string;
  kind: "inbound" | "outbound";
  views: number;
  linkClicks: number;
  waClicks: number;
  pages: number;
  lastEvent: string;
  hot: boolean;
  destinations: Array<{ label: string; clicks: number }>;
};

type Payload = {
  ok: boolean;
  totals?: { companies: number; views: number; waClicks: number; linkClicks: number; hot: number; pages: number; sources: number };
  signals?: Signal[];
  pages?: PageStat[];
  sources?: TrafficSource[];
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

  const totals = data?.totals ?? { companies: 0, views: 0, waClicks: 0, linkClicks: 0, hot: 0, pages: 0, sources: 0 };
  const signals = data?.signals ?? [];
  const pages = data?.pages ?? [];
  const sources = data?.sources ?? [];

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
            <article className="kpi-card">
              <div className="kpi-label">Linhas de trafego</div>
              <div className="kpi-value">{nf.format(totals.sources)}</div>
              <div className="kpi-trend">{nf.format(totals.pages)} paginas ativas</div>
            </article>
          </div>

          {sources.length > 0 && (
            <>
              <h2 style={{ marginTop: "24px" }}>Linhas de trafego</h2>
              <div className="subtitle" style={{ marginBottom: "12px" }}>
                Cada propriedade sua que traz acesso, e para onde ela empurra a pessoa depois.
                Inbound = quem chega ate voce. Outbound = pagina que voce mandou pro lead.
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Tipo</th>
                      <th>Acessos</th>
                      <th>Cliques</th>
                      <th>WhatsApp</th>
                      <th>Destinos mais clicados</th>
                      <th>Ultimo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((s) => (
                      <tr key={s.key}>
                        <td>
                          {s.label}
                          {s.hot && <span className="status-pill" style={{ marginLeft: "6px", background: "#d32f2f", color: "#fff" }}>QUENTE</span>}
                          {s.pages > 1 && <span className="subtitle" style={{ display: "block", fontSize: "11px" }}>{s.pages} paginas</span>}
                        </td>
                        <td>{s.kind === "inbound" ? "Inbound" : "Outbound"}</td>
                        <td><strong>{nf.format(s.views)}</strong></td>
                        <td>{nf.format(s.linkClicks)}</td>
                        <td>{s.waClicks > 0 ? <strong>{nf.format(s.waClicks)}</strong> : 0}</td>
                        <td>
                          {s.destinations.length === 0
                            ? "-- nenhum clique ainda"
                            : s.destinations.map((d) => `${d.label} (${d.clicks})`).join(" · ")}
                        </td>
                        <td>{s.lastEvent ? timeAgo(s.lastEvent) : "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {pages.length > 0 && (
            <>
              <h2 style={{ marginTop: "24px" }}>Volume por pagina</h2>
              <div className="subtitle" style={{ marginBottom: "12px" }}>
                De onde esta vindo o acesso: cada linha e uma pagina (modelo de site ou diagnostico),
                com o total de aberturas e cliques que ela gerou.
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Pagina</th>
                      <th>Dominio</th>
                      <th>Acessos</th>
                      <th>Cliques link</th>
                      <th>Cliques WhatsApp</th>
                      <th>Empresas</th>
                      <th>Ultimo acesso</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map((p) => (
                      <tr key={p.pageUrl}>
                        <td>
                          {p.label}
                          {p.hot && <span className="status-pill" style={{ marginLeft: "6px", background: "#d32f2f", color: "#fff" }}>QUENTE</span>}
                        </td>
                        <td>{p.host || "--"}</td>
                        <td><strong>{nf.format(p.views)}</strong></td>
                        <td>{nf.format(p.linkClicks)}</td>
                        <td>{p.waClicks > 0 ? <strong>{nf.format(p.waClicks)}</strong> : 0}</td>
                        <td>{nf.format(p.companies)}</td>
                        <td>{p.lastEvent ? timeAgo(p.lastEvent) : "--"}</td>
                        <td>
                          <a className="topbar-btn" href={p.pageUrl} rel="noreferrer" target="_blank">Abrir</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h2 style={{ marginTop: "24px" }}>Por empresa</h2>
            </>
          )}

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
