export const DEMAND_STATUSES = ["todo", "in_progress", "review", "done", "cancelled"] as const;
export const DEMAND_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const DEMAND_DESTINATIONS = [
  "instagram",
  "site",
  "whatsapp",
  "ads",
  "presentation",
  "drive",
  "other",
] as const;

/**
 * Regime de cobranca da demanda. Pontual entra uma vez, na competencia escolhida;
 * mensal repete todo mes a partir dela ate billingUntil (ou para sempre); parcelado
 * quebra o valor em parcelas, cada uma com mes proprio e baixa propria.
 */
export const DEMAND_BILLING_TYPES = ["one_off", "installment", "monthly"] as const;

export const DEMAND_ATTACHMENTS_BUCKET = "demand-attachments";
export const DEFAULT_MAX_DEMAND_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const DEMAND_TIME_ZONE = "America/Sao_Paulo";

export type DemandStatus = (typeof DEMAND_STATUSES)[number];
export type DemandPriority = (typeof DEMAND_PRIORITIES)[number];
export type DemandDestination = (typeof DEMAND_DESTINATIONS)[number];
export type DemandBillingType = (typeof DEMAND_BILLING_TYPES)[number];
export type DemandScheduleGroup = "overdue" | "today" | "upcoming" | "no_due" | "completed";

// Rotulos unicos da operacao. Ficam aqui para a pagina, o workspace e os scripts
// lerem do mesmo lugar em vez de duplicar a copy em cada arquivo.
export const DEMAND_STATUS_LABELS: Record<DemandStatus, string> = {
  todo: "A iniciar",
  in_progress: "Criando",
  review: "Em aprovacao",
  done: "Entregue",
  cancelled: "Cancelada",
};

export const DEMAND_PRIORITY_LABELS: Record<DemandPriority, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export const DEMAND_DESTINATION_LABELS: Record<DemandDestination, string> = {
  instagram: "Instagram",
  site: "Site",
  whatsapp: "WhatsApp",
  ads: "Anuncios",
  presentation: "Apresentacao",
  drive: "Drive",
  other: "Outro",
};

export const DEMAND_BILLING_LABELS: Record<DemandBillingType, string> = {
  one_off: "Pontual",
  installment: "Parcelado",
  monthly: "Mensal",
};

export const MAX_DEMAND_INSTALLMENTS = 60;

export const DEMAND_CLOSED_STATUSES: readonly DemandStatus[] = ["done", "cancelled"];

export function isClosedDemand(demand: { status: DemandStatus }) {
  return DEMAND_CLOSED_STATUSES.includes(demand.status);
}

export type DemandClient = {
  id: number;
  name: string;
  cnpj: string | null;
  status: string | null;
};

export type DemandDeal = {
  id: number;
  company: string;
  name?: string | null;
  title?: string | null;
  stage?: string | null;
  status?: string | null;
  owner?: string | null;
  assignee?: string | null;
  value?: number | null;
};

