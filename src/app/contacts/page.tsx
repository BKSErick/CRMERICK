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

export default function ContactsPage() {
  const contacts = useCRMStore((state) => state.contacts);
  const setContacts = useCRMStore((state) => state.setContacts);
  const createContact = useCRMStore((state) => state.createContact);
  const deleteContact = useCRMStore((state) => state.deleteContact);
  const lastError = useCRMStore((state) => state.lastError);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ContactStatus | "all">("all");
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");
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
                  <div className="contact-cell">
                    <div className="contact-avatar">{initials(contact.name)}</div>
                    <div>
                      <div className="contact-name">{contact.name}</div>
                      <div className="muted-copy">ID {contact.id}</div>
                    </div>
                  </div>
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
    </section>
  );
}
