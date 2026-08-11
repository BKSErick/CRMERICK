import type { DealQualification, QualificationSummary } from "./dealQualification.mjs";

export type QualificationUpdateResult = {
  dealId: number;
  qualification: DealQualification;
  summary: QualificationSummary;
  changedFields: string[];
  persisted: boolean;
};

export function updateDealQualification(
  supabase: unknown,
  dealId: number,
  mutation: Record<string, unknown>,
  options?: {
    actor?: string;
    at?: string;
    source?: string;
    dispatchEvent?: (supabase: unknown, event: Record<string, unknown>, options: { apply: true }) => Promise<unknown>;
  },
): Promise<QualificationUpdateResult>;
