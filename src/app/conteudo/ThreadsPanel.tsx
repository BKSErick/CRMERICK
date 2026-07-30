"use client";

import { useEffect, useState } from "react";

export type ThreadsItem = {
  n: number;
  title: string;
  excerpt: string;
  hook: string;
  status: string;
};

type Topico = { id: string | null; nome: string; posts: number | null };
type EstadoPublicacao = { n: number; ok: boolean; msg: string; permalink?: string | null };

const LIMITE = 500;

export function ThreadsPanel({ items }: { items: ThreadsItem[] }) {
  const [topicos, setTopicos] = useState<Topico[] | null>(null);
  const [avisoTopicos, setAvisoTopicos] = useState<string | null>(null);
  const [meusTop, setMeusTop] = useState<{ text: string; views: number; replies: number }[]>([]);
  const [publicando, setPublicando] = useState<number | null>(null);
  const [resultado, setResultado] = useState<EstadoPublicacao | null>(null);
  const [publicados, setPublicados] = useState<Record<number, string>>({});
  // Assunto em alta digitado na mao: a API do Threads nao entrega trending.
  const [assunto, setAssunto] = useState("");
  const [gerando, setGerando] = useState<number | null>(null);
  const [reescritos, setReescritos] = useState<Record<number, string>>({});

  useEffect(() => {
    fetch("/api/threads/trending?country=BR")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setTopicos(j.topicos ?? []);
        else setAvisoTopicos(j.error ?? "Nao foi possivel carregar os topicos.");
      })
      .catch(() => setAvisoTopicos("Falha de rede ao buscar topicos em alta."));

    // Sinal que a API entrega hoje: o desempenho dos SEUS posts. Enquanto o app nao
    // passa por App Review, isso e o unico "em alta" real disponivel.
    fetch("/api/threads")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        type PostApi = { text?: string; views?: number; replies?: number };
        const top = (j.posts ?? [])
          .map((p: PostApi) => ({
            text: p.text ?? "",
            views: p.views ?? 0,
            replies: p.replies ?? 0,
          }))
          .filter((p: { text: string }) => p.text)
          .sort((a: { views: number }, b: { views: number }) => b.views - a.views)
          .slice(0, 5);
        setMeusTop(top);
      })
      .catch(() => setMeusTop([]));
  }, []);

  function textoAtual(item: ThreadsItem) {
    return reescritos[item.n] ?? item.excerpt ?? item.hook;
  }

  async function regenerar(item: ThreadsItem) {
    if (!assunto.trim()) return;
    setGerando(item.n);
    setResultado(null);
    try {
      const res = await fetch("/api/threads/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.excerpt || item.hook, topic: assunto }),
      });
      const json = await res.json();
      if (json.ok) setReescritos((r) => ({ ...r, [item.n]: json.text }));
      else setResultado({ n: item.n, ok: false, msg: json.error ?? "Falha ao gerar." });
    } catch (e) {
      setResultado({ n: item.n, ok: false, msg: e instanceof Error ? e.message : "Falha de rede." });
    } finally {
      setGerando(null);
    }
  }

  async function publicar(item: ThreadsItem) {
    const texto = textoAtual(item);
    // Publicar e irreversivel e publico: confirma com o texto na frente do usuario.
    const ok = window.confirm(
      `Publicar agora no Threads?\n\n"${texto}"\n\n${texto.length}/${LIMITE} caracteres.`,
    );
    if (!ok) return;

    setPublicando(item.n);
    setResultado(null);
    try {
      const res = await fetch("/api/threads/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: texto }),
      });
      const json = await res.json();
      if (json.ok) {
        setPublicados((p) => ({ ...p, [item.n]: json.permalink ?? "publicado" }));
        setResultado({ n: item.n, ok: true, msg: "Publicado no Threads.", permalink: json.permalink });
      } else {
        setResultado({ n: item.n, ok: false, msg: json.error ?? "Falha ao publicar." });
      }
    } catch (e) {
      setResultado({ n: item.n, ok: false, msg: e instanceof Error ? e.message : "Falha de rede." });
    } finally {
      setPublicando(null);
    }
  }

  return (
    <>
      <h2 className="section-title">O que mais rodou nos seus posts</h2>
      {meusTop.length === 0 ? (
        <div className="connection-status fallback">Carregando seus posts...</div>
      ) : (
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Post</th>
                <th>Views</th>
                <th>Respostas</th>
              </tr>
            </thead>
            <tbody>
              {meusTop.map((p, i) => (
                <tr key={i}>
                  <td>{p.text.slice(0, 110)}</td>
                  <td>{p.views}</td>
                  <td>{p.replies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="section-title">Em alta no Threads (Brasil)</h2>
      {avisoTopicos ? (
        <div className="portfolio-status warning">{avisoTopicos}</div>
      ) : !topicos ? (
        <div className="connection-status fallback">Carregando topicos...</div>
      ) : topicos.length === 0 ? (
        <div className="connection-status fallback">A API nao retornou topicos agora.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {topicos.map((t, i) => (
            <span key={t.id ?? i} className="status-pill lead">
              {t.nome}
              {t.posts ? ` (${t.posts})` : ""}
            </span>
          ))}
        </div>
      )}

      <h2 className="section-title">Threads ({items.length})</h2>
      {resultado ? (
        <div className={resultado.ok ? "connection-status fallback" : "portfolio-status warning"}>
          {resultado.msg}{" "}
          {resultado.permalink ? (
            <a href={resultado.permalink} target="_blank" rel="noreferrer">
              ver post
            </a>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
        <input
          className="settings-input"
          placeholder="Assunto em alta (ex: agente de IA, layoff em tech, Pix parcelado)"
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          style={{ flex: 1, maxWidth: 520 }}
        />
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          usado pelo botao Regenerar de cada post
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Titulo</th>
              <th>Texto do post</th>
              <th>Tamanho</th>
              <th>Acao</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const texto = textoAtual(item);
              const cabe = texto.length <= LIMITE;
              const reescrito = Boolean(reescritos[item.n]);
              return (
                <tr key={item.n}>
                  <td>{item.n}</td>
                  <td>{item.title}</td>
                  <td>
                    {reescrito ? (
                      <>
                        <textarea
                          className="settings-input"
                          value={texto}
                          rows={4}
                          onChange={(e) =>
                            setReescritos((r) => ({ ...r, [item.n]: e.target.value }))
                          }
                          style={{ width: "100%", minWidth: 320 }}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setReescritos((r) => {
                              const copia = { ...r };
                              delete copia[item.n];
                              return copia;
                            })
                          }
                          style={{
                            marginTop: 4,
                            background: "none",
                            border: "none",
                            padding: 0,
                            fontSize: 11,
                            opacity: 0.7,
                            cursor: "pointer",
                          }}
                        >
                          voltar ao original
                        </button>
                      </>
                    ) : (
                      texto
                    )}
                  </td>
                  <td>
                    <span className={`status-pill ${cabe ? "active" : "lost"}`}>
                      {texto.length}/{LIMITE}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="settings-input"
                      style={{
                        cursor: assunto.trim() ? "pointer" : "not-allowed",
                        width: "auto",
                        padding: "6px 12px",
                      }}
                      disabled={!assunto.trim() || gerando === item.n}
                      title={assunto.trim() ? "" : "Digite o assunto em alta acima"}
                      onClick={() => regenerar(item)}
                    >
                      {gerando === item.n ? "Gerando..." : "Regenerar com IA"}
                    </button>
                    {publicados[item.n] ? (
                      <a href={publicados[item.n]} target="_blank" rel="noreferrer">
                        publicado
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="settings-input"
                        style={{ cursor: cabe ? "pointer" : "not-allowed", width: "auto", padding: "6px 12px" }}
                        disabled={!cabe || publicando === item.n}
                        onClick={() => publicar(item)}
                      >
                        {publicando === item.n ? "Publicando..." : "Publicar agora"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}