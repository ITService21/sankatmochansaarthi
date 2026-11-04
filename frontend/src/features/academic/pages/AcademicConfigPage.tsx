import { FormEvent, useState } from "react";
import { AppButton, AppCheckbox, AppInput, AppModal, AppPagination, AppSelect, AppTable, Column, ConfirmDialog, DraftNotice, ErrorState, StatusBadge } from "../../../shared/components";
import { required } from "../../../shared/forms/validation";
import { useAsync } from "../../../shared/hooks/useAsync";
import { useFormDraft } from "../../../shared/hooks/useFormDraft";
import { useMutation } from "../../../shared/hooks/useMutation";
import { TaxonomyItem } from "../../../shared/types";
import { academicApi, TaxonomyResource } from "../api/academic.api";
import { useTaxonomyOptions } from "../components/useTaxonomyOptions";

const TABS: Array<{ key: TaxonomyResource; label: string }> = [
  { key: "boards", label: "Boards" }, { key: "classes", label: "Classes" }, { key: "subjects", label: "Subjects" },
  { key: "chapters", label: "Chapters" }, { key: "topics", label: "Topics" },   { key: "material-types", label: "Material types" },
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
    ...(resource === "chapters" ? [{ key: "stream", header: "Stream", render: (i: TaxonomyItem) => <span className="capitalize">{i.stream === "general" ? "General (all streams)" : i.stream}</span> }] : []),
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
  // All fields live in one draft so they survive closing the dialog (cleared after saving or "Discard changes").
  const draft = useFormDraft(`taxonomy-${resource}-${item?.id ?? "new"}`, {
    name: item?.name ?? "", code: item?.code ?? "", classNumber: item?.class_number != null ? String(item.class_number) : "", sort: String(item?.sort_order ?? 0),
    comingSoon: !!item?.coming_soon, stream: (item?.stream ?? "general") as string, board: String(item?.board_id ?? ""), cls: String(item?.class_id ?? ""), subject: String(item?.subject_id ?? ""), chapter: String(item?.chapter_id ?? ""),
  });
  const { name, code, classNumber, sort, comingSoon, stream, board, cls, subject, chapter } = draft.value;
  const up = (patch: Partial<typeof draft.value>) => draft.set({ ...draft.value, ...patch });
  const setName = (v: string) => up({ name: v }); const setCode = (v: string) => up({ code: v }); const setClassNumber = (v: string) => up({ classNumber: v });
  const setSort = (v: string) => up({ sort: v }); const setComingSoon = (v: boolean) => up({ comingSoon: v });
  const setStream = (v: string) => up({ stream: v }); const setBoard = (v: string) => up({ board: v }); const setCls = (v: string) => up({ cls: v }); const setSubject = (v: string) => up({ subject: v }); const setChapter = (v: string) => up({ chapter: v });
  const [touched, setTouched] = useState(false);
  const boards = useTaxonomyOptions("boards", {}, resource === "chapters");
  const classes = useTaxonomyOptions("classes", {}, resource === "chapters");
  const subjects = useTaxonomyOptions("subjects", {}, resource === "chapters");
  // Topics: pick the Subject first, then only that subject's chapters (labelled with class and board, since names repeat).
  const forTopic = resource === "topics";
  const allChapters = useAsync(async () => (forTopic ? academicApi.options("chapters", {}) : []), [forTopic]);
  const topicClasses = useTaxonomyOptions("classes", {}, forTopic);
  const topicSubjects = useTaxonomyOptions("subjects", {}, forTopic);
  const topicBoards = useTaxonomyOptions("boards", {}, forTopic);
  // The subject of an existing topic comes from its chapter; until the user picks one, show that.
  const chapterSubject = String(allChapters.data?.find((c) => String(c.id) === chapter)?.subject_id ?? "");
  const topicSubject = subject || chapterSubject;
  const chapterOptions = (allChapters.data ?? []).filter((c) => String(c.subject_id) === topicSubject || String(c.id) === chapter)
    .map((c) => ({ value: c.id, label: [c.name, topicClasses.options.find((o) => o.value === c.class_id)?.label, topicBoards.options.find((o) => o.value === c.board_id)?.label].filter(Boolean).join(" · ") }));

  const parentErr = resource === "chapters" ? (!board || !cls || !subject ? "Choose a board, class and subject" : undefined) : resource === "topics" ? (!chapter ? "Choose a chapter" : undefined) : undefined;
  const nameErr = required(name, "Name");
  const save = useMutation(async () => {
    const body: Record<string, unknown> = { name: name.trim(), sort_order: Number(sort) || 0 };
    if (["boards", "subjects", "languages", "material-types"].includes(resource)) body.code = code.trim() || null;
    if (resource === "classes") { body.class_number = classNumber === "" ? null : Number(classNumber); body.coming_soon = comingSoon; }
    if (resource === "chapters") Object.assign(body, { board_id: +board, class_id: +cls, subject_id: +subject, stream });
    if (resource === "topics") body.chapter_id = +chapter;
    if (item) await academicApi.update(resource, item.id, body); else await academicApi.create(resource, body);
    draft.clear();
    onSaved();
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!nameErr && !parentErr) void save.run(); };

  return (
    <AppModal open title={item ? "Edit" : "Add"} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-3">
        {resource === "chapters" && <>
          <AppSelect required label="Board" placeholder="Select…" options={boards.options} value={board} onChange={setBoard} />
          <AppSelect required label="Class" placeholder="Select…" options={classes.options} value={cls} onChange={setCls} />
          <AppSelect required label="Stream" options={[{ value: "general", label: "General (valid for every stream)" }, { value: "science", label: "Science" }, { value: "commerce", label: "Commerce" }]} value={stream} onChange={setStream}
            hint="A Science chapter only appears when a note's stream is Science; “General” chapters appear for every stream." />
          <AppSelect required label="Subject" placeholder="Select…" options={subjects.options} value={subject} onChange={setSubject} />
        </>}
        {resource === "topics" && <>
          <AppSelect required label="Subject" placeholder="Select…" options={topicSubjects.options} value={topicSubject} onChange={(v) => up({ subject: v, chapter: "" })} />
          <AppSelect required label="Chapter" placeholder={topicSubject ? "Select…" : "Choose a subject first"} options={chapterOptions} value={chapter} onChange={setChapter} disabled={!topicSubject}
            hint={topicSubject && !allChapters.loading && chapterOptions.length === 0 ? "This subject has no chapters yet. Add one in the Chapters tab first." : undefined} />
        </>}
        {touched && parentErr && <p role="alert" className="text-xs text-red-600">{parentErr}</p>}
        <AppInput required label="Name" value={name} onChange={(e) => setName(e.target.value)} error={touched ? nameErr : undefined} />
        {["boards", "subjects", "languages", "material-types"].includes(resource) && <AppInput label="Code" value={code} onChange={(e) => setCode(e.target.value)} />}
        {resource === "classes" && <>
          <AppInput label="Class number" inputMode="numeric" value={classNumber} onChange={(e) => setClassNumber(e.target.value)} />
          <AppCheckbox label="Show as “Coming soon” on the Courses page" checked={comingSoon} onChange={(e) => setComingSoon(e.target.checked)} />
        </>}
        <AppInput label="Sort order" inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value)} />
        {save.error != null && <ErrorState error={save.error} />}
        <DraftNotice dirty={draft.dirty} restored={draft.restored} onDiscard={() => { draft.clear(); onClose(); }} />
        <div className="flex justify-end gap-2">
          <AppButton variant="secondary" onClick={onClose}>Close</AppButton>
          <AppButton type="submit" loading={save.loading}>Save</AppButton>
        </div>
      </form>
    </AppModal>
  );
}
