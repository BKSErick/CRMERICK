"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import {
  CONTENT_MEDIA_BUCKET,
  type ContentChannel,
  type ContentItem,
  type ContentMediaKind,
  type ContentStatus,
  type ContentType,
  STATUS_LABELS,
  acceptsCaption,
  allowedMediaKinds,
  captionLimitFor,
  contentTypesFor,
  requiresMedia,
} from "@/lib/contentItems";

type Props = {
  channel: ContentChannel;
  /** null = criar um item novo. */
  item: ContentItem | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
};

type Form = {
  type: ContentType;
  title: string;
  hook: string;
  caption: string;
  status: ContentStatus;
  scheduledAt: string;
  mediaUrl: string;
  mediaPath: string;
  mediaKind: ContentMediaKind | null;
};

// <input type="datetime-local"> fala horario LOCAL sem timezone; o banco guarda UTC.
function toDatetimeLocal(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyForm(channel: ContentChannel): Form {
  return {
    type: contentTypesFor(channel)[0],
    title: "",
    hook: "",
    caption: "",
    status: "planejado",
    scheduledAt: "",
    mediaUrl: "",
    mediaPath: "",
    mediaKind: null,
  };
}

function formFrom(item: ContentItem): Form {
  return {
    type: item.type,
    title: item.title ?? "",
    hook: item.hook ?? "",
    caption: item.caption ?? "",
    status: item.status,
    scheduledAt: toDatetimeLocal(item.scheduled_at),
    mediaUrl: item.media_url ?? "",
    mediaPath: item.media_path ?? "",
    mediaKind: item.media_kind,
  };
}

async function readBody<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) throw new Error(body?.error ?? fallback);
  return body as T;
}

function fileLabel(url: string) {
  const name = url.split("/").pop() ?? "";
  // O nome no Storage vem prefixado por um uuid; mostra so o nome original.
  return decodeURIComponent(name.replace(/^[0-9a-f-]{36}-/, "")) || "arquivo";
}