export type DemandChecklistItem = {
  id: number;
  demandId: number;
  title: string;
  isDone: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type DemandLink = {
  id: number;
  demandId: number;
  label: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

export type DemandAttachment = {
  id: number;
  demandId: number;
  fileName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

/**
 * Uma cobranca da demanda: mes, valor e baixa. Pontual tem uma, parcelado tem N,
 * mensal ganha uma por mes conforme voce da baixa.
 */
export type DemandCharge = {
  id: number;
  demandId: number;
  /** 1..N, na ordem de cobranca. No mensal, a distancia em meses desde a competencia. */
  number: number;
  billingMonth: string;
  value: number;
  /** Nulo enquanto nao entrou o dinheiro. */
  paidAt: string | null;
};

export type DemandEvent = {
  id: number;
  demandId: number;
  actor: string;
  eventType: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ClientDemand = {
  id: number;
  dealId: number | null;
  /** Dono da demanda no cadastro de clientes. O deal continua junto so como origem. */
  clientId: number | null;
  /** Pasta da arvore de organizacao; nulo = "Sem pasta". O caminho vem de demandTreePath. */
  folderId: number | null;
  title: string;
  description: string;
  copyText: string;
  status: DemandStatus;
  priority: DemandPriority;
  assignee: string;
  destinationType: DemandDestination;
  destinationLabel: string;
  /** Quanto essa entrega vale. Zero = ainda nao precificada. */
  value: number;
  billingType: DemandBillingType;
  /** Competencia "YYYY-MM" escolhida na mao; nula cai no mes do prazo. */
  billingMonth: string | null;
  /** Ultimo mes de uma recorrencia. Nulo = segue rodando. */
  billingUntil: string | null;
  startsAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Cobrancas ja registradas: parcelas do parcelado, ou os meses ja baixados. */
  charges: DemandCharge[];
  client: DemandClient | null;
  deal: DemandDeal | null;
  checklistItems: DemandChecklistItem[];
  links: DemandLink[];
  attachments: DemandAttachment[];
  events: DemandEvent[];
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function firstRecord(value: unknown): UnknownRecord {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function isDemandStatus(value: unknown): value is DemandStatus {
  return typeof value === "string" && (DEMAND_STATUSES as readonly string[]).includes(value);
}

export function isDemandPriority(value: unknown): value is DemandPriority {
  return typeof value === "string" && (DEMAND_PRIORITIES as readonly string[]).includes(value);
}

export function isDemandDestination(value: unknown): value is DemandDestination {
  return typeof value === "string" && (DEMAND_DESTINATIONS as readonly string[]).includes(value);
}

export function isDemandBillingType(value: unknown): value is DemandBillingType {
  return typeof value === "string" && (DEMAND_BILLING_TYPES as readonly string[]).includes(value);
}

/** Competencia no formato "YYYY-MM" - o mesmo que o input type="month" devolve. */
export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function isEligibleDemandDeal(deal: { stage?: unknown; status?: unknown } | null | undefined) {
  return deal?.stage === "won" || deal?.status === "won";
}

/** Nome que aparece na tela: o cadastro manda, o deal e so o historico de origem. */
export function demandClientName(
  demand: { client?: { name?: string | null } | null; deal?: { company?: string | null } | null },
) {
  return demand.client?.name || demand.deal?.company || "Cliente removido";
}

function dateKeyInTimeZone(value: Date, timeZone = DEMAND_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function groupDemandBySchedule(
  demand: { status: DemandStatus; dueAt?: string | null },
  now = new Date(),
): DemandScheduleGroup {
  if (demand.status === "done" || demand.status === "cancelled") return "completed";
  if (!demand.dueAt) return "no_due";
  const due = new Date(demand.dueAt);
  if (Number.isNaN(due.getTime())) return "no_due";
  const dueKey = dateKeyInTimeZone(due);
  const todayKey = dateKeyInTimeZone(now);
  if (dueKey < todayKey) return "overdue";
  if (dueKey === todayKey) return "today";
  return "upcoming";
}

/** So a parte de cobranca da demanda - o que as somas de fato leem. */
export type BillableDemand = Pick<
  ClientDemand,
  "status" | "value" | "billingType" | "billingMonth" | "billingUntil" | "dueAt" | "createdAt"
> & { charges?: DemandCharge[] };

/**
 * Quebra o total em N parcelas mensais consecutivas a partir de startMonth.
 * A sobra de centavos vai para a PRIMEIRA parcela, como faz maquininha e boleto:
 * 1000 em 3x = 333,34 + 333,33 + 333,33.
 */
export function buildInstallments(total: number, count: number, startMonth: string) {
  const parcels = Math.trunc(count);
  if (!Number.isInteger(parcels) || parcels < 1 || parcels > MAX_DEMAND_INSTALLMENTS) {
    throw new Error(`Numero de parcelas invalido. Use de 1 a ${MAX_DEMAND_INSTALLMENTS}.`);
  }
  if (!isMonthKey(startMonth)) throw new Error("Mes da primeira parcela invalido.");

  const cents = Math.round((Number.isFinite(total) ? total : 0) * 100);
  const base = Math.floor(cents / parcels);
  const remainder = cents - base * parcels;

  return Array.from({ length: parcels }, (_, index) => ({
    number: index + 1,
    billingMonth: shiftMonthKey(startMonth, index),
    value: (base + (index === 0 ? remainder : 0)) / 100,
  }));
}

/** Cobrancas que caem no mes consultado. */
export function chargesInMonth(demand: BillableDemand, monthKey: string) {
  return (demand.charges ?? []).filter((item) => item.billingMonth === monthKey);
}

export function monthKeyFromIso(value: string | null | undefined, timeZone = DEMAND_TIME_ZONE) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dateKeyInTimeZone(date, timeZone).slice(0, 7);
}

export function currentMonthKey(now = new Date(), timeZone = DEMAND_TIME_ZONE) {
  return dateKeyInTimeZone(now, timeZone).slice(0, 7);
}

/** Distancia em meses entre duas competencias (negativa se o alvo for anterior). */
export function monthsBetween(fromMonth: string, toMonth: string) {
  if (!isMonthKey(fromMonth) || !isMonthKey(toMonth)) return 0;
  const [fromYear, fromMonthNumber] = fromMonth.split("-").map(Number);
  const [toYear, toMonthNumber] = toMonth.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonthNumber - fromMonthNumber);
}

export function shiftMonthKey(monthKey: string, months: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const total = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(total / 12);
  const nextMonth = total % 12 + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

export function formatMonthKeyLabel(monthKey: string) {
  if (!isMonthKey(monthKey)) return monthKey;
  const label = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "short", year: "numeric" })
    .format(new Date(`${monthKey}-01T12:00:00Z`));
  return label.replace(".", "");
}

/**
 * Competencia da demanda: o campo escolhido na mao vence; sem ele cai no mes do prazo
 * e, se nem prazo houver, no mes em que a demanda foi criada.
 */
export function demandBillingMonth(demand: BillableDemand) {
  return demand.billingMonth ?? monthKeyFromIso(demand.dueAt) ?? monthKeyFromIso(demand.createdAt);
}

/** Mensal viva no mes consultado - a parcela de MRR que esse mes carrega. */
export function isRecurringInMonth(demand: BillableDemand, monthKey: string) {
  if (demand.billingType !== "monthly" || demand.status === "cancelled") return false;
  const start = demandBillingMonth(demand);
  if (start && monthKey < start) return false;
  if (demand.billingUntil && monthKey > demand.billingUntil) return false;
  return true;
}

/** Demanda cancelada nao fatura; pontual entra so na competencia dela. */
export function demandBillsInMonth(demand: BillableDemand, monthKey: string) {
  if (demand.status === "cancelled") return false;
  if (demand.billingType === "monthly") return isRecurringInMonth(demand, monthKey);
  if (demand.billingType === "installment") return chargesInMonth(demand, monthKey).length > 0;
  return demandBillingMonth(demand) === monthKey;
}

export function demandValueInMonth(demand: BillableDemand, monthKey: string) {
  if (demand.status === "cancelled") return 0;
  // No parcelado quem manda e a parcela: o valor do mes e o que vence nele, nao o total.
  if (demand.billingType === "installment") {
    return chargesInMonth(demand, monthKey).reduce((total, item) => total + item.value, 0);
  }
  return demandBillsInMonth(demand, monthKey) ? demand.value : 0;
}

/** True quando a cobranca daquele mes ja foi baixada. Vale nos tres regimes. */
export function isMonthPaid(demand: BillableDemand, monthKey: string) {
  if (demand.status === "cancelled") return false;
  const charges = chargesInMonth(demand, monthKey);
  if (charges.length === 0) return false;
  return charges.every((item) => Boolean(item.paidAt));
}

/**
 * Do que cai no mes, quanto ja entrou.
 * No parcelado soma parcela por parcela (pode ter mes com duas). Em pontual e mensal a
 * cobranca e so o registro da baixa: o valor lido e o da demanda hoje, para o recebido
 * nao ficar preso a um preco que ja mudou.
 */
export function demandPaidInMonth(demand: BillableDemand, monthKey: string) {
  if (demand.status === "cancelled") return 0;
  if (demand.billingType === "installment") {
    return chargesInMonth(demand, monthKey)
      .filter((item) => item.paidAt)
      .reduce((total, item) => total + item.value, 0);
  }
  return isMonthPaid(demand, monthKey) ? demandValueInMonth(demand, monthKey) : 0;
}

/**
 * Meses ja vencidos de uma mensal, do mais novo para o mais antigo, para a tela de
 * baixa. Nao lista mes futuro: nao se da baixa no que ainda nem foi cobrado.
 */
export function recurringMonthsUntil(demand: BillableDemand, monthKey = currentMonthKey(), limit = 12) {
  const start = demandBillingMonth(demand);
  if (!start || demand.billingType !== "monthly") return [];
  const last = demand.billingUntil && demand.billingUntil < monthKey ? demand.billingUntil : monthKey;
  const span = monthsBetween(start, last);
  if (span < 0) return [];
  return Array.from({ length: Math.min(span + 1, limit) }, (_, index) => shiftMonthKey(last, -index));
}

/** Resumo do parcelamento para a tela: 1 de 3 pagas, R$ 1.000,00 em aberto. */
export function installmentSummary(demand: BillableDemand) {
  const items = demand.charges ?? [];
  const paid = items.filter((item) => item.paidAt);
  return {
    count: items.length,
    paidCount: paid.length,
    paidValue: paid.reduce((total, item) => total + item.value, 0),
    openValue: items.filter((item) => !item.paidAt).reduce((total, item) => total + item.value, 0),
    total: items.reduce((total, item) => total + item.value, 0),
    nextOpen: items.filter((item) => !item.paidAt).sort((left, right) => left.number - right.number)[0] ?? null,
  };
}

export function sumDemandValues(demands: BillableDemand[], monthKey: string) {
  return demands.reduce((total, demand) => total + demandValueInMonth(demand, monthKey), 0);
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatDemandCurrency(value: number) {
  return BRL.format(Number.isFinite(value) ? value : 0);
}

/**
 * Aceita numero, "1500.50" e o formato que o teclado brasileiro produz ("1.500,50").
 * Vazio vira zero: demanda sem preco e um estado legitimo, nao um erro.
 */
export function parseDemandValue(value: unknown, field = "Valor") {
  if (value === null || value === undefined || value === "") return 0;
  let parsed: number;
  if (typeof value === "number") {
    parsed = value;
  } else {
    const text = String(value).trim().replace(/[R$\s]/gi, "");
    parsed = Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
  }
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} invalido.`);
  if (parsed > 99_999_999.99) throw new Error(`${field} excede o limite.`);
  return Math.round(parsed * 100) / 100;
}

export function nullableMonthKey(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  if (!isMonthKey(value)) throw new Error(`${field} invalido. Use o formato AAAA-MM.`);
  return value;
}

function dateKeyToUtcNoon(dateKey: string) {
  // Meio-dia UTC mantem o mesmo dia do calendario em America/Sao_Paulo (UTC-3).
  return new Date(`${dateKey}T12:00:00Z`);
}

function shiftDateKey(dateKey: string, days: number, timeZone = DEMAND_TIME_ZONE) {
  return dateKeyInTimeZone(new Date(dateKeyToUtcNoon(dateKey).getTime() + days * 86400000), timeZone);
}

export function formatDemandDayLabel(dateKey: string, todayKey: string, timeZone = DEMAND_TIME_ZONE) {
  const date = dateKeyToUtcNoon(dateKey);
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "short" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const dateLabel = `${part("day")} ${part("month").replace(".", "")}`;

  if (dateKey === todayKey) return { weekday: "Hoje", dateLabel };
  if (dateKey === shiftDateKey(todayKey, 1, timeZone)) return { weekday: "Amanha", dateLabel };
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "long" }).format(date);
  return { weekday: weekday.charAt(0).toLocaleUpperCase("pt-BR") + weekday.slice(1), dateLabel };
}

export type DemandOverviewDay = {
  dateKey: string;
  weekday: string;
  dateLabel: string;
  demands: ClientDemand[];
};

export type DemandOverview = {
  windowDays: number;
  overdue: ClientDemand[];
  days: DemandOverviewDay[];
  noDue: ClientDemand[];
  completed: ClientDemand[];
  beyondWindow: number;
  scheduledTotal: number;
};

const PRIORITY_RANK: Record<DemandPriority, number> = { urgent: 3, high: 2, normal: 1, low: 0 };

function compareDemands(left: ClientDemand, right: ClientDemand) {
  const byDue = (left.dueAt ?? "").localeCompare(right.dueAt ?? "");
  if (byDue !== 0) return byDue;
  const byPriority = PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority];
  if (byPriority !== 0) return byPriority;
  return left.id - right.id;
}

/** Entregue mais recente primeiro; sem data de conclusao cai na ordem normal de prazo. */
function compareCompletedDemands(left: ClientDemand, right: ClientDemand) {
  const byCompleted = (right.completedAt ?? "").localeCompare(left.completedAt ?? "");
  if (byCompleted !== 0) return byCompleted;
  return compareDemands(left, right);
}

/**
 * Recorta as demandas na janela do Overview: atrasadas primeiro, depois um bucket
 * por dia dentro da janela, o que nao tem prazo e a contagem do que fica alem dela.
 *
 * Entregue e cancelada nunca entram em atrasadas nem nas contagens: se o prazo delas
 * cai dentro da janela ficam no dia (a demanda nao pula de lugar quando voce marca
 * entregue), e o resto vai para o bucket `completed`. Sem isso toda entrega antiga
 * voltava para o topo como atrasada e a tela virava lixo em duas semanas.
 */
export function buildDemandOverview(
  demands: ClientDemand[],
  options: { windowDays?: number; now?: Date; timeZone?: string } = {},
): DemandOverview {
  const windowDays = Math.max(1, Math.trunc(options.windowDays ?? 7));
  const timeZone = options.timeZone ?? DEMAND_TIME_ZONE;
  const todayKey = dateKeyInTimeZone(options.now ?? new Date(), timeZone);
  const lastKey = shiftDateKey(todayKey, windowDays - 1, timeZone);

  const overdue: ClientDemand[] = [];
  const noDue: ClientDemand[] = [];
  const completed: ClientDemand[] = [];
  const byDay = new Map<string, ClientDemand[]>();
  let beyondWindow = 0;

  for (const demand of demands) {
    const closed = isClosedDemand(demand);
    const due = demand.dueAt ? new Date(demand.dueAt) : null;
    const dueKey = due && !Number.isNaN(due.getTime()) ? dateKeyInTimeZone(due, timeZone) : null;

    if (!dueKey) {
      if (closed) completed.push(demand);
      else noDue.push(demand);
      continue;
    }
    if (dueKey < todayKey) {
      if (closed) completed.push(demand);
      else overdue.push(demand);
    } else if (dueKey <= lastKey) {
      const bucket = byDay.get(dueKey);
      if (bucket) bucket.push(demand);
      else byDay.set(dueKey, [demand]);
    } else if (closed) {
      completed.push(demand);
    } else {
      beyondWindow += 1;
    }
  }

  overdue.sort(compareDemands);
  noDue.sort(compareDemands);
  completed.sort(compareCompletedDemands);

  const days = Array.from(byDay.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([dateKey, items]) => ({
      dateKey,
      ...formatDemandDayLabel(dateKey, todayKey, timeZone),
      demands: items.sort(compareDemands),
    }));

  const scheduledInDays = days.reduce(
    (total, day) => total + day.demands.filter((demand) => !isClosedDemand(demand)).length,
    0,
  );

  return {
    windowDays,
    overdue,
    days,
    noDue,
    completed,
    beyondWindow,
    scheduledTotal: overdue.length + scheduledInDays,
  };
}

export function transitionDemandStatus(
  _currentStatus: DemandStatus,
  nextStatus: DemandStatus,
  nowIso = new Date().toISOString(),
) {
  return {
    status: nextStatus,
    completedAt: nextStatus === "done" ? nowIso : null,
  };
}

export function checklistProgress(items: Array<{ isDone: boolean }>) {
  const total = items.length;
  const completed = items.filter((item) => item.isDone).length;
  return {
    completed,
    total,
    percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export function normalizeHttpUrl(value: string) {
  const candidate = value.trim();
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Informe uma URL valida.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("O link deve usar http ou https.");
  }
  return url.toString();
}

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "text/csv",
  "text/plain",
]);

export function validateDemandAttachment(
  input: { fileName: string; mimeType: string; sizeBytes: number },
  maxBytes = DEFAULT_MAX_DEMAND_ATTACHMENT_BYTES,
) {
  const fileName = input.fileName.trim();
  const mimeType = input.mimeType.trim().toLowerCase();
  const sizeBytes = Number(input.sizeBytes);
  if (!fileName || fileName.length > 240) throw new Error("Nome de arquivo invalido.");
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) throw new Error("Tamanho de arquivo invalido.");
  if (sizeBytes > maxBytes) throw new Error(`O anexo excede o limite de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const allowed = mimeType.startsWith("image/") || mimeType.startsWith("video/") || DOCUMENT_MIME_TYPES.has(mimeType);
  if (!allowed) throw new Error("Tipo de arquivo nao permitido.");
  return { fileName, mimeType, sizeBytes };
}

export function safeDemandFileName(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-160);
  return normalized || "arquivo";
}

export function demandStoragePath(demandId: number, fileName: string, nonce: string) {
  if (!Number.isInteger(demandId) || demandId <= 0) throw new Error("demandId invalido.");
  const safeNonce = nonce.replace(/[^a-zA-Z0-9-]/g, "");
  if (!safeNonce) throw new Error("Identificador de upload invalido.");
  return `${demandId}/${safeNonce}-${safeDemandFileName(fileName)}`;
}

function mapDeal(value: unknown): DemandDeal | null {
  const row = firstRecord(value);
  const id = asNumber(row.id);
  if (!id) return null;
  return {
    id,
    company: asString(row.company, asString(row.name, `Deal #${id}`)),
    name: asNullableString(row.name),
    title: asNullableString(row.title),
    stage: asNullableString(row.stage),
    status: asNullableString(row.status),
    owner: asNullableString(row.owner),
    assignee: asNullableString(row.assignee),
    value: row.value == null ? null : asNumber(row.value),
  };
}

function mapClient(value: unknown): DemandClient | null {
  const row = firstRecord(value);
  const id = asNumber(row.id);
  if (!id) return null;
  return {
    id,
    name: asString(row.name, `Cliente #${id}`),
    cnpj: asNullableString(row.cnpj),
    status: asNullableString(row.status),
  };
}

function mapChecklist(value: unknown): DemandChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = asRecord(item);
    return {
      id: asNumber(row.id),
      demandId: asNumber(row.demand_id),
      title: asString(row.title),
      isDone: Boolean(row.is_done),
      position: asNumber(row.position),
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
    };
  }).sort((left, right) => left.position - right.position || left.id - right.id);
}

