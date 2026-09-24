// Tipos do modulo ESM typedDecision.mjs.
import type { AiFailure, AiProviderAttempt, AiProviderPolicy } from "./aiProviders.mjs";

export type ChoiceQuestion = { type: "choice"; instructions: string; criteria: Record<string, string> };
export type ScoreQuestion = { type: "score"; instructions: string; criteria: readonly string[] };
export type BooleanQuestion = { type: "boolean"; instructions: string; criteria?: { true?: string; false?: string } };
export type DecisionQuestion = ChoiceQuestion | ScoreQuestion | BooleanQuestion;
export type DecisionQuestions = Record<string, DecisionQuestion>;

export type DecisionAnswer =
  | { type: "choice"; choice: string }
  | { type: "score"; level: number; label: string }
  | { type: "boolean"; value: boolean };

export type DecisionEvidence = { from: readonly string[]; instructions?: string };

export type DecideInput = {
  state: unknown;
  questions: DecisionQuestions;
  evidence?: DecisionEvidence;
  signal?: AbortSignal;
  timeoutMs?: number;
  perModelTimeoutMs?: number;
  perProviderTimeoutMs?: number;
  providerPolicy?: AiProviderPolicy;
};

export type DecideResult =
  | {
      ok: true;
      answers: Record<string, DecisionAnswer | null>;
      invalid: string[];
      evidencia: string;
      provider: string;
      model: string;
      decidedBy: "llm";
      attempts: AiProviderAttempt[];
    }
  | {
      ok: false;
      reason: "unavailable" | "invalid_json" | "evidence_mismatch";
      detail: string;
      failures: AiFailure[];
      attempts: AiProviderAttempt[];
    };

export function extrairJson(texto: string): unknown;
export function normalizarTexto(value: unknown): string;
export function evidenciaVemDoLead(evidencia: string, falasPermitidas: readonly string[]): boolean;
export function buildDecisionPrompt(questions: DecisionQuestions, evidence?: DecisionEvidence): string;
export function parseDecision(
  raw: unknown,
  questions: DecisionQuestions,
): { answers: Record<string, DecisionAnswer | null>; invalid: string[]; evidencia: string };
export function decide(input: DecideInput): Promise<DecideResult>;
