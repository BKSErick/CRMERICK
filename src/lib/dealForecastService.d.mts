import type { ForecastSummary } from "./dealForecast.mjs";

export const DEAL_FORECAST_SELECT: string;
export function calculateForecastFromSupabase(
  supabase: unknown,
  options?: { dealId?: number | null; stage?: string | null; from?: string; to?: string; now?: string | Date },
): Promise<ForecastSummary>;
