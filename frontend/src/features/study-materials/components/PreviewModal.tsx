import { AppModal } from "../../../shared/components";
import { Material } from "../../../shared/types";
import { materialsApi } from "../api/study-materials.api";
import { AccessBadge } from "./MaterialBadges";
import { BuyButton, DownloadButton } from "./MaterialActions";
import { PdfPreview } from "./PdfPreview";
import { noteHeading } from "../../../shared/utils/note-heading";

/** Large preview dialog (first N pages only unless the user already owns the note). */
export function PreviewModal({ m, onClose, onChanged }: { m: Material; onClose: () => void; onChanged: () => void }) {
  return (
    <AppModal open wide title={`${m.title} — preview`} onClose={onClose}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <AccessBadge m={m} /><span>{m.subject.name} · {m.class.name} · {m.board.name}</span>
        {!m.access.can_download && <span className="text-xs text-slate-500">Previewing the first {m.preview_page_limit} of {m.page_count ?? "?"} pages</span>}
      </div>
      <PdfPreview key={m.id} title={`${noteHeading(m)} preview`} load={() => materialsApi.previewBlob(m.id)} />
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {m.access.can_download ? <DownloadButton m={m} /> : m.access_type === "paid" && <BuyButton m={m} showPrice onPaid={() => { onChanged(); onClose(); }} />}
      </div>
    </AppModal>
  );
}
