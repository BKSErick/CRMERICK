"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ContentEditorDialog } from "@/components/ContentEditorDialog";
import {
  type ContentChannel,
  type ContentItem,
  type ContentStatus,
  CONTENT_PAGE_SIZE,
  CONTENT_STATUSES,
  STATUS_LABELS,
  contentTypesFor,
  pageWindow,
  sortContentItems,
  summarizeContent,
} from "@/lib/contentItems";

const nf = new Intl.NumberFormat("pt-BR");
const PAGE_SIZE = CONTENT_PAGE_SIZE;

function formatDate(item: ContentItem) {
  const raw = item.scheduled_at ?? item.published_at;
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

// Titulo e legenda quase se repetem no que veio do Instagram (o titulo E a primeira
// linha da legenda). Mostrar as duas colunas lado a lado duplicava o texto na tela,
// entao a linha traz o titulo e, embaixo, so o que a legenda acrescenta.
function rowText(item: ContentItem) {
  const title = clean(item.title);
  const body = clean(item.caption) || clean(item.excerpt) || clean(item.hook);
  if (!body) return { title: title || "(sem titulo)", detail: "" };
  if (!title) return { title: body.slice(0, 90), detail: "" };

  const rest = body.toLowerCase().startsWith(title.toLowerCase()) ? body.slice(title.length).trim() : body;
  const detail = rest.replace(/^[-–—:.,\s]+/, "");
  return { title, detail: detail.length > 150 ? `${detail.slice(0, 147)}...` : detail };
}

// Backlog e historico do canal na MESMA tabela: o que esta planejado, o que esta
// agendado e o que ja saiu, em ordem de data. Antes disso o planejado morava numa tela
// (/conteudo, lendo JSON estatico) e o publicado em outra (/instagram, ao vivo da API),
// e nao dava pra olhar os dois juntos.
export function ContentBoard({ channel }: { channel: ContentChannel }) {
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"todos" | ContentStatus>("todos");
  const [typeFilter, setTypeFilter] = useState<"todos" | string>("todos");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ item: ContentItem | null } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingBulk, setConfirmingBulk] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Recarregar e um contador, nao uma funcao chamada de fora do effect: o fetch mora
  // dentro do effect (com guarda de cancelamento) como no resto do projeto.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function fetchItems() {
      try {
        const response = await fetch(`/api/content?channel=${channel}`);
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Nao foi possivel carregar o conteudo.");
        if (cancelled) return;
        setItems(body.items as ContentItem[]);
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        setItems([]);
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    }

    fetchItems();
    return () => {
      cancelled = true;
    };
  }, [channel, reloadKey]);

  const all = useMemo(() => sortContentItems(items ?? []), [items]);
  const summary = useMemo(() => summarizeContent(items ?? []), [items]);
  const visible = useMemo(
    () =>
      all.filter(
        (item) =>
          (statusFilter === "todos" || item.status === statusFilter) &&
          (typeFilter === "todos" || item.type === typeFilter),
      ),
    [all, statusFilter, typeFilter],
  );

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  // Trocar o filtro pode encurtar a lista abaixo da pagina atual; sem isso a tela fica
  // vazia numa pagina que nao existe mais.
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = visible.slice(start, start + PAGE_SIZE);

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
    // A selecao e por id: trocar o filtro esconderia itens marcados, e "Excluir 27"
    // apagaria coisa que sumiu da tela. Mais seguro zerar.
    setSelected(new Set());
    setConfirmingBulk(false);
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Marca tudo que o filtro atual mostra, nao so a pagina: o pedido real e
  // "todos os planejados", que sao mais do que cabe numa pagina.
  const allFilteredSelected = visible.length > 0 && visible.every((item) => selected.has(item.id));
  function toggleAll() {
    setSelected(allFilteredSelected ? new Set() : new Set(visible.map((item) => item.id)));
  }

  async function removeSelected() {
    setRemoving(true);
    setError(null);
    try {
      const response = await fetch("/api/content", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Nao foi possivel excluir.");
      setNotice(`${body.removed} ${body.removed === 1 ? "item excluido" : "itens excluidos"}.`);
      setSelected(new Set());
      setConfirmingBulk(false);
      setPage(1);
      reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRemoving(false);
    }
  }

  async function syncInstagram() {
    setSyncing(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/content/sync-instagram", { method: "POST" });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao importar.");
      setNotice(`${body.synced} publicacoes importadas do Instagram.`);
      reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>{channel === "threads" ? "Conteudo do Threads" : "Conteudo do Instagram"}</h1>
          <div className="subtitle">
            Backlog e publicados no mesmo lugar. Editavel, com data de postagem e publicacao pela API.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Itens</div>
          <div className="value">{summary.total}</div>
        </div>
      </div>

      {error ? <div className="content-alert erro">{error}</div> : null}
      {notice ? <div className="content-alert ok">{notice}</div> : null}

      <div className="kpi-row">
        <article className="kpi-card">
          <div className="kpi-label">Planejados</div>
          <div className="kpi-value">{summary.planejado}</div>
          <div className="kpi-trend">Sem data marcada</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Agendados</div>
          <div className="kpi-value">{summary.agendado}</div>
          <div className="kpi-trend">Com data definida</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Publicados</div>
          <div className="kpi-value">{summary.publicado}</div>
          <div className="kpi-trend up">Ja no ar</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">{channel === "threads" ? "Rascunhos" : "Alcance medio"}</div>
          <div className="kpi-value">
            {channel === "threads" ? summary.rascunho : summary.avgReach ? nf.format(summary.avgReach) : "—"}
          </div>
          <div className="kpi-trend">{channel === "threads" ? "Em escrita" : "Por publicacao"}</div>
        </article>
      </div>

      <div className="content-toolbar">
        <select
          onChange={(event) => changeFilter(() => setStatusFilter(event.target.value as "todos" | ContentStatus))}
          value={statusFilter}
        >
          <option value="todos">Todos os status</option>
          {CONTENT_STATUSES.map((status) => (
            <option key={status} value={status}>{STATUS_LABELS[status]}</option>
          ))}
        </select>
        <select onChange={(event) => changeFilter(() => setTypeFilter(event.target.value))} value={typeFilter}>
          <option value="todos">Todos os tipos</option>
          {contentTypesFor(channel).map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <span className="content-toolbar-spacer" />
        {channel === "instagram" ? (
          <button className="topbar-btn" disabled={syncing} onClick={syncInstagram} type="button">
            {syncing ? "Importando..." : "Importar publicados do Instagram"}
          </button>
        ) : null}
        <button className="topbar-btn primary" onClick={() => setEditing({ item: null })} type="button">
          Novo conteudo
        </button>
      </div>

      {selected.size > 0 ? (
        <div className="content-bulk">
          {confirmingBulk ? (
            <>
              <p>
                Excluir {selected.size} {selected.size === 1 ? "item" : "itens"}? A midia sai junto do Storage e nao
                da pra desfazer.
              </p>
              <div className="content-bulk-actions">
                <button className="topbar-btn" disabled={removing} onClick={() => setConfirmingBulk(false)} type="button">
                  Voltar
                </button>
                <button className="topbar-btn danger" disabled={removing} onClick={removeSelected} type="button">
                  {removing ? "Excluindo..." : `Confirmar exclusao de ${selected.size}`}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                <strong>{selected.size}</strong> {selected.size === 1 ? "selecionado" : "selecionados"}
              </p>
              <div className="content-bulk-actions">
                <button className="content-link-btn" onClick={() => setSelected(new Set())} type="button">
                  Limpar selecao
                </button>
                <button className="topbar-btn danger" onClick={() => setConfirmingBulk(true)} type="button">
                  Excluir selecionados
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {items === null ? (
        <div className="connection-status fallback">Carregando conteudo...</div>
      ) : visible.length === 0 ? (
        <div className="connection-status fallback">
          {all.length === 0
            ? "Nenhum conteudo ainda. Rode `npm run content:seed` para importar o backlog do vault, ou crie um item novo."
            : "Nenhum item bate com esse filtro."}
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="content-check">
                    <input
                      aria-label={allFilteredSelected ? "Desmarcar todos" : "Marcar todos os itens do filtro"}
                      checked={allFilteredSelected}
                      onChange={toggleAll}
                      title={`Marcar os ${visible.length} itens deste filtro`}
                      type="checkbox"
                    />
                  </th>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Conteudo</th>
                  {channel === "instagram" ? <th className="content-num">Alcance</th> : null}
                  <th className="content-num">Likes</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => {
                  const text = rowText(item);
                  return (
                    <tr
                      className={`content-row${selected.has(item.id) ? " marcada" : ""}`}
                      key={item.id}
                      onClick={() => setEditing({ item })}
                      title="Clique para editar"
                    >
                      {/* O clique no checkbox nao pode abrir o editor junto. */}
                      <td className="content-check" onClick={(event) => event.stopPropagation()}>
                        <input
                          aria-label={`Selecionar ${item.title ?? "conteudo"}`}
                          checked={selected.has(item.id)}
                          onChange={() => toggle(item.id)}
                          type="checkbox"
                        />
                      </td>
                      <td className="content-when">{formatDate(item)}</td>
                      <td>{item.type}</td>
                      <td>
                        <div className="content-cell-title">
                          <strong>{text.title}</strong>
                          {text.detail ? <span>{text.detail}</span> : null}
                        </div>
                      </td>
                      {channel === "instagram" ? (
                        <td className="content-num">{item.metrics?.reach ? nf.format(item.metrics.reach) : "—"}</td>
                      ) : null}
                      <td className="content-num">{item.metrics?.likes ? nf.format(item.metrics.likes) : "—"}</td>
                      <td>
                        <span className={`content-badge ${item.status}`}>{STATUS_LABELS[item.status]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="content-pager">
            <span className="content-pager-info">
              {start + 1}–{Math.min(start + PAGE_SIZE, visible.length)} de {visible.length}
              {visible.length !== all.length ? ` (${all.length} no total)` : ""}
            </span>
            {totalPages > 1 ? (
              <div className="content-pager-controls">
                <button
                  className="topbar-btn"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                  type="button"
                >
                  Anterior
                </button>
                {pageWindow(currentPage, totalPages).map((entry, index) =>
                  entry === "gap" ? (
                    <span className="content-pager-gap" key={`gap-${index}`}>…</span>
                  ) : (
                    <button
                      className={`content-pager-page${entry === currentPage ? " ativa" : ""}`}
                      key={entry}
                      onClick={() => setPage(entry)}
                      type="button"
                    >
                      {entry}
                    </button>
                  ),
                )}
                <button
                  className="topbar-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  type="button"
                >
                  Proxima
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}

      <ContentEditorDialog
        channel={channel}
        item={editing?.item ?? null}
        onChanged={reload}
        onClose={() => setEditing(null)}
        open={editing !== null}
      />
    </section>
  );
}
