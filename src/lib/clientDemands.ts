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

export const DEMAND_ATTACHMENTS_BUCKET = "demand-attachments";
export const DEFAULT_MAX_DEMAND_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const DEMAND_TIME_ZONE = "America/Sao_Paulo";

export type DemandStatus = (typeof DEMAND_STATUSES)[number];
export type DemandPriority = (typeof DEMAND_PRIORITIES)[number];
export type DemandDestination = (typeof DEMAND_DESTINATIONS)[number];
export type DemandScheduleGroup = "overdue" | "today" | "upcoming" | "no_due" | "completed";

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
  title: string;
  description: string;
  copyText: string;
  status: DemandStatus;
  priority: DemandPriority;
  assignee: string;
  destinationType: DemandDestination;
  destinationLabel: string;
  startsAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

export function isEligibleDemandDeal(deal: { stage?: unknown; status?: unknown } | null | undefined) {
  return deal?.stage === "won" || deal?.status === "won";
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
    title: asString(row.title),
    description: asString(row.description),
    copyText: asString(row.copy_text),
    status: isDemandStatus(row.status) ? row.status : "todo",
    priority: isDemandPriority(row.priority) ? row.priority : "normal",
    assignee: asString(row.assignee),
    destinationType: isDemandDestination(row.destination_type) ? row.destination_type : "other",
    destinationLabel: asString(row.destination_label),
    startsAt: asNullableString(row.starts_at),
    dueAt: asNullableString(row.due_at),
    completedAt: asNullableString(row.completed_at),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deal: mapDeal(row.deal),
    checklistItems: mapChecklist(row.checklist_items),
    links: mapLinks(row.links),
    attachments: mapAttachments(row.attachments),
    events: mapEvents(row.events),
  };
}
