import { ArrowLeft, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { AppButton, ErrorState, LoadingState } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { materialsApi } from "../../study-materials/api/study-materials.api";
import { AccessBadge } from "../../study-materials/components/MaterialBadges";
import { BuyButton } from "../../study-materials/components/MaterialActions";
import { AddToDownloadsButton } from "../../study-materials/components/LibraryActions";
import { SecureViewer } from "../../study-materials/components/SecureViewer";
import { noteHeading } from "../../../shared/utils/note-heading";

/**
 * Full-width preview (everything except the sidebar). Shows ONLY the first N pages (enforced by the server).
 * Reading the whole note is done from My Downloads, so this pane offers Buy / Download instead of a full read.
 */
export function NotePreviewPane({ noteId, onBack, onChanged }: { noteId: number; onBack: () => void; onChanged: () => void }) {
  const { data: m, loading, error, reload } = useAsync(() => materialsApi.get(noteId), [noteId]);
  if (loading && !m) return <LoadingState />;
  if (error != null || !m) return <ErrorState error={error} onRetry={reload} />;
  const locked = m.access_type === "paid" && !m.access.can_download;
  const changed = () => { reload(); onChanged(); };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <AppButton variant="secondary" size="sm" onClick={onBack}><ArrowLeft size={16} />Back to notes</AppButton>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-bold text-slate-900">{noteHeading(m)}</h2><AccessBadge m={m} /></div>
          <p className="text-xs text-slate-500">{m.board.name} · {m.class.name} · {m.subject.name} · {m.chapter.name}{m.topic ? ` · ${m.topic.name}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {locked ? <><BuyButton m={m} showPrice onPaid={changed} /><Link to="/subscriptions"><AppButton variant="secondary">Subscribe</AppButton></Link></> : <AddToDownloadsButton m={m} onChanged={changed} />}
        </div>
      </div>
      <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900"><Lock size={16} className="shrink-0" />
        {m.access.can_download ? `Previewing the first ${m.preview_page_limit} of ${m.page_count ?? "?"} pages. Add the note to My Downloads to read all of it.`
          : `Previewing the first ${m.preview_page_limit} of ${m.page_count ?? "?"} pages. Buy this note or subscribe to read the full document.`}</p>
      {m.access.can_preview
        ? <SecureViewer key={`${m.id}-${m.updated_at}`} title={`${noteHeading(m)} preview`} load={() => materialsApi.previewBlob(m.id)} className="min-h-[70vh]" />
        : <div className="rounded-2xl bg-white p-10 text-center text-slate-500 shadow-card">A preview isn't available for this note yet.</div>}
    </div>
  );
}
