export type AiAgentPersonaSnapshot = {
  id: string;
  name: string;
  alias: string;
  type: "agent" | "clone";
  version: string;
  specialty: string;
  sourceRoot: "crm" | "aios";
  sourcePath: string;
  sourceHash: string;
  promptVersion: string;
  syncedAt: string;
  identity: string;
  frameworks: string[];
  tone: string;
  limits: string[];
  suggestions: string[];
};
export const AI_AGENT_PERSONAS: readonly AiAgentPersonaSnapshot[];
