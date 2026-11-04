import { AppCombobox } from "../../../shared/components";
import { useTaxonomyOptions } from "../../academic/components/useTaxonomyOptions";

export interface TaxonomyValue { board_id: string; class_id: string; subject_id: string; chapter_id: string }
export const emptyTaxonomy = (): TaxonomyValue => ({ board_id: "", class_id: "", subject_id: "", chapter_id: "" });

/**
 * Board → Class → Subject (→ Chapter) pickers for the question bank, papers and filters. Each level unlocks after the one before it and changing
 * a parent clears the levels below it. Data comes from the academic setup (database), never from constants.
 * @param withChapter show the Chapter picker
 * @param optional show an "All" row (filters) instead of requiring a choice
 */
export function TaxonomyPicker({ value, onChange, withChapter = true, optional = false, required = false }: { value: TaxonomyValue; onChange: (v: TaxonomyValue) => void; withChapter?: boolean; optional?: boolean; required?: boolean }) {
  const board = useTaxonomyOptions("boards"); const cls = useTaxonomyOptions("classes"); const subject = useTaxonomyOptions("subjects");
  const ready = !!(value.board_id && value.class_id && value.subject_id);
  const chapter = useTaxonomyOptions("chapters", { board_id: value.board_id, class_id: value.class_id, subject_id: value.subject_id }, withChapter && ready);
  const ph = optional ? "All" : "Select…";
  const set = (k: keyof TaxonomyValue) => (v: string) => onChange({ ...value, [k]: v, ...(k === "board_id" || k === "class_id" || k === "subject_id" ? { chapter_id: "" } : {}) });
  return (
    <>
      <AppCombobox required={required} label="Board" placeholder={ph} options={board.options} value={value.board_id} onChange={set("board_id")} />
      <AppCombobox required={required} label="Class" placeholder={ph} options={cls.options} value={value.class_id} onChange={set("class_id")} />
      <AppCombobox required={required} label="Subject" placeholder={ph} options={subject.options} value={value.subject_id} onChange={set("subject_id")} />
      {withChapter && <AppCombobox required={required} label="Chapter" placeholder={ready ? ph : "Choose board, class, subject first"} options={chapter.options} value={value.chapter_id} onChange={set("chapter_id")} disabled={!ready} emptyMessage={chapter.loading ? "Loading…" : "No chapters yet for this combination"} />}
    </>
  );
}
