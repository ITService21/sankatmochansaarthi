import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, FileUp, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { ApiError } from "../../../shared/api/http-client";
import { useAuth } from "../../../shared/auth/AuthContext";
import { AppButton, AppCombobox, AppInput, AppModal, AppSelect } from "../../../shared/components";
import { positiveInt } from "../../../shared/forms/validation";
import { formatFileSize } from "../../../shared/utils/format-file-size";
import { academicApi } from "../../academic/api/academic.api";
import { useTaxonomyOptions } from "../../academic/components/useTaxonomyOptions";
import { materialsApi } from "../api/study-materials.api";
import { detailsErrors, emptyDetails, hasErrors, loadLastContext, NoteDetails, saveLastContext, setDetail, STREAM_OPTIONS } from "./note-details";

const INITIAL_ROWS = 5;
const MAX_ROWS = 50;

type RowStatus = "idle" | "saving" | "saved" | "failed";
interface Row {
  key: number; topic_id: string; material_type_id: string; access_type: "free" | "paid"; price: string; preview_page_limit: string; file: File | null;
  status: RowStatus; error?: string; /** Set when the note was saved but could not be published. */ publishError?: string; published?: boolean;
}

let nextKey = 1;
const newRow = (): Row => ({ key: nextKey++, topic_id: "", material_type_id: "", access_type: "free", price: "", preview_page_limit: "", file: null, status: "idle" });

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");

/**
 * Bulk add notes in two steps:
 *  1. Choose where the notes belong: Board → Class → Stream → Subject → Chapter (shared by every row).
 *  2. Fill a table of topic rows (5 to start; add, edit or delete any row). Each row has its own topic, material type, access,
 *     preview pages and PDF. Submit saves every valid row as its own request, so a row that fails (bad PDF, duplicate…) is
 *     flagged in place and never blocks the others; fix it and submit again — saved rows are not sent twice.
 */
