// Tipos do servico ESM commercialAutomationService.mjs.
import type { CommercialDecision, CommercialEvent, CommercialRule } from "./commercialAutomation.mjs";

export function listCommercialAutomationRules(supabase: unknown): Promise<CommercialRule[]>;
export function processCommercialEvent(
  supabase: unknown,
  input: Omit<Partial<CommercialEvent>, "type"> & { id: string; type: string },
  options?: { apply?: boolean },
): Promise<{ event: CommercialEvent; mode: "dry-run" | "apply"; duplicate: boolean; decisions: CommercialDecision[] }>;
export function processCommercialEventBestEffort(
  supabase: unknown,
  input: Omit<Partial<CommercialEvent>, "type"> & { id: string; type: string },
  options?: { apply?: boolean },
): Promise<
  | { event: CommercialEvent; mode: "dry-run" | "apply"; duplicate: boolean; decisions: CommercialDecision[] }
  | { event: null; mode: "dry-run" | "apply"; duplicate: false; decisions: []; failed: true; error: string }
>;
export function scanDueCommercialEvents(
  supabase: unknown,
  options?: { apply?: boolean; now?: string },
): Promise<Array<{ event: CommercialEvent; mode: "dry-run" | "apply"; duplicate: boolean; decisions: CommercialDecision[] }>>;
