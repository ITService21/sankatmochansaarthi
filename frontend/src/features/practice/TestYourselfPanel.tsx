import { useEffect, useRef, useState } from "react";
import { AppButton, AppInput, EmptyState, ErrorState, LoadingState } from "../../shared/components";
import { http } from "../../shared/api/http-client";
import { useAsync } from "../../shared/hooks/useAsync";
import { useMutation } from "../../shared/hooks/useMutation";

interface WQuestion { id: number; body: string; type: string; marks: number; topic: string | null }
interface Written { eligible: number; concepts: number; total_marks: number; max_marks: number; complete: boolean; questions: WQuestion[] }
interface WResult { ai: boolean; note: string | null; max_marks: number; total_marks: number | null; results: { question_id: number; max_marks: number; answer_text: string; marks: number | null; feedback: string | null; model_answer: string | null }[] }
interface MQuestion { id: number; body: string; multiple_correct: boolean; topic: string | null; options: { id: number; body: string }[] }
interface MResult { total: number; correct: number; results: { question_id: number; is_correct: boolean; correct_option_ids: number[]; explanation: string | null }[] }

const card = "rounded-2xl border border-amber-300 bg-amber-50/60 p-5";
const h3 = "font-display text-xl font-bold uppercase tracking-wide text-slate-900";
const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** "Test Yourself" module of the learning workspace: a timed written test marked by AI, and a quick auto-graded MCQ quiz, both drawn from the question bank. Practice only; nothing is stored. */
export function TestYourselfPanel({ chapterId, topicId, heading, context }: { chapterId: string; topicId: string; heading: string; context: string }) {
  const [mode, setMode] = useState<"written" | "mcq">("written");
  if (!chapterId) return <EmptyState message="Choose a chapter above to build a Test Yourself paper." />;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2 text-sm"><span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold uppercase text-orange-800">Test Yourself</span><span className="text-slate-600">{context}</span></div>
        <h2 className="font-display mt-2 text-3xl font-bold uppercase text-slate-900">{heading}</h2>
        <div className="mt-4 flex gap-2" role="tablist">
          {([["written", "Written answers · AI-marked"], ["mcq", "Quick MCQ quiz · Auto-graded"]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${mode === k ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>{label}</button>
          ))}
        </div>
      </div>
      {mode === "written" ? <WrittenTest key={`w${chapterId}-${topicId}`} chapterId={chapterId} topicId={topicId} /> : <McqQuiz key={`m${chapterId}-${topicId}`} chapterId={chapterId} topicId={topicId} />}
    </div>
  );
}

