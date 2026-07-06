"use client";

import { useEffect, useMemo, useState } from "react";

type MediaItem = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
};

const fallbackPlan = [
  { title: "Diagnostico de funil", pillar: "Autoridade", format: "Carrossel", stage: "Topo", status: "Planejado" },
  { title: "Bastidor de proposta", pillar: "Prova", format: "Reel", stage: "Meio", status: "Roteiro" },
  { title: "Oferta de mentoria", pillar: "Conversao", format: "Story", stage: "Fundo", status: "Pronto" },
];

function titleFromCaption(caption?: string) {
  return caption?.split("\n")[0]?.trim() || "Post sem legenda";
}

export default function ConteudoPage() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [status, setStatus] = useState<"loading" | "live" | "fallback">("loading");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/instagram");
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Conteudo indisponivel.");
        if (!cancelled) {
          setMedia(body.media ?? []);
          setStatus("live");
        }
      } catch {
        if (!cancelled) setStatus("fallback");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const contentRows = useMemo(() => {
    if (!media.length) return fallbackPlan;
    return media.slice(0, 8).map((item) => ({
      title: titleFromCaption(item.caption),
      pillar: (item.like_count ?? 0) > 100 ? "Prova" : "Autoridade",
      format: item.media_product_type ?? item.media_type ?? "Post",
      stage: (item.comments_count ?? 0) > 10 ? "Meio/Fundo" : "Topo",
      status: "Publicado",
    }));
  }, [media]);

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Conteudo</h1>
          <div className="subtitle">
            Calendario editorial e leitura de performance migrados para React, mantendo tabela e cards do Hub.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Itens</div>
          <div className="value">{contentRows.length}</div>
        </div>
      </div>

      <div className={`connection-status ${status === "live" ? "success" : status}`}>
        {status === "live"
          ? "Conteudos reais carregados do Instagram."
          : status === "loading"
            ? "Carregando Instagram..."
            : "Fallback editorial ativo ate configurar credenciais."}
      </div>

      <div className="kpi-row">
        <article className="kpi-card">
          <div className="kpi-label">Publicados</div>
          <div className="kpi-value">{media.length}</div>
          <div className="kpi-trend">Instagram API</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Topo</div>
          <div className="kpi-value">{contentRows.filter((row) => row.stage.includes("Topo")).length}</div>
          <div className="kpi-trend">Awareness</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Meio/Fundo</div>
          <div className="kpi-value">{contentRows.filter((row) => !row.stage.includes("Topo")).length}</div>
          <div className="kpi-trend up">Conversao</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Status</div>
          <div className="kpi-value">{status === "live" ? "Live" : "Mock"}</div>
          <div className="kpi-trend">Fonte atual</div>
        </article>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Conteudo</th>
              <th>Pilar</th>
              <th>Formato</th>
              <th>Funil</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {contentRows.map((row) => (
              <tr key={`${row.title}-${row.format}`}>
                <td>{row.title}</td>
                <td>{row.pillar}</td>
                <td>{row.format}</td>
                <td>{row.stage}</td>
                <td>
                  <span className="status-pill active">{row.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
