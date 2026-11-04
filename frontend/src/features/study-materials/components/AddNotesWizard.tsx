import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Eye, FileCheck2, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { ApiError } from "../../../shared/api/http-client";
import { AppButton, AppCombobox, AppInput, AppModal, AppSelect, DraftNotice, ErrorState, LoadingState, MultiFileDropzone } from "../../../shared/components";
import { useAuth } from "../../../shared/auth/AuthContext";
import { academicApi } from "../../academic/api/academic.api";
import { useTaxonomyOptions } from "../../academic/components/useTaxonomyOptions";
import { useAsync } from "../../../shared/hooks/useAsync";
import { useMutation } from "../../../shared/hooks/useMutation";
import { useFormDraft } from "../../../shared/hooks/useFormDraft";
import { formatFileSize } from "../../../shared/utils/format-file-size";
import { DraftBatch, materialsApi, UploadDraft } from "../api/study-materials.api";
import { PdfPreview } from "./PdfPreview";
import { detailsErrors, detailsFromFields, detailsToFields, hasErrors, loadLastContext, NoteDetails, NoteDetailsFields, saveLastContext, startingDetails } from "./note-details";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.doc,.docx";
const MAX_FILES = 10;
const MAX_BULK_FILES = 50;
/** Files sent to the server per request (the server accepts MAX_UPLOAD_FILES per call, default 10). */
const CHUNK = 10;
const fileKey = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;
/** What can differ from note to note in a bulk import; everything else comes from the shared details. */
interface FileMeta { topic_id: string; material_type_id: string; preview_page_limit: string; access_type: "free" | "paid"; price: string }
const blankMeta = (): FileMeta => ({ topic_id: "", material_type_id: "", preview_page_limit: "", access_type: "free", price: "" });
const metaPriceOk = (m: FileMeta) => m.access_type !== "paid" || parseFloat(m.price) > 0;
const metaValid = (m: FileMeta) => !!m.topic_id && metaPriceOk(m);
const FORMAT_LABEL: Record<string, string> = { pdf: "PDF", jpg: "JPG", png: "PNG", docx: "DOCX", doc: "DOC", images: "IMAGES" };
const isImage = (f: File) => /\.(jpe?g|png)$/i.test(f.name);

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");

/**
 * Add notes in two steps, so nothing is saved by accident:
 *  1. Details & files — pick PDF / JPG / PNG / DOC / DOCX files (several at once) and fill in the shared details.
 *     Each file is converted to PDF on the server and parked as a draft.
 *  2. Review — preview every converted PDF, tweak its details, then Accept (saves the note) or Discard.
 * Drafts live on the server (kept 14 days) and the form is remembered in the browser, so closing the dialog, going back
 * or reloading the page never loses the work: reopening "Add notes" resumes at the review step.
 */
export function AddNotesWizard({ onClose, onChanged, bulk = false }: { onClose: () => void; onChanged: () => void; bulk?: boolean }) {
  const title = bulk ? "Bulk import notes" : "Add notes";
  const loaded = useAsync(() => materialsApi.listDrafts(), []);
  if (loaded.loading) return <AppModal open wide compact title={title} onClose={onClose}><LoadingState /></AppModal>;
  if (loaded.error != null) return <AppModal open wide compact title={title} onClose={onClose}><ErrorState error={loaded.error} onRetry={loaded.reload} /></AppModal>;
  return <Wizard bulk={bulk} title={title} initialDrafts={loaded.data ?? []} onClose={onClose} onChanged={onChanged} />;
}

