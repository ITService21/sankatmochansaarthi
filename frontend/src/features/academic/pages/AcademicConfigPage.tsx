import { FormEvent, useState } from "react";
import { AppButton, AppCheckbox, AppInput, AppModal, AppPagination, AppSelect, AppTable, Column, ConfirmDialog, ErrorState, StatusBadge } from "../../../shared/components";
import { required } from "../../../shared/forms/validation";
import { useAsync } from "../../../shared/hooks/useAsync";
import { useMutation } from "../../../shared/hooks/useMutation";
import { TaxonomyItem } from "../../../shared/types";
import { academicApi, TaxonomyResource } from "../api/academic.api";
import { useTaxonomyOptions } from "../components/useTaxonomyOptions";

const TABS: Array<{ key: TaxonomyResource; label: string }> = [
  { key: "boards", label: "Boards" }, { key: "classes", label: "Classes" }, { key: "subjects", label: "Subjects" },
  { key: "chapters", label: "Chapters" }, { key: "topics", label: "Topics" }, { key: "languages", label: "Languages" }, { key: "material-types", label: "Material types" },
];

/** Administrator setup of boards, classes, subjects, chapters, topics and languages (no hard-coded academic labels). */
export function AcademicConfigPage() {
  const [tab, setTab] = useState<TaxonomyResource>("boards");
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Academic setup</h1>
      <div className="mb-4 flex flex-wrap gap-1 border-b">
        {TABS.map((t) => <button key={t.key} onClick={() => setTab(t.key)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:text-slate-900"}`}>{t.label}</button>)}
      </div>
      <ResourcePanel key={tab} resource={tab} />
    </div>
  );
}

function ResourcePanel({ resource }: { resource: TaxonomyResource }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => academicApi.list(resource, { search: search || undefined, page, page_size: 15 }), [resource, search, page]);
  const [editing, setEditing] = useState<TaxonomyItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<TaxonomyItem | null>(null);
  const toggle = useMutation(async (i: TaxonomyItem) => { await academicApi.update(resource, i.id, { is_active: !i.is_active }); reload(); });
  const del = useMutation(async () => { await academicApi.remove(resource, deleting!.id); setDeleting(null); reload(); });

  const cols: Column<TaxonomyItem>[] = [
    { key: "name", header: "Name" },
    ...(resource === "classes" ? [{ key: "class_number", header: "Number" }, { key: "coming_soon", header: "Courses page", render: (i: TaxonomyItem) => (i.coming_soon ? <StatusBadge value="pending" label="Coming soon" /> : <StatusBadge value="active" label="Open" />) }] : []),
    ...(["boards", "subjects", "languages", "material-types"].includes(resource) ? [{ key: "code", header: "Code" }] : []),
    { key: "sort_order", header: "Order" },
    { key: "is_active", header: "Status", render: (i: TaxonomyItem) => <StatusBadge value={i.is_active ? "active" : "draft"} label={i.is_active ? "Active" : "Disabled"} /> },
    { key: "act", header: "", render: (i: TaxonomyItem) => (
      <div className="flex gap-1">
        <AppButton size="sm" variant="secondary" onClick={() => setEditing(i)}>Edit</AppButton>
        <AppButton size="sm" variant="secondary" onClick={() => void toggle.run(i)}>{i.is_active ? "Disable" : "Enable"}</AppButton>
        <AppButton size="sm" variant="danger" onClick={() => setDeleting(i)}>Delete</AppButton>
      </div>) },
  ];

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <AppInput className="w-64" label="Search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <AppButton onClick={() => setEditing("new")}>+ Add</AppButton>
      </div>
      {(toggle.error != null) && <div className="mb-3"><ErrorState error={toggle.error} /></div>}
      {error != null ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <AppTable columns={cols} rows={data?.data ?? []} rowKey={(i) => i.id} loading={loading} emptyMessage="Nothing configured yet" />
          {data && data.pagination.total_items > 0 && <AppPagination pagination={data.pagination} onPage={setPage} />}
        </>
      )}
      {editing && <ItemForm resource={resource} item={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      <ConfirmDialog open={!!deleting} title="Delete value" message={`Soft-delete "${deleting?.name}"? This is blocked while notes or child items reference it (disable it instead).`} loading={del.loading}
        onCancel={() => { setDeleting(null); del.clearError(); }} onConfirm={() => void del.run()} />
      {del.error != null && deleting && <div className="mt-3"><ErrorState error={del.error} /></div>}
    </div>
  );
}

function ItemForm({ resource, item, onClose, onSaved }: { resource: TaxonomyResource; item?: TaxonomyItem; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [code, setCode] = useState(item?.code ?? "");
  const [classNumber, setClassNumber] = useState(item?.class_number != null ? String(item.class_number) : "");
  const [sort, setSort] = useState(String(item?.sort_order ?? 0));
  const [comingSoon, setComingSoon] = useState(!!item?.coming_soon);
  const [board, setBoard] = useState(String(item?.board_id ?? ""));
  const [cls, setCls] = useState(String(item?.class_id ?? ""));
  const [subject, setSubject] = useState(String(item?.subject_id ?? ""));
  const [chapter, setChapter] = useState(String(item?.chapter_id ?? ""));
  const [touched, setTouched] = useState(false);
  const boards = useTaxonomyOptions("boards", {}, resource === "chapters");
  const classes = useTaxonomyOptions("classes", {}, resource === "chapters");
  const subjects = useTaxonomyOptions("subjects", {}, resource === "chapters");
  const chapters = useTaxonomyOptions("chapters", {}, resource === "topics");

  const parentErr = resource === "chapters" ? (!board || !cls || !subject ? "Choose a board, class and subject" : undefined) : resource === "topics" ? (!chapter ? "Choose a chapter" : undefined) : undefined;
  const nameErr = required(name, "Name");
  const save = useMutation(async () => {
    const body: Record<string, unknown> = { name: name.trim(), sort_order: Number(sort) || 0 };
    if (["boards", "subjects", "languages", "material-types"].includes(resource)) body.code = code.trim() || null;
    if (resource === "classes") { body.class_number = classNumber === "" ? null : Number(classNumber); body.coming_soon = comingSoon; }
    if (resource === "chapters") Object.assign(body, { board_id: +board, class_id: +cls, subject_id: +subject });
    if (resource === "topics") body.chapter_id = +chapter;
    if (item) await academicApi.update(resource, item.id, body); else await academicApi.create(resource, body);
    onSaved();
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!nameErr && !parentErr) void save.run(); };

  return (
    <AppModal open title={item ? "Edit" : "Add"} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-3">
        {resource === "chapters" && <>
          <AppSelect label="Board" placeholder="Select…" options={boards.options} value={board} onChange={setBoard} />
          <AppSelect label="Class" placeholder="Select…" options={classes.options} value={cls} onChange={setCls} />
          <AppSelect label="Subject" placeholder="Select…" options={subjects.options} value={subject} onChange={setSubject} />
        </>}
        {resource === "topics" && <AppSelect label="Chapter" placeholder="Select…" options={chapters.options} value={chapter} onChange={setChapter} />}
        {touched && parentErr && <p role="alert" className="text-xs text-red-600">{parentErr}</p>}
        <AppInput label="Name" value={name} onChange={(e) => setName(e.target.value)} error={touched ? nameErr : undefined} />
        {["boards", "subjects", "languages", "material-types"].includes(resource) && <AppInput label="Code" value={code} onChange={(e) => setCode(e.target.value)} />}
        {resource === "classes" && <>
          <AppInput label="Class number" inputMode="numeric" value={classNumber} onChange={(e) => setClassNumber(e.target.value)} />
          <AppCheckbox label="Show as “Coming soon” on the Courses page" checked={comingSoon} onChange={(e) => setComingSoon(e.target.checked)} />
        </>}
        <AppInput label="Sort order" inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value)} />
        {save.error != null && <ErrorState error={save.error} />}
        <div className="flex justify-end gap-2">
          <AppButton variant="secondary" onClick={onClose}>Cancel</AppButton>
          <AppButton type="submit" loading={save.loading}>Save</AppButton>
        </div>
      </form>
    </AppModal>
  );
}
