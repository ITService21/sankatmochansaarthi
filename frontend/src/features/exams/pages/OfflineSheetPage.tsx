import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { tokenStore } from "../../../shared/api/http-client";
import { AppButton, ConfirmDialog, ErrorState, LoadingState, MultiFileDropzone, useToast } from "../../../shared/components";
import { formatFileSize } from "../../../shared/utils/format-file-size";
import { useAsync } from "../../../shared/hooks/useAsync";
import { Sheet, SheetStatus, examsApi, uploadSheets } from "../api/exams.api";
import { StatusPill, openBlob, when } from "../components/ui";

const LADDER = [["sheet_uploaded", "Answer sheet uploaded"], ["evaluation_pending", "Evaluation pending"], ["ai_evaluating", "AI evaluation in progress"], ["evaluated", "Evaluation completed"], ["teacher_review", "Teacher review"], ["published", "Result published"]] as const;

/** Offline exam: upload scanned or photographed pages (PDF/JPG/PNG), preview, replace or remove them until the deadline, then submit. Shows the status ladder afterwards. */
export function OfflineSheetPage() {
  const examId = Number(useParams().examId);
  const exams = useAsync(() => examsApi.myExams(), []);
  const exam = exams.data?.find((e) => e.id === examId);
  const attemptId = exam?.latest_attempt?.id;
  const [status, setStatus] = useState<SheetStatus | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const toast = useToast();
  useEffect(() => { if (attemptId) examsApi.sheetStatus(attemptId).then(setStatus, setError); }, [attemptId]);

  const locked = !!status && status.status !== "sheet_uploaded";
  const upload = async (replace: boolean) => {
    setError(null); setProgress(0);
    try { const s = await uploadSheets(examId, files, replace, tokenStore.get(), setProgress); setStatus(s); setFiles([]); exams.reload(); toast.success(replace ? "Answer sheet replaced" : "Pages uploaded"); }
    catch (e) { setError(e); } finally { setProgress(null); }
  };
  const finalize = async () => { setBusy(true); try { setStatus(await examsApi.finalizeSheet(status!.attempt_id)); exams.reload(); toast.success("Answer sheet submitted for evaluation"); } catch (e) { setError(e); } finally { setBusy(false); setConfirm(false); } };
  if (exams.loading && !exams.data) return <LoadingState />;
  if (!exam) return <ErrorState error={exams.error ?? new Error("Test not found")} />;
  const step = status ? LADDER.findIndex(([k]) => k === status.status) : -1;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div><Link to="/tests" className="text-sm text-indigo-700 hover:underline">← Tests</Link><h1 className="text-xl font-bold">{exam.name}</h1><p className="text-sm text-slate-600">Write your answers on paper, then scan or photograph every page. Upload deadline: <b>{when(exam.ends_at)}</b>.</p></div>
      <ol className="flex flex-wrap gap-2 text-xs">{LADDER.map(([k, label], i) => <li key={k} className={`rounded-full px-3 py-1 font-semibold ${i < step ? "bg-emerald-100 text-emerald-800" : i === step ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>{label}</li>)}</ol>
      {status && <p className="flex items-center gap-2 text-sm">Status: <StatusPill status={status.status} />{status.status === "published" && exam.latest_attempt && <Link className="font-medium text-indigo-700 hover:underline" to={`/tests/results/${exam.latest_attempt.id}`}>View result</Link>}</p>}
      {error != null && <ErrorState error={error} />}
      {!locked && (
        <div className="rounded-xl border bg-white p-4 shadow-card">
          <MultiFileDropzone label="Answer-sheet pages" files={files} onFiles={setFiles} accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" max={40} hint="PDF, JPG, JPEG or PNG. Several pages are fine." />
          {progress !== null && <div className="mt-3" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-xs text-slate-500">Uploading… {progress}%</p></div>}
          <div className="mt-3 flex flex-wrap gap-2"><AppButton disabled={!files.length || progress !== null} onClick={() => void upload(false)}>Upload {files.length || ""} file{files.length === 1 ? "" : "s"}</AppButton>{!!status?.sheets.length && <AppButton variant="secondary" disabled={!files.length || progress !== null} onClick={() => void upload(true)}>Replace the whole sheet</AppButton>}</div>
        </div>)}
      {status && status.sheets.length > 0 && (
        <div className="rounded-xl border bg-white p-4 shadow-card"><h2 className="mb-3 text-sm font-semibold text-slate-600">Uploaded pages ({status.sheets.length})</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{status.sheets.map((s) => <PageThumb key={s.id} attemptId={status.attempt_id} sheet={s} locked={locked} onRemoved={setStatus} />)}</div>
          {!locked && <div className="mt-4 flex justify-end"><AppButton onClick={() => setConfirm(true)}>Submit answer sheet</AppButton></div>}
        </div>)}
      <ConfirmDialog open={confirm} title="Submit your answer sheet?" message="After submitting you cannot add, replace or remove pages." confirmLabel="Submit" loading={busy} onConfirm={() => void finalize()} onCancel={() => setConfirm(false)} />
    </div>
  );
}

function PageThumb({ attemptId, sheet, locked, onRemoved }: { attemptId: number; sheet: Sheet; locked: boolean; onRemoved: (s: SheetStatus) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImg = sheet.mime_type.startsWith("image/");
  useEffect(() => { let u: string | null = null; let live = true; if (isImg) examsApi.sheetFile(attemptId, sheet.id).then((b) => { u = URL.createObjectURL(b); if (live) setUrl(u); }, () => undefined); return () => { live = false; if (u) URL.revokeObjectURL(u); }; }, [attemptId, sheet.id, isImg]);
  const label = useMemo(() => `Page ${sheet.page_no} · ${formatFileSize(sheet.size_bytes)}`, [sheet]);
  return (
    <figure className="rounded-lg border p-2"><div className="flex h-32 items-center justify-center overflow-hidden rounded bg-slate-50">{isImg ? (url ? <img src={url} alt={label} className="max-h-full" /> : <span className="text-xs text-slate-400">Loading…</span>) : <button className="text-sm font-medium text-indigo-700" onClick={async () => openBlob(await examsApi.sheetFile(attemptId, sheet.id))}>Open PDF</button>}</div>
      <figcaption className="mt-1 flex items-center justify-between text-xs text-slate-600"><span className="truncate" title={sheet.original_name}>{label}</span>{!locked && <button className="text-red-600 hover:underline" onClick={async () => onRemoved(await examsApi.removeSheet(attemptId, sheet.id))}>Remove</button>}</figcaption></figure>
  );
}
