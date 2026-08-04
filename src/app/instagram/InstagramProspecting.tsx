"use client";

import { useEffect, useState } from "react";

type Finding = {
  channel: {
    dealId: number;
    identity?: string | null;
    profileUrl?: string | null;
    matchSource?: string | null;
    matchConfidence?: "low" | "medium" | "high";
    status?: string;
    evidence?: Record<string, unknown>;
  };
  deal: {
    id: number;
    name?: string | null;
    company?: string | null;
    segment?: string | null;
    site_url?: string | null;
  } | null;
  messages: Array<{ direction?: string | null }>;
};

async function fetchFindings() {
  const response = await fetch("/api/prospecting", { cache: "no-store" });
  const body = await response.json() as { ok?: boolean; items?: Finding[]; error?: string };
  if (!response.ok || !body.ok) throw new Error(body.error ?? "Não foi possível carregar os achados.");
  return body.items ?? [];
}

function confidenceLabel(value?: string) {
  if (value === "high") return "evidência forte";
  if (value === "medium") return "revisado";
  return "revisão pendente";
}

function sourceLabel(value?: string | null) {
  if (value === "official_website") return "site oficial";
  if (value === "maps_profile") return "Google Maps";
  return "pesquisa pública";
}

export function InstagramProspecting() {
  const [items, setItems] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchFindings()
      .then((findings) => {
        if (active) {
          setItems(findings);
          setError("");
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Achados indisponíveis.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await fetchFindings());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Achados indisponíveis.");
    } finally {
      setLoading(false);
    }
  }

  const untouched = items.filter((item) => !item.messages.some((message) => message.direction === "sent")).length;
  const reviewed = items.filter((item) => item.channel.matchConfidence !== "low").length;

  return (
    <section className="ig-workspace">
      <div className="ig-workspace-intro">
        <div>
          <span className="ig-kicker">Achados da busca</span>
          <h2>Somente clínicas já pesquisadas e filtradas</h2>
          <p>A pesquisa é feita comigo em lotes pequenos. O CRM recebe apenas os perfis que passaram pela revisão de identidade, demanda e aderência.</p>
        </div>
        <div className="ig-manual-badge"><span /> Curadoria antes do CRM</div>
      </div>

      <div className="ig-curation-flow" aria-label="Fluxo da curadoria">
        <div><strong>1</strong><span>Buscar</span><small>Maps, Instagram e site</small></div>
        <div><strong>2</strong><span>Revisar</span><small>evidência e aderência</small></div>
        <div><strong>3</strong><span>Subir</span><small>somente o achado útil</small></div>
      </div>

      <div className="ig-findings-toolbar">
        <div className="ig-search-stats">
          <span><strong>{items.length}</strong> achados no CRM</span>
          <span><strong>{reviewed}</strong> com evidência revisada</span>
          <span><strong>{untouched}</strong> ainda sem abordagem</span>
        </div>
        <button disabled={loading} onClick={refresh} type="button">{loading ? "Atualizando..." : "Atualizar lista"}</button>
      </div>

      {error ? <div className="ig-notice error" role="alert">{error}</div> : null}

      <div className="ig-result-grid">
        {items.map((item) => {
          const evidence = item.channel.evidence ?? {};
          const name = item.deal?.company || item.deal?.name || item.channel.identity || "Clínica";
          const location = [evidence.city, evidence.uf].filter((value) => typeof value === "string" && value).join(" / ");
          return (
            <article className="ig-lead-card" key={item.channel.dealId}>
              <div className="ig-lead-card-head">
                <span className={`ig-confidence ${item.channel.matchConfidence ?? "low"}`}>{confidenceLabel(item.channel.matchConfidence)}</span>
                <span className={`ig-status-pill ${item.channel.status ?? "review"}`}>{item.channel.status ?? "revisar"}</span>
              </div>
              <h3>{name}</h3>
              <p>{location || "Localização registrada na pesquisa"}</p>
              <dl className="ig-lead-facts">
                <div><dt>Instagram</dt><dd>@{item.channel.identity || "não identificado"}</dd></div>
                <div><dt>Segmento</dt><dd>{item.deal?.segment === "odontologia" ? "odontologia" : "estética"}</dd></div>
                <div><dt>Origem da evidência</dt><dd>{sourceLabel(item.channel.matchSource)}</dd></div>
              </dl>
              <div className="ig-card-actions">
                {item.channel.profileUrl ? <a href={item.channel.profileUrl} rel="noreferrer" target="_blank">Abrir perfil verificado</a> : <span>Perfil pendente</span>}
                <span className="ig-deal-reference">Lead #{item.channel.dealId}</span>
              </div>
            </article>
          );
        })}
      </div>

      {!loading && !items.length && !error ? (
        <div className="ig-empty">Nenhum achado foi enviado ao CRM ainda. O primeiro lote entra aqui depois da nossa revisão.</div>
      ) : null}
    </section>
  );
}