function Wizard({ initialDrafts, onClose, onChanged, bulk, title }: { bulk: boolean; title: string; initialDrafts: UploadDraft[]; onClose: () => void; onChanged: () => void }) {
  const [drafts, setDrafts] = useState<UploadDraft[]>(initialDrafts);
  const [step, setStep] = useState<"details" | "files" | "review">(initialDrafts.length ? "review" : "details");
  // Details AND the chosen files are kept when the dialog is closed (files in memory only). Erased when everything is saved,
  // or by "Discard changes" — never by closing the window.
  const draft = useFormDraft(bulk ? "note-bulk-wizard" : "note-wizard", { details: startingDetails() as NoteDetails, files: [] as File[], combine: true }, { volatile: ["files"] });
  const { details, files, combine } = draft.value;
  const imageCount = files.filter(isImage).length;
  const setDetails = (d: NoteDetails) => draft.set((p) => ({ ...p, details: d }));
  const setFiles = (f: File[]) => draft.set((p) => ({ ...p, files: f }));
  const [triedRows, setTriedRows] = useState(false);
  const [fileMeta, setFileMeta] = useState<Record<string, FileMeta>>({});
  const [failed, setFailed] = useState<DraftBatch["failed"]>([]);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(0);
  // Bulk import chooses Access (and price) per note on the next step, so the shared form is not checked for it.
  const errs = detailsErrors(bulk ? { ...details, access_type: "free" } : details);

  const convert = useMutation(async () => {
    // Files are grouped by their own topic (falling back to the shared Topic field) and sent in chunks, so one upload can
    // hold many notes that differ only by topic.
    const groups = new Map<string, File[]>();
    const metaOf = (f: File): FileMeta => ({ ...blankMeta(), ...(bulk ? fileMeta[fileKey(f)] : { topic_id: details.topic_id, material_type_id: details.material_type_id, preview_page_limit: details.preview_page_limit, access_type: details.access_type, price: details.price }) });
    for (const f of files) { const k = JSON.stringify(metaOf(f)); groups.set(k, [...(groups.get(k) ?? []), f]); }
    const made: UploadDraft[] = []; const bad: DraftBatch["failed"] = [];
    for (const [metaKey, group] of groups) {
      const m = JSON.parse(metaKey) as FileMeta;
      for (let i = 0; i < group.length; i += CHUNK) {
        const chunk = group.slice(i, i + CHUNK);
        const fd = new FormData();
        for (const [k, v] of Object.entries(detailsToFields(bulk ? { ...details, ...m } : details))) fd.append(k, v);
        for (const f of chunk) fd.append("files", f);
        if (combine && chunk.filter(isImage).length > 1) fd.append("combine_images", "true");
        try { const res = await materialsApi.createDrafts(fd); made.push(...res.drafts); bad.push(...res.failed); }
        catch (e) { bad.push(...chunk.map((f) => ({ filename: f.name, message: `${f.name}: ${messageOf(e)}` }))); }
      }
    }
    setDrafts((d) => [...d, ...made]);
    setFailed(bad);
    if (made.length) {
      // Submitted: remember Board/Class/Subject/Stream/Chapter and get the form ready for the next batch.
      saveLastContext(details);
      draft.set((p) => ({ ...p, details: { ...startingDetails(), ...loadLastContext() }, files: [] }));
      setFileMeta({});
      setStep("review");
    } else setFiles([]);
  });
  const startConvert = () => {
    setTouched(true);
    if (bulk) { setTriedRows(true); if (files.some((f) => !metaValid({ ...blankMeta(), ...fileMeta[fileKey(f)] }))) return; }
    if (!hasErrors(errs) && files.length) void convert.run();
  };
  const nextToFiles = () => { setTouched(true); if (!hasErrors(errs)) setStep("files"); };

  // Closing keeps the work. Only when notes were saved and nothing is left to review is the form considered finished and cleared.
  const finish = () => { if (saved) onChanged(); if (saved && drafts.length === 0) draft.clear(); onClose(); };

  return (
    <AppModal open wide compact title={title} onClose={finish}>
      <ol className="mb-4 flex flex-wrap items-center gap-2 text-sm font-semibold" aria-label="Steps">
        {(bulk ? [["details", "1 · Details"], ["files", "2 · Add notes"], ["review", `3 · Review${drafts.length ? ` (${drafts.length})` : ""}`]] : [["details", "1 · Details & files"], ["review", `2 · Review${drafts.length ? ` (${drafts.length})` : ""}`]]).map(([k, label], i) => (
          <li key={k} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden className="text-slate-300">—</span>}
            <span className={`rounded-full px-3 py-1 ${step === k ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>{label}</span>
          </li>
        ))}
      </ol>

      {step === "details" && (
        <div className="space-y-4">
          {drafts.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <span><b>{drafts.length}</b> converted file{drafts.length > 1 ? "s are" : " is"} waiting for your review.</span>
              <AppButton size="sm" onClick={() => setStep("review")}>Go to review <ArrowRight size={14} /></AppButton>
            </div>
          )}
          <NoteDetailsFields columns={3} bulk={bulk} value={details} onChange={setDetails} errors={touched ? errs : {}} />
          {!bulk && <MultiFileDropzone required files={files} onFiles={setFiles} accept={ACCEPT} max={bulk ? MAX_BULK_FILES : MAX_FILES} label="Files" hint={`PDF, JPG, PNG, DOC or DOCX — up to ${bulk ? MAX_BULK_FILES : MAX_FILES} at a time. Everything is converted to PDF; you check it before it is saved.`}
            error={touched && !files.length ? "Choose at least one file" : undefined} />}
          {!bulk && imageCount > 1 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600" checked={combine} onChange={(e) => draft.set((p) => ({ ...p, combine: e.target.checked }))} />
              <span><b>Combine my {imageCount} images into one PDF</b> — one note with one page per image, in the order shown above. Untick to make a separate note for each image.</span>
            </label>
          )}
          {convert.error != null && <ErrorState error={convert.error} />}
          {failed.length > 0 && <FailedList failed={failed} />}
          <DraftNotice dirty={draft.dirty} restored={draft.restored} onDiscard={() => { draft.clear(); setTouched(false); }} />
          <div className="flex justify-end gap-2">
            <AppButton variant="secondary" onClick={finish}>Close</AppButton>
            {bulk ? <AppButton onClick={nextToFiles}>Next <ArrowRight size={16} /></AppButton>
              : <AppButton loading={convert.loading} onClick={startConvert}>Convert &amp; review <ArrowRight size={16} /></AppButton>}
          </div>
        </div>
      )}

      {step === "files" && (
        <div className="space-y-4">
          <ContextSummary details={details} />
          <FilesStep files={files} setFiles={setFiles} chapterId={details.chapter_id} meta={fileMeta} setMeta={setFileMeta} showErrors={triedRows} />
          {convert.error != null && <ErrorState error={convert.error} />}
          {failed.length > 0 && <FailedList failed={failed} />}
          <div className="flex justify-between gap-2">
            <AppButton variant="secondary" onClick={() => setStep("details")}><ArrowLeft size={16} />Back</AppButton>
            <AppButton loading={convert.loading} disabled={!files.length} onClick={startConvert}>Review ({files.length}) <ArrowRight size={16} /></AppButton>
          </div>
        </div>
      )}

      {step === "review" && (
        <Review drafts={drafts} setDrafts={setDrafts} failed={failed} onBack={() => setStep(bulk ? "files" : "details")} onClose={finish} onSaved={() => { setSaved((n) => n + 1); onChanged(); }} />
      )}
    </AppModal>
  );
}

/** Read-only recap of the shared details chosen on step 1, so every note added below clearly inherits them. */
function ContextSummary({ details: d }: { details: NoteDetails }) {
  const board = useTaxonomyOptions("boards");
  const cls = useTaxonomyOptions("classes");
  const subject = useTaxonomyOptions("subjects");
  const chapter = useTaxonomyOptions("chapters", { board_id: d.board_id, class_id: d.class_id, subject_id: d.subject_id, stream: d.stream }, !!(d.board_id && d.class_id && d.subject_id && d.stream));
  const name = (o: { options: { value: string | number; label: string }[] }, id: string) => o.options.find((x) => String(x.value) === id)?.label ?? "…";
  const items: [string, string][] = [["Board", name(board, d.board_id)], ["Class", name(cls, d.class_id)], ["Stream", d.stream.charAt(0).toUpperCase() + d.stream.slice(1)],
    ["Subject", name(subject, d.subject_id)], ["Chapter", name(chapter, d.chapter_id)]];
  return (
    <dl className="grid gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-sm sm:grid-cols-5">
      {items.map(([k, v]) => <div key={k}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</dt><dd className="font-medium text-slate-900">{v}</dd></div>)}
    </dl>
  );
}

/**
 * Bulk import, step 2: every note below shares the details above. "Add more" picks files straight away; each file is a card
 * with its own Topic, Material type, Access (and price) and Preview pages. "Same for all" fills those in for every card at once.
 * Topic is required for every note; a new topic can be created by typing its name.
 */
function FilesStep({ files, setFiles, chapterId, meta, setMeta, showErrors }: { files: File[]; setFiles: (f: File[]) => void; chapterId: string; meta: Record<string, FileMeta>; setMeta: (m: Record<string, FileMeta>) => void; showErrors: boolean }) {
  const { can } = useAuth();
  const picker = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");
  const [all, setAll] = useState<FileMeta>(blankMeta());
  const topic = useTaxonomyOptions("topics", { chapter_id: chapterId }, !!chapterId);
  const types = useTaxonomyOptions("material-types");
  const metaOf = (f: File): FileMeta => ({ ...blankMeta(), ...meta[fileKey(f)] });
  const patch = (f: File, p: Partial<FileMeta>) => setMeta({ ...meta, [fileKey(f)]: { ...metaOf(f), ...p } });
  const applyAll = () => setMeta(Object.fromEntries(files.map((f) => [fileKey(f), { ...metaOf(f), material_type_id: all.material_type_id, preview_page_limit: all.preview_page_limit, access_type: all.access_type, price: all.price }])));
  const createTopic = async (name: string) => {
    const t = await academicApi.create("topics", { name, chapter_id: Number(chapterId) });
    topic.addOption({ value: t.id, label: t.name });
    return String(t.id);
  };
  const addFiles = (picked: FileList | null) => {
    if (!picked) return;
    const known = new Set(files.map(fileKey));
    const fresh = Array.from(picked).filter((f) => /\.(pdf|jpe?g|png|docx?)$/i.test(f.name) && !known.has(fileKey(f)));
    const room = MAX_BULK_FILES - files.length;
    setNotice(fresh.length > room ? `Only ${MAX_BULK_FILES} files fit in one import — ${fresh.length - room} not added.` : picked.length > fresh.length ? "Some files were skipped (already added, or not PDF/JPG/PNG/DOC/DOCX)." : "");
    setFiles([...files, ...fresh.slice(0, Math.max(0, room))]);
    if (picker.current) picker.current.value = "";
  };
  const remove = (f: File) => setFiles(files.filter((x) => fileKey(x) !== fileKey(f)));
  const accessOptions = [{ value: "free", label: "Free" }, { value: "paid", label: "Paid" }];
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">Notes in this import ({files.length}/{MAX_BULK_FILES})</p>
        <div className="flex gap-2">
          <AppButton size="sm" onClick={() => picker.current?.click()} disabled={files.length >= MAX_BULK_FILES}><Plus size={14} />Add more</AppButton>
        </div>
        <input ref={picker} type="file" multiple hidden accept={ACCEPT} onChange={(e) => addFiles(e.target.files)} />
      </div>
      {notice && <p role="status" className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{notice}</p>}
      {files.length > 1 && (
        <div className="grid items-end gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-5">
          <AppCombobox label="Material type" placeholder="Default (first type)" options={types.options} value={all.material_type_id} onChange={(v) => setAll({ ...all, material_type_id: v })} />
          <AppSelect label="Access" options={accessOptions} value={all.access_type} onChange={(v) => setAll({ ...all, access_type: v as FileMeta["access_type"] })} />
          <AppInput label="Price" inputMode="decimal" placeholder="199.00" disabled={all.access_type !== "paid"} value={all.price} onChange={(ev) => setAll({ ...all, price: ev.target.value })} />
          <AppInput label="Preview pages" inputMode="numeric" placeholder="Default" value={all.preview_page_limit} onChange={(ev) => setAll({ ...all, preview_page_limit: ev.target.value })} />
          <AppButton variant="secondary" onClick={applyAll}>Same for all</AppButton>
        </div>
      )}
      {files.length === 0 ? (
        <button type="button" onClick={() => picker.current?.click()} className="w-full rounded-xl border-2 border-dashed border-slate-300 p-8 text-sm text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/40">
          Click <b>Add more</b> (or here) to choose files — PDF, JPG, PNG, DOC or DOCX. Each one becomes a note with the details above.
        </button>
      ) : (
        <ul className="space-y-3">
          {files.map((f) => {
            const m = metaOf(f);
            return (
              <li key={fileKey(f)} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-800" title={f.name}>{f.name} <span className="text-xs font-normal text-slate-400">{formatFileSize(f.size)}</span></span>
                  <AppButton size="sm" variant="danger" onClick={() => remove(f)} aria-label={`Remove ${f.name}`}><Trash2 size={14} /></AppButton>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  <AppCombobox required label="Topic" error={showErrors && !m.topic_id ? "Choose or create a topic" : undefined} createNoun="topic" onCreate={can("academic.manage") ? createTopic : undefined} placeholder="Select…" options={topic.options} value={m.topic_id} onChange={(v) => patch(f, { topic_id: v })} emptyMessage="No topics yet — type a name to create one." />
                  <AppCombobox label="Material type" placeholder="Default (first type)" options={types.options} value={m.material_type_id} onChange={(v) => patch(f, { material_type_id: v })} />
                  <AppSelect label="Access" options={accessOptions} value={m.access_type} onChange={(v) => patch(f, { access_type: v as FileMeta["access_type"] })} />
                  <AppInput label="Preview pages (blank = default)" inputMode="numeric" value={m.preview_page_limit} onChange={(ev) => patch(f, { preview_page_limit: ev.target.value })} />
                  {m.access_type === "paid" && <AppInput required label="Price" inputMode="decimal" placeholder="199.00" value={m.price} onChange={(ev) => patch(f, { price: ev.target.value })} error={metaPriceOk(m) ? undefined : "Enter a price greater than zero"} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FailedList({ failed }: { failed: DraftBatch["failed"] }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <p className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle size={16} />{failed.length} file{failed.length > 1 ? "s" : ""} could not be converted</p>
      <ul className="list-disc space-y-0.5 pl-5">{failed.map((f) => <li key={f.filename}>{f.message}</li>)}</ul>
    </div>
  );
}

function Review({ drafts, setDrafts, failed, onBack, onClose, onSaved }: {
  drafts: UploadDraft[]; setDrafts: (fn: (d: UploadDraft[]) => UploadDraft[]) => void; failed: DraftBatch["failed"]; onBack: () => void; onClose: () => void; onSaved: () => void;
}) {
  const [edits, setEdits] = useState<Record<number, NoteDetails>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [justSaved, setJustSaved] = useState<string[]>([]);
  const detailsOf = (d: UploadDraft) => edits[d.id] ?? detailsFromFields(d.metadata);

  const accept = async (d: UploadDraft): Promise<boolean> => {
    const cur = detailsOf(d);
    if (hasErrors(detailsErrors(cur))) { setErrors((e) => ({ ...e, [d.id]: "Fill in the required details first (open “Edit details”)." })); return false; }
    setBusy((b) => ({ ...b, [d.id]: true })); setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => Number(k) !== d.id)));
    try {
      await materialsApi.acceptDraft(d.id, detailsToFields(cur));
      saveLastContext(cur);
      setDrafts((all) => all.filter((x) => x.id !== d.id));
      setJustSaved((s) => [...s, d.original_filename]);
      onSaved();
      return true;
    } catch (err) {
      setErrors((e) => ({ ...e, [d.id]: messageOf(err) }));
      return false;
    } finally { setBusy((b) => ({ ...b, [d.id]: false })); }
  };
  const discard = async (d: UploadDraft) => {
    setBusy((b) => ({ ...b, [d.id]: true }));
    try { await materialsApi.discardDraft(d.id); setDrafts((all) => all.filter((x) => x.id !== d.id)); }
    catch (err) { setErrors((e) => ({ ...e, [d.id]: messageOf(err) })); }
    finally { setBusy((b) => ({ ...b, [d.id]: false })); }
  };
  const acceptAll = useMutation(async () => { for (const d of drafts) await accept(d); });

  return (
    <div className="space-y-3">
      {failed.length > 0 && <FailedList failed={failed} />}
      {justSaved.length > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800"><CheckCircle2 size={16} className="mt-0.5 shrink-0" />Saved as draft notes: {justSaved.join(", ")}. Publish them from the Manage notes list.</p>
      )}
      {drafts.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-600">
          <FileCheck2 className="mx-auto mb-2 text-slate-400" />
          Nothing waiting for review.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">Check each converted PDF, then <b>Accept</b> to save it as a note or <b>Discard</b> it.</p>
            {drafts.length > 1 && <AppButton size="sm" loading={acceptAll.loading} onClick={() => void acceptAll.run()}>Accept all ({drafts.length})</AppButton>}
          </div>
          <ul className="space-y-3">
            {drafts.map((d) => (
              <DraftCard key={d.id} draft={d} details={detailsOf(d)} onDetails={(v) => setEdits((e) => ({ ...e, [d.id]: v }))} error={errors[d.id]} busy={!!busy[d.id]}
                onAccept={() => void accept(d)} onDiscard={() => void discard(d)} />
            ))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <AppButton variant="secondary" onClick={onBack}><ArrowLeft size={16} />Back to details</AppButton>
        <div className="flex items-center gap-3">
          {drafts.length > 0 && <span className="text-xs text-slate-500">Unreviewed files are kept for you — reopen “Add notes” any time.</span>}
          <AppButton variant={drafts.length ? "secondary" : "primary"} onClick={onClose}>{drafts.length ? "Close, review later" : "Done"}</AppButton>
        </div>
      </div>
    </div>
  );
}

/** The note's topic by name as the card heading (the file name when it has no topic), with the file name shown as a tag below. */
function TopicName({ chapterId, topicId, fallback }: { chapterId: string; topicId: string; fallback: string }) {
  const topic = useTaxonomyOptions("topics", { chapter_id: chapterId }, !!chapterId && !!topicId);
  return <>{topic.options.find((o) => String(o.value) === topicId)?.label ?? fallback}</>;
}

function DraftCard({ draft: d, details, onDetails, error, busy, onAccept, onDiscard }: {
  draft: UploadDraft; details: NoteDetails; onDetails: (d: NoteDetails) => void; error?: string; busy: boolean; onAccept: () => void; onDiscard: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const converted = d.conversion_method !== "none";
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900"><TopicName chapterId={details.chapter_id} topicId={details.topic_id} fallback={d.original_filename} /></p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">{FORMAT_LABEL[d.source_format]}{converted ? " → PDF" : ""}</span>
            <span>{d.page_count} page{d.page_count === 1 ? "" : "s"}</span><span>{formatFileSize(d.file_size_bytes)}</span>
            <span className="max-w-[18rem] truncate rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700" title={d.original_filename}>File: {d.original_filename}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AppButton size="sm" variant="secondary" onClick={() => setShowPreview((v) => !v)}><Eye size={14} />{showPreview ? "Hide preview" : "Preview"}</AppButton>
          <AppButton size="sm" variant="secondary" onClick={() => setShowDetails((v) => !v)}>Edit details <ChevronDown size={14} className={showDetails ? "rotate-180" : ""} /></AppButton>
          <AppButton size="sm" loading={busy} onClick={onAccept}><CheckCircle2 size={14} />Accept</AppButton>
          <AppButton size="sm" variant="danger" disabled={busy} onClick={onDiscard}><Trash2 size={14} />Discard</AppButton>
        </div>
      </div>
      {d.conversion_note && <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-900"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{d.conversion_note}</p>}
      {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      {showDetails && <div className="mt-3 border-t pt-3"><NoteDetailsFields value={details} onChange={onDetails} errors={detailsErrors(details)} /></div>}
      {showPreview && <div className="mt-3 border-t pt-3"><PdfPreview key={d.id} title={`${d.original_filename} converted preview`} load={() => materialsApi.draftPdf(d.id)} className="min-h-[50vh]" /></div>}
    </li>
  );
}
