export type QualificationFieldKey =
  | "problem"
  | "impact"
  | "stakeholders"
  | "urgency"
  | "investmentCapacity"
  | "desiredSolution"
  | "recommendedOffer";

export type QualificationFieldStatus = "not_informed" | "suggested" | "confirmed";
export type QualificationEvidence = { text: string; origin: string };
export type QualificationField = {
  status: QualificationFieldStatus;
  value: string | null;
  source: "ai" | "operator" | null;
  evidence: QualificationEvidence | null;
  updatedAt: string | null;
  updatedBy: string | null;
};
export type DealQualification = {
  version: number;
  fields: Record<QualificationFieldKey, QualificationField>;
};
export type QualificationSummary = {
  totalFields: number;
  confirmedCount: number;
  suggestedCount: number;
  completeness: number;
  pendingFields: Array<{ key: QualificationFieldKey; label: string; status: QualificationFieldStatus }>;
};

export const DEAL_QUALIFICATION_VERSION: number;
export const QUALIFICATION_FIELD_DEFINITIONS: readonly { key: QualificationFieldKey; label: string }[];
export const QUALIFICATION_REVIEW_STAGES: readonly string[];
export function normalizeDealQualification(raw: unknown): DealQualification;
export function summarizeDealQualification(raw: unknown): QualificationSummary;
export function applyQualificationMutation(
  raw: unknown,
  mutation: Record<string, unknown>,
  context: { actor: string; at: string },
): DealQualification;
export function parseQualificationSuggestions(content: string): Partial<Record<QualificationFieldKey, { value: string; evidence: QualificationEvidence }>>;
