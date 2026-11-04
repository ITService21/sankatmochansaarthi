import { useWorkspaceBase } from "./useWorkspaceBase";
import { Link, useParams } from "react-router-dom";
import { AppButton, AppTable, ErrorState, LoadingState, useToast } from "../../shared/components";
import { useAsync } from "../../shared/hooks/useAsync";
import { examsApi } from "../exams/api/exams.api";
import { Kpi, PageHeader, Pill, Section, StatusPill, when } from "../exams/components/ui";
import { useState } from "react";
import { AssignExam } from "./ExamsPage";

/** One exam: submissions and their status ladder, review links, publish-all, cancel, and the performance report. */
export function ExamDetailPage() {
  const base = useWorkspaceBase();
  const id = Number(useParams().id);
  const exam = useAsync(() => examsApi.exam(id), [id]);
  const attempts = useAsync(() => examsApi.examAttempts(id), [id]);
  const report = useAsync(() => examsApi.examReport(id).catch(() => null), [id]);
  const toast = useToast();
  const [assign, setAssign] = useState(false);
  if (exam.loading && !exam.data) return <LoadingState />;
  if (exam.error || !exam.data) return <ErrorState error={exam.error} />;
  const e = exam.data;
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); attempts.reload(); report.reload(); exam.reload(); } catch (x) { toast.error((x as Error).message); } };
  const r = report.data as any;
  return (
    <div>
      <PageHeader title={e.name} sub={`${e.mode} exam · ${when(e.starts_at)} → ${when(e.ends_at)} · ${e.status}`}>
        <Link to={`${base}/exams`}><AppButton variant="secondary">← Exams</AppButton></Link>
        <AppButton variant="secondary" onClick={() => setAssign(true)}>Assign</AppButton>
        <AppButton variant="secondary" onClick={() => void run(() => examsApi.publishAll(id), "Ready results published")}>Publish all ready results</AppButton>
        {e.status !== "cancelled" && <AppButton variant="secondary" onClick={() => void run(() => examsApi.cancelExam(id), "Exam cancelled")}>Cancel exam</AppButton>}
      </PageHeader>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="Assigned" value={e.assigned} /><Kpi label="Attempts" value={e.attempts} />
        <Kpi label="Participation" value={r ? `${r.participation.rate_percentage}%` : "—"} /><Kpi label="Class average" value={r?.class_average_percentage != null ? `${r.class_average_percentage}%` : "—"} /></div>
      <Section title="Submissions">
        {attempts.error != null ? <ErrorState error={attempts.error} /> : <AppTable loading={attempts.loading} rows={attempts.data ?? []} rowKey={(a) => a.id} emptyMessage="No submissions yet."
          columns={[{ key: "username", header: "Student", render: (a) => a.full_name || a.username }, { key: "attempt_no", header: "#" }, { key: "status", header: "Status", render: (a) => <StatusPill status={a.status} /> },
            { key: "score", header: "Score", render: (a) => (a.score === null ? "—" : `${a.score} / ${a.total_marks} (${a.percentage}%)`) }, { key: "flagged", header: "Flags", render: (a) => (a.flagged ? <Pill tone="amber">{a.flagged} to check</Pill> : "") },
            { key: "actions", header: "", render: (a) => (a.status === "in_progress" ? "" : <Link to={`${base}/attempts/${a.id}`}><AppButton variant="secondary">{a.status === "published" ? "View" : "Review"}</AppButton></Link>) }]} />}
      </Section>
      {r?.chapter_performance?.length > 0 && <Section title="Chapter-wise performance (published results)"><AppTable rows={r.chapter_performance} rowKey={(c: any) => c.chapter_id} columns={[{ key: "chapter", header: "Chapter" }, { key: "average_percentage", header: "Average %" }]} />
        {r.weak_areas.length > 0 && <p className="mt-2 text-sm text-red-700">Weak areas: {r.weak_areas.map((w: any) => `${w.chapter} (${w.average_percentage}%)`).join(", ")}</p>}</Section>}
      {assign && <AssignExam exam={e} onClose={() => { setAssign(false); exam.reload(); }} />}
    </div>
  );
}
