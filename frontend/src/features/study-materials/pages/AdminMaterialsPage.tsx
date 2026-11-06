import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../shared/auth/AuthContext";
import { AppButton, AppInput, AppModal, AppPagination, AppSelect, AppTable, Column, ConfirmDialog, DraftNotice, ErrorState, FileDropzone, StatusBadge } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { useFormDraft } from "../../../shared/hooks/useFormDraft";
import { useMutation } from "../../../shared/hooks/useMutation";
import { formatDateTime } from "../../../shared/utils/format-date";
import { Material } from "../../../shared/types";
import { materialsApi } from "../api/study-materials.api";
import { AddNotesWizard } from "../components/AddNotesWizard";
import { BulkNotesWizard } from "../components/BulkNotesWizard";
import { MaterialFormModal } from "../components/MaterialFormModal";
import { MaterialPriceTag } from "../components/MaterialPriceTag";
import { PreviewModal } from "../components/PreviewModal";
import { noteHeading } from "../../../shared/utils/note-heading";

/**
 * Staff note management: search/filter (query params), add (multi-format, converted to PDF and reviewed first), edit, replace PDF,
 * publish, retry preview, soft-delete. Each button appears only if the staff member holds that permission; an Admin
 * also only ever sees notes inside their board/class/subject scope (the server filters the list).
 */
export function AdminMaterialsPage() {
  const { can, isSuper, user } = useAuth();
  const [adding, setAdding] = useState(false);
  const [bulkAdding, setBulkAdding] = useState(false);
  const pending = useAsync(() => (can("materials.create") ? materialsApi.listDrafts() : Promise.resolve([])), [adding]);
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); if (k !== "page") n.delete("page"); setParams(n, { replace: true }); };
  const { data, error, loading, reload } = useAsync(
    () => materialsApi.list({ page_size: 15, q: get("q") || undefined, status: get("status") || undefined, access_type: get("access_type") || undefined, page: get("page") || undefined, sort_by: "updated_at" }),
    [params.toString()],
  );
  const [form, setForm] = useState<{ material: Material } | null>(null);
  const [replacing, setReplacing] = useState<Material | null>(null);
  const [deleting, setDeleting] = useState<Material | null>(null);
  const [preview, setPreview] = useState<Material | null>(null);

  const act = useMutation(async (fn: () => Promise<unknown>) => { await fn(); reload(); });
  const del = useMutation(async () => { await materialsApi.remove(deleting!.id); setDeleting(null); reload(); });

  const cols: Column<Material>[] = [
    { key: "title", header: "Topic / file", render: (m) => (
      // Several notes can share a topic, so the file name and page count tell them apart.
      <div className="max-w-[18rem]"><button className="text-left font-medium text-indigo-700 hover:underline" onClick={() => setPreview(m)}>{noteHeading(m)}</button>
        <p className="truncate text-xs text-slate-500" title={m.original_filename}>{m.original_filename} · {m.page_count ?? "?"} page{m.page_count === 1 ? "" : "s"}</p></div>) },
    { key: "ctx", header: "Board / Class / Subject", render: (m) => `${m.board.name} · ${m.class.name} · ${m.subject.name}` },
    { key: "material_type", header: "Type", render: (m) => <StatusBadge value="draft" label={m.material_type.name} /> },
    { key: "access", header: "Access", render: (m) => <MaterialPriceTag m={m} /> },
    { key: "status", header: "Status", render: (m) => <StatusBadge value={m.status} /> },
    { key: "preview", header: "Preview", render: (m) => <StatusBadge value={m.preview_status} /> },
    { key: "updated_at", header: "Updated", render: (m) => formatDateTime(m.updated_at) },
    { key: "actions", header: "Actions", render: (m) => (
      <div className="flex flex-nowrap gap-1">
        {can("materials.edit") && <AppButton size="sm" variant="secondary" onClick={() => setForm({ material: m })}>Edit</AppButton>}
        {can("materials.edit") && <AppButton size="sm" variant="secondary" onClick={() => setReplacing(m)}>Replace PDF</AppButton>}
        {can("materials.edit") && m.preview_status !== "ready" && <AppButton size="sm" variant="secondary" onClick={() => void act.run(() => materialsApi.regeneratePreview(m.id))}>Retry preview</AppButton>}
        {can("materials.publish") && (m.status === "published"
          ? <AppButton size="sm" variant="secondary" onClick={() => void act.run(() => materialsApi.unpublish(m.id))}>Unpublish</AppButton>
          : <AppButton size="sm" onClick={() => void act.run(() => materialsApi.publish(m.id))}>Publish</AppButton>)}
        {can("materials.delete") && <AppButton size="sm" variant="danger" onClick={() => setDeleting(m)}>Delete</AppButton>}
      </div>
    ) },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Manage notes</h1>
          {!isSuper && user?.role === "Admin" && (user.scopes.board_ids.length + user.scopes.class_ids.length + user.scopes.subject_ids.length > 0) && <p className="text-sm text-slate-600">Showing only the boards, classes and subjects you manage.</p>}
        </div>
        {can("materials.create") && (
          <div className="flex gap-2">
            <AppButton variant="secondary" onClick={() => setBulkAdding(true)}>+ Bulk add notes</AppButton>
            <AppButton onClick={() => setAdding(true)}>+ Add notes</AppButton>
          </div>
        )}
      </div>
      {(pending.data?.length ?? 0) > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span><b>{pending.data!.length}</b> converted file{pending.data!.length > 1 ? "s are" : " is"} waiting for your review before being saved as notes.</span>
          <AppButton size="sm" onClick={() => setAdding(true)}>Review now</AppButton>
        </div>
      )}
      <div className="mb-4 grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-3">
        <AppInput label="Search" value={get("q")} onChange={(e) => set("q", e.target.value)} />
        <AppSelect label="Status" placeholder="All statuses" value={get("status")} onChange={(v) => set("status", v)} options={["draft", "published", "unpublished", "archived"].map((s) => ({ value: s, label: s }))} />
        <AppSelect label="Access" placeholder="Free & paid" value={get("access_type")} onChange={(v) => set("access_type", v)} options={[{ value: "free", label: "Free" }, { value: "paid", label: "Paid" }]} />
      </div>
      {act.error != null && <div className="mb-3"><ErrorState error={act.error} /></div>}
      {error != null ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <AppTable columns={cols} rows={data?.data ?? []} rowKey={(m) => m.id} loading={loading} emptyMessage={can("materials.create") ? "No notes yet — add the first one" : "No notes to show"} />
          {data && data.pagination.total_items > 0 && <AppPagination pagination={data.pagination} onPage={(p) => set("page", String(p))} />}
        </>
      )}
      {form && <MaterialFormModal material={form.material} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
      {adding && <AddNotesWizard onClose={() => setAdding(false)} onChanged={reload} />}
      {bulkAdding && <BulkNotesWizard onClose={() => setBulkAdding(false)} onChanged={reload} />}
      {replacing && <ReplaceFileModal material={replacing} onClose={() => setReplacing(null)} onDone={() => { setReplacing(null); reload(); }} />}
      {preview && <PreviewModal m={preview} onClose={() => setPreview(null)} onChanged={reload} />}
      <ConfirmDialog open={!!deleting} title="Delete note" message={`Soft-delete "${deleting?.title}"? It disappears from the site but the record and files are retained.`} confirmLabel="Delete"
        loading={del.loading} onCancel={() => setDeleting(null)} onConfirm={() => void del.run()} />
    </div>
  );
}

