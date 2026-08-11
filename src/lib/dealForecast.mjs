import { summarizeDealQualification } from "./dealQualification.mjs";
import { lossReasonLabel } from "./dealLossReasons.mjs";

export const DEAL_FORECAST_RUBRIC = Object.freeze({
  version: 1,
  metric: "commercial_forecast",
  aggregateProbabilitySource: "calculated_v1",
  activeProbabilityBounds: Object.freeze([1, 95]),
  stageBase: Object.freeze({
    prospect: 5,
    abordado: 10,
    followup: 18,
    qualified: 35,
    proposal: 55,
    negotiation: 72,
  }),
  adjustments: Object.freeze({
    healthStrong: 8,
    healthHealthy: 5,
    healthAtRisk: -12,
    healthCritical: -18,
    qualificationComplete: 8,
    qualificationPartial: 4,
    qualificationStarted: 2,
    humanResponse: 6,
    decisionMaker: 6,
    meetingHeld: 10,
    meetingConfirmed: 6,
    meetingScheduled: 3,
    meetingNoShow: -10,
    proposal: 4,
    activityThreeDays: 5,
    activitySevenDays: 2,
    activityStale: -8,
    closeInPeriod: 4,
    closeOverdue: -10,
  }),
  confidenceWeights: Object.freeze({
    stage: 10,
    value: 15,
    closeDate: 15,
    health: 10,
    qualification: 10,
    response: 10,
    recentActivity: 10,
    meeting: 10,
    nextAction: 10,
  }),
});

const ACTIVE_STAGES = new Set(Object.keys(DEAL_FORECAST_RUBRIC.stageBase));
const HUMAN_RESPONSES = new Set(["humana", "encaminhamento", "objecao"]);
const DAY_MS = 86400000;

function validDate(value, endOfDay = false) {
  if (!value) return null;
  const normalized = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizePeriod(period, now) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const from = validDate(period?.from) ?? monthStart;
  const to = validDate(period?.to, true) ?? monthEnd;
  if (from.getTime() > to.getTime()) throw new Error("Periodo invalido: a data inicial deve anteceder a final.");
  return { from, to, fromDate: from.toISOString().slice(0, 10), toDate: to.toISOString().slice(0, 10) };
}

