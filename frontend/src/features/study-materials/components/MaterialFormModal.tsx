import { FormEvent, useState } from "react";
import { AppButton, AppCombobox, AppInput, AppModal, AppSelect, AppTextarea, ErrorState, FileDropzone } from "../../../shared/components";
import { positiveInt, required } from "../../../shared/forms/validation";
import { useMutation } from "../../../shared/hooks/useMutation";
import { Material } from "../../../shared/types";
import { useTaxonomyOptions } from "../../academic/components/useTaxonomyOptions";
import { materialsApi } from "../api/study-materials.api";

interface FormState {
  title: string; description: string; board_id: string; class_id: string; subject_id: string; chapter_id: string; topic_id: string;
  language_id: string; access_type: "free" | "paid"; material_type_id: string; price: string; currency: string; preview_page_limit: string;
}

const initial = (m?: Material): FormState => ({
  title: m?.title ?? "", description: m?.description ?? "", board_id: String(m?.board.id ?? ""), class_id: String(m?.class.id ?? ""),
  subject_id: String(m?.subject.id ?? ""), chapter_id: String(m?.chapter.id ?? ""), topic_id: String(m?.topic?.id ?? ""),
  language_id: String(m?.language.id ?? ""), access_type: m?.access_type ?? "free", material_type_id: String(m?.material_type.id ?? ""),
  price: m?.price_minor_units ? String(m.price_minor_units / 100) : "", currency: m?.currency ?? "INR", preview_page_limit: String(m?.preview_page_limit ?? ""),
});

