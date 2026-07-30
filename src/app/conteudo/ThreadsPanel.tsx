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
  const [publicando, setPublicando] = useState<number | null>(null);
  const [resultado, setResultado] = useState<EstadoPublicacao | null>(null);
  const [publicados, setPublicados] = useState<Record<number, string>>({});

  useEffect(() => {
    fetch("/api/threads/trending?country=BR")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setTopicos(j.topicos ?? []);
        else setAvisoTopicos(j.error ?? "Nao foi possivel carregar os topicos.");
      })
      .catch(() => setAvisoTopicos("Falha de rede ao buscar topicos em alta."));
  }, []);

  async function publicar(item: ThreadsItem) {
    const texto = item.excerpt || item.hook;
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
              const texto = item.excerpt || item.hook;
              const cabe = texto.length <= LIMITE;
              return (
                <tr key={item.n}>
                  <td>{item.n}</td>
                  <td>{item.title}</td>
                  <td>{texto}</td>
                  <td>
                    <span className={`status-pill ${cabe ? "active" : "lost"}`}>
                      {texto.length}/{LIMITE}
                    </span>
                  </td>
                  <td>
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