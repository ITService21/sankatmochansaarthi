import { SelectOption } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { academicApi, TaxonomyResource } from "../api/academic.api";

/**
 * Loads dropdown options for a taxonomy resource. Pass `query` with parent ids to get only compatible values
 * (chapters for a board/class/subject, topics for a chapter); pass `enabled=false` to skip until parents are chosen.
 */
export function useTaxonomyOptions(resource: TaxonomyResource, query: Record<string, string | number | undefined> = {}, enabled = true) {
  const { data, loading } = useAsync(
    async () => (enabled ? (await academicApi.options(resource, query)).map((i): SelectOption => ({ value: i.id, label: i.name, ...(i.coming_soon ? { disabled: true, hint: "Coming soon" } : {}) })) : []),
    [resource, enabled, JSON.stringify(query)],
  );
  return { options: data ?? [], loading };
}
