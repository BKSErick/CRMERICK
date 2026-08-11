export const LOSS_REASON_CATALOG = Object.freeze({
  version: 1,
  metric: "deal_loss_reason",
  minimumSampleSize: 3,
  reasons: Object.freeze([
    { code: "no_budget", label: "Sem orcamento" },
    { code: "no_priority", label: "Sem prioridade" },
    { code: "no_response", label: "Sem retorno" },
    { code: "no_decision_maker_access", label: "Sem acesso ao decisor" },
    { code: "bad_timing", label: "Momento inadequado" },
    { code: "competitor", label: "Concorrente" },
    { code: "bad_offer", label: "Oferta inadequada" },
    { code: "no_fit", label: "Sem fit" },
    { code: "invalid_channel_data", label: "Canal ou dado invalido" },
    { code: "other", label: "Outro" },
  ]),
});

const REASON_BY_CODE = new Map(LOSS_REASON_CATALOG.reasons.map((reason) => [reason.code, reason]));

function cleanText(value, maxLength = 2000) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function field(record, camel, snake = camel) {
  return record?.[camel] ?? record?.[snake];
}

function validDate(value, endOfDay = false) {
  if (!value) return null;
  const normalized = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizePeriod(period, now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const from = validDate(period?.from) ?? monthStart;
  const to = validDate(period?.to, true) ?? monthEnd;
  if (from.getTime() > to.getTime()) throw new Error("Periodo invalido: a data inicial deve anteceder a final.");
  return { from, to, fromDate: from.toISOString().slice(0, 10), toDate: to.toISOString().slice(0, 10) };
}

function groupDistribution(items, keyOf, total, labelOf = (key) => key) {
  const counts = new Map();
  for (const item of items) {
    const key = cleanText(keyOf(item), 200) ?? "not_informed";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({
      key,
      code: key,
      label: labelOf(key),
      count,
      sharePct: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
    }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

export function lossReasonLabel(code) {
  if (code === "not_informed") return "Motivo nao informado";
  return REASON_BY_CODE.get(code)?.label ?? "Motivo desconhecido";
}

export function validateLossReason(input) {
  const code = cleanText(input?.code, 80);
  const reason = code ? REASON_BY_CODE.get(code) : null;
  if (!reason) throw new Error("Razao de perda invalida.");
  const note = cleanText(input?.note);
  if (code === "other" && !note) throw new Error("Nota e obrigatoria para a razao Outro.");
  return { code, label: reason.label, note };
}

export function requiresLossReason(previousStage, targetStage) {
  return previousStage !== "lost" && targetStage === "lost";
}

/** Aggregates final versions of loss episodes without inferring causality. */
export function buildLossAnalysis(input = {}) {
  const now = validDate(input.now) ?? new Date();
  const period = normalizePeriod(input.period, now);
  const latestByEpisode = new Map();
  const startedAtByEpisode = new Map();
  for (const record of input.records ?? []) {
    const episodeId = String(field(record, "episodeId", "episode_id") ?? `record:${record.id}`);
    const candidateAt = validDate(field(record, "recordedAt", "recorded_at"));
    if (!candidateAt) continue;
    const startedAt = startedAtByEpisode.get(episodeId);
    if (!startedAt || candidateAt.getTime() < startedAt.getTime()) startedAtByEpisode.set(episodeId, candidateAt);
    const previous = latestByEpisode.get(episodeId);
    const previousAt = previous ? validDate(field(previous, "recordedAt", "recorded_at")) : null;
    if (!previous || candidateAt.getTime() > previousAt.getTime()
      || (candidateAt.getTime() === previousAt.getTime() && Number(record.id) > Number(previous.id))) {
      latestByEpisode.set(episodeId, record);
    }
  }

  const records = [...latestByEpisode.values()].filter((record) => {
    const episodeId = String(field(record, "episodeId", "episode_id") ?? `record:${record.id}`);
    const lossOccurredAt = startedAtByEpisode.get(episodeId);
    return lossOccurredAt && lossOccurredAt.getTime() >= period.from.getTime() && lossOccurredAt.getTime() <= period.to.getTime();
  });
  const totalLosses = records.length;
  const byReason = groupDistribution(
    records,
    (record) => field(record, "reasonCode", "reason_code"),
    totalLosses,
    lossReasonLabel,
  );
  const bySegment = groupDistribution(records, (record) => field(record, "segmentSnapshot", "segment_snapshot"), totalLosses);
  const byOrigin = groupDistribution(records, (record) => field(record, "originSnapshot", "origin_snapshot"), totalLosses);
  const recordDealIds = new Set((input.records ?? []).map((record) => Number(field(record, "dealId", "deal_id"))).filter(Boolean));
  const legacyWithoutReason = (input.deals ?? [])
    .filter((deal) => deal.stage === "lost"
      && !field(deal, "lossReasonCode", "loss_reason_code")
      && !recordDealIds.has(Number(deal.id)))
    .map((deal) => ({ dealId: Number(deal.id), company: String(deal.company ?? deal.name ?? `Deal ${deal.id}`) }))
    .sort((left, right) => left.company.localeCompare(right.company));

  return {
    catalogVersion: LOSS_REASON_CATALOG.version,
    period: { from: period.fromDate, to: period.toDate },
    minimumSampleSize: LOSS_REASON_CATALOG.minimumSampleSize,
    baseSufficient: totalLosses >= LOSS_REASON_CATALOG.minimumSampleSize,
    totalLosses,
    activeLosses: records.filter((record) => !field(record, "supersededReason", "superseded_reason")).length,
    reopenedLosses: records.filter((record) => field(record, "supersededReason", "superseded_reason") === "reopened").length,
    byReason: byReason.map((item) => ({
      code: item.code,
      label: item.label,
      count: item.count,
      sharePct: item.sharePct,
    })),
    bySegment,
    byOrigin,
    legacyWithoutReason,
    caveat: "Distribuicao observada no periodo; nao demonstra causalidade.",
  };
}
