// Regras deterministicas da operacao de follow-up.
// A engine e compartilhada por CLI, API e UI. Ela nunca envia mensagens nem move stages.

export type FollowupTier = "aguardar" | "M1" | "M2" | "M3";
export type ResponseType =
  | "sem_resposta"
  | "bot"
  | "humana"
  | "encaminhamento"
  | "objecao"
  | "perdido";
export type ResponseTypeSource = "automatic" | "manual";
export type NextActionType =
  | "followup_silencio"
  | "followup_bot"
  | "responder"
  | "contactar_responsavel"
  | "tratar_objecao";
export type QueueSection =
  | "responder_agora"
  | "encaminhamentos"
  | "bots_d7"
  | "followups_vencidos"
  | "aguardando_cadencia"
  | "dados_inconsistentes";

export type NextActionPlan = {
  at: string | null;
  type: NextActionType | null;
  note: string;
};

export const RESPONSE_TYPE_INFO: Record<ResponseType, { label: string; tone: string }> = {
  sem_resposta: { label: "Sem resposta", tone: "neutral" },
  bot: { label: "Bot", tone: "warning" },
  humana: { label: "Humana", tone: "success" },
  encaminhamento: { label: "Encaminhamento", tone: "info" },
  objecao: { label: "Objecao", tone: "danger" },
  perdido: { label: "Sem interesse", tone: "muted" },
};

export const QUEUE_SECTION_INFO: Record<QueueSection, { label: string; order: number }> = {
  responder_agora: { label: "Responder agora", order: 1 },
  encaminhamentos: { label: "Encaminhamentos", order: 2 },
  bots_d7: { label: "Bots D+7", order: 3 },
  followups_vencidos: { label: "Follow-ups vencidos", order: 4 },
  aguardando_cadencia: { label: "Aguardando cadencia", order: 5 },
  dados_inconsistentes: { label: "Dados inconsistentes", order: 6 },
};

export const TIER_INFO: Record<Exclude<FollowupTier, "aguardar">, { label: string; window: string }> = {
  M1: { label: "M1 - Retomada leve", window: "D+2 a D+4" },
  M2: { label: "M2 - Prova (cases)", window: "D+5 a D+9" },
  M3: { label: "M3 - Breakup", window: "D+10 ou mais" },
};

type WhatsappActivityRow = {
  deal_id: number | null;
  type: string | null;
  created_at: string | null;
  description?: string | null;
};

export type WhatsappActivitySummary = Record<
  number,
  {
    last: string;
    count: number;
    lastOutbound: string;
    lastOutboundText: string;
    lastInbound?: string;
    lastInboundText?: string;
    inboundCount: number;
  }
>;

function cleanWhatsappActivityDescription(value?: string | null) {
  return (value ?? "")
    .replace(/^\[UAZAPI-HISTORY[^\]]*\]\s*/i, "")
    .replace(/^WhatsApp\s+(recebido|enviado):\s*/i, "")
    .trim();
}

export function buildWhatsappActivitySummary(rows: WhatsappActivityRow[]) {
  const summary: WhatsappActivitySummary = {};
  for (const row of rows) {
    if (!row.deal_id || !row.created_at) continue;
    const outbound = row.type === "whatsapp_sent" || row.type === "whatsapp_sent_sync";
    const inbound = row.type === "whatsapp_received";
    if (!outbound && !inbound) continue;

    const current = summary[row.deal_id] ?? {
      last: "",
      count: 0,
      lastOutbound: "",
      lastOutboundText: "",
      inboundCount: 0,
    };
    if (outbound) {
      current.count += 1;
      if (!current.lastOutbound || row.created_at > current.lastOutbound) {
        current.last = row.created_at;
        current.lastOutbound = row.created_at;
        current.lastOutboundText = cleanWhatsappActivityDescription(row.description);
      }
    }
    if (inbound) {
      current.inboundCount += 1;
      if (!current.lastInbound || row.created_at > current.lastInbound) {
        current.lastInbound = row.created_at;
        current.lastInboundText = cleanWhatsappActivityDescription(row.description);
      }
    }
    summary[row.deal_id] = current;
  }
  return summary;
}