/** Create (with PDF) or edit (metadata only) a note. Chapter/topic dropdowns only offer values compatible with the parents chosen. */
export function MaterialFormModal({ material, onClose, onSaved }: { material?: Material; onClose: () => void; onSaved: () => void }) {
  const editing = !!material;
  const [f, setF] = useState<FormState>(initial(material));
  const [file, setFile] = useState<File | null>(null);
  const [touched, setTouched] = useState(false);
  const set = (k: keyof FormState) => (v: string) => setF((s) => {
    const next = { ...s, [k]: v };
    if (["board_id", "class_id", "subject_id"].includes(k)) { next.chapter_id = ""; next.topic_id = ""; }
    if (k === "chapter_id") next.topic_id = "";
    return next;
  });

  const board = useTaxonomyOptions("boards");
  const cls = useTaxonomyOptions("classes");
  const subject = useTaxonomyOptions("subjects");
  const language = useTaxonomyOptions("languages");
  const types = useTaxonomyOptions("material-types");
  const ctxReady = !!(f.board_id && f.class_id && f.subject_id);
  const chapter = useTaxonomyOptions("chapters", { board_id: f.board_id, class_id: f.class_id, subject_id: f.subject_id }, ctxReady);
  const topic = useTaxonomyOptions("topics", { chapter_id: f.chapter_id }, !!f.chapter_id);

  const priceMinor = f.access_type === "paid" ? Math.round(parseFloat(f.price) * 100) : null;
  const errs = {
    title: required(f.title, "Title"), board_id: required(f.board_id, "Board"), class_id: required(f.class_id, "Class"), subject_id: required(f.subject_id, "Subject"),
    chapter_id: required(f.chapter_id, "Chapter"), language_id: required(f.language_id, "Language"),
    price: f.access_type === "paid" && !(priceMinor && priceMinor > 0) ? "Enter a price greater than zero" : undefined,
    currency: f.access_type === "paid" && !/^[A-Za-z]{3}$/.test(f.currency) ? "3-letter currency code" : undefined,
    preview_page_limit: f.preview_page_limit && positiveInt(f.preview_page_limit, "Preview pages"),
    file: !editing && !file ? "Choose a PDF" : undefined,
  };
  const invalid = Object.values(errs).some(Boolean);

  const save = useMutation(async () => {
    if (editing) {
      await materialsApi.update(material!.id, {
        title: f.title.trim(), description: f.description.trim() || null, board_id: +f.board_id, class_id: +f.class_id, subject_id: +f.subject_id,
        chapter_id: +f.chapter_id, topic_id: f.topic_id ? +f.topic_id : null, language_id: +f.language_id, access_type: f.access_type, material_type_id: f.material_type_id ? +f.material_type_id : undefined,
        price_minor_units: priceMinor, currency: f.access_type === "paid" ? f.currency.toUpperCase() : null,
        ...(f.preview_page_limit ? { preview_page_limit: +f.preview_page_limit } : {}),
      });
    } else {
      const fd = new FormData();
      const add = (k: string, v: string | number | null | undefined) => { if (v !== undefined && v !== null && v !== "") fd.append(k, String(v)); };
      add("title", f.title.trim()); add("description", f.description.trim());
      add("board_id", f.board_id); add("class_id", f.class_id); add("subject_id", f.subject_id); add("chapter_id", f.chapter_id);
      add("topic_id", f.topic_id); add("language_id", f.language_id); add("access_type", f.access_type); add("material_type_id", f.material_type_id);
      if (f.access_type === "paid") { add("price_minor_units", priceMinor); add("currency", f.currency.toUpperCase()); }
      add("preview_page_limit", f.preview_page_limit);
      fd.append("file", file!);
      await materialsApi.create(fd);
    }
    onSaved();
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!invalid) void save.run(); };
  const e = (k: keyof typeof errs) => (touched ? errs[k] : undefined);

  return (
    <AppModal open wide title={editing ? "Edit note" : "Add note"} onClose={onClose}>
      <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-2">
        <AppInput className="sm:col-span-2" label="Title" value={f.title} onChange={(ev) => set("title")(ev.target.value)} error={e("title")} />
        <AppTextarea className="sm:col-span-2" label="Description" value={f.description} onChange={(ev) => set("description")(ev.target.value)} />
        <AppCombobox label="Board" placeholder="Select…" options={board.options} value={f.board_id} onChange={set("board_id")} error={e("board_id")} />
        <AppCombobox label="Class" placeholder="Select…" options={cls.options} value={f.class_id} onChange={set("class_id")} error={e("class_id")} />
        <AppCombobox label="Subject" placeholder="Select…" options={subject.options} value={f.subject_id} onChange={set("subject_id")} error={e("subject_id")} />
        <AppCombobox label="Language" placeholder="Select…" options={language.options} value={f.language_id} onChange={set("language_id")} error={e("language_id")} />
        <AppCombobox label="Chapter" placeholder={ctxReady ? "Select…" : "Pick board, class and subject first"} options={chapter.options} value={f.chapter_id} onChange={set("chapter_id")} disabled={!ctxReady} error={e("chapter_id")} />
        <AppCombobox label="Topic (optional)" placeholder="None" options={topic.options} value={f.topic_id} onChange={set("topic_id")} disabled={!f.chapter_id} />
        <AppCombobox label="Material type" placeholder="Default (first type)" options={types.options} value={f.material_type_id} onChange={set("material_type_id")} />
        <AppSelect label="Access" options={[{ value: "free", label: "Free" }, { value: "paid", label: "Paid" }]} value={f.access_type} onChange={set("access_type")} />
        <AppInput label="Preview pages (blank = default)" inputMode="numeric" value={f.preview_page_limit} onChange={(ev) => set("preview_page_limit")(ev.target.value)} error={e("preview_page_limit")} />
        {f.access_type === "paid" && <>
          <AppInput label="Price" inputMode="decimal" placeholder="199.00" value={f.price} onChange={(ev) => set("price")(ev.target.value)} error={e("price")} />
          <AppInput label="Currency" maxLength={3} value={f.currency} onChange={(ev) => set("currency")(ev.target.value)} error={e("currency")} />
        </>}
        {!editing && <div className="sm:col-span-2"><FileDropzone file={file} onFile={setFile} error={e("file")} /></div>}
        {save.error != null && <div className="sm:col-span-2"><ErrorState error={save.error} /></div>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <AppButton variant="secondary" onClick={onClose}>Cancel</AppButton>
          <AppButton type="submit" loading={save.loading}>{editing ? "Save changes" : "Upload note"}</AppButton>
        </div>
      </form>
    </AppModal>
  );
}
