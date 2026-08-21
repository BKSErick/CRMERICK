import { NextResponse } from "next/server";
import { getApiErrorMessage } from "@/lib/apiError";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";

export const DEMAND_SUMMARY_SELECT = `
  id, deal_id, folder_id, title, description, copy_text, status, priority, assignee,
  destination_type, destination_label, starts_at, due_at, completed_at,
  created_at, updated_at,
  deal:deals(id, company, name, stage, status, owner, assignee, value),
  checklist_items:client_demand_checklist_items(id, demand_id, title, is_done, position, created_at, updated_at)
`;

// A arvore e auto-referenciada: carregamos a lista chapada e montamos o caminho no cliente,
// em vez de tentar um embed recursivo no PostgREST.
export const DEMAND_FOLDER_SELECT = "id, parent_id, deal_id, name, position";

export async function assertDemandFolderExists(
  supabase: ReturnType<typeof getCrmSupabaseAdmin>,
  id: number,
) {
  const result = await supabase.from("demand_folders").select("id").eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Pasta nao encontrada.");
  return result.data;
}

export const DEMAND_DETAIL_SELECT = `
  ${DEMAND_SUMMARY_SELECT},
  links:client_demand_links(id, demand_id, label, url, created_at, updated_at),
  attachments:client_demand_attachments(id, demand_id, file_name, storage_path, mime_type, size_bytes, created_at),
  events:client_demand_events(id, demand_id, actor, event_type, description, metadata, created_at)
`;

export function demandErrorResponse(error: unknown, status = 500) {
  return NextResponse.json(
    { ok: false, error: getApiErrorMessage(error, "Erro inesperado em Demandas") },
    { status },
  );
}

export function demandId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function boundedDemandText(value: unknown, max: number, field: string, required = false) {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new Error(`${field} e obrigatorio.`);
  if (text.length > max) throw new Error(`${field} excede ${max} caracteres.`);
  return text;
}

export function nullableIso(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error(`${field} invalido.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} invalido.`);
  return date.toISOString();
}

export async function appendDemandEvent(
  supabase: ReturnType<typeof getCrmSupabaseAdmin>,
  input: {
    demandId: number;
    actor: string;
    eventType: string;
    description: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from("client_demand_events").insert({
    demand_id: input.demandId,
    actor: input.actor,
    event_type: input.eventType,
    description: input.description,
    metadata: input.metadata ?? {},
  });
  if (error) throw error;
}

export async function assertDemandExists(
  supabase: ReturnType<typeof getCrmSupabaseAdmin>,
  id: number,
) {
  const result = await supabase.from("client_demands").select("id, deal_id, status").eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Demanda nao encontrada.");
  return result.data;
}

export async function assertDemandWritable(
  supabase: ReturnType<typeof getCrmSupabaseAdmin>,
  id: number,
) {
  const demand = await assertDemandExists(supabase, id);
  if (!demand.deal_id) {
    throw new Error("A demanda de um deal removido e somente leitura. Vincule um cliente elegivel para editar.");
  }
  return demand;
}