function inPeriod(date, period) {
  return Boolean(date && date.getTime() >= period.from.getTime() && date.getTime() <= period.to.getTime());
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function positiveValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function addEvidence(target, key, label, impact, evidence) {
  target.push({ key, label, impact, evidence });
}

function dealField(deal, camel, snake = camel) {
  return deal?.[camel] ?? deal?.[snake];
}

function latestMeeting(meetings) {
  return [...(meetings ?? [])]
    .filter((meeting) => meeting && typeof meeting === "object")
    .sort((left, right) => String(dealField(right, "startsAt", "starts_at") ?? "")
      .localeCompare(String(dealField(left, "startsAt", "starts_at") ?? "")))[0] ?? null;
}

function latestActivityDate(deal) {
  return [
    validDate(dealField(deal, "lastInboundAt", "last_inbound_at")),
    validDate(dealField(deal, "lastOutboundAt", "last_outbound_at")),
  ].filter(Boolean).sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

function responseType(deal) {
  return dealField(deal, "responseType", "response_type");
}

function normalizedManualProbability(deal) {
  const raw = deal.prob ?? deal.probability;
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null;
}

/**
 * Calculates an explainable forecast for one deal without reading or writing external state.
 */
export function calculateDealForecast(input = {}) {
  const deal = input.deal ?? {};
  const now = validDate(input.now) ?? new Date();
  const period = normalizePeriod(input.period, now);
  const stage = String(deal.stage ?? "prospect");
  const dealId = Number(deal.id) || 0;
  const company = String(deal.company ?? deal.name ?? `Deal ${dealId}`);
  const recurring = Boolean(deal.recurring);
  const value = positiveValue(deal.value);
  const manualProbability = normalizedManualProbability(deal);
  const closeDate = validDate(dealField(deal, "closeDate", "close_date") ?? deal.close, true);
  const closedAt = validDate(dealField(deal, "closedAt", "closed_at"), true);
  const nextAction = validDate(dealField(deal, "nextActionAt", "next_action_at"));
  const factors = [];
  const risks = [];
  const warnings = [];
  const adjustments = DEAL_FORECAST_RUBRIC.adjustments;
  const lossReasonCode = dealField(deal, "lossReasonCode", "loss_reason_code") ?? null;
  const lossReason = lossReasonCode ? {
    code: String(lossReasonCode),
    label: lossReasonLabel(String(lossReasonCode)),
    note: dealField(deal, "lossReasonNote", "loss_reason_note") ?? null,
    recordedAt: dealField(deal, "lossRecordedAt", "loss_recorded_at") ?? null,
    recordedBy: dealField(deal, "lossRecordedBy", "loss_recorded_by") ?? null,
  } : null;

  const baseResult = {
    rubricVersion: DEAL_FORECAST_RUBRIC.version,
    probabilitySource: DEAL_FORECAST_RUBRIC.aggregateProbabilitySource,
    dealId,
    company,
    stage,
    recurring,
    manualProbability,
    grossValue: value,
    closeDate: closeDate?.toISOString().slice(0, 10) ?? null,
    period: { from: period.fromDate, to: period.toDate },
    lossReason,
  };

  if (!value) warnings.push("Sem valor comercial valido; receita mantida em zero.");
  if (!closeDate && stage !== "won" && stage !== "lost") warnings.push("Sem data esperada de fechamento; fora da previsao do periodo.");

  if (stage === "won") {
    const realizedInPeriod = inPeriod(closedAt, period) && value > 0;
    if (!closedAt) warnings.push("Negocio ganho sem data de fechamento; fora do realizado do periodo.");
    return {
      ...baseResult,
      forecastStatus: "realized",
      baseProbability: 100,
      calculatedProbability: 100,
      confidence: 100,
      weightedValue: 0,
      predictedValue: 0,
      realizedValue: realizedInPeriod ? money(value) : 0,
      includedInPeriod: realizedInPeriod,
      isAtRisk: false,
      withoutNextAction: false,
      factors: [{ key: "won", label: "Negocio ganho", impact: 100, evidence: "Receita classificada somente como realizada." }],
      risks: [],
      warnings,
    };
  }

  if (stage === "lost") {
    if (!lossReason) warnings.push("Motivo da perda nao informado (legado).");
    return {
      ...baseResult,
      forecastStatus: "excluded",
      baseProbability: 0,
      calculatedProbability: 0,
      confidence: 100,
      weightedValue: 0,
      predictedValue: 0,
      realizedValue: 0,
      includedInPeriod: false,
      isAtRisk: false,
      withoutNextAction: false,
      factors: [],
      risks: [{
        key: "lost",
        label: "Negocio perdido",
        impact: 0,
        evidence: lossReason
          ? `Deals perdidos nao entram no forecast. Motivo: ${lossReason.label}${lossReason.note ? ` — ${lossReason.note}` : ""}.`
          : "Deals perdidos nao entram no forecast. Motivo nao informado.",
      }],
      warnings,
    };
  }

  const baseProbability = DEAL_FORECAST_RUBRIC.stageBase[stage] ?? DEAL_FORECAST_RUBRIC.stageBase.prospect;
  let probability = baseProbability;
  addEvidence(factors, "stage_base", "Probabilidade-base da etapa", baseProbability, `Etapa atual: ${stage}.`);
  if (!ACTIVE_STAGES.has(stage)) warnings.push("Etapa desconhecida; aplicada base conservadora de prospect.");

  const healthRaw = dealField(deal, "dealHealthScore", "deal_health_score");
  const health = Number(healthRaw);
  const hasHealth = healthRaw !== null && healthRaw !== undefined && healthRaw !== ""
    && Number.isFinite(health) && health >= 0 && health <= 100;
  if (!hasHealth) {
    warnings.push("Sem saude do negocio calculada.");
  } else if (health >= 80) {
    probability += adjustments.healthStrong;
    addEvidence(factors, "health_strong", "Saude forte", adjustments.healthStrong, `Saude do negocio: ${health}/100.`);
  } else if (health >= 65) {
    probability += adjustments.healthHealthy;
    addEvidence(factors, "health_healthy", "Saude positiva", adjustments.healthHealthy, `Saude do negocio: ${health}/100.`);
  } else if (health < 25) {
    probability += adjustments.healthCritical;
    addEvidence(risks, "health_critical", "Saude critica", adjustments.healthCritical, `Saude do negocio: ${health}/100.`);
  } else if (health < 45) {
    probability += adjustments.healthAtRisk;
    addEvidence(risks, "health_at_risk", "Saude em risco", adjustments.healthAtRisk, `Saude do negocio: ${health}/100.`);
  }

  const qualificationRaw = deal.qualification;
  const qualification = summarizeDealQualification(qualificationRaw);
  const hasQualification = qualification.confirmedCount > 0 || qualification.suggestedCount > 0;
  if (!hasQualification) {
    warnings.push("Sem qualificacao consultiva preenchida.");
  } else if (qualification.completeness === 100) {
    probability += adjustments.qualificationComplete;
    addEvidence(factors, "qualification_complete", "Qualificacao confirmada", adjustments.qualificationComplete, "Os 7 campos consultivos foram confirmados pelo operador.");
  } else if (qualification.completeness >= 57) {
    probability += adjustments.qualificationPartial;
    addEvidence(factors, "qualification_partial", "Qualificacao avancada", adjustments.qualificationPartial, `${qualification.confirmedCount}/7 campos confirmados.`);
  } else if (qualification.confirmedCount > 0) {
    probability += adjustments.qualificationStarted;
    addEvidence(factors, "qualification_started", "Qualificacao iniciada", adjustments.qualificationStarted, `${qualification.confirmedCount}/7 campos confirmados.`);
  }

  const response = responseType(deal);
  const hasResponseClassification = typeof response === "string" && response.length > 0;
  if (HUMAN_RESPONSES.has(response)) {
    probability += adjustments.humanResponse;
    addEvidence(factors, "human_response", "Resposta humana", adjustments.humanResponse, `Resposta classificada como ${response}.`);
  } else if (!hasResponseClassification) {
    warnings.push("Sem classificacao de resposta.");
  }

  const hasDecisionMaker = response === "encaminhamento" || Boolean(dealField(deal, "referredPhone", "referred_phone"));
  if (hasDecisionMaker) {
    probability += adjustments.decisionMaker;
    addEvidence(factors, "decision_maker", "Decisor identificado", adjustments.decisionMaker, "Existe encaminhamento ou contato do decisor.");
  } else {
    warnings.push("Sem decisor ou encaminhamento registrado.");
  }

  const meeting = latestMeeting(input.meetings);
  const meetingStatus = meeting ? String(dealField(meeting, "status", "meeting_status") ?? (meeting.done ? "held" : "scheduled")) : null;
  if (!meeting) {
    warnings.push("Sem reuniao registrada.");
  } else if (meetingStatus === "held") {
    probability += adjustments.meetingHeld;
    addEvidence(factors, "meeting_held", "Reuniao realizada", adjustments.meetingHeld, "A reuniao comercial foi realizada.");
  } else if (meetingStatus === "confirmed") {
    probability += adjustments.meetingConfirmed;
    addEvidence(factors, "meeting_confirmed", "Reuniao confirmada", adjustments.meetingConfirmed, "A reuniao comercial esta confirmada.");
  } else if (meetingStatus === "scheduled") {
    probability += adjustments.meetingScheduled;
    addEvidence(factors, "meeting_scheduled", "Reuniao agendada", adjustments.meetingScheduled, "Existe reuniao comercial agendada.");
  } else if (meetingStatus === "no_show") {
    probability += adjustments.meetingNoShow;
    addEvidence(risks, "meeting_no_show", "No-show", adjustments.meetingNoShow, "A reuniao mais recente terminou em no-show.");
  }

  if (stage === "proposal" || stage === "negotiation") {
    probability += adjustments.proposal;
    addEvidence(factors, "proposal", "Proposta em andamento", adjustments.proposal, `A etapa ${stage} comprova proposta em andamento.`);
  }

  const activityDate = latestActivityDate(deal);
  if (!activityDate) {
    warnings.push("Sem data confiavel de atividade comercial recente.");
  } else {
    const days = Math.max(0, (now.getTime() - activityDate.getTime()) / DAY_MS);
    if (days <= 3) {
      probability += adjustments.activityThreeDays;
      addEvidence(factors, "recent_activity", "Atividade recente", adjustments.activityThreeDays, `Ultima atividade ha ${Math.floor(days)} dia(s).`);
    } else if (days <= 7) {
      probability += adjustments.activitySevenDays;
      addEvidence(factors, "recent_activity", "Atividade na semana", adjustments.activitySevenDays, `Ultima atividade ha ${Math.floor(days)} dia(s).`);
    } else if (days >= 14) {
      probability += adjustments.activityStale;
      addEvidence(risks, "stale_activity", "Atividade antiga", adjustments.activityStale, `Sem atividade ha ${Math.floor(days)} dias.`);
    }
  }

  const includedInPeriod = inPeriod(closeDate, period) && value > 0;
  if (closeDate && closeDate.getTime() < now.getTime()) {
    probability += adjustments.closeOverdue;
    addEvidence(risks, "close_overdue", "Fechamento atrasado", adjustments.closeOverdue, `Data esperada vencida em ${closeDate.toISOString().slice(0, 10)}.`);
  } else if (includedInPeriod) {
    probability += adjustments.closeInPeriod;
    addEvidence(factors, "close_in_period", "Fechamento no periodo", adjustments.closeInPeriod, `Fechamento esperado entre ${period.fromDate} e ${period.toDate}.`);
  }

  if (!nextAction) warnings.push("Sem proxima acao registrada.");

  const confidenceSignals = {
    stage: Boolean(deal.stage),
    value: value > 0,
    closeDate: Boolean(closeDate),
    health: hasHealth,
    qualification: hasQualification,
    response: hasResponseClassification,
    recentActivity: Boolean(activityDate),
    meeting: Boolean(meeting),
    nextAction: Boolean(nextAction),
  };
  const confidence = Object.entries(DEAL_FORECAST_RUBRIC.confidenceWeights)
    .reduce((sum, [key, weight]) => sum + (confidenceSignals[key] ? weight : 0), 0);
  const [minProbability, maxProbability] = DEAL_FORECAST_RUBRIC.activeProbabilityBounds;
  const calculatedProbability = Math.max(minProbability, Math.min(maxProbability, Math.round(probability)));
  const weightedValue = money(value * calculatedProbability / 100);
  const predictedValue = includedInPeriod ? weightedValue : 0;

  return {
    ...baseResult,
    forecastStatus: "forecast",
    baseProbability,
    calculatedProbability,
    confidence,
    weightedValue,
    predictedValue,
    realizedValue: 0,
    includedInPeriod,
    isAtRisk: risks.length > 0 || (hasHealth && health <= 44),
    withoutNextAction: includedInPeriod && !nextAction,
    factors,
    risks,
    warnings,
  };
}

/**
 * Aggregates active forecast and realized revenue while keeping MRR and one-off separate.
 */
export function calculateForecast(input = {}) {
  const now = validDate(input.now) ?? new Date();
  const period = normalizePeriod(input.period, now);
  const meetingsByDeal = new Map();
  for (const meeting of input.meetings ?? []) {
    const dealId = Number(dealField(meeting, "dealId", "deal_id"));
    if (!dealId) continue;
    const list = meetingsByDeal.get(dealId) ?? [];
    list.push(meeting);
    meetingsByDeal.set(dealId, list);
  }

  const deals = (input.deals ?? []).map((deal) => calculateDealForecast({
    deal,
    meetings: meetingsByDeal.get(Number(deal.id)) ?? [],
    now: now.toISOString(),
    period: { from: period.fromDate, to: period.toDate },
  }));
  const active = deals.filter((deal) => deal.forecastStatus === "forecast");
  const predicted = active.filter((deal) => deal.includedInPeriod);
  const realized = deals.filter((deal) => deal.forecastStatus === "realized" && deal.includedInPeriod);
  const sum = (items, field) => money(items.reduce((total, item) => total + Number(item[field] ?? 0), 0));
  const predictedTotal = sum(predicted, "predictedValue");
  const grossPipeline = sum(active, "grossValue");
  const weightedPipeline = sum(active, "weightedValue");
  const percentage = (value, base) => base > 0 ? Math.round((value / base) * 10000) / 100 : 0;
  const relevantDeals = [...predicted]
    .sort((left, right) => right.predictedValue - left.predictedValue || left.dealId - right.dealId)
    .slice(0, 20)
    .map((deal) => ({
      dealId: deal.dealId,
      company: deal.company,
      stage: deal.stage,
      closeDate: deal.closeDate,
      recurring: deal.recurring,
      calculatedProbability: deal.calculatedProbability,
      manualProbability: deal.manualProbability,
      confidence: deal.confidence,
      predictedValue: deal.predictedValue,
      isAtRisk: deal.isAtRisk,
      withoutNextAction: deal.withoutNextAction,
    }));

  return {
    rubricVersion: DEAL_FORECAST_RUBRIC.version,
    probabilitySource: DEAL_FORECAST_RUBRIC.aggregateProbabilitySource,
    period: { from: period.fromDate, to: period.toDate },
    pipeline: {
      gross: grossPipeline,
      weighted: weightedPipeline,
      weightedRate: percentage(weightedPipeline, grossPipeline),
    },
    predicted: {
      total: predictedTotal,
      mrr: sum(predicted.filter((deal) => deal.recurring), "predictedValue"),
      oneOff: sum(predicted.filter((deal) => !deal.recurring), "predictedValue"),
      periodCoverageRate: percentage(predictedTotal, weightedPipeline),
    },
    realized: {
      total: sum(realized, "realizedValue"),
      mrr: sum(realized.filter((deal) => deal.recurring), "realizedValue"),
      oneOff: sum(realized.filter((deal) => !deal.recurring), "realizedValue"),
    },
    attention: {
      revenueAtRisk: sum(predicted.filter((deal) => deal.isAtRisk), "predictedValue"),
      revenueWithoutNextAction: sum(predicted.filter((deal) => deal.withoutNextAction), "predictedValue"),
    },
    counts: {
      active: active.length,
      predictedInPeriod: predicted.length,
      realizedInPeriod: realized.length,
      excludedLost: deals.filter((deal) => deal.forecastStatus === "excluded").length,
      missingValue: deals.filter((deal) => deal.warnings.some((warning) => warning.startsWith("Sem valor comercial"))).length,
      missingCloseDate: active.filter((deal) => !deal.closeDate).length,
    },
    relevantDeals,
    deals,
  };
}
