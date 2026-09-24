export type CapacityTier = "governante" | "estruturado" | "micro" | "incerto";
export type DecisionAccess = "decisor" | "indicado" | "gatekeeper" | "bot" | "incerto";
export type OfferTrack = "projeto" | "entrada" | "nenhuma";

export interface ProspectingEligibilityInput {
  id?: number;
  company?: string | null;
  name?: string | null;
  segment?: string | null;
  segment_norm?: string | null;
  is_icp?: boolean | null;
  porte?: string | null;
  capital_social?: number | string | null;
  cnae_descricao?: string | null;
  site_url?: string | null;
  decisor_nome?: string | null;
  decision_access?: DecisionAccess | null;
  points?: number | null;
}

export interface ProspectingPriorityInput {
  id?: number;
  points?: number | null;
  signalWeight?: number | null;
  confianca?: number | null;
  capacity_tier?: CapacityTier | null;
  prospectingEligibility?: Pick<ProspectingEligibilityResult, "capacity_tier"> | null;
}

export interface ProspectingEligibilityResult {
  eligible: boolean;
  capacity_tier: CapacityTier;
  capacity_evidence: string[];
  decision_access: DecisionAccess;
  offer_track: OfferTrack;
  eligibility_reason: string;
}

export function avaliarElegibilidadeProspeccao(
  lead: ProspectingEligibilityInput,
): ProspectingEligibilityResult;

export function compararPrioridadeProspeccao(
  a: ProspectingPriorityInput,
  b: ProspectingPriorityInput,
): number;

declare const api: {
  avaliarElegibilidadeProspeccao: typeof avaliarElegibilidadeProspeccao;
  compararPrioridadeProspeccao: typeof compararPrioridadeProspeccao;
};
export default api;