export function ContentEditorDialog({ channel, item, open, onClose, onChanged }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<Form>(() => (item ? formFrom(item) : emptyForm(channel)));
  const [lastItem, setLastItem] = useState(item);
  const [busy, setBusy] = useState<null | "salvando" | "publicando" | "enviando" | "excluindo" | "gerando">(null);
  const [error, setError] = useState<string | null>(null);
  // Confirmacao mora DENTRO do modal: window.confirm joga um alerta cru do navegador
  // por cima de um dialogo desenhado, e nao da pra explicar o que vai acontecer.
  const [confirming, setConfirming] = useState<null | "publicar" | "excluir">(null);
  // Assunto em alta digitado na mao: a API do Threads nao entrega trending sem App Review.
  const [assunto, setAssunto] = useState("");

  // Cada abertura traz um item diferente: reinicia o formulario na renderizacao,
  // sem effect, mesmo padrao do DemandDialog.
  if (item !== lastItem) {
    setLastItem(item);
    setForm(item ? formFrom(item) : emptyForm(channel));
    setError(null);
    setConfirming(null);
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const limit = captionLimitFor(channel);
  const used = form.caption.length;
  const withinLimit = used <= limit;
  const published = item?.status === "publicado";
  const kinds = allowedMediaKinds(form.type);
  const acceptAttr = kinds.length === 0 ? "" : kinds.map((kind) => `${kind}/*`).join(",");
  const canalLabel = channel === "threads" ? "Threads" : "Instagram";

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function uploadMedia(file: File) {
    setBusy("enviando");
    setError(null);
    try {
      const prepared = await readBody<{ upload: { path: string; token: string; storageUrl: string; anonKey: string } }>(
        await fetch("/api/content/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "prepare-upload",
            channel,
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          }),
        }),
        "Nao foi possivel preparar o upload.",
      );

      // Upload direto do navegador pro Storage: o arquivo nao passa pelo servidor Next.
      const client = createClient(prepared.upload.storageUrl, prepared.upload.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const uploaded = await client.storage
        .from(CONTENT_MEDIA_BUCKET)
        .uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, { contentType: file.type });
      if (uploaded.error) throw uploaded.error;

      const confirmed = await readBody<{ mediaUrl: string; mediaPath: string; mediaKind: ContentMediaKind }>(
        await fetch("/api/content/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "confirm-upload", storagePath: prepared.upload.path }),
        }),
        "Nao foi possivel confirmar o upload.",
      );

      setForm((current) => ({
        ...current,
        mediaUrl: confirmed.mediaUrl,
        mediaPath: confirmed.mediaPath,
        mediaKind: confirmed.mediaKind,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<ContentItem> {
    const payload = {
      channel,
      type: form.type,
      title: form.title,
      hook: form.hook,
      caption: form.caption,
      status: form.status,
      scheduledAt: form.scheduledAt || null,
      mediaUrl: form.mediaUrl || null,
      mediaPath: form.mediaPath || null,
      mediaKind: form.mediaKind,
    };
    const response = item
      ? await fetch(`/api/content/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    const body = await readBody<{ item: ContentItem }>(response, "Nao foi possivel salvar.");
    return body.item;
  }

  async function handleSave() {
    setBusy("salvando");
    setError(null);
    try {
      await save();
      onChanged();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handlePublish() {
    setBusy("publicando");
    setError(null);
    try {
      // Salva antes: quem publica e o servidor lendo o banco, entao a edicao que ainda
      // esta so na tela precisa estar gravada pra ir junto.
      const saved = await save();
      await readBody(
        await fetch("/api/content/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: saved.id }),
        }),
        "Falha ao publicar.",
      );
      onChanged();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setConfirming(null);
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  // Reescreve o texto amarrando num assunto em alta. Veio do painel de Threads antigo,
  // que fazia isso numa tabela; aqui fica junto do campo que o usuario esta editando.
  async function regenerate() {
    if (!assunto.trim()) return;
    setBusy("gerando");
    setError(null);
    try {
      const body = await readBody<{ text: string }>(
        await fetch("/api/threads/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: form.caption || form.hook, topic: assunto }),
        }),
        "Falha ao gerar.",
      );
      set("caption", body.text);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!item) return;
    setBusy("excluindo");
    setError(null);
    try {
      await readBody(await fetch(`/api/content/${item.id}`, { method: "DELETE" }), "Nao foi possivel excluir.");
      onChanged();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setConfirming(null);
    } finally {
      setBusy(null);
    }
  }

  function close() {
    setConfirming(null);
    onClose();
  }

  return (
    <dialog className="content-dialog" onCancel={close} onClose={close} ref={ref}>
      <header className="content-dialog-head">
        <div>
          <h2>{item ? "Editar conteudo" : "Novo conteudo"}</h2>
          <p>
            {canalLabel} · {form.type}
            {published && item?.published_at
              ? ` · publicado em ${new Date(item.published_at).toLocaleDateString("pt-BR")}`
              : null}
          </p>
        </div>
        <div className="content-dialog-head-right">
          {item ? <span className={`content-badge ${item.status}`}>{STATUS_LABELS[item.status]}</span> : null}
          <button aria-label="Fechar" className="content-dialog-close" onClick={close} type="button">
            ×
          </button>
        </div>
      </header>

      <div className="content-dialog-body">
        {error ? <div className="content-alert erro">{error}</div> : null}

        {item?.status === "falhou" && item.error_message && !error ? (
          <div className="content-alert erro">Ultima tentativa falhou: {item.error_message}</div>
        ) : null}

        {published ? (
          <div className="content-alert ok">
            Ja publicado.
            {item?.permalink ? (
              <>
                {" "}
                <a href={item.permalink} rel="noreferrer" target="_blank">Ver no {canalLabel}</a>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="content-field-row">
          <div className="content-field">
            <label htmlFor="content-tipo">Tipo</label>
            <select
              id="content-tipo"
              onChange={(event) => set("type", event.target.value as ContentType)}
              value={form.type}
            >
              {contentTypesFor(channel).map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div className="content-field">
            <label htmlFor="content-status">Status</label>
            <select
              id="content-status"
              onChange={(event) => set("status", event.target.value as ContentStatus)}
              value={form.status}
            >
              <option value="rascunho">Rascunho</option>
              <option value="planejado">Planejado</option>
              <option value="agendado">Agendado</option>
              {published ? <option value="publicado">Publicado</option> : null}
              {item?.status === "falhou" ? <option value="falhou">Falhou</option> : null}
            </select>
          </div>
          <div className="content-field">
            <label htmlFor="content-data">Data de postagem</label>
            <input
              id="content-data"
              onChange={(event) => set("scheduledAt", event.target.value)}
              type="datetime-local"
              value={form.scheduledAt}
            />
          </div>
        </div>

        <div className="content-field">
          <label htmlFor="content-titulo">Titulo</label>
          <input
            id="content-titulo"
            maxLength={180}
            onChange={(event) => set("title", event.target.value)}
            placeholder="Como voce chama esse conteudo internamente"
            value={form.title}
          />
        </div>

        <div className="content-field">
          <label htmlFor="content-gancho">Gancho</label>
          <input
            id="content-gancho"
            onChange={(event) => set("hook", event.target.value)}
            placeholder="A frase que abre / o texto na imagem"
            value={form.hook}
          />
        </div>

        {acceptsCaption(form.type) ? (
          <div className="content-field">
            <div className="content-field-head">
              <label htmlFor="content-legenda">{channel === "threads" ? "Texto do post" : "Legenda"}</label>
              <span className={`content-counter${withinLimit ? "" : " estourou"}`}>
                {used}/{limit}
              </span>
            </div>
            <textarea
              id="content-legenda"
              onChange={(event) => set("caption", event.target.value)}
              placeholder={channel === "threads" ? "O post, inteiro." : "A legenda que vai junto do post."}
              rows={channel === "threads" ? 5 : 9}
              value={form.caption}
            />
            {channel === "threads" ? (
              <div className="content-generate-row">
                <input
                  onChange={(event) => setAssunto(event.target.value)}
                  placeholder="Assunto em alta (ex: agente de IA, Pix parcelado)"
                  value={assunto}
                />
                <button
                  className="topbar-btn"
                  disabled={!assunto.trim() || busy !== null}
                  onClick={regenerate}
                  title={assunto.trim() ? "" : "Digite o assunto em alta"}
                  type="button"
                >
                  {busy === "gerando" ? "Gerando..." : "Regenerar com IA"}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="content-hint">
            Story nao leva legenda: a API do Instagram recusa o post se mandar texto junto.
          </div>
        )}

        {requiresMedia(form.type) ? (
          <div className="content-field">
            <div className="content-field-head">
              <label>Midia</label>
              <span className="content-counter">{kinds.join(" ou ")}</span>
            </div>

            {form.mediaUrl ? (
              <div className="content-media">
                {form.mediaKind === "video" ? (
                  <video controls src={form.mediaUrl} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="Previa da midia" src={form.mediaUrl} />
                )}
                <div className="content-media-info">
                  <strong>{fileLabel(form.mediaUrl)}</strong>
                  <a href={form.mediaUrl} rel="noreferrer" target="_blank">Abrir URL publica</a>
                  <div className="content-media-actions">
                    <label className="content-file-btn">
                      Trocar
                      <input
                        accept={acceptAttr}
                        disabled={busy !== null}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) uploadMedia(file);
                        }}
                        type="file"
                      />
                    </label>
                    <button
                      className="content-link-btn"
                      disabled={busy !== null}
                      onClick={() => setForm((c) => ({ ...c, mediaUrl: "", mediaPath: "", mediaKind: null }))}
                      type="button"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <label className={`content-dropzone${busy === "enviando" ? " enviando" : ""}`}>
                <input
                  accept={acceptAttr}
                  disabled={busy !== null}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadMedia(file);
                  }}
                  type="file"
                />
                <strong>{busy === "enviando" ? "Enviando arquivo..." : "Escolher arquivo"}</strong>
                <small>
                  O Instagram busca a midia por URL publica: o arquivo sobe pro Storage e a API le de la. Ate 50 MB.
                </small>
              </label>
            )}
          </div>
        ) : null}
      </div>

      <footer className="content-dialog-foot">
        {confirming ? (
          <div className="content-confirm">
            <p>
              {confirming === "publicar"
                ? `Publicar agora no ${canalLabel}? Isso vai ao ar no seu perfil e nao da pra desfazer por aqui.`
                : "Excluir esse conteudo? A midia sai junto do Storage e nao da pra desfazer."}
            </p>
            <div className="content-dialog-actions">
              <button className="topbar-btn" disabled={busy !== null} onClick={() => setConfirming(null)} type="button">
                Voltar
              </button>
              <button
                className={`topbar-btn ${confirming === "excluir" ? "danger" : "primary"}`}
                disabled={busy !== null}
                onClick={confirming === "publicar" ? handlePublish : handleDelete}
                type="button"
              >
                {busy === "publicando"
                  ? "Publicando..."
                  : busy === "excluindo"
                    ? "Excluindo..."
                    : confirming === "publicar"
                      ? "Confirmar e publicar"
                      : "Confirmar exclusao"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {item ? (
              <button
                className="content-link-btn perigo"
                disabled={busy !== null}
                onClick={() => setConfirming("excluir")}
                type="button"
              >
                Excluir
              </button>
            ) : null}
            <div className="content-dialog-actions">
              <button className="topbar-btn" disabled={busy !== null} onClick={close} type="button">
                Cancelar
              </button>
              <button className="topbar-btn" disabled={busy !== null || !withinLimit} onClick={handleSave} type="button">
                {busy === "salvando" ? "Salvando..." : "Salvar"}
              </button>
              {published ? null : (
                <button
                  className="topbar-btn primary"
                  disabled={busy !== null || !withinLimit}
                  onClick={() => setConfirming("publicar")}
                  type="button"
                >
                  Publicar agora
                </button>
              )}
            </div>
          </>
        )}
      </footer>
    </dialog>
  );
}
