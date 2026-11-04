import { Link, useParams } from "react-router-dom";
import { AppButton, ErrorState, LoadingState } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { examsApi } from "../api/exams.api";
import { Kpi, Pill } from "../components/ui";

/** A published result: total, percentage and per-question marks with feedback (and correct answers when the exam allows review). */
export function ResultPage() {
  const id = Number(useParams().id);
  const { data, error, loading } = useAsync(() => examsApi.result(id), [id]);
  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between"><div><Link to="/tests" className="text-sm text-indigo-700 hover:underline">← Tests</Link><h1 className="text-xl font-bold">{data.exam_name}: result</h1></div><Link to="/tests/progress"><AppButton variant="secondary">My progress</AppButton></Link></div>
      <div className="grid grid-cols-3 gap-3"><Kpi label="Score" value={`${data.score} / ${data.total_marks}`} /><Kpi label="Percentage" value={`${data.percentage}%`} /><Kpi label="Questions" value={data.questions.length} /></div>
      <ol className="space-y-3">{data.questions.map((q) => (
        <li key={q.question_id} className="rounded-xl border bg-white p-4 shadow-card">
          <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium"><span className="text-slate-500">Q{q.position}.</span> {q.body}</p><Pill tone={q.marks_awarded === q.max_marks ? "green" : (q.marks_awarded ?? 0) > 0 ? "amber" : "red"}>{q.marks_awarded ?? 0} / {q.max_marks}</Pill></div>
          {q.question_type === "mcq" && q.options && <ul className="mt-2 space-y-1 text-sm">{q.options.map((o, i) => <li key={i} className={`rounded px-2 py-1 ${o.is_correct ? "bg-emerald-50 text-emerald-800" : ""} ${q.selected_option_ids.includes(o.id!) ? "font-semibold underline" : ""}`}>({String.fromCharCode(97 + i)}) {o.body}{o.is_correct ? " ✓" : ""}</li>)}</ul>}
          {q.question_type !== "mcq" && <div className="mt-2 space-y-2 text-sm">{q.your_answer && <div className="rounded-lg bg-slate-50 p-2"><p className="text-xs font-semibold text-slate-500">Your answer</p><p className="whitespace-pre-wrap">{q.your_answer}</p></div>}{q.expected_answer && <div className="rounded-lg bg-emerald-50 p-2"><p className="text-xs font-semibold text-emerald-700">Expected answer</p><p className="whitespace-pre-wrap">{q.expected_answer}</p></div>}</div>}
          {q.feedback && <p className="mt-2 text-sm text-indigo-800">Feedback: {q.feedback}</p>}
          {q.explanation && <p className="mt-1 text-xs text-slate-600">{q.explanation}</p>}
        </li>))}</ol>
    </div>
  );
}
