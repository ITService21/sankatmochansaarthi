import { Pagination } from "../types";
import { AppButton } from "./AppButton";

/** Shared pager driven by the API's pagination metadata. */
export function AppPagination({ pagination, onPage }: { pagination: Pagination; onPage: (page: number) => void }) {
  const { page, total_pages, total_items } = pagination;
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
      <span>{total_items} result{total_items === 1 ? "" : "s"} · page {page} of {total_pages}</span>
      <div className="flex gap-2">
        <AppButton variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</AppButton>
        <AppButton variant="secondary" size="sm" disabled={page >= total_pages} onClick={() => onPage(page + 1)}>Next</AppButton>
      </div>
    </div>
  );
}
