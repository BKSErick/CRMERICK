"use client";

import { useEffect, useState } from "react";

type Topico = { id: string | null; nome: string; posts: number | null };
type MeuPost = { text: string; views: number; replies: number };

// Sinais que ajudam a escrever o proximo post. A lista de posts do backlog saiu daqui
// (agora e o ContentBoard, que grava no banco); o que sobrou e o contexto: o que rodou
// nos seus posts e o que esta em alta.
export function ThreadsPanel() {
  const [topicos, setTopicos] = useState<Topico[] | null>(null);
  const [avisoTopicos, setAvisoTopicos] = useState<string | null>(null);
  const [meusTop, setMeusTop] = useState<MeuPost[]>([]);

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
          .map((p: PostApi) => ({ text: p.text ?? "", views: p.views ?? 0, replies: p.replies ?? 0 }))
          .filter((p: MeuPost) => p.text)
          .sort((a: MeuPost, b: MeuPost) => b.views - a.views)
          .slice(0, 5);
        setMeusTop(top);
      })
      .catch(() => setMeusTop([]));
  }, []);

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
    </>
  );
}