function mapCharges(value: unknown): DemandCharge[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = asRecord(item);
    return {
      id: asNumber(row.id),
      demandId: asNumber(row.demand_id),
      number: asNumber(row.number),
      billingMonth: asString(row.billing_month),
      value: asNumber(row.value),
      paidAt: asNullableString(row.paid_at),
    };
  }).sort((left, right) => left.number - right.number);
}

function mapLinks(value: unknown): DemandLink[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = asRecord(item);
    return {
      id: asNumber(row.id),
      demandId: asNumber(row.demand_id),
      label: asString(row.label),
      url: asString(row.url),
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
    };
  });
}

function mapAttachments(value: unknown): DemandAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = asRecord(item);
    return {
      id: asNumber(row.id),
      demandId: asNumber(row.demand_id),
      fileName: asString(row.file_name),
      storagePath: asString(row.storage_path),
      mimeType: asString(row.mime_type),
      sizeBytes: asNumber(row.size_bytes),
      createdAt: asString(row.created_at),
    };
  });
}

function mapEvents(value: unknown): DemandEvent[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = asRecord(item);
    return {
      id: asNumber(row.id),
      demandId: asNumber(row.demand_id),
      actor: asString(row.actor, "Operador"),
      eventType: asString(row.event_type, "updated"),
      description: asString(row.description),
      metadata: asRecord(row.metadata),
      createdAt: asString(row.created_at),
    };
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function mapClientDemand(value: unknown): ClientDemand {
  const row = asRecord(value);
  return {
    id: asNumber(row.id),
    dealId: row.deal_id == null ? null : asNumber(row.deal_id),
    clientId: row.client_id == null ? null : asNumber(row.client_id),
    folderId: row.folder_id == null ? null : asNumber(row.folder_id),
    title: asString(row.title),
    description: asString(row.description),
    copyText: asString(row.copy_text),
    status: isDemandStatus(row.status) ? row.status : "todo",
    priority: isDemandPriority(row.priority) ? row.priority : "normal",
    assignee: asString(row.assignee),
    destinationType: isDemandDestination(row.destination_type) ? row.destination_type : "other",
    destinationLabel: asString(row.destination_label),
    value: asNumber(row.value),
    billingType: isDemandBillingType(row.billing_type) ? row.billing_type : "one_off",
    billingMonth: isMonthKey(row.billing_month) ? row.billing_month : null,
    billingUntil: isMonthKey(row.billing_until) ? row.billing_until : null,
    startsAt: asNullableString(row.starts_at),
    dueAt: asNullableString(row.due_at),
    completedAt: asNullableString(row.completed_at),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    charges: mapCharges(row.charges),
    client: mapClient(row.client),
    deal: mapDeal(row.deal),
    checklistItems: mapChecklist(row.checklist_items),
    links: mapLinks(row.links),
    attachments: mapAttachments(row.attachments),
    events: mapEvents(row.events),
  };
}
