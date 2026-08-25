// Completador de IA compartilhado: mesma cascata de provedores usada em /api/ai, extraída
// para outras rotas (ex: busca em linguagem natural) reusarem sem duplicar a lógica de
// fallback.
//
// A implementação vive em aiProviders.mjs para que os CLIs (Story 032) usem exatamente
// a mesma cascata. Este arquivo continua sendo o ponto de import das rotas.
//
// A lista de modelos vem do catálogo vivo (aiModelCatalog.mjs): nenhum nome de modelo é
// fixo no código. Use `aiCompleteDetailed` + `describeFailures` quando a rota precisar
// explicar ao usuário POR QUE a IA não respondeu.

export type { AiCompleteOptions, AiFailure, AiFailureReason, AiResult } from "@/lib/aiProviders.mjs";
export { AI_PROVIDERS, aiComplete, aiCompleteDetailed, classifyProviderFailure, describeFailures } from "@/lib/aiProviders.mjs";
