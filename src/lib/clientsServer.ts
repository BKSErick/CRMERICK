import fs from "node:fs";
import path from "node:path";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { mapClientDemand, type ClientDemand } from "@/lib/clientDemands";
import {
  clientTotals,
  mapClient,
  normalizeClientName,
  normalizeCnpj,
  type Client,
  type ClientWithTotals,
} from "@/lib/clients";

type Supabase = ReturnType<typeof getCrmSupabaseAdmin>;

export const CLIENT_SELECT = `
  id, deal_id, name, legal_name, cnpj, state_registration, municipal_registration,
  email, phone, address, city, state, zip_code, segment, notes, status, source,
  created_at, updated_at
`;

/** So o que as somas precisam. Puxa a base inteira de demandas de uma vez. */
const CLIENT_DEMAND_SELECT = `
  id, client_id, deal_id, folder_id, title, status, priority, assignee, value,
  billing_type, billing_month, billing_until, due_at, completed_at, created_at, updated_at,
  destination_type, destination_label, description, copy_text, starts_at,
  charges:client_demand_charges(id, demand_id, number, billing_month, value, paid_at)
`;

function nameFromDeal(deal: { id: number; company?: string | null; name?: string | null }) {
  const company = (deal.company ?? "").trim();
  const contact = (deal.name ?? "").trim();
  return company || contact || `Cliente #${deal.id}`;
}

/**
 * Deal ganho vira cliente sozinho. Roda a cada leitura da aba: cobre tanto quem fechou
 * antes desta feature quanto quem for arrastado para "won" por qualquer caminho.
 * Idempotente - a chave e o deal_id.
 */
export async function syncClientsFromWonDeals(supabase: Supabase) {
  const deals = await supabase
    .from("deals")
    .select("id, company, name, segment, cnpj")
    .eq("stage", "won");
  if (deals.error) throw deals.error;

  const existing = await supabase.from("clients").select("id, deal_id, cnpj");
  if (existing.error) throw existing.error;

  const linkedDeals = new Set(
    (existing.data ?? []).map((row) => Number(row.deal_id)).filter((id) => Number.isInteger(id) && id > 0),
  );
  const usedCnpj = new Set(
    (existing.data ?? []).map((row) => normalizeCnpj(row.cnpj)).filter((value): value is string => Boolean(value)),
  );

  const inserts = [];
  for (const deal of deals.data ?? []) {
    const dealId = Number(deal.id);
    if (linkedDeals.has(dealId)) continue;
    const cnpj = normalizeCnpj(deal.cnpj);
    // CNPJ tem indice unico: se ja pertence a outro cadastro, o cliente novo entra sem ele.
    const canUseCnpj = Boolean(cnpj) && cnpj!.length === 14 && !usedCnpj.has(cnpj!);
    if (canUseCnpj) usedCnpj.add(cnpj!);
    inserts.push({
      deal_id: dealId,
      name: nameFromDeal({ id: dealId, company: deal.company, name: deal.name }),
      cnpj: canUseCnpj ? cnpj : null,
      segment: (deal.segment ?? "") || "",
      source: "pipeline",
      status: "active",
    });
  }

  if (inserts.length === 0) return { created: 0 };
  const inserted = await supabase.from("clients").insert(inserts).select("id");
  if (inserted.error) throw inserted.error;
  return { created: (inserted.data ?? []).length };
}

/**
 * Garante o cliente de UM deal ganho, na hora em que ele e arrastado para "won" no
 * pipeline/lista. O sync completo cobriria isso na proxima leitura da aba, mas ai o
 * cliente so apareceria no seletor de demandas depois de um refresh.
 * Best-effort: falhar aqui nao pode derrubar a atualizacao do deal.
 */