function WrittenTest({ chapterId, topicId }: { chapterId: string; topicId: string }) {
  const [maxMarks, setMaxMarks] = useState(20); const [minutes, setMinutes] = useState(60); const [round, setRound] = useState(0);
  const paper = useAsync(() => http.get<Written>("/practice/written", { chapter_id: chapterId, topic_id: topicId || undefined, max_marks: maxMarks }), [chapterId, topicId, maxMarks, round]);
  const [running, setRunning] = useState(false); const [left, setLeft] = useState(0);
  const [text, setText] = useState<Record<number, string>>({}); const [result, setResult] = useState<WResult | null>(null);
  const qs = paper.data?.questions ?? [];
  const submit = useMutation(async () => { setRunning(false); setResult(await http.post<WResult>("/practice/check-written", { answers: qs.map((q) => ({ question_id: q.id, answer_text: text[q.id] ?? "" })) })); });
  const submitRef = useRef(submit.run); submitRef.current = submit.run;
  // Countdown; at zero the paper is handed in automatically.
  useEffect(() => {
    if (!running) return;
    const end = Date.now() + left * 1000;
    const id = window.setInterval(() => { const s = Math.max(0, Math.round((end - Date.now()) / 1000)); setLeft(s); if (s === 0) { window.clearInterval(id); void submitRef.current(); } }, 500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  const start = () => { setText({}); setResult(null); setLeft(minutes * 60); setRunning(true); };
  const reset = () => { setRunning(false); setResult(null); setText({}); setRound((r) => r + 1); };

  if (paper.loading && !paper.data) return <LoadingState />;
  if (paper.error != null || !paper.data) return <ErrorState error={paper.error} onRetry={paper.reload} />;
  const p = paper.data;

  if (result) return (
    <div className="space-y-4">
      <div role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-center">
        {result.total_marks !== null ? <><p className="text-4xl font-bold text-slate-900">{result.total_marks} / {result.max_marks}</p><p className="text-sm text-slate-700">{Math.round((result.total_marks / Math.max(result.max_marks, 1)) * 100)}% · marked by AI</p></> : <p className="font-semibold text-slate-800">Paper handed in</p>}
        {result.note && <p className="mt-2 text-sm text-amber-800">{result.note}</p>}
      </div>
      <ol className="space-y-3">{qs.map((q, n) => { const r = result.results.find((x) => x.question_id === q.id); return (
        <li key={q.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
          <div className="flex justify-between gap-3"><p className="font-medium text-slate-900"><span className="mr-2 text-slate-400">{n + 1}.</span>{q.body}</p><span className="shrink-0 text-sm font-bold text-slate-700">{r?.marks ?? "–"} / {q.marks}</span></div>
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-sm text-slate-700"><span className="font-semibold">Your answer: </span>{r?.answer_text || <em className="text-slate-400">not answered</em>}</p>
          {r?.feedback && <p className="mt-2 text-sm text-blue-800"><span className="font-semibold">Feedback: </span>{r.feedback}</p>}
          {r?.model_answer && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900"><span className="font-semibold">Model answer: </span>{r.model_answer}</p>}
        </li>); })}</ol>
      <div className="flex justify-end"><AppButton onClick={reset}>New paper</AppButton></div>
    </div>
  );

  if (running) return (
    <div className="space-y-4">
      <div className="sticky top-16 z-10 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-card"><span className="text-sm font-semibold text-slate-700">{qs.length} questions · {p.total_marks} marks</span><span className={`font-mono text-lg font-bold ${left < 300 ? "text-red-600" : "text-slate-900"}`}>⏱ {clock(left)}</span></div>
      <ol className="space-y-4">{qs.map((q, n) => (
        <li key={q.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
          <div className="flex justify-between gap-3"><p className="font-medium text-slate-900"><span className="mr-2 text-slate-400">{n + 1}.</span>{q.body}</p><span className="shrink-0 text-xs font-bold text-slate-500">[{q.marks} mark{q.marks === 1 ? "" : "s"}]</span></div>
          <textarea aria-label={`Answer to question ${n + 1}`} rows={q.type === "long" ? 8 : q.type === "medium" ? 5 : 3} value={text[q.id] ?? ""} onChange={(e) => setText({ ...text, [q.id]: e.target.value })} placeholder="Write your answer here" className="mt-3 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </li>))}</ol>
      {submit.error != null && <ErrorState error={submit.error} />}
      <div className="flex justify-end gap-2"><AppButton variant="secondary" onClick={() => setRunning(false)}>Cancel test</AppButton><AppButton loading={submit.loading} onClick={() => void submit.run()}>Submit for marking</AppButton></div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className={card}>
        <h3 className={h3}>Topic Test / Test Yourself — Written answers</h3>
        <p className="mt-3 font-semibold text-slate-900">Time: {minutes} minutes · Maximum marks: {maxMarks} · Short, medium and long answers</p>
        <p className="mt-2 text-sm text-slate-600">Source: Question Bank questions for this chapter. The AI marks your written answers against the model answers and gives feedback.</p>
        <p className="mt-3 text-slate-900">Eligible descriptive questions: {p.eligible} · Tagged concepts: {p.concepts} · Selected questions: {qs.length} ({p.total_marks} marks)</p>
        {p.eligible === 0 && <p className="mt-3 text-red-800">There are no written questions for this chapter yet. Ask your teacher or an admin to add short/medium/long questions with model answers in the Question Bank.</p>}
        {p.eligible > 0 && !p.complete && <p className="mt-3 text-red-800">Only {p.total_marks} of {maxMarks} marks can be formed from the available questions. You can still start with a shorter paper.</p>}
        <div className="mt-4 flex flex-wrap gap-2"><AppButton disabled={qs.length === 0} onClick={start}>Start {minutes}-minute Topic Test</AppButton><AppButton variant="secondary" onClick={reset}>New Paper</AppButton></div>
      </div>
      <div className="rounded-2xl border border-amber-200 bg-orange-50/50 p-5">
        <h3 className={h3}>Test generator — Question bank</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><AppInput label="Maximum marks" type="number" min={1} max={100} value={String(maxMarks)} onChange={(e) => setMaxMarks(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} /><AppInput label="Time (minutes)" type="number" min={1} max={180} value={String(minutes)} onChange={(e) => setMinutes(Math.min(180, Math.max(1, Number(e.target.value) || 1)))} /></div>
      </div>
    </div>
  );
}

function McqQuiz({ chapterId, topicId }: { chapterId: string; topicId: string }) {
  const [count, setCount] = useState(10); const [round, setRound] = useState(0);
  const quiz = useAsync(() => http.get<{ available: number; questions: MQuestion[] }>("/practice/questions", { chapter_id: chapterId, topic_id: topicId || undefined, count }), [chapterId, topicId, count, round]);
  const [picked, setPicked] = useState<Record<number, number[]>>({}); const [result, setResult] = useState<MResult | null>(null);
  const check = useMutation(async () => setResult(await http.post("/practice/check", { answers: (quiz.data?.questions ?? []).map((q) => ({ question_id: q.id, selected_option_ids: picked[q.id] ?? [] })) })));
  const again = () => { setPicked({}); setResult(null); setRound((r) => r + 1); };
  if (quiz.loading && !quiz.data) return <LoadingState />;
  if (quiz.error != null || !quiz.data) return <ErrorState error={quiz.error} onRetry={quiz.reload} />;
  const qs = quiz.data.questions;
  const toggle = (q: MQuestion, id: number) => setPicked((p) => ({ ...p, [q.id]: q.multiple_correct ? ((p[q.id] ?? []).includes(id) ? (p[q.id] ?? []).filter((x) => x !== id) : [...(p[q.id] ?? []), id]) : [id] }));
  const answered = qs.filter((q) => (picked[q.id] ?? []).length > 0).length;
  if (qs.length === 0) return <EmptyState message="No MCQs for this chapter yet. Your teacher or an admin can add them in the Question Bank." />;
  return (
    <div className="space-y-4">
      <div className={card}><h3 className={h3}>Quick MCQ quiz — Auto-graded</h3><p className="mt-2 text-sm text-slate-700">{quiz.data.available} question{quiz.data.available === 1 ? "" : "s"} available.</p>
        {!result && <div className="mt-3 flex items-center gap-2 text-sm text-slate-700">Questions:{[5, 10, 20].map((n) => <button key={n} onClick={() => { setPicked({}); setCount(n); }} className={`rounded-full border px-3 py-1 font-semibold ${count === n ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white"}`}>{n}</button>)}</div>}</div>
      {result && <div role="status" className={`rounded-xl border p-4 text-center ${result.correct === result.total ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}><p className="text-3xl font-bold text-slate-900">{result.correct} / {result.total}</p><p className="text-sm text-slate-700">{Math.round((result.correct / Math.max(result.total, 1)) * 100)}% correct</p></div>}
      <ol className="space-y-4">{qs.map((q, n) => { const r = result?.results.find((x) => x.question_id === q.id); return (
        <li key={q.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
          <p className="font-medium text-slate-900"><span className="mr-2 text-slate-400">{n + 1}.</span>{q.body}</p>{q.multiple_correct && <p className="mt-1 text-xs text-slate-500">Select all that apply</p>}
          <ul className="mt-3 space-y-2">{q.options.map((o) => { const on = (picked[q.id] ?? []).includes(o.id); const right = r?.correct_option_ids.includes(o.id);
            const tone = r ? (right ? "border-emerald-400 bg-emerald-50" : on ? "border-red-300 bg-red-50" : "border-slate-200") : on ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50";
            return <li key={o.id}><label className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${tone} ${r ? "" : "cursor-pointer"}`}><input type={q.multiple_correct ? "checkbox" : "radio"} name={`q${q.id}`} checked={on} disabled={!!r} onChange={() => toggle(q, o.id)} /><span className="flex-1">{o.body}</span>{r && right && <span className="text-xs font-semibold text-emerald-700">Correct</span>}{r && on && !right && <span className="text-xs font-semibold text-red-700">Your answer</span>}</label></li>; })}</ul>
          {r && <p className={`mt-3 text-sm ${r.is_correct ? "text-emerald-700" : "text-red-700"}`}>{r.is_correct ? "Correct" : "Not quite"}{r.explanation ? <span className="text-slate-700"> — {r.explanation}</span> : null}</p>}
        </li>); })}</ol>
      {check.error != null && <ErrorState error={check.error} />}
      <div className="flex justify-end">{result ? <AppButton onClick={again}>Try new questions</AppButton> : <AppButton loading={check.loading} disabled={answered === 0} onClick={() => void check.run()}>Check answers ({answered}/{qs.length})</AppButton>}</div>
    </div>
  );
}
