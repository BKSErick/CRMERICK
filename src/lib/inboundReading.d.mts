// Tipos do modulo ESM inboundReading.mjs.
import type { DecideInput, DecideResult } from "./typedDecision.mjs";

export type InboundIntent = "sinal_forte" | "sinal_fraco" | "pergunta" | "objecao" | "encaminhamento" | "recusa" | "automatica" | "outro";
export type InboundObjection = "nenhuma" | "preco" | "ja_tem_fornecedor" | "sem_urgencia" | "decisor_ausente" | "sem_interesse" | "fora_icp" | "outro";

export type InboundReading = {
  intent: InboundIntent;
  objection: InboundObjection;
  /** Chave do sales-playbook.json (msg2, msg2Ponte, msg2Preco, postResponse.cartas.*) ou "nenhuma". */
  card: string;
  evidence: string;
  decidedBy: "regra" | "llm";
  provider?: string;
  model?: string;
};

export type InboundHistoryItem = { direction: string | null; content: string | null };

export const COLD_STAGES: readonly string[];
export const INBOUND_INTENTS: Readonly<Record<InboundIntent, string>>;
export const INBOUND_OBJECTIONS: Readonly<Record<InboundObjection, string>>;

export function foldText(value: unknown): string;
export function cardCriteria(playbook?: unknown): Record<string, string>;
export function cardLabel(card: string | null | undefined): string;
export function intentLabel(intent: string | null | undefined): string;
export function readInboundByRules(input: { text: string; responseType?: string | null; stage?: string | null; playbook?: unknown }): InboundReading | null;
export function readInboundMessage(input: {
  company?: string | null;
  /** Etapa do deal. Fora de COLD_STAGES a carta e sempre "nenhuma" (resposta na mao). */
  stage?: string | null;
  history: readonly InboundHistoryItem[];
  responseType?: string | null;
  playbook?: unknown;
  decideFn?: (input: DecideInput) => Promise<DecideResult>;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<({ ok: true } & InboundReading) | { ok: false; detail: string }>;
export function renderReadingLine(reading: Pick<InboundReading, "intent" | "objection" | "card" | "evidence">): string;