/** Replace a note's PDF. The chosen file is kept (in memory) if the dialog is closed; cleared after replacing or "Discard changes". */
function ReplaceFileModal({ material, onClose, onDone }: { material: Material; onClose: () => void; onDone: () => void }) {
  const draft = useFormDraft(`replace-pdf-${material.id}`, { file: null as File | null }, { volatile: ["file"] });
  const file = draft.value.file;
  const submit = useMutation(async () => {
    const fd = new FormData();
    fd.append("file", file!);
    await materialsApi.replaceFile(material.id, fd);
    draft.clear();
    onDone();
  });
  return (
    <AppModal open title={`Replace PDF — ${noteHeading(material)}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">The new file replaces the original; the preview is regenerated and the old files are cleaned up.</p>
      <FileDropzone required file={file} onFile={(f) => draft.set({ file: f })} />
      {submit.error != null && <div className="mt-3"><ErrorState error={submit.error} /></div>}
      <div className="mt-3"><DraftNotice dirty={draft.dirty} restored={draft.restored} onDiscard={() => { draft.clear(); onClose(); }} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <AppButton variant="secondary" onClick={onClose}>Close</AppButton>
        <AppButton disabled={!file} loading={submit.loading} onClick={() => void submit.run()}>Replace</AppButton>
      </div>
    </AppModal>
  );
}
