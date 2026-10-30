import { Eye, FileText } from "lucide-react";
import { SubjectIcon } from "../../../shared/components";
import { formatFileSize } from "../../../shared/utils/format-file-size";
import { Material } from "../../../shared/types";
import { AccessBadge } from "./MaterialBadges";
import { BuyButton } from "./MaterialActions";

/** Grid card (dashboard / purchases): icon tile, badge, meta, description and a Preview or Buy Now action. */
export function MaterialCard({ m, onPreview, onPaid }: { m: Material; onPreview: (m: Material) => void; onPaid: () => void }) {
  const needsPurchase = m.access_type === "paid" && !m.access.can_download;
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition hover:border-indigo-200 hover:shadow-md">
      <div className="flex items-start gap-3">
        <SubjectIcon subject={m.subject.name} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2"><AccessBadge m={m} />{m.page_count && <span className="text-xs text-slate-500">{m.page_count} pages</span>}</div>
          <h3 className="line-clamp-2 font-semibold leading-snug text-slate-900">{m.title}</h3>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{m.subject.name} · {m.class.name} · {m.board.name}</p>
      <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm text-slate-600">{m.description ?? `${m.chapter.name}${m.topic ? ` — ${m.topic.name}` : ""}`}</p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-xs text-slate-500"><FileText size={14} />PDF · {formatFileSize(m.file_size_bytes)}</span>
        {needsPurchase ? <BuyButton m={m} size="sm" onPaid={onPaid} />
          : <button onClick={() => onPreview(m)} disabled={!m.access.can_preview} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"><Eye size={14} />Preview</button>}
      </div>
    </article>
  );
}