function addDays(iso: string, days: number) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function foldText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyInboundResponse(content: string): ResponseType {
  const text = foldText(content);
  const botPatterns = [
    "mensagem automatica",
    "resposta automatica",
    "assistente virtual",
    "horario de atendimento",
    "selecione uma opcao",
    "digite uma opcao",
    "digite 1",
    "nao responda esta mensagem",
    "aguarde que em breve",
  ];
  if (botPatterns.some((pattern) => text.includes(pattern))) return "bot";

  const referralPatterns = [
    "responsavel por compras",
    "responsavel pelas compras",
    "responsavel por novos materiais",
    "entre em contato com",
    "fale com meu superior",
    "falar com meu superior",
    "encaminhar seu contato",
    "vou encaminhar",
  ];
  if (referralPatterns.some((pattern) => text.includes(pattern))) return "encaminhamento";

  return "humana";
}

export function nextActionAfterInbound(
  responseType: ResponseType,
  occurredAt: string,
): NextActionPlan {
  if (responseType === "bot") {
    return {
      at: addDays(occurredAt, 7),
      type: "followup_bot",
      note: "Resposta automatica; retomar em D+7.",
    };
  }
  if (responseType === "encaminhamento") {
    return {
      at: occurredAt,
      type: "contactar_responsavel",
      note: "Encaminhamento recebido; contatar o responsavel.",
    };
  }
  if (responseType === "humana") {
    return {
      at: occurredAt,
      type: "responder",
      note: "Resposta humana recebida; responder com contexto.",
    };
  }
  if (responseType === "objecao") {
    return {
      at: occurredAt,
      type: "tratar_objecao",
      note: "Objecao registrada; preparar resposta contextual.",
    };
  }
  if (responseType === "perdido") {
    return { at: null, type: null, note: "Sem interesse; nenhuma retomada automatica." };
  }
  return {
    at: addDays(occurredAt, 2),
    type: "followup_silencio",
    note: "Sem resposta; primeira retomada em D+2.",
  };
}

export function nextActionAfterOutbound(input: {
  responseType: ResponseType;
  occurredAt: string;
  outboundCount: number;
}): NextActionPlan {
  if (input.responseType === "perdido") {
    return { at: null, type: null, note: "Sem interesse; nenhuma retomada automatica." };
  }
  if (input.responseType === "bot") {
    if (input.outboundCount >= 4) {
      return { at: null, type: null, note: "Cadencia de bot concluida em D+21." };
    }
    return {
      at: addDays(input.occurredAt, 7),
      type: "followup_bot",
      note: "Contato ainda em atendimento automatico; nova retomada em 7 dias.",
    };
  }

  const interval = input.outboundCount <= 1 ? 2 : input.outboundCount === 2 ? 3 : input.outboundCount === 3 ? 5 : null;
  if (interval === null) {
    return { at: null, type: null, note: "Cadencia de silencio concluida apos M3." };
  }
  return {
    at: addDays(input.occurredAt, interval),
    type: "followup_silencio",
    note:
      input.outboundCount <= 1
        ? "Sem resposta; primeira retomada em D+2."
        : input.outboundCount === 2
          ? "M1 enviado; proxima retomada em D+5."
          : "M2 enviado; breakup em D+10.",
  };
}

export function classificationUpdate(
  responseType: ResponseType,
  occurredAt: string,
  currentNextActionSource?: "automatic" | "manual" | null,
) {
  if (currentNextActionSource === "manual") {
    return {
      responseType,
      responseTypeSource: "manual" as const,
    };
  }
  const plan = nextActionAfterInbound(responseType, occurredAt);
  return {
    responseType,
    responseTypeSource: "manual" as const,
    nextActionAt: plan.at,
    nextActionType: plan.type,
    nextActionNote: plan.note,
    nextActionSource: "automatic" as const,
  };
}

export function normalizeClientActivityType(type: string) {
  return type === "whatsapp_sent" ? "whatsapp_opened" : type;
}

export function resolveNextActionAt(
  manualAt: string | null | undefined,
  recommendedAt: string | null,
) {
  return manualAt || recommendedAt;
}

