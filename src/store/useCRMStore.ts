"use client";

import { create } from "zustand";
import type { Contact, Deal, DealStage } from "@/lib/crmRecords";

export type { Contact, Deal, DealStage };

type CRMState = {
  deals: Deal[];
  contacts: Contact[];
  lastError: string | null;
  setDeals: (deals: Deal[]) => void;
  setContacts: (contacts: Contact[]) => void;
  clearError: () => void;
  createDeal: (deal: Omit<Deal, "id">) => Promise<Deal>;
  updateDeal: (dealId: number, updates: Partial<Deal>) => Promise<void>;
  deleteDeal: (dealId: number) => Promise<void>;
  updateDealStage: (dealId: number, stage: DealStage) => Promise<void>;
  createContact: (contact: Omit<Contact, "id">) => Promise<Contact>;
  updateContact: (contactId: number, updates: Partial<Contact>) => Promise<void>;
  deleteContact: (contactId: number) => Promise<void>;
};

async function readApi<T>(response: Response, fallbackMessage: string): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    throw new Error(body?.error ?? fallbackMessage);
  }
  return body as T;
}

function setFailure(set: (partial: Partial<CRMState>) => void, error: unknown) {
  set({ lastError: error instanceof Error ? error.message : "Falha ao salvar no CRM." });
}

export const useCRMStore = create<CRMState>((set, get) => ({
  deals: [],
  contacts: [],
  lastError: null,
  setDeals: (deals) => set({ deals, lastError: null }),
  setContacts: (contacts) => set({ contacts, lastError: null }),
  clearError: () => set({ lastError: null }),
  createDeal: async (deal) => {
    const tempDeal = { ...deal, id: -Date.now(), updated_at: new Date().toISOString() };
    const previousDeals = get().deals;
    set({ deals: [tempDeal, ...previousDeals], lastError: null });

    try {
      const body = await readApi<{ deal: Deal }>(
        await fetch("/api/deals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(deal),
        }),
        "Nao foi possivel criar o deal.",
      );
      set((state) => ({
        deals: state.deals.map((item) => (item.id === tempDeal.id ? body.deal : item)),
      }));
      return body.deal;
    } catch (error) {
      set({ deals: previousDeals });
      setFailure(set, error);
      throw error;
    }
  },
  updateDeal: async (dealId, updates) => {
    const previousDeals = get().deals;
    const updatedAt = new Date().toISOString();
    set((state) => ({
      deals: state.deals.map((deal) =>
        deal.id === dealId ? { ...deal, ...updates, updated_at: updatedAt } : deal,
      ),
      lastError: null,
    }));

    try {
      const body = await readApi<{ deal: Deal }>(
        await fetch("/api/deals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: dealId, ...updates }),
        }),
        "Nao foi possivel atualizar o deal.",
      );
      set((state) => ({
        deals: state.deals.map((deal) => (deal.id === dealId ? body.deal : deal)),
      }));
    } catch (error) {
      set({ deals: previousDeals });
      setFailure(set, error);
      throw error;
    }
  },
  deleteDeal: async (dealId) => {
    const previousDeals = get().deals;
    set((state) => ({ deals: state.deals.filter((deal) => deal.id !== dealId), lastError: null }));

    try {
      await readApi(
        await fetch(`/api/deals?id=${encodeURIComponent(dealId)}`, { method: "DELETE" }),
        "Nao foi possivel excluir o deal.",
      );
    } catch (error) {
      set({ deals: previousDeals });
      setFailure(set, error);
      throw error;
    }
  },
  updateDealStage: async (dealId, stage) => {
    await get().updateDeal(dealId, { stage });
  },
  createContact: async (contact) => {
    const tempContact = { ...contact, id: -Date.now() };
    const previousContacts = get().contacts;
    set({ contacts: [tempContact, ...previousContacts], lastError: null });

    try {
      const body = await readApi<{ contact: Contact }>(
        await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(contact),
        }),
        "Nao foi possivel criar o contato.",
      );
      set((state) => ({
        contacts: state.contacts.map((item) => (item.id === tempContact.id ? body.contact : item)),
      }));
      return body.contact;
    } catch (error) {
      set({ contacts: previousContacts });
      setFailure(set, error);
      throw error;
    }
  },
  updateContact: async (contactId, updates) => {
    const previousContacts = get().contacts;
    set((state) => ({
      contacts: state.contacts.map((contact) => (contact.id === contactId ? { ...contact, ...updates } : contact)),
      lastError: null,
    }));

    try {
      const body = await readApi<{ contact: Contact }>(
        await fetch("/api/contacts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: contactId, ...updates }),
        }),
        "Nao foi possivel atualizar o contato.",
      );
      set((state) => ({
        contacts: state.contacts.map((contact) => (contact.id === contactId ? body.contact : contact)),
      }));
    } catch (error) {
      set({ contacts: previousContacts });
      setFailure(set, error);
      throw error;
    }
  },
  deleteContact: async (contactId) => {
    const previousContacts = get().contacts;
    set((state) => ({ contacts: state.contacts.filter((contact) => contact.id !== contactId), lastError: null }));

    try {
      await readApi(
        await fetch(`/api/contacts?id=${encodeURIComponent(contactId)}`, { method: "DELETE" }),
        "Nao foi possivel excluir o contato.",
      );
    } catch (error) {
      set({ contacts: previousContacts });
      setFailure(set, error);
      throw error;
    }
  },
}));
