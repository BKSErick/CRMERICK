export type DealHealthClassification =
  | "excelente"
  | "saudavel"
  | "atencao"
  | "em_risco"
  | "critico"
  | "ganho"
  | "perdido";

export type DealHealthEvidence = {
  key: string;
  label: string;
  impact: number;
  evidence: string;
};

export type DealHealthInput = {
  now?: string | Date;
  deal: {
    id?: number;
    stage?: string | null;
    stageEnteredAt?: string | null;
    lastInboundAt?: string | null;
    lastOutboundAt?: string | null;
    responseType?: string | null;
    responseTypeSource?: string | null;
    referredPhone?: string | null;
    nextActionAt?: string | null;
    nextActionNote?: string | null;
    nextActionSource?: string | null;
    closeDate?: string | null;
  };
  meetings?: Array<{ status?: string | null; startsAt?: string | null; heldAt?: string | null }>;
};

export type DealHealthResult = {
  rubricVersion: number;
  metric: "deal_health";
  dealHealthScore: number;
  classification: DealHealthClassification;
  confidence: number;
  factors: DealHealthEvidence[];
  risks: DealHealthEvidence[];
  warnings: string[];
  recommendedNextAction: string;
  computedAt: string;
};

export const DEAL_HEALTH_RUBRIC: {
  readonly version: number;
  readonly metric: "deal_health";
  readonly baseScore: number;
  readonly riskMaxScore: number;
  readonly stageImpact: Readonly<Record<string, number>>;
  readonly factors: readonly { key: string; impact: number; description: string }[];
  readonly bands: readonly { min: number; classification: string }[];
};

export const DEAL_HEALTH_RISK_MAX_SCORE: number;

export function calculateDealHealth(input: DealHealthInput): DealHealthResult;
