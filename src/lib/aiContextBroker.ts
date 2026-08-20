import { calculateForecastFromSupabase } from "./dealForecastService.mjs";
import { loadLossAnalysis } from "./dealLossService.mjs";
import { redactSensitiveText } from "./salesCopilot.mjs";
import type { AiContextEnvelope, AiContextScope } from "./aiConversation.ts";
import type { getCrmSupabaseAdmin } from "./crmSupabase";

type SupabaseAdmin = ReturnType<typeof getCrmSupabaseAdmin>;
type Provider = (supabase: SupabaseAdmin, scope: AiContextScope) => Promise<AiContextEnvelope>;

function safeText(value: unknown, max = 600) {
  return redactSensitiveText(String(value ?? "")).slice(0, max);
}

function envelope(sourceId: string, label: string, scope: AiContextScope, facts: unknown[], limitations: string[] = [], links: Array<{ label: string; href: string }> = []): AiContextEnvelope {
  return { sourceId, label, asOf: new Date().toISOString(), scope: scope.type, facts, limitations, links };
}

export function minimizeForecastForAi(value: unknown) {
  const forecast = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const { deals, relevantDeals, ...aggregates } = forecast;
  return {
    ...aggregates,
    relevantDeals: Array.isArray(relevantDeals) ? relevantDeals.slice(0, 25) : [],
    dealsOmitted: Array.isArray(deals) ? deals.length : 0,
  };
}

export function minimizeLossesForAi(value: unknown) {
  const losses = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const { legacyWithoutReason, ...aggregates } = losses;
  return {
    ...aggregates,
    legacyWithoutReasonCount: Array.isArray(legacyWithoutReason) ? legacyWithoutReason.length : 0,
  };
}

const pipelineProvider: Provider = async (supabase, scope) => {
  const rows: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await supabase.from("deals").select("id, company, name, stage, status, value, close_date, next_action_at, deal_health_score").order("id", { ascending: true }).range(offset, offset + 999);
    if (result.error) throw result.error;
    const page = (result.data ?? []) as Array<Record<string, unknown>>;
    rows.push(...page);
    if (page.length < 1000) break;
  }
  const stages = rows.reduce<Record<string, { count: number; value: number }>>((acc, row) => {
    const key = String(row.stage ?? "sem_etapa");
    acc[key] ??= { count: 0, value: 0 };
    acc[key].count += 1;
    acc[key].value += Number(row.value) || 0;
    return acc;
  }, {});
  return envelope("crm.pipeline", "Pipeline do CRM", scope, [{ total: rows.length, stages }], [], [{ label: "Abrir pipeline", href: "/pipeline" }]);
};

const forecastProvider: Provider = async (supabase, scope) => {
  const forecast = await calculateForecastFromSupabase(supabase, scope.type === "deal" ? { dealId: scope.dealId } : {});
  return envelope("crm.forecast", "Forecast deterministico", scope, [minimizeForecastForAi(forecast)], ["A lista detalhada de deals foi omitida; apenas agregados e contagens entram no prompt."], [{ label: "Abrir funil", href: "/funil" }]);
};

const lossesProvider: Provider = async (supabase, scope) => {
  const losses = await loadLossAnalysis(supabase);
  return envelope("crm.losses", "Analise deterministica de perdas", scope, [minimizeLossesForAi(losses)], ["Registros legados individuais foram substituidos por contagem agregada."], [{ label: "Abrir funil", href: "/funil" }]);
};

