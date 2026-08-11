export const DEAL_HEALTH_RUBRIC = Object.freeze({
  version: 1,
  metric: "deal_health",
  baseScore: 50,
  riskMaxScore: 44,
  stageImpact: Object.freeze({ prospect: 0, abordado: 1, followup: 1, qualified: 4, proposal: 6, negotiation: 8 }),
  factors: Object.freeze([
    { key: "stage_progress", impact: 0, description: "Etapa comercial real, separada do score de prospeccao." },
    { key: "stage_recent", impact: 3, description: "Entrou na etapa atual ha no maximo 3 dias." },
    { key: "human_response", impact: 12, description: "Existe resposta humana, objecao ou encaminhamento registrado." },
    { key: "decision_maker", impact: 10, description: "Existe decisor ou contato indicado registrado." },
    { key: "recent_inbound", impact: 8, description: "Houve mensagem recebida nos ultimos 3 dias; entre 4 e 7 dias vale 4 pontos." },
    { key: "next_action", impact: 6, description: "Existe proxima acao futura em ate 7 dias; mais distante vale 3 pontos." },
    { key: "manual_next_action", impact: 6, description: "A proxima acao foi corrigida manualmente e e preservada." },
    { key: "meeting_scheduled", impact: 4, description: "Existe reuniao agendada." },
    { key: "meeting_confirmed", impact: 7, description: "Existe reuniao confirmada." },
    { key: "meeting_held", impact: 12, description: "Existe reuniao realizada." },
    { key: "proposal", impact: 8, description: "O negocio chegou a proposta ou negociacao." },
    { key: "expected_close", impact: 3, description: "Existe data futura esperada de fechamento." },
    { key: "stage_stalled", impact: -12, description: "A etapa esta parada ha 14 dias ou mais; entre 7 e 13 dias vale -6." },
    { key: "missing_next_action", impact: -12, description: "Negocio abordado sem proxima acao definida." },
    { key: "overdue_next_action", impact: -16, description: "Proxima acao vencida ha mais de 7 dias; atraso menor vale -10." },
    { key: "proposal_without_return", impact: -15, description: "Proposta enviada ha 7 dias ou mais sem nova entrada." },
    { key: "stale_conversation", impact: -10, description: "Conversa sem movimento ha 14 dias ou mais; entre 7 e 13 dias vale -5." },
    { key: "meeting_no_show", impact: -10, description: "A reuniao mais relevante terminou em no-show." },
    { key: "expected_close_overdue", impact: -10, description: "A data esperada de fechamento venceu com o negocio aberto." },
  ]),
  bands: Object.freeze([
    { min: 80, classification: "excelente" },
    { min: 65, classification: "saudavel" },
    { min: 45, classification: "atencao" },
    { min: 25, classification: "em_risco" },
    { min: 0, classification: "critico" },
  ]),
});

const ACTIVE_STAGES = ["abordado", "followup", "qualified", "proposal", "negotiation"];
const HUMAN_RESPONSES = new Set(["humana", "encaminhamento", "objecao"]);
const DAY_MS = 86400000;

export const DEAL_HEALTH_RISK_MAX_SCORE = DEAL_HEALTH_RUBRIC.riskMaxScore;

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validCloseDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return validDate(`${value}T23:59:59.999Z`);
  }
  return validDate(value);
}

function elapsedDays(now, value) {
  const date = validDate(value);
  return date ? Math.max(0, (now.getTime() - date.getTime()) / DAY_MS) : null;
}

function addEvidence(target, key, label, impact, evidence) {
  target.push({ key, label, impact, evidence });
}

function classificationFor(score) {
  return DEAL_HEALTH_RUBRIC.bands.find((band) => score >= band.min)?.classification ?? "critico";
}

function mostRelevantMeeting(meetings) {
  const rank = { held: 4, confirmed: 3, scheduled: 2, no_show: 1, cancelled: 0 };
  return [...meetings]
    .filter((meeting) => meeting && typeof meeting === "object")
    .sort((left, right) => {
      const byDate = String(right.heldAt ?? right.startsAt ?? "").localeCompare(String(left.heldAt ?? left.startsAt ?? ""));
      if (byDate !== 0) return byDate;
      return (rank[right.status] ?? -1) - (rank[left.status] ?? -1);
    })[0] ?? null;
}

function recommendedAction(deal, factors, risks) {
  if (deal.nextActionSource === "manual" && deal.nextActionNote) {
    return `Manter acao manual: ${deal.nextActionNote}`;
  }
  if (risks.some((risk) => risk.key === "proposal_without_return")) {
    return "Revisar a proposta e definir um follow-up manual com o decisor.";
  }
  if (risks.some((risk) => risk.key === "overdue_next_action")) {
    return "Executar ou reagendar a proxima acao vencida.";
  }
  if (risks.some((risk) => risk.key === "missing_next_action")) {
    return "Definir manualmente a proxima acao do negocio.";
  }
  if (factors.some((factor) => factor.key === "meeting_held")) {
    return "Registrar o resultado da reuniao e confirmar a proxima acao.";
  }
  if (factors.some((factor) => factor.key === "human_response")) {
    return "Responder a conversa e manter uma proxima acao definida.";
  }
  return "Revisar os dados do negocio e definir o proximo passo comercial.";
}

