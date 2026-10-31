import { FormEvent, useState } from "react";
import { AppButton, AppModal, DraftNotice, ErrorState } from "../../../shared/components";
import { useFormDraft } from "../../../shared/hooks/useFormDraft";
import { useMutation } from "../../../shared/hooks/useMutation";
import { Material } from "../../../shared/types";
import { materialsApi } from "../api/study-materials.api";
import { detailsErrors, detailsFromMaterial, hasErrors, NoteDetails, NoteDetailsFields, priceMinor } from "./note-details";

/** Edit a note's details (the file is replaced separately; new notes are added through the "Add notes" wizard). */
export function MaterialFormModal({ material, onClose, onSaved }: { material: Material; onClose: () => void; onSaved: () => void }) {
  // Edits survive closing the dialog (cleared only after saving or "Discard changes").
  const draft = useFormDraft(`material-edit-${material.id}`, { details: detailsFromMaterial(material) as NoteDetails });
  const f = draft.value.details;
  const setF = (details: NoteDetails) => draft.set({ details });
  const [touched, setTouched] = useState(false);
  const errs = detailsErrors(f);

  const save = useMutation(async () => {
    await materialsApi.update(material.id, {
      description: f.description.trim() || null, board_id: +f.board_id, class_id: +f.class_id, subject_id: +f.subject_id, chapter_id: +f.chapter_id,
      topic_id: f.topic_id ? +f.topic_id : null, stream: f.stream, access_type: f.access_type, material_type_id: f.material_type_id ? +f.material_type_id : undefined,
      price_minor_units: priceMinor(f), currency: f.access_type === "paid" ? f.currency.toUpperCase() : null,
      ...(f.preview_page_limit ? { preview_page_limit: +f.preview_page_limit } : {}),
    });
    draft.clear();
    onSaved();
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!hasErrors(errs)) void save.run(); };

  return (
    <AppModal open wide title="Edit note" onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-3">
        <NoteDetailsFields value={f} onChange={setF} errors={touched ? errs : {}} />
        {save.error != null && <ErrorState error={save.error} />}
        <DraftNotice dirty={draft.dirty} restored={draft.restored} onDiscard={() => { draft.clear(); onClose(); }} />
        <div className="flex justify-end gap-2">
          <AppButton variant="secondary" onClick={onClose}>Close</AppButton>
          <AppButton type="submit" loading={save.loading}>Save changes</AppButton>
        </div>
      </form>
    </AppModal>
  );
}
