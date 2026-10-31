import { Info } from "lucide-react";
import { http } from "../../../shared/api/http-client";
import { AppCheckbox, ErrorState, LoadingState, MultiCheckList } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { AdminScopes } from "../../../shared/types";
import { useTaxonomyOptions } from "../../academic/components/useTaxonomyOptions";

export interface Access { permissions: string[]; scopes: AdminScopes }
export const NO_ACCESS: Access = { permissions: [], scopes: { board_ids: [], class_ids: [], subject_ids: [] } };

interface PermissionDef { key: string; label: string; group: string; description: string }

/**
 * Super Admin's access form for an Admin account: one checkbox per feature, plus which boards, classes and subjects
 * the Admin may manage notes for (nothing ticked = all). Used when creating an Admin and when editing one later.
 */
export function AccessEditor({ value, onChange }: { value: Access; onChange: (a: Access) => void }) {
  const catalog = useAsync(() => http.get<{ permissions: PermissionDef[] }>("/admin/users/access-catalog"), []);
  const boards = useTaxonomyOptions("boards");
  const classes = useTaxonomyOptions("classes");
  const subjects = useTaxonomyOptions("subjects");
  if (catalog.loading) return <LoadingState />;
  if (catalog.error != null) return <ErrorState error={catalog.error} onRetry={catalog.reload} />;

  const groups = [...new Set(catalog.data!.permissions.map((p) => p.group))];
  const has = (k: string) => value.permissions.includes(k);
  const toggle = (k: string) => onChange({ ...value, permissions: has(k) ? value.permissions.filter((x) => x !== k) : [...value.permissions, k] });
  const setScope = (key: keyof AdminScopes) => (ids: number[]) => onChange({ ...value, scopes: { ...value.scopes, [key]: ids } });
  const toOpts = (o: { value: string | number; label: string }[]) => o.map((x) => ({ id: Number(x.value), label: x.label }));

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">What this Admin can do</h3>
        <div className="space-y-3">
          {groups.map((g) => {
            const items = catalog.data!.permissions.filter((p) => p.group === g);
            const all = items.every((p) => has(p.key));
            return (
              <div key={g} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">{g}</p>
                  <button type="button" className="text-xs text-indigo-700 hover:underline"
                    onClick={() => onChange({ ...value, permissions: all ? value.permissions.filter((k) => !items.some((p) => p.key === k)) : [...new Set([...value.permissions, ...items.map((p) => p.key)])] })}>
                    {all ? "Clear group" : "Select group"}
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {items.map((p) => (
                    <li key={p.key} className="flex items-start gap-2">
                      <AppCheckbox label={p.label} checked={has(p.key)} onChange={() => toggle(p.key)} className="font-medium" />
                      <span className="pt-0.5 text-xs text-slate-500">— {p.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-700">Which notes this Admin can manage</h3>
        <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-blue-50 p-2 text-xs text-blue-900"><Info size={14} className="mt-0.5 shrink-0" /><span>Tick nothing to allow everything. Ticking boards, classes or subjects limits the Admin to notes that match <b>all</b> the groups where something is ticked (e.g. board CBSE and class 12).</span></p>
        <div className="grid gap-3 md:grid-cols-3">
          <MultiCheckList label="Boards" options={toOpts(boards.options)} value={value.scopes.board_ids} onChange={setScope("board_ids")} emptyHint="All boards" />
          <MultiCheckList label="Classes" options={toOpts(classes.options)} value={value.scopes.class_ids} onChange={setScope("class_ids")} emptyHint="All classes" />
          <MultiCheckList label="Subjects" options={toOpts(subjects.options)} value={value.scopes.subject_ids} onChange={setScope("subject_ids")} emptyHint="All subjects" />
        </div>
      </section>
    </div>
  );
}
