import { calculateForecast } from "./dealForecast.mjs";

const DEAL_PAGE_SIZE = 1000;
const MEETING_CHUNK_SIZE = 500;
const MEETING_LIMIT_PER_CHUNK = 5000;

export const DEAL_FORECAST_SELECT = [
  "id",
  "name",
  "company",
  "stage",
  "value",
  "prob",
  "recurring",
  "close_date",
  "closed_at",
  "response_type",
  "referred_phone",
  "last_inbound_at",
  "last_outbound_at",
  "next_action_at",
  "deal_health_score",
  "qualification",
].join(", ");

async function listDeals(supabase, filters = {}) {
  const rows = [];
  for (let from = 0; ; from += DEAL_PAGE_SIZE) {
    let query = supabase.from("deals").select(DEAL_FORECAST_SELECT).order("id", { ascending: true });
    if (filters.dealId) query = query.eq("id", filters.dealId);
    if (filters.stage) query = query.eq("stage", filters.stage);
    const result = await query.range(from, from + DEAL_PAGE_SIZE - 1);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < DEAL_PAGE_SIZE) break;
  }
  return rows;
}

async function listMeetings(supabase, dealIds) {
  if (dealIds.length === 0) return [];
  const rows = [];
  for (let index = 0; index < dealIds.length; index += MEETING_CHUNK_SIZE) {
    const chunk = dealIds.slice(index, index + MEETING_CHUNK_SIZE);
    const result = await supabase
      .from("calendar_events")
      .select("deal_id, starts_at, meeting_status, done")
      .eq("kind", "reuniao")
      .in("deal_id", chunk)
      .limit(MEETING_LIMIT_PER_CHUNK);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
  }
  return rows;
}

async function listCurrentLosses(supabase, dealIds) {
  if (dealIds.length === 0) return [];
  const rows = [];
  for (let index = 0; index < dealIds.length; index += MEETING_CHUNK_SIZE) {
    const result = await supabase
      .from("deal_loss_records")
      .select("deal_id, reason_code, note, recorded_at, recorded_by, superseded_at")
      .in("deal_id", dealIds.slice(index, index + MEETING_CHUNK_SIZE))
      .limit(MEETING_LIMIT_PER_CHUNK);
    if (result.error) return [];
    rows.push(...(result.data ?? []).filter((row) => !row.superseded_at));
  }
  return rows;
}

/** Reads real CRM sources and returns the deterministic forecast without persistence. */
export async function calculateForecastFromSupabase(supabase, options = {}) {
  const deals = await listDeals(supabase, options);
  const dealIds = deals.map((deal) => Number(deal.id)).filter(Boolean);
  const [meetings, losses] = await Promise.all([
    listMeetings(supabase, dealIds),
    listCurrentLosses(supabase, dealIds),
  ]);
  const lossByDeal = new Map(losses.map((loss) => [Number(loss.deal_id), loss]));
  const enrichedDeals = deals.map((deal) => {
    const loss = lossByDeal.get(Number(deal.id));
    return loss ? {
      ...deal,
      loss_reason_code: loss.reason_code,
      loss_reason_note: loss.note,
      loss_recorded_at: loss.recorded_at,
      loss_recorded_by: loss.recorded_by,
    } : deal;
  });
  return calculateForecast({
    deals: enrichedDeals,
    meetings,
    now: options.now,
    period: { from: options.from, to: options.to },
  });
}
