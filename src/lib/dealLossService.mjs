import { buildLossAnalysis, lossReasonLabel, validateLossReason } from "./dealLossReasons.mjs";

const DEAL_PAGE_SIZE = 1000;
const RECORD_PAGE_SIZE = 1000;
const VALID_STAGES = new Set(["prospect", "abordado", "followup", "qualified", "proposal", "negotiation", "won", "lost"]);

function requireDealId(value) {
  const dealId = Number(value);
  if (!Number.isInteger(dealId) || dealId <= 0) throw new Error("Deal invalido.");
  return dealId;
}

function requireActor(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Autoria da perda e obrigatoria.");
  return value.trim().slice(0, 200);
}

async function rpcSingle(supabase, name, params) {
  const result = await supabase.rpc(name, params).single();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("A transacao nao retornou o deal atualizado.");
  return result.data;
}

export async function transitionDealStage(supabase, dealIdValue, targetStage, lossReason, context = {}) {
  const dealId = requireDealId(dealIdValue);
  if (!VALID_STAGES.has(targetStage)) throw new Error("Etapa de destino invalida.");
  const actor = requireActor(context.actor);
  if (targetStage === "lost" && (!lossReason || !lossReason.code)) {
    throw new Error("Razao de perda obrigatoria.");
  }
  const reason = targetStage === "lost"
    ? validateLossReason(lossReason)
    : { code: null, note: null };
  return rpcSingle(supabase, "transition_deal_stage_atomic", {
    p_deal_id: dealId,
    p_target_stage: targetStage,
    p_reason_code: reason.code,
    p_reason_note: reason.note,
    p_actor: actor,
  });
}

export async function correctDealLossReason(supabase, dealIdValue, lossReason, context = {}) {
  const dealId = requireDealId(dealIdValue);
  const actor = requireActor(context.actor);
  const reason = validateLossReason(lossReason);
  return rpcSingle(supabase, "correct_deal_loss_reason_atomic", {
    p_deal_id: dealId,
    p_reason_code: reason.code,
    p_reason_note: reason.note,
    p_actor: actor,
  });
}

export async function listDealLossHistory(supabase, dealIdValue) {
  const dealId = requireDealId(dealIdValue);
  const result = await supabase
    .from("deal_loss_records")
    .select("id, deal_id, episode_id, reason_code, note, previous_stage, recorded_by, recorded_at, superseded_at, superseded_by, superseded_reason, supersedes_id")
    .eq("deal_id", dealId)
    .order("recorded_at", { ascending: false });
  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => ({
    id: Number(row.id),
    dealId: row.deal_id == null ? null : Number(row.deal_id),
    episodeId: String(row.episode_id),
    reasonCode: String(row.reason_code),
    reasonLabel: lossReasonLabel(String(row.reason_code)),
    note: row.note == null ? null : String(row.note),
    previousStage: String(row.previous_stage),
    recordedBy: String(row.recorded_by),
    recordedAt: String(row.recorded_at),
    supersededAt: row.superseded_at == null ? null : String(row.superseded_at),
    supersededBy: row.superseded_by == null ? null : String(row.superseded_by),
    supersededReason: row.superseded_reason == null ? null : String(row.superseded_reason),
    supersedesId: row.supersedes_id == null ? null : Number(row.supersedes_id),
  }));
}

async function listAll(queryFactory, pageSize) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const result = await queryFactory(from, from + pageSize - 1);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

export async function loadLossAnalysis(supabase, options = {}) {
  const [deals, records] = await Promise.all([
    listAll(
      (from, to) => supabase.from("deals").select("id, name, company, stage, loss_reason_code").order("id", { ascending: true }).range(from, to),
      DEAL_PAGE_SIZE,
    ),
    listAll(
      (from, to) => supabase.from("deal_loss_records").select("id, deal_id, episode_id, reason_code, recorded_at, segment_snapshot, origin_snapshot, superseded_reason").order("id", { ascending: true }).range(from, to),
      RECORD_PAGE_SIZE,
    ),
  ]);
  return buildLossAnalysis({ deals, records, period: { from: options.from, to: options.to }, now: options.now });
}
