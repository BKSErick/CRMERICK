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
  priority_score: number;
  excluded: boolean;
}

export const RECOMMENDED_APPROACHES: string[];
export const HIGH_INTENT_QUERIES: Record<string, string[]>;
export function normalize(value: unknown): string;
export function classifySegment(lead: LeadInput): { key: string; channel: string; angle: string };
export function isExcluded(lead: LeadInput): boolean;
export function detectBuilderByUrl(website?: string): string | null;
export function opportunityType(lead: LeadInput): string;
export function liveSignals(lead: LeadInput): number;
export function scoreV1(lead: LeadInput): number;
export function diagnoseLead(lead: LeadInput): LeadDiagnosis;
export function dedupeLeads(leads: LeadInput[]): LeadInput[];
