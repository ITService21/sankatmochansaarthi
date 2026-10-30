import { http } from "../../../shared/api/http-client";
import { TaxonomyItem } from "../../../shared/types";

/** Taxonomy resources managed by the administrator (match backend paths). */
export type TaxonomyResource = "boards" | "classes" | "subjects" | "languages" | "chapters" | "topics" | "material-types";
type Query = Record<string, string | number | boolean | undefined | null>;

export const academicApi = {
  /** Paginated list with query-parameter filters. */
  list: (resource: TaxonomyResource, query?: Query) => http.list<TaxonomyItem>(`/academic/${resource}`, query),
  /** EVERY matching item (all pages, up to 2,000) for searchable dropdowns, e.g. chapters compatible with a board/class/subject. */
  options: async (resource: TaxonomyResource, query?: Query) => {
    const all: TaxonomyItem[] = [];
    for (let page = 1; page <= 20; page++) {
      const r = await http.list<TaxonomyItem>(`/academic/${resource}`, { page_size: 100, page, ...query });
      all.push(...r.data);
      if (page >= r.pagination.total_pages) break;
    }
    return all;
  },
  create: (resource: TaxonomyResource, body: Record<string, unknown>) => http.post<TaxonomyItem>(`/academic/${resource}`, body),
  update: (resource: TaxonomyResource, id: number, body: Record<string, unknown>) => http.patch<TaxonomyItem>(`/academic/${resource}/${id}`, body),
  remove: (resource: TaxonomyResource, id: number) => http.delete<{ id: number; deleted: boolean }>(`/academic/${resource}/${id}`),
};