export function calculateDealHealth(input) {
  const deal = input?.deal ?? {};
  const now = validDate(input?.now) ?? new Date();
  const computedAt = now.toISOString();
  const factors = [];
  const risks = [];
  const warnings = [];
  let score = DEAL_HEALTH_RUBRIC.baseScore;

  if (deal.stage === "won") {
    return {
      rubricVersion: DEAL_HEALTH_RUBRIC.version,
      metric: DEAL_HEALTH_RUBRIC.metric,
      dealHealthScore: 100,
      classification: "ganho",
      confidence: 100,
      factors: [{ key: "won", label: "Negocio ganho", impact: 50, evidence: "Etapa atual: won." }],
      risks: [],
      warnings: [],
      recommendedNextAction: "Confirmar entrega, faturamento e relacionamento pos-venda.",
      computedAt,
    };
  }
  if (deal.stage === "lost") {
    return {
      rubricVersion: DEAL_HEALTH_RUBRIC.version,
      metric: DEAL_HEALTH_RUBRIC.metric,
      dealHealthScore: 0,
      classification: "perdido",
      confidence: 100,
      factors: [],
      risks: [{ key: "lost", label: "Negocio perdido", impact: -50, evidence: "Etapa atual: lost." }],
      warnings: [],
      recommendedNextAction: "Registrar a razao da perda antes de encerrar o negocio.",
      computedAt,
    };
  }

  const stageImpact = DEAL_HEALTH_RUBRIC.stageImpact[deal.stage] ?? 0;
  if (stageImpact > 0) {
    score += stageImpact;
    addEvidence(factors, "stage_progress", "Progresso comercial", stageImpact, `Etapa atual: ${deal.stage}.`);
  }

  const stageDays = elapsedDays(now, deal.stageEnteredAt);
  if (stageDays == null) {
    warnings.push("Sem data confiavel de entrada na etapa atual.");
  } else if (stageDays <= 3) {
    score += 3;
    addEvidence(factors, "stage_recent", "Etapa recente", 3, `Entrou na etapa ha ${Math.floor(stageDays)} dia(s).`);
  } else if (stageDays >= 14 && ACTIVE_STAGES.includes(deal.stage)) {
    score -= 12;
    addEvidence(risks, "stage_stalled", "Etapa parada", -12, `Permanece na etapa ha ${Math.floor(stageDays)} dias.`);
  } else if (stageDays >= 7 && ACTIVE_STAGES.includes(deal.stage)) {
    score -= 6;
    addEvidence(risks, "stage_stalled", "Etapa desacelerando", -6, `Permanece na etapa ha ${Math.floor(stageDays)} dias.`);
  }

  if (HUMAN_RESPONSES.has(deal.responseType)) {
    score += 12;
    addEvidence(factors, "human_response", "Resposta humana", 12, `Classificacao registrada: ${deal.responseType}.`);
  } else {
    warnings.push("Sem resposta humana classificada.");
  }

  if (deal.responseType === "encaminhamento" || deal.referredPhone) {
    score += 10;
    addEvidence(factors, "decision_maker", "Decisor identificado", 10, "Existe encaminhamento ou telefone do decisor.");
  } else {
    warnings.push("Sem decisor ou encaminhamento registrado.");
  }

  const inboundDays = elapsedDays(now, deal.lastInboundAt);
  if (inboundDays == null) {
    warnings.push("Sem data de ultima mensagem recebida.");
  } else if (inboundDays <= 3) {
    score += 8;
    addEvidence(factors, "recent_inbound", "Entrada recente", 8, `Ultima entrada ha ${Math.floor(inboundDays)} dia(s).`);
  } else if (inboundDays <= 7) {
    score += 4;
    addEvidence(factors, "recent_inbound", "Entrada na semana", 4, `Ultima entrada ha ${Math.floor(inboundDays)} dia(s).`);
  }
  if (!deal.lastOutboundAt) warnings.push("Sem data de ultima mensagem enviada.");

  const nextAction = validDate(deal.nextActionAt);
  if (nextAction) {
    const deltaDays = (nextAction.getTime() - now.getTime()) / DAY_MS;
    if (deltaDays >= 0) {
      const impact = deltaDays <= 7 ? 6 : 3;
      score += impact;
      addEvidence(
        factors,
        deal.nextActionSource === "manual" ? "manual_next_action" : "next_action",
        deal.nextActionSource === "manual" ? "Proxima acao manual" : "Proxima acao definida",
        impact,
        `${deal.nextActionNote || "Acao agendada"} em ${nextAction.toISOString()}.`,
      );
    } else {
      const overdueDays = Math.abs(deltaDays);
      const impact = overdueDays > 7 ? -16 : -10;
      score += impact;
      addEvidence(risks, "overdue_next_action", "Proxima acao vencida", impact, `Vencida ha ${Math.ceil(overdueDays)} dia(s).`);
    }
  } else {
    warnings.push("Sem proxima acao registrada.");
    if (ACTIVE_STAGES.includes(deal.stage)) {
      score -= 12;
      addEvidence(risks, "missing_next_action", "Sem proxima acao", -12, `A etapa ${deal.stage} esta ativa e sem agenda.`);
    }
  }

  const meeting = mostRelevantMeeting(input?.meetings ?? []);
  if (!meeting) {
    warnings.push("Sem reuniao registrada.");
  } else if (meeting.status === "held") {
    score += 12;
    addEvidence(factors, "meeting_held", "Reuniao realizada", 12, `Status da reuniao: held em ${meeting.heldAt ?? meeting.startsAt ?? "data ausente"}.`);
  } else if (meeting.status === "confirmed") {
    score += 7;
    addEvidence(factors, "meeting_confirmed", "Reuniao confirmada", 7, `Reuniao confirmada para ${meeting.startsAt ?? "data ausente"}.`);
  } else if (meeting.status === "scheduled") {
    score += 4;
    addEvidence(factors, "meeting_scheduled", "Reuniao agendada", 4, `Reuniao agendada para ${meeting.startsAt ?? "data ausente"}.`);
  } else if (meeting.status === "no_show") {
    score -= 10;
    addEvidence(risks, "meeting_no_show", "No-show", -10, `Reuniao sem comparecimento em ${meeting.startsAt ?? "data ausente"}.`);
  }

  const hasProposal = deal.stage === "proposal" || deal.stage === "negotiation";
  if (hasProposal) {
    score += 8;
    addEvidence(factors, "proposal", "Proposta em andamento", 8, `Etapa atual: ${deal.stage}.`);
    const outboundDays = elapsedDays(now, deal.lastOutboundAt);
    const inboundAfterOutbound = validDate(deal.lastInboundAt)?.getTime() > validDate(deal.lastOutboundAt)?.getTime();
    if (outboundDays != null && outboundDays >= 7 && !inboundAfterOutbound) {
      score -= 15;
      addEvidence(risks, "proposal_without_return", "Proposta sem retorno", -15, `Ultima saida ha ${Math.floor(outboundDays)} dias sem nova entrada.`);
    }
  } else {
    warnings.push("Negocio ainda nao chegou a proposta.");
    const latestConversation = [validDate(deal.lastInboundAt), validDate(deal.lastOutboundAt)]
      .filter(Boolean)
      .sort((left, right) => right.getTime() - left.getTime())[0];
    const staleDays = latestConversation ? elapsedDays(now, latestConversation) : null;
    if (staleDays != null && staleDays >= 14 && ACTIVE_STAGES.includes(deal.stage)) {
      score -= 10;
      addEvidence(risks, "stale_conversation", "Conversa parada", -10, `Sem movimento ha ${Math.floor(staleDays)} dias.`);
    } else if (staleDays != null && staleDays >= 7 && ACTIVE_STAGES.includes(deal.stage)) {
      score -= 5;
      addEvidence(risks, "stale_conversation", "Conversa desacelerando", -5, `Sem movimento ha ${Math.floor(staleDays)} dias.`);
    }
  }

  const closeDate = validCloseDate(deal.closeDate);
  if (!closeDate) {
    warnings.push("Sem data esperada de fechamento.");
  } else if (closeDate.getTime() >= now.getTime()) {
    score += 3;
    addEvidence(factors, "expected_close", "Fechamento previsto", 3, `Previsao: ${closeDate.toISOString()}.`);
  } else if (ACTIVE_STAGES.includes(deal.stage)) {
    score -= 10;
    addEvidence(risks, "expected_close_overdue", "Fechamento atrasado", -10, `Previsao vencida em ${closeDate.toISOString()}.`);
  }

  const confidenceSignals = [
    Boolean(deal.stage),
    Boolean(validDate(deal.stageEnteredAt)),
    Boolean(validDate(deal.lastInboundAt)),
    Boolean(validDate(deal.lastOutboundAt)),
    Boolean(nextAction),
    HUMAN_RESPONSES.has(deal.responseType),
    Boolean(deal.referredPhone || deal.responseType === "encaminhamento"),
    Boolean(meeting),
    hasProposal,
    Boolean(closeDate),
  ];
  const confidence = Math.round((confidenceSignals.filter(Boolean).length / confidenceSignals.length) * 100);
  const dealHealthScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    rubricVersion: DEAL_HEALTH_RUBRIC.version,
    metric: DEAL_HEALTH_RUBRIC.metric,
    dealHealthScore,
    classification: classificationFor(dealHealthScore),
    confidence,
    factors,
    risks,
    warnings,
    recommendedNextAction: recommendedAction(deal, factors, risks),
    computedAt,
  };
}
