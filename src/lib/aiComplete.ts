// Completador de IA compartilhado: mesma cascata de provedores/free models usada em
// /api/ai, extraída para outras rotas (ex: busca em linguagem natural) reusarem sem
// duplicar a lógica de fallback.
//
// A implementação vive em aiProviders.mjs para que os CLIs (Story 032) usem exatamente
// a mesma cascata. Este arquivo continua sendo o ponto de import das rotas.

export type { AiCompleteOptions, AiResult } from "@/lib/aiProviders.mjs";
export { AI_PROVIDERS, aiComplete } from "@/lib/aiProviders.mjs";
