import { useState } from "react";
import { AppSelect, AppTable, ErrorState, LoadingState } from "../../shared/components";
import { useAsync } from "../../shared/hooks/useAsync";
import { examsApi } from "../exams/api/exams.api";
import { Kpi, PageHeader, Section } from "../exams/components/ui";

/** Performance report for one exam: participation, student-wise marks, top performers, chapter-wise results and weak areas (published results only). */
export function ReportsPage() {
  const exams = useAsync(() => examsApi.exams(), []);
  const [examId, setExamId] = useState("");
  const rep = useAsync(async () => (examId ? ((await examsApi.examReport(+examId)) as any) : null), [examId]);
  const r = rep.data;
  return (
    <div>
      <PageHeader title="Performance reports" sub="Only published results are counted." />
      <div className="mb-4 max-w-md"><AppSelect label="Exam" placeholder="Choose an exam…" options={(exams.data ?? []).map((e) => ({ value: e.id, label: e.name }))} value={examId} onChange={setExamId} /></div>
      {rep.loading && examId ? <LoadingState /> : rep.error != null ? <ErrorState error={rep.error} /> : !r ? <p className="text-sm text-slate-500">Pick an exam to see its report.</p> : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="Assigned" value={r.participation.assigned} /><Kpi label="Attempted" value={r.participation.attempted} /><Kpi label="Participation" value={`${r.participation.rate_percentage}%`} /><Kpi label="Class average" value={r.class_average_percentage != null ? `${r.class_average_percentage}%` : "—"} /></div>
          <Section title="Student-wise marks"><AppTable rows={r.students} rowKey={(s: any) => s.student_user_id} emptyMessage="No published results yet." columns={[{ key: "username", header: "Student", render: (s: any) => s.full_name || s.username }, { key: "score", header: "Marks", render: (s: any) => `${s.score} / ${s.total_marks}` }, { key: "percentage", header: "%" }]} /></Section>
          {r.chapter_performance.length > 0 && <Section title="Chapter-wise performance"><AppTable rows={r.chapter_performance} rowKey={(c: any) => c.chapter_id} columns={[{ key: "chapter", header: "Chapter" }, { key: "average_percentage", header: "Average %" }, { key: "attempts", header: "Attempts" }]} />
            {r.weak_areas.length > 0 && <p className="mt-2 text-sm font-medium text-red-700">Weak areas (under 40%): {r.weak_areas.map((w: any) => w.chapter).join(", ")}</p>}</Section>}
        </>)}
    </div>
  );
}
