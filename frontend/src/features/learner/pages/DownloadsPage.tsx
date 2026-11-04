import { ArrowLeft, BookOpen, Lock, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AppButton, AppPagination, ConfirmDialog, EmptyState, ErrorState, LoadingState, SubjectIcon, useToast } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { useMutation } from "../../../shared/hooks/useMutation";
import { Material } from "../../../shared/types";
import { formatFileSize } from "../../../shared/utils/format-file-size";
import { materialsApi } from "../../study-materials/api/study-materials.api";
import { SecureViewer } from "../../study-materials/components/SecureViewer";
import { noteHeading } from "../../../shared/utils/note-heading";

/**
 * My Downloads: the in-app library. Notes are read here, in the secure viewer, and are never saved to the device —
 * this keeps paid and free content from being copied and shared outside the platform.
 */
export function DownloadsPage() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(() => materialsApi.list({ downloaded: true, page, page_size: 10, sort_by: "title", sort_order: "asc" }), [page]);
  const [reading, setReading] = useState<Material | null>(null);
  const [removing, setRemoving] = useState<Material | null>(null);
  const toast = useToast();
  const remove = useMutation(async () => {
    const id = toast.loading("Removing from My Downloads…");
    try { await materialsApi.removeDownload(removing!.id); toast.success("Removed from My Downloads.", id); setRemoving(null); reload(); }
    catch (e) { toast.error(e, id); throw e; }
  });

  if (reading) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <AppButton variant="secondary" size="sm" onClick={() => setReading(null)}><ArrowLeft size={16} />Back to downloads</AppButton>
          <div className="min-w-0 flex-1"><h1 className="truncate text-lg font-bold text-slate-900">{reading.title}</h1><p className="text-xs text-slate-500">{reading.board.name} · {reading.class.name} · {reading.subject.name} · {reading.chapter.name}</p></div>
        </div>
        <SecureViewer key={reading.id} title={reading.title} load={() => materialsApi.downloadBlob(reading.id)} className="min-h-[75vh]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-gradient-to-r from-blue-950 via-blue-800 to-blue-600 px-8 py-9 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">Your private library</p>
        <h1 className="font-display mt-2 text-5xl font-bold">My Downloads</h1>
        <p className="mt-3 flex max-w-2xl items-start gap-2 text-blue-100"><ShieldCheck size={20} className="mt-0.5 shrink-0" />Notes you download stay inside Sankatmochan Saarthi. Read them here any time — they can't be saved to your device or shared.</p>
      </section>
      {error != null ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingState />
        : !data || data.data.length === 0 ? (
          <div className="space-y-3 text-center"><EmptyState message="You haven't downloaded any notes yet." /><Link to="/learn"><AppButton>Browse notes</AppButton></Link></div>
        ) : (
          <>
            <div className="space-y-3">
              {data.data.map((m) => (
                <article key={m.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                  <SubjectIcon subject={m.subject.name} size={52} />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-slate-900">{noteHeading(m)}</h2>
                    <p className="text-xs text-slate-500">{m.board.name} · {m.class.name} · {m.subject.name} · {m.chapter.name}{m.topic ? ` · ${m.topic.name}` : ""}</p>
                    <p className="mt-1 text-xs text-slate-500">PDF · {formatFileSize(m.file_size_bytes)}{m.page_count ? ` · ${m.page_count} pages` : ""}</p>
                  </div>
                  {m.access.can_download ? <AppButton onClick={() => setReading(m)}><BookOpen size={16} />Read</AppButton>
                    : <Link to="/subscriptions" className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800"><Lock size={15} />Access ended — renew to read</Link>}
                  <AppButton variant="ghost" size="sm" aria-label={`Remove ${noteHeading(m)}`} onClick={() => setRemoving(m)}><Trash2 size={16} />Remove</AppButton>
                </article>
              ))}
            </div>
            <AppPagination pagination={data.pagination} onPage={setPage} />
          </>
        )}
      <ConfirmDialog open={!!removing} title="Remove from downloads" message={`Remove "${removing?.title}" from My Downloads? You can add it again later.`} confirmLabel="Remove" loading={remove.loading} onCancel={() => setRemoving(null)} onConfirm={() => void remove.run()} />
    </div>
  );
}
