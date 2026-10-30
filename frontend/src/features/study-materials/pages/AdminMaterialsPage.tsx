import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppButton, AppInput, AppModal, AppPagination, AppSelect, AppTable, Column, ConfirmDialog, ErrorState, FileDropzone, StatusBadge } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { useMutation } from "../../../shared/hooks/useMutation";
import { formatDateTime } from "../../../shared/utils/format-date";
import { Material } from "../../../shared/types";
import { materialsApi } from "../api/study-materials.api";
import { MaterialFormModal } from "../components/MaterialFormModal";
import { MaterialPriceTag } from "../components/MaterialPriceTag";
import { PreviewModal } from "../components/PreviewModal";

/** Administrator note management: search/filter (query params), create, edit, replace PDF, publish, retry preview, soft-delete. */
export function AdminMaterialsPage() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); if (k !== "page") n.delete("page"); setParams(n, { replace: true }); };
  const { data, error, loading, reload } = useAsync(
    () => materialsApi.list({ page_size: 15, q: get("q") || undefined, status: get("status") || undefined, access_type: get("access_type") || undefined, page: get("page") || undefined, sort_by: "updated_at" }),
    [params.toString()],
  );
  const [form, setForm] = useState<{ material?: Material } | null>(null);
  const [replacing, setReplacing] = useState<Material | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [deleting, setDeleting] = useState<Material | null>(null);
  const [preview, setPreview] = useState<Material | null>(null);

  const act = useMutation(async (fn: () => Promise<unknown>) => { await fn(); reload(); });
  const submitReplace = useMutation(async () => {
    const fd = new FormData();
    fd.append("file", replaceFile!);
    await materialsApi.replaceFile(replacing!.id, fd);
    setReplacing(null); setReplaceFile(null); reload();
  });
  const del = useMutation(async () => { await materialsApi.remove(deleting!.id); setDeleting(null); reload(); });

  const cols: Column<Material>[] = [
    { key: "title", header: "Title", render: (m) => <button className="text-left font-medium text-indigo-700 hover:underline" onClick={() => setPreview(m)}>{m.title}</button> },
    { key: "ctx", header: "Board / Class / Subject", render: (m) => `${m.board.name} · ${m.class.name} · ${m.subject.name}` },
    { key: "material_type", header: "Type", render: (m) => <StatusBadge value="draft" label={m.material_type.name} /> },
    { key: "access", header: "Access", render: (m) => <MaterialPriceTag m={m} /> },
    { key: "status", header: "Status", render: (m) => <StatusBadge value={m.status} /> },
    { key: "preview", header: "Preview", render: (m) => <StatusBadge value={m.preview_status} /> },
    { key: "updated_at", header: "Updated", render: (m) => formatDateTime(m.updated_at) },
    { key: "actions", header: "Actions", render: (m) => (
      <div className="flex flex-wrap gap-1">
        <AppButton size="sm" variant="secondary" onClick={() => setForm({ material: m })}>Edit</AppButton>
        <AppButton size="sm" variant="secondary" onClick={() => setReplacing(m)}>Replace PDF</AppButton>
        {m.preview_status !== "ready" && <AppButton size="sm" variant="secondary" onClick={() => void act.run(() => materialsApi.regeneratePreview(m.id))}>Retry preview</AppButton>}
        {m.status === "published"
          ? <AppButton size="sm" variant="secondary" onClick={() => void act.run(() => materialsApi.unpublish(m.id))}>Unpublish</AppButton>
          : <AppButton size="sm" onClick={() => void act.run(() => materialsApi.publish(m.id))}>Publish</AppButton>}
        <AppButton size="sm" variant="danger" onClick={() => setDeleting(m)}>Delete</AppButton>
      </div>
    ) },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Manage notes</h1>
        <AppButton onClick={() => setForm({})}>+ Add note</AppButton>
      </div>
      <div className="mb-4 grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-3">
        <AppInput label="Search" value={get("q")} onChange={(e) => set("q", e.target.value)} />
        <AppSelect label="Status" placeholder="All statuses" value={get("status")} onChange={(v) => set("status", v)} options={["draft", "published", "unpublished", "archived"].map((s) => ({ value: s, label: s }))} />
        <AppSelect label="Access" placeholder="Free & paid" value={get("access_type")} onChange={(v) => set("access_type", v)} options={[{ value: "free", label: "Free" }, { value: "paid", label: "Paid" }]} />
      </div>
      {act.error != null && <div className="mb-3"><ErrorState error={act.error} /></div>}
      {error != null ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <AppTable columns={cols} rows={data?.data ?? []} rowKey={(m) => m.id} loading={loading} emptyMessage="No notes yet — add the first one" />
          {data && data.pagination.total_items > 0 && <AppPagination pagination={data.pagination} onPage={(p) => set("page", String(p))} />}
        </>
      )}
      {form && <MaterialFormModal material={form.material} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
      <AppModal open={!!replacing} title={`Replace PDF — ${replacing?.title ?? ""}`} onClose={() => { setReplacing(null); setReplaceFile(null); }}>
        <p className="mb-3 text-sm text-slate-600">The new file replaces the original; the preview is regenerated and the old files are cleaned up.</p>
        <FileDropzone file={replaceFile} onFile={setReplaceFile} />
        {submitReplace.error != null && <div className="mt-3"><ErrorState error={submitReplace.error} /></div>}
        <div className="mt-4 flex justify-end gap-2">
          <AppButton variant="secondary" onClick={() => { setReplacing(null); setReplaceFile(null); }}>Cancel</AppButton>
          <AppButton disabled={!replaceFile} loading={submitReplace.loading} onClick={() => void submitReplace.run()}>Replace</AppButton>
        </div>
      </AppModal>
      {preview && <PreviewModal m={preview} onClose={() => setPreview(null)} onChanged={reload} />}
      <ConfirmDialog open={!!deleting} title="Delete note" message={`Soft-delete "${deleting?.title}"? It disappears from the site but the record and files are retained.`} confirmLabel="Delete"
        loading={del.loading} onCancel={() => setDeleting(null)} onConfirm={() => void del.run()} />
    </div>
  );
}
