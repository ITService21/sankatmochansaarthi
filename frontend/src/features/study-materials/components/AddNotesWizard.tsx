import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Eye, FileCheck2, Trash2 } from "lucide-react";
import { useState } from "react";
import { ApiError } from "../../../shared/api/http-client";
import { AppButton, AppModal, DraftNotice, ErrorState, LoadingState, MultiFileDropzone } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { useMutation } from "../../../shared/hooks/useMutation";
import { useFormDraft } from "../../../shared/hooks/useFormDraft";
import { formatFileSize } from "../../../shared/utils/format-file-size";
import { DraftBatch, materialsApi, UploadDraft } from "../api/study-materials.api";
import { PdfPreview } from "./PdfPreview";
import { detailsErrors, detailsFromFields, detailsToFields, hasErrors, loadLastContext, NoteDetails, NoteDetailsFields, saveLastContext, startingDetails } from "./note-details";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.doc,.docx";
const MAX_FILES = 10;
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
export function AddNotesWizard({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const loaded = useAsync(() => materialsApi.listDrafts(), []);
  if (loaded.loading) return <AppModal open wide compact title="Add notes" onClose={onClose}><LoadingState /></AppModal>;
  if (loaded.error != null) return <AppModal open wide compact title="Add notes" onClose={onClose}><ErrorState error={loaded.error} onRetry={loaded.reload} /></AppModal>;
  return <Wizard initialDrafts={loaded.data ?? []} onClose={onClose} onChanged={onChanged} />;
}

function Wizard({ initialDrafts, onClose, onChanged }: { initialDrafts: UploadDraft[]; onClose: () => void; onChanged: () => void }) {
  const [drafts, setDrafts] = useState<UploadDraft[]>(initialDrafts);
  const [step, setStep] = useState<"details" | "review">(initialDrafts.length ? "review" : "details");
  // Details AND the chosen files are kept when the dialog is closed (files in memory only). Erased when everything is saved,
  // or by "Discard changes" — never by closing the window.
  const draft = useFormDraft("note-wizard", { details: startingDetails() as NoteDetails, files: [] as File[], combine: true }, { volatile: ["files"] });
  const { details, files, combine } = draft.value;
  const imageCount = files.filter(isImage).length;
  const setDetails = (d: NoteDetails) => draft.set((p) => ({ ...p, details: d }));
  const setFiles = (f: File[]) => draft.set((p) => ({ ...p, files: f }));
  const [failed, setFailed] = useState<DraftBatch["failed"]>([]);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(0);
  const errs = detailsErrors(details);

  const convert = useMutation(async () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(detailsToFields(details))) fd.append(k, v);
    for (const f of files) fd.append("files", f);
    if (combine && imageCount > 1) fd.append("combine_images", "true");
    const res = await materialsApi.createDrafts(fd);
    setDrafts((d) => [...d, ...res.drafts]);
    setFailed(res.failed);
    if (res.drafts.length) {
      // Submitted: remember Board/Class/Subject/Stream/Chapter and get the form ready for the next note — only the topic,
      // description and files start blank, so adding many notes to the same chapter means picking just the topic.
      saveLastContext(details);
      draft.set((p) => ({ ...p, details: { ...startingDetails(), ...loadLastContext() }, files: [] }));
    } else setFiles([]);
    if (res.drafts.length) setStep("review");
  });
  const startConvert = () => { setTouched(true); if (!hasErrors(errs) && files.length) void convert.run(); };

  // Closing keeps the work. Only when notes were saved and nothing is left to review is the form considered finished and cleared.
  const finish = () => { if (saved) onChanged(); if (saved && drafts.length === 0) draft.clear(); onClose(); };

  return (
    <AppModal open wide compact title="Add notes" onClose={finish}>
      <ol className="mb-4 flex items-center gap-2 text-sm font-semibold" aria-label="Steps">
        <li className={`rounded-full px-3 py-1 ${step === "details" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>1 · Details &amp; files</li>
        <span aria-hidden className="text-slate-300">—</span>
        <li className={`rounded-full px-3 py-1 ${step === "review" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>2 · Review{drafts.length ? ` (${drafts.length})` : ""}</li>
      </ol>

      {step === "details" && (
        <div className="space-y-4">
          {drafts.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <span><b>{drafts.length}</b> converted file{drafts.length > 1 ? "s are" : " is"} waiting for your review.</span>
              <AppButton size="sm" onClick={() => setStep("review")}>Go to review <ArrowRight size={14} /></AppButton>
            </div>
          )}
          <NoteDetailsFields columns={3} value={details} onChange={setDetails} errors={touched ? errs : {}} />
          <MultiFileDropzone required files={files} onFiles={setFiles} accept={ACCEPT} max={MAX_FILES} label="Files" hint={`PDF, JPG, PNG, DOC or DOCX — up to ${MAX_FILES} at a time. Everything is converted to PDF; you check it before it is saved.`}
            error={touched && !files.length ? "Choose at least one file" : undefined} />
          {imageCount > 1 && (
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
            <AppButton loading={convert.loading} onClick={startConvert}>Convert &amp; review <ArrowRight size={16} /></AppButton>
          </div>
        </div>
      )}

      {step === "review" && (
        <Review drafts={drafts} setDrafts={setDrafts} failed={failed} onBack={() => setStep("details")} onClose={finish} onSaved={() => { setSaved((n) => n + 1); onChanged(); }} />
      )}
    </AppModal>
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
          <p className="truncate font-semibold text-slate-900">{d.original_filename}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">{FORMAT_LABEL[d.source_format]}{converted ? " → PDF" : ""}</span>
            <span>{d.page_count} page{d.page_count === 1 ? "" : "s"}</span><span>{formatFileSize(d.file_size_bytes)}</span>
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
