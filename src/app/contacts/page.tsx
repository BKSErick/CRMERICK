"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useCRMStore, type Contact } from "@/store/useCRMStore";

type ContactStatus = NonNullable<Contact["status"]>;

const statusOptions: Array<{ value: ContactStatus | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "lead", label: "Leads" },
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

// Visão 360 = deal ligado + sinal + timeline, buscada sob demanda ao abrir o contato.
type LeadSignal = { views: number; waClicks: number; linkClicks: number; lastEvent: string; hot: boolean };
type DealLite = { id: number; company: string; stage: string; points?: number; origin?: string; siteUrl?: string };
type Activity = { type: string | null; description: string | null; created_at: string | null };
type Contact360 = { ok: boolean; deal: DealLite | null; activities: Activity[]; signal: LeadSignal | null };

const activityLabel: Record<string, string> = {
  signal_view: "Abriu a página",
  signal_whatsapp: "Clicou no WhatsApp",
  signal_click: "Clicou em link",
  whatsapp_sent: "Disparo enviado",
  quiz_lead: "Veio do quiz",
  note: "Nota",
};

function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ContactsPage() {
  const contacts = useCRMStore((state) => state.contacts);
  const setContacts = useCRMStore((state) => state.setContacts);
  const createContact = useCRMStore((state) => state.createContact);
  const deleteContact = useCRMStore((state) => state.deleteContact);
  const lastError = useCRMStore((state) => state.lastError);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ContactStatus | "all">("all");
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");
  const [openContact, setOpenContact] = useState<Contact | null>(null);
  const [detail, setDetail] = useState<Contact360 | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [newContact, setNewContact] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    status: "lead" as ContactStatus,
  });

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((contact) => {
      const matchesQuery =
        !q ||
        contact.name.toLowerCase().includes(q) ||
        contact.company?.toLowerCase().includes(q) ||
        contact.email?.toLowerCase().includes(q) ||
        contact.phone?.toLowerCase().includes(q);
      const matchesStatus = status === "all" || contact.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [contacts, query, status]);

  useEffect(() => {
    let cancelled = false;

    async function loadContacts() {
      try {
        const response = await fetch("/api/contacts");
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao carregar contatos");
        if (!cancelled) {
          setContacts(body.contacts);
          setDataStatus("ready");
        }
      } catch {
        if (!cancelled) setDataStatus("error");
      }
    }

    loadContacts();
    return () => {
      cancelled = true;
    };
  }, [setContacts]);

  async function handleCreateContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newContact.name.trim()) return;

    try {
      await createContact({
        name: newContact.name.trim(),
        company: newContact.company.trim(),
        email: newContact.email.trim(),
        phone: newContact.phone.trim(),
        status: newContact.status,
      });

      setNewContact({ name: "", company: "", email: "", phone: "", status: "lead" });
    } catch {
      // lastError ja e atualizado pelo store para exibir feedback visivel.
    }
  }

  async function openContact360(contact: Contact) {
    setOpenContact(contact);
    setDetail(null);
    setDetailStatus("loading");
    try {
      const res = await fetch(`/api/contact-360?contactId=${contact.id}`);
      const body = (await res.json()) as Contact360;
      if (!res.ok || !body.ok) throw new Error("Falha ao carregar a visão do contato");
      setDetail(body);
      setDetailStatus("ready");
    } catch {
      setDetailStatus("error");
    }
  }

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Contatos</h1>
          <div className="subtitle">
            Lista de contatos migrada para React mantendo a tabela operacional do legado, com filtros e criacao local.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Base ativa</div>
          <div className="value">{dataStatus === "loading" ? "..." : contacts.length}</div>
        </div>
      </div>

      {lastError ? <div className="portfolio-status warning">{lastError}</div> : null}
      {dataStatus === "error" ? (
        <div className="portfolio-status warning">Nao foi possivel carregar contatos do Supabase.</div>
      ) : null}

      <div className="filterbar">
        <input
          className="table-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar nome, empresa, email ou telefone"
          value={query}
        />
        <div className="filter-group">
          <select onChange={(event) => setStatus(event.target.value as ContactStatus | "all")} value={status}>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <form className="contacts-create card" onSubmit={handleCreateContact}>
        <div className="card-header">
          <div className="card-title">Novo contato</div>
          <span className="card-badge">Store</span>
        </div>
        <input
          className="settings-input"
          onChange={(event) => setNewContact((current) => ({ ...current, name: event.target.value }))}
          placeholder="Nome"
          value={newContact.name}
        />
        <input
          className="settings-input"
          onChange={(event) => setNewContact((current) => ({ ...current, company: event.target.value }))}
          placeholder="Empresa"
          value={newContact.company}
        />
        <input
          className="settings-input"
          onChange={(event) => setNewContact((current) => ({ ...current, email: event.target.value }))}
          placeholder="Email"
          value={newContact.email}
        />
        <input
          className="settings-input"
          onChange={(event) => setNewContact((current) => ({ ...current, phone: event.target.value }))}
          placeholder="Telefone"
          value={newContact.phone}
        />
        <select
          className="pref-select"
          onChange={(event) => setNewContact((current) => ({ ...current, status: event.target.value as ContactStatus }))}
          value={newContact.status}
        >
          <option value="lead">Lead</option>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </select>
        <button className="topbar-btn primary" type="submit">
          Criar
        </button>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Contato</th>
              <th>Empresa</th>
              <th>Email</th>
              <th>Telefone</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {filteredContacts.map((contact) => (
              <tr key={contact.id}>
                <td>
                  <button className="contact-cell" onClick={() => void openContact360(contact)} type="button" style={{ background: "none", border: 0, cursor: "pointer", textAlign: "left", padding: 0 }}>
                    <div className="contact-avatar">{initials(contact.name)}</div>
                    <div>
                      <div className="contact-name" style={{ textDecoration: "underline", textDecorationStyle: "dotted" }}>{contact.name}</div>
                      <div className="muted-copy">ID {contact.id} · ver 360</div>
                    </div>
                  </button>
                </td>
                <td>{contact.company || "Sem empresa"}</td>
                <td>{contact.email || "Sem email"}</td>
                <td className="font-mono">{contact.phone || "Sem telefone"}</td>
                <td>
                  <span className={`status-pill ${contact.status ?? "lead"}`}>{contact.status ?? "lead"}</span>
                </td>
                <td>
                  <button className="icon-text danger" onClick={() => void deleteContact(contact.id)} type="button">
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openContact ? (
        <div
          onClick={() => setOpenContact(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(10,12,20,0.55)", display: "flex", justifyContent: "flex-end", zIndex: 50 }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(460px, 92vw)", height: "100%", overflowY: "auto", background: "var(--surface, #fff)", boxShadow: "-8px 0 30px rgba(0,0,0,0.25)", padding: "22px 24px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
              <div>
                <h2 style={{ margin: "0 0 2px" }}>{openContact.name}</h2>
                <div className="muted-copy">{openContact.company || "Sem empresa"} · {openContact.phone || "sem telefone"}</div>
              </div>
              <button className="topbar-btn" onClick={() => setOpenContact(null)} type="button">Fechar</button>
            </div>

            {detailStatus === "loading" ? (
              <div className="connection-status fallback" style={{ marginTop: "18px" }}>Carregando deal, sinal e timeline...</div>
            ) : detailStatus === "error" ? (
              <div className="portfolio-status warning" style={{ marginTop: "18px" }}>Nao foi possivel carregar a visao 360.</div>
            ) : detail ? (
              <>
                <h3 style={{ marginTop: "22px", marginBottom: "8px" }}>Oportunidade</h3>
                {detail.deal ? (
                  <div className="card" style={{ padding: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                      <strong>{detail.deal.company}</strong>
                      <span className={`status-pill ${detail.deal.stage}`}>{detail.deal.stage}</span>
                    </div>
                    <div className="muted-copy" style={{ marginTop: "4px", fontSize: "12px" }}>
                      {detail.deal.points ?? 1} pts
                      {detail.deal.origin ? ` · origem ${detail.deal.origin}` : ""}
                    </div>
                    {detail.signal ? (
                      <div style={{ marginTop: "10px" }}>
                        <span className="status-pill" style={{ background: detail.signal.hot ? "#d32f2f" : "#455a64", color: "#fff" }}>
                          {detail.signal.hot ? "QUENTE" : "Sinal"}
                        </span>
                        <span className="muted-copy" style={{ marginLeft: "8px", fontSize: "12px" }}>
                          {detail.signal.views} abertura(s), {detail.signal.linkClicks} clique(s), {detail.signal.waClicks} no WhatsApp
                        </span>
                      </div>
                    ) : (
                      <div className="muted-copy" style={{ marginTop: "8px", fontSize: "12px" }}>Nenhum sinal de pagina ainda.</div>
                    )}
                  </div>
                ) : (
                  <div className="connection-status fallback">Este contato ainda nao tem deal ligado no pipeline.</div>
                )}

                <h3 style={{ marginTop: "22px", marginBottom: "8px" }}>Timeline</h3>
                {detail.activities.length === 0 ? (
                  <div className="muted-copy" style={{ fontSize: "13px" }}>Sem atividade registrada.</div>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
                    {detail.activities.map((a, i) => (
                      <li key={i} style={{ borderLeft: "2px solid var(--line, #e0dcec)", paddingLeft: "12px" }}>
                        <div style={{ fontSize: "13px", fontWeight: 600 }}>{activityLabel[a.type ?? "note"] ?? a.type}</div>
                        <div className="muted-copy" style={{ fontSize: "12px" }}>{a.description}</div>
                        <div className="muted-copy" style={{ fontSize: "11px" }}>{fmtDate(a.created_at)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
