import type { Deal, DealStage } from "./crmRecords.ts";

export type DealListFilters = {
  query: string;
  stage: DealStage | "all";
  owner: string | "all";
};

export type DealListSortKey = "nextAction" | "updatedAt" | "value" | "health" | "company";
export type DealListSortDirection = "asc" | "desc";

const textCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function dealOwner(deal: Deal): string {
  return deal.assignee ?? deal.ownerName ?? deal.owner ?? "";
}

export function filterDeals(deals: Deal[], filters: DealListFilters): Deal[] {
  const query = normalizeText(filters.query);
  const owner = normalizeText(filters.owner);

  return deals.filter((deal) => {
    const matchesStage = filters.stage === "all" || deal.stage === filters.stage;
    const matchesOwner = filters.owner === "all" || normalizeText(dealOwner(deal)) === owner;
    const searchable = [
      deal.company,
      deal.name,
      deal.title,
      deal.ticketId,
      deal.owner,
      deal.ownerName,
      deal.assignee,
      deal.segment,
      deal.phone,
      deal.whatsapp,
    ];
    const matchesQuery = !query || searchable.some((value) => normalizeText(value).includes(query));

    return matchesStage && matchesOwner && matchesQuery;
  });
}

function sortableValue(deal: Deal, key: DealListSortKey): number | string | null {
  if (key === "nextAction") {
    const timestamp = deal.nextActionAt ? Date.parse(deal.nextActionAt) : Number.NaN;
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (key === "updatedAt") {
    const timestamp = deal.updated_at ? Date.parse(deal.updated_at) : Number.NaN;
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (key === "value") return Number.isFinite(deal.value) ? deal.value : null;
  if (key === "health") return Number.isFinite(deal.dealHealthScore) ? deal.dealHealthScore ?? null : null;
  return normalizeText(deal.company || deal.name || deal.title);
}

export function sortDeals(
  deals: Deal[],
  key: DealListSortKey,
  direction: DealListSortDirection,
): Deal[] {
  const multiplier = direction === "asc" ? 1 : -1;

  return [...deals].sort((left, right) => {
    const leftValue = sortableValue(left, key);
    const rightValue = sortableValue(right, key);

    if (leftValue == null && rightValue == null) return left.id - right.id;
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;

    const compared = typeof leftValue === "string" && typeof rightValue === "string"
      ? textCollator.compare(leftValue, rightValue)
      : Number(leftValue) - Number(rightValue);

    return compared === 0 ? left.id - right.id : compared * multiplier;
  });
}

export function paginateDeals(deals: Deal[], requestedPage: number, pageSize = 50) {
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 50;
  const total = deals.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const page = Math.min(Math.max(Number.isInteger(requestedPage) ? requestedPage : 1, 1), totalPages);
  const offset = (page - 1) * safePageSize;
  const items = deals.slice(offset, offset + safePageSize);

  return {
    items,
    page,
    pageSize: safePageSize,
    total,
    totalPages,
    start: total === 0 ? 0 : offset + 1,
    end: total === 0 ? 0 : offset + items.length,
  };
}

export function listDealOwners(deals: Deal[]): string[] {
  return Array.from(new Set(deals.map(dealOwner).filter(Boolean))).sort(textCollator.compare);
}