export function BulkNotesWizard({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { user, can } = useAuth();
  const [step, setStep] = useState<"context" | "rows">("context");
  const [ctx, setCtx] = useState<NoteDetails>({ ...emptyDetails(), ...loadLastContext() });
  const [touched, setTouched] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: INITIAL_ROWS }, newRow));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [rowErrorsShown, setRowErrorsShown] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const sc = user?.role === "Admin" ? user.scopes : undefined;
  const inScope = (ids: number[] | undefined) => (o: { value: string | number }) => !ids?.length || ids.includes(Number(o.value));
  const board = useTaxonomyOptions("boards");
  const cls = useTaxonomyOptions("classes");
  const subject = useTaxonomyOptions("subjects");
  const types = useTaxonomyOptions("material-types");
  const ctxReady = !!(ctx.board_id && ctx.class_id && ctx.subject_id && ctx.stream);
  const chapter = useTaxonomyOptions("chapters", { board_id: ctx.board_id, class_id: ctx.class_id, subject_id: ctx.subject_id, stream: ctx.stream }, ctxReady);
  const topic = useTaxonomyOptions("topics", { chapter_id: ctx.chapter_id }, step === "rows" && !!ctx.chapter_id);
  const canCreateTopic = can("academic.manage");
  const topicRequired = canCreateTopic || topic.options.length > 0;
  const set = (k: keyof NoteDetails) => (v: string) => setCtx((c) => setDetail(c, k, v));
  const errs = detailsErrors(ctx);
  const streamName = STREAM_OPTIONS.find((o) => o.value === ctx.stream)?.label ?? "";

  const createTopic = async (name: string) => {
    const t = await academicApi.create("topics", { name, chapter_id: Number(ctx.chapter_id) });
    topic.addOption({ value: t.id, label: t.name });
    return String(t.id);
  };

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p, ...(r.status === "failed" ? { status: "idle" as RowStatus, error: undefined } : {}) } : r)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const add = () => setRows((rs) => (rs.length < MAX_ROWS ? [...rs, newRow()] : rs));

  /** Validation message for one row (empty string = ready to submit). */
  const rowProblem = (r: Row): string => {
    if (!r.file) return "Choose a PDF file";
    if (topicRequired && !r.topic_id) return "Choose or create a topic";
    if (r.preview_page_limit && positiveInt(r.preview_page_limit, "Preview pages")) return "Preview pages must be a whole number above 0";
    if (r.access_type === "paid" && !(parseFloat(r.price) > 0)) return "Enter a price above 0 for paid notes";
    return "";
  };
  const pendingRows = rows.filter((r) => r.status !== "saved");
  const readyCount = pendingRows.filter((r) => !rowProblem(r)).length;

  const goNext = () => { setTouched(true); if (!hasErrors(errs)) setStep("rows"); };

  const submit = async () => {
    setRowErrorsShown(true);
    const todo = rows.filter((r) => r.status !== "saved" && !rowProblem(r));
    if (!todo.length) return;
    setSubmitting(true); setSubmitted(true);
    let ok = 0;
    for (const r of todo) {
      setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, status: "saving", error: undefined } : x)));
      try {
        const fd = new FormData();
        for (const [k, v] of Object.entries({ board_id: ctx.board_id, class_id: ctx.class_id, subject_id: ctx.subject_id, stream: ctx.stream, chapter_id: ctx.chapter_id })) fd.append(k, v);
        if (r.topic_id) fd.append("topic_id", r.topic_id);
        if (r.material_type_id) fd.append("material_type_id", r.material_type_id);
        fd.append("access_type", r.access_type);
        if (r.access_type === "paid") { fd.append("price_minor_units", String(Math.round(parseFloat(r.price) * 100))); fd.append("currency", "INR"); }
        if (r.preview_page_limit) fd.append("preview_page_limit", r.preview_page_limit);
        fd.append("file", r.file!);
        const created = await materialsApi.create(fd);
        ok++;
        // Publish straight away. A publish failure never un-saves the note: it stays as a draft and the row says why.
        let published = false, publishError: string | undefined;
        if (can("materials.publish")) {
          try { await materialsApi.publish(created.id); published = true; } catch (err) { publishError = messageOf(err); }
        } else publishError = "You don't have permission to publish";
        setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, status: "saved", published, publishError } : x)));
      } catch (err) {
        setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, status: "failed", error: messageOf(err) } : x)));
      }
    }
    setSubmitting(false);
    if (ok) { saveLastContext(ctx); setSavedCount((n) => n + ok); onChanged(); }
  };

  const failedCount = rows.filter((r) => r.status === "failed").length;
  const allSaved = submitted && rows.length > 0 && rows.every((r) => r.status === "saved");
  const finish = () => { if (savedCount) onChanged(); onClose(); };

  return (
    <AppModal open wide compact title="Bulk add notes" onClose={finish}>
      <ol className="mb-4 flex items-center gap-2 text-sm font-semibold" aria-label="Steps">
        <li className={`rounded-full px-3 py-1 ${step === "context" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>1 · Board, class &amp; chapter</li>
        <span aria-hidden className="text-slate-300">—</span>
        <li className={`rounded-full px-3 py-1 ${step === "rows" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>2 · Topic notes</li>
      </ol>

      {step === "context" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <AppCombobox required label="Board" placeholder="Select…" options={board.options.filter(inScope(sc?.board_ids))} value={ctx.board_id} onChange={set("board_id")} error={touched ? errs.board_id : undefined} />
            <AppCombobox required label="Class" placeholder={ctx.board_id ? "Select…" : "Choose a board first"} options={cls.options.filter(inScope(sc?.class_ids))} value={ctx.class_id} onChange={set("class_id")} disabled={!ctx.board_id} error={touched ? errs.class_id : undefined} />
            <AppSelect required label="Stream" placeholder={ctx.class_id ? "Select…" : "Choose a class first"} options={STREAM_OPTIONS} value={ctx.stream} onChange={set("stream")} disabled={!ctx.class_id} error={touched ? errs.stream : undefined} />
            <AppCombobox required label="Subject" placeholder={ctx.stream ? "Select…" : "Choose a stream first"} options={subject.options.filter(inScope(sc?.subject_ids))} value={ctx.subject_id} onChange={set("subject_id")} disabled={!ctx.stream} error={touched ? errs.subject_id : undefined} />
            <AppCombobox required label="Chapter" placeholder={ctxReady ? "Select…" : "Choose the subject first"} options={chapter.options} value={ctx.chapter_id} onChange={set("chapter_id")} disabled={!ctxReady} error={touched ? errs.chapter_id : undefined}
              emptyMessage={chapter.loading ? "Loading chapters…" : `No ${streamName} chapters for this board, class and subject yet.${canCreateTopic ? " Add one in Academic Setup → Chapters." : " Ask a Super Admin to add one."}`} />
          </div>
          <div className="flex justify-end gap-2">
            <AppButton variant="secondary" onClick={finish}>Close</AppButton>
            <AppButton onClick={goNext}>Next <ArrowRight size={16} /></AppButton>
          </div>
        </div>
      )}

      {step === "rows" && (
        <div className="space-y-3">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <b>{board.options.find((o) => String(o.value) === ctx.board_id)?.label}</b> · {cls.options.find((o) => String(o.value) === ctx.class_id)?.label} · {streamName} · {subject.options.find((o) => String(o.value) === ctx.subject_id)?.label} · <b>{chapter.options.find((o) => String(o.value) === ctx.chapter_id)?.label}</b>
          </p>
          {allSaved && <p role="status" className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800"><CheckCircle2 size={16} />All {savedCount} notes were saved{rows.every((r) => r.published) ? " and published" : ""}.{rows.some((r) => !r.published) && " Some are still drafts — publish them from the Manage notes list."}</p>}
          {failedCount > 0 && !submitting && <p role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle size={16} />{failedCount} note{failedCount > 1 ? "s" : ""} could not be saved (shown in red). The others were saved — fix the red rows and submit again.</p>}

          <ul className="space-y-2">
            {rows.map((r, i) => (
              <RowCard key={r.key} index={i + 1} row={r} locked={r.status === "saved" || submitting} problem={rowErrorsShown && r.status !== "saved" ? rowProblem(r) : ""}
                topicOptions={topic.options} typeOptions={types.options} topicRequired={topicRequired} onCreateTopic={canCreateTopic ? createTopic : undefined}
                onChange={(p) => patch(r.key, p)} onDelete={() => remove(r.key)} />
            ))}
          </ul>
          {rows.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-600">No rows. Add one to continue.</p>}
          <AppButton size="sm" variant="secondary" disabled={submitting || rows.length >= MAX_ROWS} onClick={add}><Plus size={14} />Add row</AppButton>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <AppButton variant="secondary" disabled={submitting} onClick={() => setStep("context")}><ArrowLeft size={16} />Back</AppButton>
            <div className="flex items-center gap-2">
              <AppButton variant="secondary" disabled={submitting} onClick={finish}>{savedCount ? "Done" : "Close"}</AppButton>
              <AppButton loading={submitting} disabled={pendingRows.length === 0} onClick={() => void submit()}>
                {pendingRows.length === 0 ? "Submit" : `Submit ${readyCount < pendingRows.length && rowErrorsShown ? `${readyCount} of ${pendingRows.length}` : pendingRows.length} note${pendingRows.length > 1 ? "s" : ""}`}
              </AppButton>
            </div>
          </div>
        </div>
      )}
    </AppModal>
  );
}

function RowCard({ index, row: r, locked, problem, topicOptions, typeOptions, topicRequired, onCreateTopic, onChange, onDelete }: {
  index: number; row: Row; locked: boolean; problem: string; topicOptions: { value: string | number; label: string }[]; typeOptions: { value: string | number; label: string }[];
  topicRequired: boolean; onCreateTopic?: (name: string) => Promise<string>; onChange: (p: Partial<Row>) => void; onDelete: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const border = r.status === "saved" ? "border-green-300 bg-green-50/50" : r.status === "failed" || problem ? "border-red-300 bg-red-50/40" : "border-slate-200 bg-white";
  return (
    <li className={`rounded-xl border p-3 ${border}`} aria-label={`Note ${index}`}>
      <div className="grid items-end gap-2 md:grid-cols-12">
        <div className="md:col-span-3">
          <AppCombobox required={topicRequired} label={`${index}. Topic name`} createNoun="topic" onCreate={onCreateTopic} placeholder="Select or type…" options={topicOptions} value={r.topic_id} onChange={(v) => onChange({ topic_id: v })} disabled={locked}
            emptyMessage={onCreateTopic ? "Type a name to create a topic." : "No topics in this chapter."} />
        </div>
        <div className="md:col-span-2"><AppCombobox label="Material type" placeholder="Default" options={typeOptions} value={r.material_type_id} onChange={(v) => onChange({ material_type_id: v })} disabled={locked} /></div>
        <div className="md:col-span-2"><AppSelect label="Access" options={[{ value: "free", label: "Free" }, { value: "paid", label: "Paid" }]} value={r.access_type} onChange={(v) => onChange({ access_type: v as "free" | "paid" })} disabled={locked} /></div>
        <div className="md:col-span-2"><AppInput label="Preview pages" placeholder="Default" inputMode="numeric" value={r.preview_page_limit} onChange={(e) => onChange({ preview_page_limit: e.target.value })} disabled={locked} /></div>
        <div className="md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">File<span className="text-red-600"> *</span></span>
          <button type="button" disabled={locked} onClick={() => input.current?.click()} title={r.file?.name}
            className="flex h-10 w-full items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 text-left text-sm text-slate-600 hover:border-indigo-400 disabled:opacity-60">
            <FileUp size={14} className="shrink-0" /><span className="truncate">{r.file ? `${r.file.name} (${formatFileSize(r.file.size)})` : "Choose PDF…"}</span>
          </button>
          <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" aria-label={`File for note ${index}`} onChange={(e) => { onChange({ file: e.target.files?.[0] ?? null }); e.target.value = ""; }} />
        </div>
        <div className="flex justify-end md:col-span-1">
          <button type="button" disabled={locked && r.status !== "saved"} onClick={onDelete} aria-label={`Delete row ${index}`} title="Delete row"
            className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 size={16} /></button>
        </div>
      </div>
      {r.access_type === "paid" && (
        <div className="mt-2 max-w-[12rem]"><AppInput label="Price (INR)" inputMode="decimal" placeholder="199.00" value={r.price} onChange={(e) => onChange({ price: e.target.value })} disabled={locked} /></div>
      )}
      {r.status === "saving" && <p className="mt-2 text-xs text-slate-500">Saving…</p>}
      {r.status === "saved" && (r.published
        ? <p className="mt-2 flex items-center gap-1 text-xs font-medium text-green-700"><CheckCircle2 size={14} />Saved &amp; published</p>
        : <p className="mt-2 text-xs font-medium text-amber-700">Saved as a draft, not published: {r.publishError}. Publish it from the Manage notes list.</p>)}
      {r.status === "failed" && <p role="alert" className="mt-2 text-xs font-medium text-red-700">Not saved: {r.error}</p>}
      {problem && r.status !== "failed" && <p role="alert" className="mt-2 text-xs text-red-700">{problem}</p>}
    </li>
  );
}
