import { AI_AGENT_PUBLIC_SNAPSHOTS } from "./aiAgentRegistry.generated.ts";

export type AiAgentId = "crm-copilot" | "copy-chief" | "willian-celso" | "thiago-finch" | "alex-hormozi" | "webson-vendedor" | "data-chief";
export type AiAgentPublic = {
  id: AiAgentId; name: string; alias: string; type: "agent" | "clone";
  version: string; specialty: string; sourcePath: string; sourceHash: string;
  disclosure: string; suggestions: string[];
};

export const AI_AGENT_PUBLIC_REGISTRY = AI_AGENT_PUBLIC_SNAPSHOTS as readonly AiAgentPublic[];

export function agentById(value: unknown) {
  return AI_AGENT_PUBLIC_REGISTRY.find((agent) => agent.id === value) ?? null;
}

export function agentByAlias(value: unknown) {
  const alias = String(value ?? "").trim().toLowerCase();
  return AI_AGENT_PUBLIC_REGISTRY.find((agent) => agent.alias === alias) ?? null;
}
