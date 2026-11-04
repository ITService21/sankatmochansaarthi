import { Link } from "react-router-dom";
import { AppButton, AppTable, ErrorState, LoadingState } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { examsApi } from "../api/exams.api";
import { Kpi, PageHeader, Section } from "../components/ui";

/** The student's progress: improvement over time, chapter-wise performance and weak areas (published results only). */
export function ProgressPage() {
  const { data, error, loading } = useAsync(() => examsApi.progress(), []);
  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;
  const imp = data.improvement;
  return (
    <div>
      <PageHeader title="My progress" sub="Based on your published results."><Link to="/tests"><AppButton variant="secondary">← Tests</AppButton></Link></PageHeader>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="Tests taken" value={data.timeline.length} /><Kpi label="Weak areas" value={data.weak_areas.length} />{imp && <><Kpi label="Earlier average" value={`${imp.first_half_average}%`} /><Kpi label="Recent average" value={`${imp.second_half_average}%`} hint={`${imp.change >= 0 ? "+" : ""}${imp.change} points`} /></>}</div>
      {data.weak_areas.length > 0 && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">Focus on: {data.weak_areas.map((w: any) => `${w.chapter} (${w.subject}, ${w.average_percentage}%)`).join(" · ")}</p>}
      <Section title="Over time"><AppTable rows={data.timeline} rowKey={(t: any) => t.attempt_id} emptyMessage="No published results yet." columns={[{ key: "exam", header: "Test", render: (t: any) => <Link className="text-indigo-700 hover:underline" to={`/tests/results/${t.attempt_id}`}>{t.exam}</Link> }, { key: "subject", header: "Subject" }, { key: "percentage", header: "%" }]} /></Section>
      <Section title="Chapter-wise"><AppTable rows={data.chapter_performance} rowKey={(c: any) => `${c.subject}${c.chapter}`} emptyMessage="Nothing yet." columns={[{ key: "subject", header: "Subject" }, { key: "chapter", header: "Chapter" }, { key: "average_percentage", header: "Average %" }]} /></Section>
    </div>
  );
}
