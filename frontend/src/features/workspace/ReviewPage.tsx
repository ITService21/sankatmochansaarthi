import { useWorkspaceBase } from "./useWorkspaceBase";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AppButton, ErrorState, LoadingState, useToast } from "../../shared/components";
import { useAsync } from "../../shared/hooks/useAsync";
import { Sheet, examsApi } from "../exams/api/exams.api";
import { PageHeader, Pill, StatusPill, marksText } from "../exams/components/ui";

/**
 * Teacher review of one attempt: the student's answer (typed, or the scanned sheet pages), the AI's suggested marks, feedback and confidence,
 * and editable final marks/feedback per question. Low-confidence answers are highlighted. Publishing sends the result to the student.
 */
export function ReviewPage() {
  const base = useWorkspaceBase();
  const id = Number(useParams().id);
  const { data, error, loading, reload } = useAsync(() => examsApi.review(id), [id]);
  const [marks, setMarks] = useState<Record<number, { m: string; f: string }>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => { if (data) setMarks(Object.fromEntries(data.questions.map((q) => [q.question_id, { m: q.marks_awarded === null ? "" : String(q.marks_awarded), f: q.feedback ?? "" }]))); }, [data]);
  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;
  const a = data.attempt; const locked = a.status === "published";
  const act = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); reload(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  const save = () => act(() => examsApi.saveReview(id, data.questions.filter((q) => marks[q.question_id]?.m !== "").map((q) => ({ question_id: q.question_id, marks_awarded: Number(marks[q.question_id].m), feedback: marks[q.question_id].f || null }))), "Marks saved");
  const unmarked = data.questions.filter((q) => marks[q.question_id]?.m === "").length;

  return (
    <div>
      <PageHeader title={`Review: ${data.exam.name}`} sub={a.score === null ? "Not marked yet" : `Score ${a.score} / ${a.total_marks} (${a.percentage}%)`}>
        <Link to={`${base}/exams/${data.exam.id}`}><AppButton variant="secondary">← Exam</AppButton></Link><StatusPill status={a.status} />
        {!locked && <AppButton variant="secondary" loading={busy} onClick={() => void act(async () => { const r = await examsApi.evaluate(id); if (r.status === "failed") throw new Error(r.error ?? "AI evaluation failed"); }, "AI evaluation finished")}>Run AI evaluation</AppButton>}
        {!locked && <AppButton variant="secondary" loading={busy} onClick={() => void save()}>Save marks</AppButton>}
        {!locked && <AppButton loading={busy} disabled={unmarked > 0} onClick={() => void act(async () => { await save(); await examsApi.publishAttempt(id); }, "Result published")}>Publish result</AppButton>}
      </PageHeader>
      {unmarked > 0 && !locked && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{unmarked} question(s) are not marked yet. Enter marks (or run the AI evaluation) before publishing.</p>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <ol className="space-y-3">
          {data.questions.map((q) => (
            <li key={q.question_id} className={`rounded-xl border bg-white p-4 ${q.needs_review ? "border-amber-400" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium"><span className="text-slate-500">Q{q.position}.</span> {q.body}</p><Pill tone="blue">{marksText(q.max_marks)}</Pill></div>
              {q.question_type === "mcq" ? <ul className="mt-2 space-y-1 text-sm">{q.options.map((o, i) => <li key={i} className={`rounded px-2 py-1 ${o.is_correct ? "bg-emerald-50 text-emerald-800" : ""} ${q.selected_option_ids.includes(o.id!) ? "font-semibold underline" : ""}`}>({String.fromCharCode(97 + i)}) {o.body}{o.is_correct ? " ✓" : ""}</li>)}</ul> : (
                <div className="mt-2 space-y-2 text-sm">
                  <div className="rounded-lg bg-slate-50 p-2"><p className="text-xs font-semibold text-slate-500">Student answer</p><p className="whitespace-pre-wrap">{q.student_answer || <i className="text-slate-400">{data.exam.mode === "offline" ? "Read from the scanned sheet by the AI (empty until evaluated)" : "No answer"}</i>}</p></div>
                  <div className="rounded-lg bg-emerald-50 p-2"><p className="text-xs font-semibold text-emerald-700">Expected answer</p><p className="whitespace-pre-wrap">{q.expected_answer}</p></div>
                </div>)}
              {q.ai_marks !== null && <p className="mt-2 text-xs text-slate-600">AI suggested <b>{q.ai_marks}</b> / {q.max_marks}{q.confidence !== null && <> · confidence <b className={q.confidence < 0.7 ? "text-amber-700" : ""}>{Math.round(q.confidence * 100)}%</b></>}{q.ai_feedback && <> · “{q.ai_feedback}”</>}</p>}
              {q.needs_review && <p className="mt-1 text-xs font-semibold text-amber-700">Needs your check (low confidence or no answer found).</p>}
              <div className="mt-2 grid gap-2 sm:grid-cols-[110px_1fr]">
                <label className="text-xs font-semibold text-slate-600">Marks<input disabled={locked} inputMode="decimal" value={marks[q.question_id]?.m ?? ""} onChange={(e) => setMarks({ ...marks, [q.question_id]: { ...marks[q.question_id], m: e.target.value } })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></label>
                <label className="text-xs font-semibold text-slate-600">Feedback to the student<input disabled={locked} value={marks[q.question_id]?.f ?? ""} onChange={(e) => setMarks({ ...marks, [q.question_id]: { ...marks[q.question_id], f: e.target.value } })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></label>
              </div>
            </li>))}
        </ol>
        {data.exam.mode === "offline" && <SheetViewer attemptId={id} sheets={data.sheets} />}
      </div>
    </div>
  );
}

/** The student's uploaded pages, fetched through the authenticated API (there is no public URL). */
function SheetViewer({ attemptId, sheets }: { attemptId: number; sheets: Sheet[] }) {
  const [urls, setUrls] = useState<Record<number, string>>({});
  useEffect(() => {
    let live = true; const made: string[] = [];
    (async () => { for (const s of sheets) { try { const u = URL.createObjectURL(await examsApi.sheetFile(attemptId, s.id)); made.push(u); if (live) setUrls((x) => ({ ...x, [s.id]: u })); } catch { /* shown as unavailable */ } } })();
    return () => { live = false; made.forEach(URL.revokeObjectURL); };
  }, [attemptId, sheets]);
  return (
    <aside className="space-y-3 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-auto">
      <h2 className="text-sm font-semibold text-slate-600">Answer sheet ({sheets.length} page{sheets.length === 1 ? "" : "s"})</h2>
      {sheets.map((s) => <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-2"><p className="mb-1 text-xs text-slate-500">Page {s.page_no} · {s.original_name}</p>
        {!urls[s.id] ? <p className="p-4 text-center text-xs text-slate-400">Loading…</p> : s.mime_type === "application/pdf" ? <iframe title={`Page ${s.page_no}`} src={urls[s.id]} className="h-96 w-full rounded" /> : <img alt={`Answer sheet page ${s.page_no}`} src={urls[s.id]} className="w-full rounded" />}</div>)}
    </aside>
  );
}
