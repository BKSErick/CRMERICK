// Cadastro de clientes. Puro (sem Supabase, sem React) para a tela, as rotas e os
// testes lerem as mesmas regras. Import relativo com extensao nos libs que os testes
// carregam direto em `node --test`.
import {
  currentMonthKey,
  demandPaidInMonth,
  demandValueInMonth,
  isClosedDemand,
  isRecurringInMonth,
  type ClientDemand,
} from "./clientDemands.ts";

export const CLIENT_STATUSES = ["active", "paused", "churned"] as const;
export const CLIENT_SOURCES = ["manual", "pipeline", "vault"] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export type ClientSource = (typeof CLIENT_SOURCES)[number];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Ativo",
  paused: "Pausado",
  churned: "Encerrado",
};

export const CLIENT_SOURCE_LABELS: Record<ClientSource, string> = {
  manual: "Cadastro manual",
  pipeline: "Ganho no pipeline",
  vault: "Carteira",
};

export type Client = {
  id: number;
  dealId: number | null;
  name: string;
  legalName: string;
  /** So digitos, ou null. A formatacao e da tela. */
  cnpj: string | null;
  stateRegistration: string;
  municipalRegistration: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  representativeName: string;
  representativeDocument: string;
  segment: string;
  notes: string;
  status: ClientStatus;
  source: ClientSource;
  createdAt: string;
  updatedAt: string;
};

export type ClientTotals = {
  demands: number;
  openDemands: number;
  overdueDemands: number;
  /** Demandas que caem no mes consultado (pontual da competencia, parcela do mes, mensal ativa). */
  monthDemands: number;
  monthValue: number;
  /** Do valor do mes, quanto ja entrou. So parcela tem baixa hoje. */
  monthPaidValue: number;
  /** Soma das mensais vivas no mes consultado: o MRR do cliente. */
  recurringValue: number;
  /** Tudo que ja foi cobrado desse cliente, somando cada mes de recorrencia. */
  contractedValue: number;
  lastDueAt: string | null;
};

export type ClientWithTotals = Client & { totals: ClientTotals };

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function isClientStatus(value: unknown): value is ClientStatus {
  return typeof value === "string" && (CLIENT_STATUSES as readonly string[]).includes(value);
}

export function isClientSource(value: unknown): value is ClientSource {
  return typeof value === "string" && (CLIENT_SOURCES as readonly string[]).includes(value);
}

/** Deixa so os digitos. String vazia vira null: coluna sem CNPJ nao entra no indice unico. */
export function normalizeCnpj(value: unknown): string | null {
  const digits = typeof value === "string" || typeof value === "number"
    ? String(value).replace(/[^0-9]/g, "")
    : "";
  return digits ? digits : null;
}

/**
 * Digito verificador do CNPJ. Um numero errado so aparece na hora de emitir a nota,
 * entao a validacao acontece no cadastro.
 */
export function isValidCnpj(value: unknown): boolean {
  const digits = normalizeCnpj(value);
  if (!digits || digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const checkDigit = (length: number) => {
    let weight = length - 7;
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * weight;
      weight -= 1;
      if (weight < 2) weight = 9;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return checkDigit(12) === Number(digits[12]) && checkDigit(13) === Number(digits[13]);
}

export function formatCnpj(value: string | null | undefined) {
  const digits = normalizeCnpj(value);
  if (!digits || digits.length !== 14) return digits ?? "";
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function mapClient(value: unknown): Client {
  const row = asRecord(value);
  const id = asNumber(row.id);
  return {
    id,
    dealId: row.deal_id == null ? (row.dealId == null ? null : asNumber(row.dealId)) : asNumber(row.deal_id),
    name: asString(row.name, `Cliente #${id}`),
    legalName: asString(row.legal_name ?? row.legalName),
    cnpj: normalizeCnpj(row.cnpj),
    stateRegistration: asString(row.state_registration ?? row.stateRegistration),
    municipalRegistration: asString(row.municipal_registration ?? row.municipalRegistration),
    email: asString(row.email),
    phone: asString(row.phone),
    address: asString(row.address),
    city: asString(row.city),
    state: asString(row.state),
    zipCode: asString(row.zip_code ?? row.zipCode),
    representativeName: asString(row.representative_name ?? row.representativeName),
    representativeDocument: asString(row.representative_document ?? row.representativeDocument),
    segment: asString(row.segment),
    notes: asString(row.notes),
    status: isClientStatus(row.status) ? row.status : "active",
    source: isClientSource(row.source) ? row.source : "manual",
    createdAt: asString(row.created_at ?? row.createdAt),
    updatedAt: asString(row.updated_at ?? row.updatedAt),
  };
}

/**
 * Numeros de um cliente no mes consultado. A demanda e a unidade de cobranca:
 * o valor de fechamento da primeira venda continua no deal, o resto vive aqui.
 */
export function clientTotals(
  demands: ClientDemand[],
  monthKey = currentMonthKey(),
  now = new Date(),
): ClientTotals {
  const nowIso = now.toISOString();
  let openDemands = 0;
  let overdueDemands = 0;
  let monthDemands = 0;
  let monthValue = 0;
  let monthPaidValue = 0;
  let recurringValue = 0;
  let contractedValue = 0;
  let lastDueAt: string | null = null;

  for (const demand of demands) {
    if (!isClosedDemand(demand)) {
      openDemands += 1;
      if (demand.dueAt && demand.dueAt < nowIso) overdueDemands += 1;
    }
    const inMonth = demandValueInMonth(demand, monthKey);
    if (inMonth > 0) {
      monthDemands += 1;
      monthValue += inMonth;
      monthPaidValue += demandPaidInMonth(demand, monthKey);
    }
    if (isRecurringInMonth(demand, monthKey)) recurringValue += demand.value;
    contractedValue += demand.status === "cancelled" ? 0 : demand.value;
    if (demand.dueAt && (!lastDueAt || demand.dueAt > lastDueAt)) lastDueAt = demand.dueAt;
  }

  return {
    demands: demands.length,
    openDemands,
    overdueDemands,
    monthDemands,
    monthValue,
    monthPaidValue,
    recurringValue,
    contractedValue,
    lastDueAt,
  };
}

/** Compara nomes ignorando acento, caixa e espaco duplo - o dedup do cadastro. */
export function normalizeClientName(value: string) {
  return value
    .normalize("NFD")
    .replace(new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g"), "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}
