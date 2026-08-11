import type { LossAnalysis, LossHistoryRecord, LossReasonInput } from "./dealLossReasons.mjs";
export function transitionDealStage(supabase: unknown, dealId: number, targetStage: string, lossReason: LossReasonInput | null, context: { actor: string; source?: string }): Promise<Record<string, unknown>>;
export function correctDealLossReason(supabase: unknown, dealId: number, lossReason: LossReasonInput, context: { actor: string; source?: string }): Promise<Record<string, unknown>>;
export function listDealLossHistory(supabase: unknown, dealId: number): Promise<LossHistoryRecord[]>;
export function loadLossAnalysis(supabase: unknown, options?: { from?: string; to?: string; now?: string | Date }): Promise<LossAnalysis>;
