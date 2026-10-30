import { Eye, FileText, Globe2, Layers } from "lucide-react";
import { Link } from "react-router-dom";
import { AppButton, SubjectIcon } from "../../../shared/components";
import { Material } from "../../../shared/types";
import { formatFileSize } from "../../../shared/utils/format-file-size";
import { classLabel } from "../../../shared/utils/roman";
import { AccessBadge } from "../../study-materials/components/MaterialBadges";
import { BuyButton } from "../../study-materials/components/MaterialActions";
import { AddToDownloadsButton } from "../../study-materials/components/LibraryActions";

const Chip = ({ children }: { children: React.ReactNode }) => <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{children}</span>;

/** Detailed note card for the workspace: full hierarchy, file facts, and Preview / Buy / Download actions. */
export function NoteCard({ m, onPreview, onChanged }: { m: Material; onPreview: (m: Material) => void; onChanged: () => void }) {
  const locked = m.access_type === "paid" && !m.access.can_download;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card transition hover:border-blue-300">
      <div className="flex items-start gap-4">
        <SubjectIcon subject={m.subject.name} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold text-slate-900">{m.title}</h3><AccessBadge m={m} /></div>
          {m.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{m.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800">{m.material_type.name}</span><Chip>{m.board.name}</Chip><Chip>{m.class.name.startsWith("Class") ? m.class.name : classLabel({ class_number: null, name: m.class.name })}</Chip><Chip>{m.subject.name}</Chip>
            <Chip>Chapter: {m.chapter.name}</Chip>{m.topic && <Chip>Topic: {m.topic.name}</Chip>}
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><FileText size={13} />PDF · {formatFileSize(m.file_size_bytes)}</span>
            {m.page_count && <span className="inline-flex items-center gap-1"><Layers size={13} />{m.page_count} pages</span>}
            <span className="inline-flex items-center gap-1"><Globe2 size={13} />{m.language.name}</span>
            <span>Updated {new Date(m.updated_at).toLocaleDateString()}</span>
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-slate-100 pt-4">
        <AppButton variant="secondary" disabled={!m.access.can_preview} onClick={() => onPreview(m)}><Eye size={16} />Preview{m.access.can_download ? "" : ` (first ${m.preview_page_limit} pages)`}</AppButton>
        {locked ? (
          <><BuyButton m={m} showPrice onPaid={onChanged} /><Link to="/subscriptions"><AppButton variant="ghost">Subscribe instead</AppButton></Link></>
        ) : <AddToDownloadsButton m={m} onChanged={onChanged} />}
      </div>
    </article>
  );
}
