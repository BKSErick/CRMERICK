// Tipos do modulo ESM aiModelCatalog.mjs.
export const MAX_MODELS_PER_PROVIDER: number;
export const MODEL_PREFERENCES: Record<string, readonly string[]>;

/** Modelo como o catalogo do provedor descreve: os sinais usados pra ranquear. */
export type CatalogModel = {
  id: string;
  name?: string;
  contextLength: number;
  tierEstavel: boolean;
  pricing?: { prompt: number; completion: number };
  modalities?: { input: string[]; output: string[] };
};

export function rankModels(providerName: string, modelos: ReadonlyArray<CatalogModel | string>): string[];
export function discoverFreeModels(providerName: string, key?: string): Promise<CatalogModel[]>;
export function getFreeModelCatalog(providerName?: string, key?: string): Promise<{
  provider: string;
  models: CatalogModel[];
  discoveredAt: string;
}>;
export function isStructurallyFreeOpenRouterId(modelId: string): boolean;
export function validateFreeOpenRouterModel(modelId: string, key?: string): Promise<CatalogModel>;
export function markParamUnsupported(providerName: string, modelId: string, param: string): void;
export function getUnsupportedParams(providerName: string, modelId: string): Set<string>;
export function getProviderModels(providerName: string, key?: string): Promise<string[]>;
export function markModelDead(providerName: string, modelId: string): void;
export function getDeadModels(providerName: string): string[];
export function resetCatalogCache(): void;

declare const aiModelCatalog: {
  MAX_MODELS_PER_PROVIDER: typeof MAX_MODELS_PER_PROVIDER;
  MODEL_PREFERENCES: typeof MODEL_PREFERENCES;
  discoverFreeModels: typeof discoverFreeModels;
  getFreeModelCatalog: typeof getFreeModelCatalog;
  getDeadModels: typeof getDeadModels;
  getProviderModels: typeof getProviderModels;
  markModelDead: typeof markModelDead;
  rankModels: typeof rankModels;
  resetCatalogCache: typeof resetCatalogCache;
  validateFreeOpenRouterModel: typeof validateFreeOpenRouterModel;
};
export default aiModelCatalog;
