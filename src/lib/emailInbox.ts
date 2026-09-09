export function normalizeInboxQuery(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}\s@._+\-]/gu, "")
    .replace(/\s+/g, " ")
    .slice(0, 100);
}

export function inboxPageWindow(requestedPage: number, pageSize = 10) {
  const safePage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 10;
  const from = (safePage - 1) * safePageSize;

  return {
    page: safePage,
    pageSize: safePageSize,
    from,
    to: from + safePageSize - 1,
  };
}

export function paginateEmailThreads<T>(items: T[], requestedPage: number, pageSize = 10) {
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 10;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const page = Math.min(
    Math.max(Number.isInteger(requestedPage) ? requestedPage : 1, 1),
    totalPages,
  );
  const offset = (page - 1) * safePageSize;
  const pageItems = items.slice(offset, offset + safePageSize);

  return {
    items: pageItems,
    page,
    pageSize: safePageSize,
    total,
    totalPages,
    start: total === 0 ? 0 : offset + 1,
    end: total === 0 ? 0 : offset + pageItems.length,
  };
}
