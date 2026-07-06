"use client";

import { useEffect, useMemo, useState } from "react";

type InstagramMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  reach?: number;
  saved?: number;
  shares?: number;
  total_interactions?: number;
};

type InstagramPayload = {
  ok: boolean;
  credentialSource?: string;
  profile?: {
    username?: string;
    name?: string;
    biography?: string;
    followers?: number;
    mediaCount?: number;
    profilePictureUrl?: string;
  };
  metrics?: { reach30?: number; views30?: number; interactions30?: number };
  media?: InstagramMedia[];
  error?: string;
};

const numberFormatter = new Intl.NumberFormat("pt-BR");

function firstLine(value?: string) {
  const text = value?.split("\n")[0]?.trim() || "Post sem legenda";
  return text.length > 86 ? `${text.slice(0, 83)}...` : text;
}

export default function InstagramPage() {
  const [payload, setPayload] = useState<InstagramPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "live" | "fallback">("loading");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/instagram");
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Instagram indisponivel.");
        if (!cancelled) {
          setPayload(body);
          setStatus("live");
        }
      } catch (error) {
        if (!cancelled) {
          setPayload({ ok: false, error: error instanceof Error ? error.message : "Instagram indisponivel." });
          setStatus("fallback");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const media = useMemo(() => payload?.media ?? [], [payload?.media]);
  const reach = payload?.metrics?.reach30 ?? 0;
  const totalInteractions = payload?.metrics?.interactions30 ?? media.reduce((sum, item) => sum + (item.like_count ?? 0) + (item.comments_count ?? 0), 0);
  const engagement = reach > 0 ? (totalInteractions / reach) * 100 : 0;

  const rankedMedia = useMemo(
    () => [...media].sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0)),
    [media],
  );

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Instagram</h1>
          <div className="subtitle">
            Painel do Instagram migrado para React, consumindo a API server-side sem expor token no navegador.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Alcance 30d</div>
          <div className="value">{reach ? numberFormatter.format(reach) : "--"}</div>
        </div>
      </div>

      <div className={`connection-status ${status === "live" ? "success" : status}`}>
        {status === "live"
          ? `Dados reais carregados via ${payload?.credentialSource ?? "server-env"}.`
          : status === "loading"
            ? "Buscando dados do Instagram..."
            : `Fallback ativo: ${payload?.error}`}
      </div>

      <div className="instagram-profile card">
        <div className="ig-avatar" style={{ backgroundImage: payload?.profile?.profilePictureUrl ? `url(${payload.profile.profilePictureUrl})` : undefined }}>
          {payload?.profile?.profilePictureUrl ? "" : "IG"}
        </div>
        <div>
          <div className="focus-title">{payload?.profile?.name ?? "Instagram Erick Sena"}</div>
          <p className="muted-copy">@{payload?.profile?.username ?? "euericksena"}</p>
          <p className="muted-copy">{payload?.profile?.biography ?? "Configure as credenciais para carregar biografia e midias reais."}</p>
        </div>
      </div>

      <div className="kpi-row">
        <article className="kpi-card">
          <div className="kpi-label">Seguidores</div>
          <div className="kpi-value">{payload?.profile?.followers ? numberFormatter.format(payload.profile.followers) : "--"}</div>
          <div className="kpi-trend">Perfil</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Posts carregados</div>
          <div className="kpi-value">{media.length}</div>
          <div className="kpi-trend">Ultimas midias</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Interacoes</div>
          <div className="kpi-value">{numberFormatter.format(totalInteractions)}</div>
          <div className="kpi-trend up">Likes + comentarios</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Engajamento</div>
          <div className="kpi-value">{engagement ? `${engagement.toFixed(1).replace(".", ",")}%` : "--"}</div>
          <div className="kpi-trend">Interacoes / alcance</div>
        </article>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Post</th>
              <th>Tipo</th>
              <th>Alcance</th>
              <th>Likes</th>
              <th>Comentarios</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {rankedMedia.length ? (
              rankedMedia.slice(0, 8).map((item) => (
                <tr key={item.id}>
                  <td>{firstLine(item.caption)}</td>
                  <td>{item.media_product_type ?? item.media_type ?? "MEDIA"}</td>
                  <td>{numberFormatter.format(item.reach ?? 0)}</td>
                  <td>{numberFormatter.format(item.like_count ?? 0)}</td>
                  <td>{numberFormatter.format(item.comments_count ?? 0)}</td>
                  <td>{item.timestamp ? new Date(item.timestamp).toLocaleDateString("pt-BR") : "--"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>Sem midias reais carregadas. Configure as credenciais em Configuracoes.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
