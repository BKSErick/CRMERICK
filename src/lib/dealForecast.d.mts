export type ForecastEvidence = { key: string; label: string; impact: number; evidence: string };
export type DealForecast = {
  rubricVersion: number;
  probabilitySource: string;
  dealId: number;
  company: string;
  stage: string;
  recurring: boolean;
  manualProbability: number | null;
  grossValue: number;
  closeDate: string | null;
  period: { from: string; to: string };
  lossReason: { code: string; label: string; note: string | null; recordedAt: string | null; recordedBy: string | null } | null;
  forecastStatus: "forecast" | "realized" | "excluded";
  baseProbability: number;
  calculatedProbability: number;
  confidence: number;
  weightedValue: number;
  predictedValue: number;
  realizedValue: number;
  includedInPeriod: boolean;
  isAtRisk: boolean;
  withoutNextAction: boolean;
  factors: ForecastEvidence[];
  risks: ForecastEvidence[];
  warnings: string[];
};

export type ForecastSummary = {
  rubricVersion: number;
  probabilitySource: string;
  period: { from: string; to: string };
  pipeline: { gross: number; weighted: number; weightedRate: number };
  predicted: { total: number; mrr: number; oneOff: number; periodCoverageRate: number };
  realized: { total: number; mrr: number; oneOff: number };
  attention: { revenueAtRisk: number; revenueWithoutNextAction: number };
  counts: { active: number; predictedInPeriod: number; realizedInPeriod: number; excludedLost: number; missingValue: number; missingCloseDate: number };
  relevantDeals: Array<Pick<DealForecast, "dealId" | "company" | "stage" | "closeDate" | "recurring" | "calculatedProbability" | "manualProbability" | "confidence" | "predictedValue" | "isAtRisk" | "withoutNextAction">>;
  deals: DealForecast[];
};

export const DEAL_FORECAST_RUBRIC: {
  version: number;
  metric: string;
  aggregateProbabilitySource: string;
  activeProbabilityBounds: readonly number[];
  stageBase: Readonly<Record<string, number>>;
  adjustments: Readonly<Record<string, number>>;
  confidenceWeights: Readonly<Record<string, number>>;
};

export function calculateDealForecast(input?: { deal?: Record<string, unknown>; meetings?: Array<Record<string, unknown>>; now?: string | Date; period?: { from?: string; to?: string } }): DealForecast;
export function calculateForecast(input?: { deals?: Array<Record<string, unknown>>; meetings?: Array<Record<string, unknown>>; now?: string | Date; period?: { from?: string; to?: string } }): ForecastSummary;
