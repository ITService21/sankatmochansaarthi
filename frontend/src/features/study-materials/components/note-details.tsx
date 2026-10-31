import { AppCombobox, AppInput, AppSelect, AppTextarea } from "../../../shared/components";
import { useAuth } from "../../../shared/auth/AuthContext";
import { positiveInt, required } from "../../../shared/forms/validation";
import { Material } from "../../../shared/types";
import { useTaxonomyOptions } from "../../academic/components/useTaxonomyOptions";

/** The details shared by every note in an upload (and edited for one note). Everything is a string, as typed in the form. */
export interface NoteDetails {
  description: string; board_id: string; class_id: string; subject_id: string; chapter_id: string; topic_id: string;
  stream: string; access_type: "free" | "paid"; material_type_id: string; price: string; currency: string; preview_page_limit: string;
}

export const STREAM_OPTIONS = [{ value: "science", label: "Science" }, { value: "commerce", label: "Commerce" }, { value: "general", label: "General" }];

/**
 * The "where does this note belong" choices people repeat for hundreds of notes in a row. After each submit they are
 * remembered on this device (localStorage), so the next "Add notes" starts with them already chosen and only the
 * topic (and files) remain to be picked.
 */
const CONTEXT_KEY = "note-last-context";
const CONTEXT_FIELDS = ["board_id", "class_id", "subject_id", "stream", "chapter_id"] as const;
export type NoteContext = Pick<NoteDetails, (typeof CONTEXT_FIELDS)[number]>;

/** The last submitted Board/Class/Subject/Stream/Chapter (empty strings when nothing was saved yet). */
export function loadLastContext(): NoteContext {
  const blank = { board_id: "", class_id: "", subject_id: "", stream: "", chapter_id: "" };
  try {
    const raw = JSON.parse(localStorage.getItem(CONTEXT_KEY) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(CONTEXT_FIELDS.map((k) => [k, typeof raw[k] === "string" ? raw[k] : ""])) as unknown as NoteContext;
  } catch { return blank; }
}

/** Remembers the context of a submitted note (only complete selections, so a half-filled form never overwrites a good one). */
export function saveLastContext(d: NoteDetails): void {
  if (!CONTEXT_FIELDS.every((k) => d[k])) return;
  try { localStorage.setItem(CONTEXT_KEY, JSON.stringify(Object.fromEntries(CONTEXT_FIELDS.map((k) => [k, d[k]])))); } catch { /* storage unavailable */ }
}

/** A fresh form that already carries the last submitted context. */
export const startingDetails = (): NoteDetails => ({ ...emptyDetails(), ...loadLastContext() });

export const emptyDetails = (): NoteDetails => ({
  description: "", board_id: "", class_id: "", subject_id: "", chapter_id: "", topic_id: "", stream: "", access_type: "free", material_type_id: "", price: "", currency: "INR", preview_page_limit: "",
});

export const detailsFromMaterial = (m: Material): NoteDetails => ({
  description: m.description ?? "", board_id: String(m.board.id), class_id: String(m.class.id), subject_id: String(m.subject.id), chapter_id: String(m.chapter.id), topic_id: String(m.topic?.id ?? ""),
  stream: m.stream, access_type: m.access_type, material_type_id: String(m.material_type.id), price: m.price_minor_units ? String(m.price_minor_units / 100) : "", currency: m.currency ?? "INR", preview_page_limit: String(m.preview_page_limit ?? ""),
});

/** Price in the smallest currency unit (paise), or null for free notes. */
export const priceMinor = (d: NoteDetails) => (d.access_type === "paid" ? Math.round(parseFloat(d.price) * 100) : null);

/** Form -> the text fields the API expects (blank values omitted). */
export function detailsToFields(d: NoteDetails): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (k: string, v: string | number | null | undefined) => { if (v !== undefined && v !== null && v !== "" && !Number.isNaN(v)) out[k] = String(v); };
  add("description", d.description.trim()); add("board_id", d.board_id); add("class_id", d.class_id); add("subject_id", d.subject_id);
  add("chapter_id", d.chapter_id); add("topic_id", d.topic_id); add("stream", d.stream); add("access_type", d.access_type); add("material_type_id", d.material_type_id);
  if (d.access_type === "paid") { add("price_minor_units", priceMinor(d)); add("currency", d.currency.toUpperCase()); }
  add("preview_page_limit", d.preview_page_limit);
  return out;
}

/** API text fields (a saved draft's details) -> form values. */
export function detailsFromFields(f: Record<string, string>): NoteDetails {
  const paid = f.access_type === "paid";
  return {
    ...emptyDetails(), description: f.description ?? "", board_id: f.board_id ?? "", class_id: f.class_id ?? "", subject_id: f.subject_id ?? "", chapter_id: f.chapter_id ?? "", topic_id: f.topic_id ?? "",
    stream: f.stream ?? "general", access_type: paid ? "paid" : "free", material_type_id: f.material_type_id ?? "",
    price: paid && f.price_minor_units ? String(Number(f.price_minor_units) / 100) : "", currency: f.currency ?? "INR", preview_page_limit: f.preview_page_limit ?? "",
  };
}

export type DetailsErrors = Partial<Record<"board_id" | "class_id" | "subject_id" | "stream" | "chapter_id" | "price" | "currency" | "preview_page_limit", string>>;