const dealProvider: Provider = async (supabase, scope) => {
  if (scope.type !== "deal" || !scope.dealId) throw new Error("Deal nao selecionado.");
  const id = scope.dealId;
  const [deal, activities, messages, demands] = await Promise.all([
    supabase.from("deals").select("id, company, name, stage, status, value, owner, assignee, close_date, next_action_at, next_action_type, next_action_note, deal_health_score, deal_health_classification, qualification").eq("id", id).maybeSingle(),
    supabase.from("activities").select("id, type, description, created_at").eq("deal_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("messages").select("id, channel, content, direction, status, occurred_at, created_at").eq("deal_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("client_demands").select("id, title, description, copy_text, status, priority, destination_type, destination_label, due_at, updated_at").eq("deal_id", id).order("updated_at", { ascending: false }).limit(30),
  ]);
  for (const result of [deal, activities, messages, demands]) if (result.error) throw result.error;
  if (!deal.data) throw new Error("Deal nao encontrado.");
  const redactRow = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? safeText(value) : value]));
  return envelope("crm.deal", `Deal ${id}`, scope, [
    { deal: redactRow(deal.data as Record<string, unknown>) },
    { activities: (activities.data ?? []).map((row) => redactRow(row as Record<string, unknown>)) },
    { messages: (messages.data ?? []).map((row) => redactRow(row as Record<string, unknown>)) },
    { demands: (demands.data ?? []).map((row) => redactRow(row as Record<string, unknown>)) },
  ], ["Telefones, emails e URLs livres sao removidos antes do envio ao modelo."], [{ label: "Abrir deal", href: `/pipeline?dealId=${id}` }, { label: "Abrir demandas", href: `/demandas?dealId=${id}` }]);
};

const integrationsProvider: Provider = async (supabase, scope) => {
  const result = await supabase.from("integration_settings").select("provider, last_event_reason, last_event_at, updated_at").order("updated_at", { ascending: false }).limit(50);
  if (result.error) throw result.error;
  const facts = (result.data ?? []).map((row) => ({ provider: safeText(row.provider, 80), status: row.last_event_at ? "configurado_com_evento" : "configurado_sem_evento", lastEventReason: safeText(row.last_event_reason, 180), lastEventAt: row.last_event_at, updatedAt: row.updated_at }));
  return envelope("crm.integrations", "Estado das integracoes", scope, facts, ["Credenciais, tokens e configuracoes secretas nunca entram no contexto."], [{ label: "Abrir configuracoes", href: "/configuracoes" }]);
};

const contentProvider: Provider = async (supabase, scope) => {
  const result = await supabase.from("insights").select("id, deal_id, company, type, content, created_at").order("created_at", { ascending: false }).limit(80);
  if (result.error) throw result.error;
  return envelope("crm.content", "Insights e conteudo do CRM", scope, (result.data ?? []).map((row) => ({ ...row, content: safeText(row.content, 1200), company: safeText(row.company, 180) })), [], [{ label: "Abrir insights", href: "/insights" }]);
};

export const CONTEXT_PROVIDER_REGISTRY: Readonly<Record<string, Provider>> = Object.freeze({
  pipeline: pipelineProvider,
  forecast: forecastProvider,
  losses: lossesProvider,
  deal: dealProvider,
  integrations: integrationsProvider,
  content: contentProvider,
});

const PROVIDERS_BY_SCOPE: Record<AiContextScope["type"], readonly (keyof typeof CONTEXT_PROVIDER_REGISTRY)[]> = {
  all: ["pipeline", "forecast", "losses", "integrations", "content"],
  deal: ["deal", "forecast"],
  reports: ["pipeline", "forecast", "losses"],
  integrations: ["integrations"],
  content: ["content"],
};

export async function loadAiContext(supabase: SupabaseAdmin, scope: AiContextScope) {
  const keys = PROVIDERS_BY_SCOPE[scope.type];
  const settled = await Promise.allSettled(keys.map((key) => CONTEXT_PROVIDER_REGISTRY[key](supabase, scope)));
  return settled.map((result, index) => result.status === "fulfilled"
    ? result.value
    : envelope(`crm.${String(keys[index])}`, `Fonte ${String(keys[index])}`, scope, [], [`Fonte indisponivel nesta resposta: ${safeText(result.reason instanceof Error ? result.reason.message : result.reason, 240)}`]));
}
