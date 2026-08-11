import type { DealHealthInput, DealHealthResult } from "./dealHealth.mjs";

export function buildDealHealthInput(input: {
  deal: Record<string, unknown>;
  messages?: Array<Record<string, unknown>>;
  meetings?: Array<Record<string, unknown>>;
  now?: string | Date;
}): DealHealthInput;

export function dealHealthFingerprint(input: DealHealthInput, health: DealHealthResult): string;

export function recalculateDealHealth(
  supabase: unknown,
  dealId: number,
  options?: { apply?: boolean; now?: string },
): Promise<{
  dealId: number;
  health: DealHealthResult;
  fingerprint: string;
  changed: boolean;
  persisted: boolean;
}>;

export function recalculateDealHealthBestEffort(
  supabase: unknown,
  dealId: number,
  options?: { apply?: boolean; now?: string },
): Promise<Record<string, unknown>>;