export function detailsErrors(d: NoteDetails): DetailsErrors {
  const minor = priceMinor(d);
  return {
    board_id: required(d.board_id, "Board"), class_id: required(d.class_id, "Class"), subject_id: required(d.subject_id, "Subject"), stream: required(d.stream, "Stream"), chapter_id: required(d.chapter_id, "Chapter"),
    price: d.access_type === "paid" && !(minor && minor > 0) ? "Enter a price greater than zero" : undefined,
    currency: d.access_type === "paid" && !/^[A-Za-z]{3}$/.test(d.currency) ? "3-letter currency code" : undefined,
    preview_page_limit: d.preview_page_limit ? positiveInt(d.preview_page_limit, "Preview pages") : undefined,
  };
}
export const hasErrors = (e: DetailsErrors) => Object.values(e).some(Boolean);

/** Changing a parent clears the dependent chapter/topic (the chapter list depends on board, class, subject AND stream). */
export function setDetail(d: NoteDetails, k: keyof NoteDetails, v: string): NoteDetails {
  const next = { ...d, [k]: v };
  if (["board_id", "class_id", "subject_id", "stream"].includes(k)) { next.chapter_id = ""; next.topic_id = ""; }
  if (k === "chapter_id") next.topic_id = "";
  return next;
}

/**
 * The shared note form fields, filled in this fixed order so an inconsistent combination can never be built:
 * Board → Class → Stream → Subject → Chapter → Topic. Each field unlocks only after the one before it is chosen, and the
 * chapter list shows only chapters of that board, class, subject and stream (plus "general" chapters valid for any stream).
 * An Admin restricted to certain boards/classes/subjects only sees those (the server enforces it regardless).
 */
export function NoteDetailsFields({ value: f, onChange, errors = {}, columns = 2 }: { value: NoteDetails; onChange: (d: NoteDetails) => void; errors?: DetailsErrors; columns?: 2 | 3 }) {
  const { user, can } = useAuth();
  const set = (k: keyof NoteDetails) => (v: string) => onChange(setDetail(f, k, v));
  const inScope = (ids: number[] | undefined) => (o: { value: string | number }) => !ids?.length || ids.includes(Number(o.value));
  const board = useTaxonomyOptions("boards");
  const cls = useTaxonomyOptions("classes");
  const subject = useTaxonomyOptions("subjects");
  const types = useTaxonomyOptions("material-types");
  const ctxReady = !!(f.board_id && f.class_id && f.subject_id && f.stream);
  const chapter = useTaxonomyOptions("chapters", { board_id: f.board_id, class_id: f.class_id, subject_id: f.subject_id, stream: f.stream }, ctxReady);
  const topic = useTaxonomyOptions("topics", { chapter_id: f.chapter_id }, !!f.chapter_id);
  const sc = user?.role === "Admin" ? user.scopes : undefined;
  const streamName = STREAM_OPTIONS.find((o) => o.value === f.stream)?.label ?? "";
  const noChapters = `No ${streamName} chapters for this board, class and subject yet.${can("academic.manage") ? " Add one in Academic Setup → Chapters." : " Ask a Super Admin to add one."}`;

  return (
    <div className={`grid gap-3 ${columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      <AppTextarea className={columns === 3 ? "sm:col-span-3" : "sm:col-span-2"} {...(columns === 3 ? { rows: 2 } : {})} label="Description" value={f.description} onChange={(ev) => set("description")(ev.target.value)} />
      <AppCombobox required label="Board" placeholder="Select…" options={board.options.filter(inScope(sc?.board_ids))} value={f.board_id} onChange={set("board_id")} error={errors.board_id} />
      <AppCombobox required label="Class" placeholder={f.board_id ? "Select…" : "Choose a board first"} options={cls.options.filter(inScope(sc?.class_ids))} value={f.class_id} onChange={set("class_id")} disabled={!f.board_id} error={errors.class_id} />
      <AppSelect required label="Stream" placeholder={f.class_id ? "Select…" : "Choose a class first"} options={STREAM_OPTIONS} value={f.stream} onChange={set("stream")} disabled={!f.class_id} error={errors.stream} />
      <AppCombobox required label="Subject" placeholder={f.stream ? "Select…" : "Choose a stream first"} options={subject.options.filter(inScope(sc?.subject_ids))} value={f.subject_id} onChange={set("subject_id")} disabled={!f.stream} error={errors.subject_id} />
      <AppCombobox required label="Chapter" placeholder={ctxReady ? "Select…" : "Choose the subject first"} options={chapter.options} value={f.chapter_id} onChange={set("chapter_id")} disabled={!ctxReady} error={errors.chapter_id}
        emptyMessage={chapter.loading ? "Loading chapters…" : noChapters} />
      <AppCombobox label="Topic (optional)" placeholder={f.chapter_id ? "None" : "Choose a chapter first"} options={topic.options} value={f.topic_id} onChange={set("topic_id")} disabled={!f.chapter_id} emptyMessage={`This chapter has no topics yet — topics are optional, so you can leave this blank.${can("academic.manage") ? " Add some in Academic Setup → Topics." : ""}`} />
      <AppCombobox label="Material type" placeholder="Default (first type)" options={types.options} value={f.material_type_id} onChange={set("material_type_id")} />
      <AppSelect label="Access" options={[{ value: "free", label: "Free" }, { value: "paid", label: "Paid" }]} value={f.access_type} onChange={set("access_type")} />
      <AppInput label="Preview pages (blank = default)" inputMode="numeric" value={f.preview_page_limit} onChange={(ev) => set("preview_page_limit")(ev.target.value)} error={errors.preview_page_limit} />
      {f.access_type === "paid" && <>
        <AppInput required label="Price" inputMode="decimal" placeholder="199.00" value={f.price} onChange={(ev) => set("price")(ev.target.value)} error={errors.price} />
        <AppInput required label="Currency" maxLength={3} value={f.currency} onChange={(ev) => set("currency")(ev.target.value)} error={errors.currency} />
      </>}
    </div>
  );
}
