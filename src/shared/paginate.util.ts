export function parsePagination(pageRaw?: any, pageSizeRaw?: any) {
  const page = Math.max(1, Number(pageRaw || 1));
  const pageSize = Math.min(100, Math.max(1, Number(pageSizeRaw || 10)));
  const skip = (page - 1) * pageSize;
  const take = pageSize;
  return { page, pageSize, skip, take };
}