export async function ensureClientForDeal(
  supabase: Supabase,
  deal: { id: number; company?: string | null; name?: string | null; cnpj?: string | null; segment?: string | null },
) {
  try {
    const existing = await supabase.from("clients").select("id").eq("deal_id", deal.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return { created: false, id: Number(existing.data.id) };

    const cnpj = normalizeCnpj(deal.cnpj);
    let usableCnpj: string | null = null;
    if (cnpj && cnpj.length === 14) {
      const taken = await supabase.from("clients").select("id").eq("cnpj", cnpj).maybeSingle();
      if (taken.error) throw taken.error;
      usableCnpj = taken.data ? null : cnpj;
    }

    const created = await supabase.from("clients").insert({
      deal_id: deal.id,
      name: nameFromDeal(deal),
      cnpj: usableCnpj,
      segment: deal.segment ?? "",
      source: "pipeline",
      status: "active",
    }).select("id").single();
    if (created.error) throw created.error;
    return { created: true, id: Number(created.data.id) };
  } catch (error) {
    console.error("Falha ao criar cliente do deal ganho:", error);
    return { created: false, id: null };
  }
}

type CarteiraItem = { name?: string; description?: string; type?: string };

/**
 * Importa a lista curada da antiga Carteira (content/carteira.json, do vault) para o
 * cadastro. Roda sob demanda - `POST /api/clients` com `{ importCarteira: true }` -, nunca
 * sozinha: automatica, ela ressuscitaria todo cliente apagado na proxima leitura da aba.
 * Dedup por nome normalizado contra quem ja existe.
 */
export async function importCarteiraClients(supabase: Supabase) {
  let items: CarteiraItem[] = [];
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "content", "carteira.json"), "utf8");
    const parsed = JSON.parse(raw) as { items?: CarteiraItem[] };
    items = Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return { created: 0, skipped: 0 };
  }

  const existing = await supabase.from("clients").select("name");
  if (existing.error) throw existing.error;
  const seen = new Set((existing.data ?? []).map((row) => normalizeClientName(String(row.name ?? ""))));

  const rows = [];
  let skipped = 0;
  for (const item of items) {
    const name = (item.name ?? "").trim();
    if (!name) continue;
    const key = normalizeClientName(name);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    rows.push({
      name: name.slice(0, 240),
      segment: (item.type ?? "").slice(0, 240),
      notes: (item.description ?? "").slice(0, 5000),
      source: "vault",
      status: "active",
    });
  }

  if (rows.length === 0) return { created: 0, skipped };
  const inserted = await supabase.from("clients").insert(rows).select("id");
  if (inserted.error) throw inserted.error;
  return { created: (inserted.data ?? []).length, skipped };
}

/**
 * Puxa tudo de uma vez e agrega em memoria. A base de demandas e da ordem de centenas:
 * um group by por cliente no PostgREST custaria mais round-trip do que economiza.
 */
export async function loadClientsWithTotals(
  supabase: Supabase,
  monthKey: string,
): Promise<{ clients: ClientWithTotals[]; demandsByClient: Map<number, ClientDemand[]> }> {
  const [clientRows, demandRows] = await Promise.all([
    supabase.from("clients").select(CLIENT_SELECT).order("name", { ascending: true }),
    supabase.from("client_demands").select(CLIENT_DEMAND_SELECT),
  ]);
  if (clientRows.error) throw clientRows.error;
  if (demandRows.error) throw demandRows.error;

  const clients = (clientRows.data ?? []).map(mapClient);
  const byDeal = new Map<number, Client>();
  for (const client of clients) {
    if (client.dealId) byDeal.set(client.dealId, client);
  }

  const demandsByClient = new Map<number, ClientDemand[]>();
  for (const row of demandRows.data ?? []) {
    const demand = mapClientDemand(row);
    // Demanda antiga pode ter so o deal: o dono e o cliente daquele deal.
    const clientId = demand.clientId ?? (demand.dealId ? byDeal.get(demand.dealId)?.id ?? null : null);
    if (!clientId) continue;
    const bucket = demandsByClient.get(clientId);
    if (bucket) bucket.push(demand);
    else demandsByClient.set(clientId, [demand]);
  }

  return {
    clients: clients.map((client) => ({
      ...client,
      totals: clientTotals(demandsByClient.get(client.id) ?? [], monthKey),
    })),
    demandsByClient,
  };
}

export async function loadClientDemands(supabase: Supabase, clientId: number) {
  const client = await supabase.from("clients").select(CLIENT_SELECT).eq("id", clientId).maybeSingle();
  if (client.error) throw client.error;
  if (!client.data) return null;

  const mapped = mapClient(client.data);
  // Pega tambem o que ficou so com deal_id (demanda criada antes do cadastro existir).
  const filter = mapped.dealId
    ? `client_id.eq.${clientId},deal_id.eq.${mapped.dealId}`
    : `client_id.eq.${clientId}`;
  const demands = await supabase
    .from("client_demands")
    .select(CLIENT_DEMAND_SELECT)
    .or(filter)
    .order("due_at", { ascending: false, nullsFirst: false });
  if (demands.error) throw demands.error;

  return { client: mapped, demands: (demands.data ?? []).map(mapClientDemand) };
}