export function queueSectionForDeal(
  deal: {
    responseType: ResponseType;
    phone?: string | null;
    nextActionAt?: string | null;
    nextActionType?: NextActionType | null;
    nextActionSource?: "automatic" | "manual" | null;
    lastInboundAt?: string | null;
    lastOutboundAt?: string | null;
  },
  nowIso = new Date().toISOString(),
): QueueSection {
  if (!deal.phone || (!deal.nextActionAt && deal.responseType !== "perdido")) {
    return "dados_inconsistentes";
  }
  const nextAction = deal.nextActionAt ? new Date(deal.nextActionAt).getTime() : Number.POSITIVE_INFINITY;
  const now = new Date(nowIso).getTime();
  if (deal.nextActionSource === "manual" && nextAction > now) {
    return "aguardando_cadencia";
  }
  if (
    deal.nextActionType === "contactar_responsavel" &&
    nextAction <= now
  ) {
    return "encaminhamentos";
  }
  const inboundAlreadyHandled = Boolean(
    deal.lastInboundAt &&
      deal.lastOutboundAt &&
      new Date(deal.lastOutboundAt).getTime() >= new Date(deal.lastInboundAt).getTime(),
  );
  if (!inboundAlreadyHandled && (deal.responseType === "humana" || deal.responseType === "objecao")) {
    return "responder_agora";
  }
  if (!inboundAlreadyHandled && deal.responseType === "encaminhamento") return "encaminhamentos";

  if (deal.responseType === "bot" && nextAction <= now) return "bots_d7";
  if (nextAction <= now) return "followups_vencidos";
  return "aguardando_cadencia";
}

export function messageCompanyMismatch(
  message: string,
  dealCompany: string,
  knownCompanies: string[],
) {
  const normalizedMessage = foldText(message);
  const normalizedDeal = foldText(dealCompany);
  for (const company of knownCompanies) {
    const normalizedCompany = foldText(company);
    if (normalizedCompany.length < 4 || normalizedCompany === normalizedDeal) continue;
    if (normalizedMessage.includes(normalizedCompany)) return company;
  }
  return null;
}

export function tierForDays(days: number | null): FollowupTier {
  if (days === null) return "M1";
  if (days < 2) return "aguardar";
  if (days <= 4) return "M1";
  if (days <= 9) return "M2";
  return "M3";
}

// Case real por segmento. Mesma regra da msg 1: so citar o que sera REALMENTE enviado.
// Usinagem e caldeiraria -> Metalthec (fabricacao e usinagem). Resto -> Jotta (manutencao).
// Nome comercial gigante repetido inteiro soa robotico ("USYTEC Servicos de Usinagem,
// Ferramentaria e Tornearia em Santo Andre, SP"). Corta no primeiro separador.
export function nomeCurto(company: string) {
  return company.split(/[|\-–,]/)[0].trim().split(/\s+/).slice(0, 4).join(" ") || company;
}

export function casoDoSegmento(segment?: string | null) {
  return segment === "usinagem" || segment === "caldeiraria"
    ? "uma metalúrgica de usinagem de precisão"
    : "uma empresa de manutenção industrial";
}

// Textos alinhados a copy aprovada em 31/07: sem "diagnostico" e sem "leitura de 2
// minutos", zero apontamento de falha, e o CTA sempre nomeia o que chega depois do sim.
export function followupMessage(
  tier: Exclude<FollowupTier, "aguardar">,
  companyRaw: string,
  responseType: ResponseType = "sem_resposta",
  segment?: string | null,
) {
  const company = nomeCurto(companyRaw);
  if (responseType === "bot") {
    return `Oi! Imagino que minha mensagem tenha caído no atendimento automático. Quem cuida do site da ${company} aí? Prefiro falar direto com essa pessoa pra não gerar retrabalho pra vocês.`;
  }
  if (tier === "M1") {
    return `Oi, Erick de novo. Te escrevi sobre a ${company} esses dias e imagino que tenha passado batido na correria. Só retomando: separei um exemplo de página que faz o comprador chegar já com o pedido definido. Quer que eu mande?`;
  }
  if (tier === "M2") {
    return `Oi! Um contexto rápido: fiz isso pra ${casoDoSegmento(segment)}, que atende indústria como vocês. O ponto era o mesmo, serviço bom e o comprador sem achar prova disso na internet. Te mando como ficou?`;
  }
  return `Oi! Vou parar de te escrever pra não virar chateação. Fica o registro: se um dia fizer sentido olhar como a ${company} aparece pra quem procura antes de pedir orçamento, é só me chamar aqui. Sucesso aí!`;
}
