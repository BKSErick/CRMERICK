"use client";

import { create } from "zustand";

export type DealStage = "prospect" | "qualified" | "proposal" | "negotiation" | "won" | "lost";

export type Deal = {
  id: number;
  name?: string;
  company: string;
  title?: string;
  stage: DealStage;
  value: number;
  prob?: number;
  probability?: number;
  owner?: string;
  ownerName?: string;
  close?: string;
  tag?: string;
  tagType?: "feature" | "bug" | "design" | "chore" | "research" | string;
  ticketId?: string;
  points?: number;
  progress?: number;
  assignee?: string;
  phone?: string;
  whatsapp?: string;
  copyText?: string;
  analysisUrl?: string;
  siteUrl?: string;
  segment?: string;
  updated_at?: string;
};

export type Contact = {
  id: number;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  status?: "lead" | "active" | "inactive";
};

type CRMState = {
  deals: Deal[];
  contacts: Contact[];
  setDeals: (deals: Deal[]) => void;
  setContacts: (contacts: Contact[]) => void;
  createDeal: (deal: Omit<Deal, "id">) => Deal;
  updateDeal: (dealId: number, updates: Partial<Deal>) => void;
  deleteDeal: (dealId: number) => void;
  updateDealStage: (dealId: number, stage: DealStage) => Promise<void>;
  createContact: (contact: Omit<Contact, "id">) => Contact;
  updateContact: (contactId: number, updates: Partial<Contact>) => void;
  deleteContact: (contactId: number) => void;
};

const initialDeals: Deal[] = [
  {
    id: 1,
    name: "Projeto Conteudo Integrado",
    company: "Projeto Conteudo Integrado",
    title: "Plano de conteudo integrado",
    stage: "negotiation",
    value: 18500,
    probability: 80,
    prob: 80,
    owner: "Erick",
    ownerName: "Erick",
    tag: "Outbound",
    tagType: "research",
    ticketId: "TEMP-001",
    points: 5,
    progress: 0,
    assignee: "JM",
    phone: "5511999991001",
    copyText: "Oi, vi que a proposta de conteudo integrado ficou pendente. Posso te mandar um resumo com o proximo passo?",
  },
  {
    id: 2,
    name: "Mentoria Instagram",
    company: "Mentoria Instagram",
    title: "Mentoria de posicionamento",
    stage: "proposal",
    value: 4500,
    probability: 60,
    prob: 60,
    owner: "Erick",
    ownerName: "Erick",
    tag: "Outbound",
    tagType: "feature",
    ticketId: "TEMP-002",
    points: 3,
    progress: 0,
    assignee: "CS",
    phone: "5521988882002",
    copyText: "Oi! Separei a proposta da mentoria com foco no seu Instagram. Quer que eu te envie por aqui?",
  },
  {
    id: 3,
    name: "Cliente ABC",
    company: "Cliente ABC",
    title: "Retainer mensal",
    stage: "won",
    value: 9800,
    probability: 100,
    prob: 100,
    owner: "Erick",
    ownerName: "Erick",
    tag: "Cliente",
    tagType: "chore",
    ticketId: "TEMP-003",
    points: 1,
    progress: 100,
    assignee: "PA",
    updated_at: new Date().toISOString(),
  },
  {
    id: 4,
    name: "Diagnostico Comercial",
    company: "Diagnostico Comercial",
    title: "Diagnostico de funil",
    stage: "qualified",
    value: 3200,
    probability: 35,
    prob: 35,
    owner: "Erick",
    ownerName: "Erick",
    tag: "Outbound",
    tagType: "bug",
    ticketId: "TEMP-004",
    points: 2,
    progress: 40,
    assignee: "AL",
    phone: "5531977773003",
  },
];

const initialContacts: Contact[] = [
  {
    id: 1,
    name: "Maria C.",
    company: "Projeto Conteudo Integrado",
    email: "maria@conteudo.com",
    phone: "5511999991001",
    status: "lead",
  },
  {
    id: 2,
    name: "Cliente ABC",
    company: "Cliente ABC",
    email: "contato@clienteabc.com",
    phone: "5511911112222",
    status: "active",
  },
  {
    id: 3,
    name: "Lead DM",
    company: "Mentoria Instagram",
    email: "lead@instagram.com",
    phone: "5521988882002",
    status: "lead",
  },
];

export const useCRMStore = create<CRMState>((set) => ({
  deals: initialDeals,
  contacts: initialContacts,
  setDeals: (deals) => set({ deals }),
  setContacts: (contacts) => set({ contacts }),
  createDeal: (deal) => {
    const newDeal = { ...deal, id: Date.now(), updated_at: new Date().toISOString() };
    set((state) => ({ deals: [newDeal, ...state.deals] }));
    return newDeal;
  },
  updateDeal: (dealId, updates) => {
    set((state) => ({
      deals: state.deals.map((deal) =>
        deal.id === dealId ? { ...deal, ...updates, updated_at: new Date().toISOString() } : deal,
      ),
    }));
  },
  deleteDeal: (dealId) => {
    set((state) => ({ deals: state.deals.filter((deal) => deal.id !== dealId) }));
  },
  updateDealStage: async (dealId, stage) => {
    set((state) => ({
      deals: state.deals.map((deal) =>
        deal.id === dealId ? { ...deal, stage, updated_at: new Date().toISOString() } : deal,
      ),
    }));
  },
  createContact: (contact) => {
    const newContact = { ...contact, id: Date.now() };
    set((state) => ({ contacts: [newContact, ...state.contacts] }));
    return newContact;
  },
  updateContact: (contactId, updates) => {
    set((state) => ({
      contacts: state.contacts.map((contact) => (contact.id === contactId ? { ...contact, ...updates } : contact)),
    }));
  },
  deleteContact: (contactId) => {
    set((state) => ({ contacts: state.contacts.filter((contact) => contact.id !== contactId) }));
  },
}));
