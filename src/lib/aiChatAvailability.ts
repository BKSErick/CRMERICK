// Fonte unica sobre "o chat de agentes esta disponivel neste ambiente?".
//
// Antes existiam DUAS respostas em desacordo: a pagina exigia AI_AGENTS_CHAT_ENABLED==="true"
// lida em build-time (congelava no build, entao setar a env na Vercel nao mudava nada) e a rota
// exigia o mesmo valor em request-time. Resultado em producao: a env nunca foi criada e a tela
// ficou meses mostrando "chat desabilitado" sem ninguem entender por que.
//
// Agora a regra e por CAPACIDADE, nao por cerimonia: se existe chave de IA, o chat liga. A env
// vira apenas um interruptor de emergencia (AI_AGENTS_CHAT_ENABLED=false desliga).

export type AgentChatAvailability = { enabled: boolean; reason: string | null };

export function getAgentChatAvailability(): AgentChatAvailability {
  if (process.env.AI_AGENTS_CHAT_ENABLED === "false") {
    return { enabled: false, reason: "O chat de agentes foi desligado neste ambiente (AI_AGENTS_CHAT_ENABLED=false)." };
  }

  const temChave = Boolean(process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY);
  if (!temChave) {
    return {
      enabled: false,
      reason: "Nenhuma chave de IA configurada neste ambiente. Defina GROQ_API_KEY ou OPENROUTER_API_KEY e refaca o deploy.",
    };
  }

  return { enabled: true, reason: null };
}
