// Tipos para o modulo CommonJS src/lib/leadScoring.js (usado pela rota server-side da fila).

export interface LeadInput {
  name?: string;
  website?: string;
  phone?: string;
  email?: string;
  rating?: number | string | null;
  reviews_count?: number | string | null;
  address?: string;
  instagram?: string;
  builder?: string | null;
  builder_source?: string | null;
  competitor_built?: boolean;
  competitor_provider?: string | null;
  competitor_link?: string | null;
  content_score?: number | null;
  content_signals?: Record<string, boolean> | null;
  replied?: boolean;
  interested?: boolean;
  /** JID confirmado pela Uazapi (contacts.whatsapp_jid). Melhor canal possivel. */
  whatsapp_jid?: string | null;
  /** WhatsApp publicado no site do proprio lead (coletado por leadEnrich). */
  site_whatsapp?: string | null;
  /** Mesmo dado vindo do banco (contacts.whatsapp_site). */
  whatsapp_site?: string | null;
  /** Telefones em tel: no site - candidatos a verificar, sem prova de WhatsApp. */
  site_phones?: string[];
  /** Cidade do lead. Alimenta a dimensao city do lookalike. */
  city?: string | null;
  uf?: string | null;
}

export type PhoneKind = "celular" | "fixo" | "invalido" | "nenhum";
export type PhoneSource = "confirmado" | "site" | "maps" | null;

export interface PhoneProfile {
  number: string | null;
  kind: PhoneKind;
  ddd: string | null;
  source: PhoneSource;
}

/** Celula de uma dimensao do perfil de conversao (data/winning-profile.json). */
export interface WinningCell {
  total: number;
  quentes: number;
  taxa: number;
  lift: number;
}

export interface WinningProfile {
  geradoEm: string;
  amostra: number;
  quentes: number;
  taxaGeral: number;
  priorPeso: number;
  minAmostra: number;
  dimensoes: Record<string, Record<string, WinningCell>>;
  buscarMais?: { segmentos: string[]; ddds: string[] };
}

export interface LeadDiagnosis {
  name: string;
  website: string;
  phone: string;
  email: string;
  rating: number | null;
  reviews_count: number;
  address: string;
  segment: string;
  angle: string;
  opportunity: string;
  builder: string | null;
  builder_source: string | null;
  competitor_built: boolean;
  competitor_provider: string | null;
  competitor_link: string | null;
  live_signals: number;
  consciousness: string;
  channel: string;
  recommended_approach: string;
  content_score: number | null;
  content_signals: Record<string, boolean> | null;
  needs_email_research: boolean;
  priority_score_v1: number;
  /** Score antes do lookalike. */
  priority_score_base: number;
  /** Ajuste por semelhanca com quem ja respondeu (limitado a +/-12). */
  lookalike_bonus: number;
  lookalike_reasons: string[];
  priority_score: number;
  excluded: boolean;
  phone_e164: string | null;
  phone_kind: PhoneKind;
  phone_source: PhoneSource;
}

export const RECOMMENDED_APPROACHES: string[];
export const HIGH_INTENT_QUERIES: Record<string, string[]>;
export function normalize(value: unknown): string;
export function classifySegment(lead: LeadInput): { key: string; channel: string; angle: string };
export function isExcluded(lead: LeadInput): boolean;
export function detectBuilderByUrl(website?: string): string | null;
export function opportunityType(lead: LeadInput): string;
export function liveSignals(lead: LeadInput): number;
export function classifyPhone(value: unknown): { number: string | null; kind: PhoneKind; ddd: string | null };
export function phoneProfile(lead: LeadInput): PhoneProfile;
export function phoneScore(p: PhoneProfile): number;
export function scoreV1(lead: LeadInput): number;
export function diagnoseLead(lead: LeadInput, profile?: WinningProfile | null): LeadDiagnosis;
export function dedupeLeads(leads: LeadInput[]): LeadInput[];
