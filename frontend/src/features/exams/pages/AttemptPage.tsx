import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../../shared/api/http-client";
import { AppButton, ConfirmDialog, ErrorState, LoadingState } from "../../../shared/components";
import { AttemptState, examsApi } from "../api/exams.api";
import { StatusPill } from "../components/ui";

type Ans = { selected_option_ids: number[]; answer_text: string };
const fmt = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/**
 * The online exam. The countdown uses the SERVER's clock (offset measured when the attempt loads) and the stored server deadline, so changing the
 * computer clock does nothing. Answers autosave a moment after each change and every 15 s, survive a refresh (reloaded from the server), and the
 * attempt is submitted automatically when time runs out.
 */
export function AttemptPage() {
  const id = Number(useParams().id);
  const [att, setAtt] = useState<AttemptState | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [answers, setAnswers] = useState<Record<number, Ans>>({});
  const [cur, setCur] = useState(0);
  const [offset, setOffset] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dirty = useRef(new Set<number>()); const timer = useRef<number>();
  const answersRef = useRef(answers); answersRef.current = answers;

  const load = useCallback(async () => {
    try {
      const a = await examsApi.attempt(id); setAtt(a); setOffset(new Date(a.server_now).getTime() - Date.now());
      setAnswers(Object.fromEntries((a.answers ?? []).map((x) => [x.question_id, { selected_option_ids: x.selected_option_ids, answer_text: x.answer_text }])));
    } catch (e) { setError(e); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const flush = useCallback(async () => {
    if (!dirty.current.size) return true;
    const ids = [...dirty.current]; setSaved("saving");
    try { await examsApi.saveAnswers(id, ids.map((q) => ({ question_id: q, selected_option_ids: answersRef.current[q]?.selected_option_ids ?? [], answer_text: answersRef.current[q]?.answer_text ?? "" }))); ids.forEach((q) => dirty.current.delete(q)); setSaved("saved"); return true; }
    catch (e) { setSaved("error"); if (e instanceof ApiError && e.code === "ATTEMPT_CLOSED") await load(); return false; }
  }, [id, load]);
  const change = (qid: number, a: Ans) => { setAnswers((p) => ({ ...p, [qid]: a })); dirty.current.add(qid); setSaved("idle"); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => void flush(), 1500); };
  useEffect(() => { const t = window.setInterval(() => void flush(), 15000); return () => window.clearInterval(t); }, [flush]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try { await flush(); setAtt(await examsApi.submit(id)); } catch (e) { setError(e); } finally { setSubmitting(false); setConfirm(false); }
  }, [flush, id]);

  // server-clock countdown; at zero the server has already (or will immediately) auto-submit, so just ask it
  useEffect(() => {
    if (!att || att.status !== "in_progress") return;
    const tick = () => { const s = Math.max(0, Math.floor((new Date(att.deadline_at).getTime() - (Date.now() + offset)) / 1000)); setLeft(s); if (s === 0) void (async () => { await flush(); await load(); })(); };
    tick(); const t = window.setInterval(tick, 1000); return () => window.clearInterval(t);
  }, [att, offset, flush, load]);

  const answered = useMemo(() => new Set(Object.entries(answers).filter(([, a]) => a.selected_option_ids.length || a.answer_text.trim()).map(([k]) => Number(k))), [answers]);
  if (error != null && !att) return <ErrorState error={error} />;
  if (!att) return <LoadingState message="Opening your test…" />;
  if (att.status !== "in_progress") return (
    <div className="mx-auto max-w-lg rounded-2xl border bg-white p-8 text-center shadow-card">
      <h1 className="text-xl font-bold">{att.auto_submitted ? "Time is up: your answers were submitted" : "Answers submitted"}</h1>
      <p className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-600">Status: <StatusPill status={att.status} /></p>
      <p className="mt-2 text-sm text-slate-600">{att.status === "published" ? "Your result is ready." : "You will be notified when your result is published."}</p>
      <div className="mt-5 flex justify-center gap-2">{att.status === "published" && <Link to={`/tests/results/${att.id}`}><AppButton>View result</AppButton></Link>}<Link to="/tests"><AppButton variant="secondary">Back to tests</AppButton></Link></div>
    </div>);

  const qs = att.questions ?? []; const q = qs[cur]; const a = answers[q.question_id] ?? { selected_option_ids: [], answer_text: "" };
  const low = left !== null && left < 300;
  return (
    <div className="mx-auto max-w-5xl">
      <div className="sticky top-16 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3 shadow-sm">
        <div><p className="font-semibold">{att.exam_name}</p><p className="text-xs text-slate-500">Set {att.set_label} · {answered.size}/{qs.length} answered · {saved === "saving" ? "Saving…" : saved === "saved" ? "All changes saved" : saved === "error" ? "Could not save: retrying" : ""}</p></div>
        <div className="flex items-center gap-3"><span role="timer" aria-live="off" className={`rounded-lg px-3 py-1.5 font-mono text-lg font-bold ${low ? "bg-red-100 text-red-700" : "bg-slate-100"}`}>{left === null ? "--:--" : fmt(left)}</span><AppButton onClick={() => setConfirm(true)}>Submit</AppButton></div>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_200px]">
        <div className="rounded-xl border bg-white p-5 shadow-card">
          <p className="text-xs font-semibold text-slate-500">Question {cur + 1} of {qs.length} · {q.marks} mark{q.marks === 1 ? "" : "s"}</p>
          <p className="mt-2 whitespace-pre-wrap text-base">{q.body}</p>
          {q.question_type === "mcq" ? <div className="mt-4 space-y-2">{q.options.map((o, i) => { const on = a.selected_option_ids.includes(o.id); return (
            <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${on ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
              <input type={q.multiple_correct ? "checkbox" : "radio"} name={`q${q.question_id}`} checked={on} className="mt-1" onChange={() => change(q.question_id, { ...a, selected_option_ids: q.multiple_correct ? (on ? a.selected_option_ids.filter((x) => x !== o.id) : [...a.selected_option_ids, o.id]) : [o.id] })} />
              <span className="text-sm">({String.fromCharCode(97 + i)}) {o.body}</span></label>); })}
            {a.selected_option_ids.length > 0 && <button className="text-xs text-slate-500 underline" onClick={() => change(q.question_id, { ...a, selected_option_ids: [] })}>Clear answer</button>}</div>
            : <textarea aria-label="Your answer" rows={q.question_type === "long" ? 12 : q.question_type === "medium" ? 8 : 4} value={a.answer_text} onChange={(e) => change(q.question_id, { ...a, answer_text: e.target.value })} className="mt-4 w-full rounded-lg border border-slate-300 p-3 text-sm" placeholder="Type your answer here" />}
          <div className="mt-5 flex justify-between"><AppButton variant="secondary" disabled={cur === 0} onClick={() => setCur(cur - 1)}>← Previous</AppButton><AppButton variant="secondary" disabled={cur === qs.length - 1} onClick={() => setCur(cur + 1)}>Next →</AppButton></div>
        </div>
        <nav aria-label="Questions" className="grid h-fit grid-cols-5 gap-1.5 rounded-xl border bg-white p-3 md:grid-cols-4">{qs.map((x, i) => <button key={x.question_id} onClick={() => setCur(i)} aria-label={`Question ${i + 1}${answered.has(x.question_id) ? ", answered" : ""}`} className={`h-9 rounded-md text-sm font-semibold ${i === cur ? "ring-2 ring-indigo-500" : ""} ${answered.has(x.question_id) ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{i + 1}</button>)}</nav>
      </div>
      {error != null && <div className="mt-3"><ErrorState error={error} /></div>}
      <ConfirmDialog open={confirm} title="Submit your test?" message={`${qs.length - answered.size} question(s) are unanswered. You cannot change answers after submitting.`} confirmLabel="Submit now" loading={submitting} onConfirm={() => void submit()} onCancel={() => setConfirm(false)} />
    </div>
  );
}
