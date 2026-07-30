"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type ThreadsPost = {
  id: string;
  text?: string;
  media_type?: string;
  permalink?: string;
  timestamp?: string;
  views?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  quotes?: number;
  shares?: number;
};

type ThreadsPayload = {
  ok: boolean;
  needsAuth?: boolean;
  authUrl?: string | null;
  profile?: {
    username?: string;
    name?: string | null;
    biography?: string | null;
    followers?: number;
  };
  metrics?: {
    views30?: number;
    likes30?: number;
    replies30?: number;
    reposts30?: number;
    quotes30?: number;
  };
  posts?: ThreadsPost[];
  tokenExpiresAt?: string | null;
  error?: string;
};

const nf = new Intl.NumberFormat("pt-BR");

// useSearchParams exige limite de Suspense no App Router; por isso o conteudo
// fica num componente interno e o default so envelopa.
export default function ThreadsPage() {
  return (
    <Suspense fallback={<div className="connection-status fallback">Carregando Threads...</div>}>
      <ThreadsConteudo />
    </Suspense>
  );
}

function ThreadsConteudo() {
  const [data, setData] = useState<ThreadsPayload | null>(null);
  const [carregando, setCarregando] = useState(true);
  // O callback devolve ?erro= quando a troca do code falha. Sem ler isso, a tela
  // repetia "nao conectado" e escondia o motivo real. Lido na renderizacao (nao em
  // efeito) porque so depende da URL: useSearchParams evita o setState em efeito.
  const params = useSearchParams();
  const retorno = {
    erro: params.get("erro") ?? undefined,
    conectado: params.get("conectado") === "1",
  };

  useEffect(() => {
    let ativo = true;
    fetch("/api/threads")
      .then((r) => r.json())
      .then((json: ThreadsPayload) => {
        if (ativo) setData(json);
      })
      .catch((e: unknown) =>
        ativo ? setData({ ok: false, error: e instanceof Error ? e.message : "Falha na rede." }) : null,
      )
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, []);

  const posts = useMemo(
    () => [...(data?.posts ?? [])].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)),
    [data],
  );

  // Engajamento = interacoes / visualizacoes. Sem views, nao mostra numero inventado.
  const engajamento = useMemo(() => {
    const m = data?.metrics;
    if (!m?.views30) return null;
    const inter = (m.likes30 ?? 0) + (m.replies30 ?? 0) + (m.reposts30 ?? 0) + (m.quotes30 ?? 0);
    return ((inter / m.views30) * 100).toFixed(1);
  }, [data]);

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Threads</h1>
          <div className="subtitle">
            {data?.profile?.username
              ? `@${data.profile.username} — dados reais da API do Threads (ultimos 30 dias).`
              : "Alcance, respostas e reposts direto da API do Threads."}
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Seguidores</div>
          <div className="value">{nf.format(data?.profile?.followers ?? 0)}</div>
        </div>
      </div>

      {retorno.erro ? (
        <div className="portfolio-status warning" style={{ marginBottom: 16 }}>
          <strong>A autorizacao voltou com erro:</strong> {retorno.erro}
        </div>
      ) : null}

      {carregando ? (
        <div className="connection-status fallback">Carregando dados do Threads...</div>
      ) : data?.needsAuth ? (
        <div className="portfolio-status warning">
          <p>
            <strong>Threads ainda nao conectado.</strong> O token do Threads e separado do
            Instagram e nasce de uma autorizacao sua.
          </p>
          {data.authUrl ? (
            <>
              <p style={{ marginTop: 16 }}>
                <a
                  href={data.authUrl}
                  rel="noreferrer"
                  style={{
                    display: "inline-block",
                    padding: "10px 18px",
                    borderRadius: 8,
                    background: "var(--color-brand-violet, #7b68ee)",
                    color: "#fff",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Conectar minha conta do Threads
                </a>
              </p>
              <p style={{ marginTop: 12, fontSize: 12, opacity: 0.75, wordBreak: "break-all" }}>
                Se o botao nao abrir, cole no navegador: {data.authUrl}
              </p>
            </>
          ) : (
            <p>Configure THREADS_APP_ID e THREADS_APP_SECRET no servidor.</p>
          )}
        </div>
      ) : !data?.ok ? (
        <div className="portfolio-status warning">
          Nao foi possivel carregar o Threads: {data?.error ?? "erro desconhecido"}
        </div>
      ) : (
        <>
          <div className="kpi-row">
            <article className="kpi-card">
              <div className="kpi-label">Visualizacoes 30d</div>
              <div className="kpi-value">{nf.format(data.metrics?.views30 ?? 0)}</div>
              <div className="kpi-trend">API Threads</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Respostas 30d</div>
              <div className="kpi-value">{nf.format(data.metrics?.replies30 ?? 0)}</div>
              <div className="kpi-trend up">O que empurra pro topico</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Reposts + citacoes</div>
              <div className="kpi-value">
                {nf.format((data.metrics?.reposts30 ?? 0) + (data.metrics?.quotes30 ?? 0))}
              </div>
              <div className="kpi-trend">Alcance emprestado</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Engajamento</div>
              <div className="kpi-value">{engajamento ? `${engajamento}%` : "—"}</div>
              <div className="kpi-trend">Interacoes / views</div>
            </article>
          </div>

          {posts.length === 0 ? (
            <div className="connection-status fallback">
              Nenhum post retornado pela API ainda.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Post</th>
                    <th>Data</th>
                    <th>Views</th>
                    <th>Respostas</th>
                    <th>Likes</th>
                    <th>Reposts</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((post) => (
                    <tr key={post.id}>
                      <td>
                        {post.permalink ? (
                          <a href={post.permalink} target="_blank" rel="noreferrer">
                            {(post.text ?? "(sem texto)").slice(0, 90)}
                          </a>
                        ) : (
                          (post.text ?? "(sem texto)").slice(0, 90)
                        )}
                      </td>
                      <td>{post.timestamp ? post.timestamp.slice(0, 10) : "—"}</td>
                      <td>{nf.format(post.views ?? 0)}</td>
                      <td>{nf.format(post.replies ?? 0)}</td>
                      <td>{nf.format(post.likes ?? 0)}</td>
                      <td>{nf.format((post.reposts ?? 0) + (post.quotes ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.tokenExpiresAt ? (
            <div className="connection-status fallback" style={{ marginTop: 16 }}>
              Token valido ate {data.tokenExpiresAt.slice(0, 10)}. A rota renova sozinha na ultima
              semana.
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}