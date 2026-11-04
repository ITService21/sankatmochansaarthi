import { useWorkspaceBase } from "./useWorkspaceBase";
import { Link } from "react-router-dom";
import { AppTable, ErrorState, LoadingState } from "../../shared/components";
import { useAsync } from "../../shared/hooks/useAsync";
import { examsApi } from "../exams/api/exams.api";
import { Kpi, PageHeader, Pill, Section, StatusPill, when } from "../exams/components/ui";

const LABELS: Record<string, string> = {
  students: "Students", teachers: "Teachers", papers: "Question papers", questions: "Questions", scheduled_exams: "Scheduled exams", pending_evaluations: "Pending evaluations", exams: "Exams", attempts: "Attempts", average_percentage: "Average score %",
  organisations: "Organisations", completed_tests: "Completed tests", purchases: "Purchases", revenue_minor_units: "Revenue (₹)", active_subscriptions: "Active subscriptions", expired_subscriptions: "Expired subscriptions",
  available_tests: "Available tests", upcoming: "Upcoming", completed: "Completed", pending_uploads: "Pending uploads", awaiting_result: "Awaiting result",
};

/** Dashboard for every role. Everything shown comes from GET /reports/dashboard, which is computed from the database for the signed-in user. */
export function DashboardPage() {
  const base = useWorkspaceBase();
  const { data, error, loading } = useAsync(() => examsApi.dashboard(), []);
  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;
  const totals: Record<string, number> = data.totals ?? {};
  return (
    <div>
      <PageHeader title={`${data.role === "Administrator" ? "Platform" : data.role} dashboard`} sub="Live figures from your data." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Object.entries(totals).map(([k, v]) => <Kpi key={k} label={LABELS[k] ?? k.replace(/_/g, " ")} value={k === "revenue_minor_units" ? (v / 100).toLocaleString("en-IN") : v} />)}
      </div>

      {data.assigned_classes?.length > 0 && <Section title="My classes & subjects"><div className="flex flex-wrap gap-2">{data.assigned_classes.map((a: any) => <Pill key={`${a.class_id}-${a.subject_id}`} tone="blue">{a.class_name} · {a.subject_name}</Pill>)}</div></Section>}

      {data.recent_exams && <Section title="Recent exams">
        <AppTable rows={data.recent_exams} rowKey={(r: any) => r.id} emptyMessage="No exams yet. Build a paper and schedule one."
          columns={[{ key: "name", header: "Exam", render: (r: any) => <Link className="font-medium text-indigo-700 hover:underline" to={`${base}/exams/${r.id}`}>{r.name}</Link> }, { key: "mode", header: "Mode" }, { key: "starts_at", header: "Starts", render: (r: any) => when(r.starts_at) },
            { key: "assigned", header: "Assigned" }, { key: "submitted", header: "Submitted" }]} />
      </Section>}

      {data.top_students?.length > 0 && <Section title="Top students"><AppTable rows={data.top_students} rowKey={(r: any) => r.id} columns={[{ key: "username", header: "Student", render: (r: any) => r.full_name || r.username }, { key: "average_percentage", header: "Average %" }, { key: "tests", header: "Tests" }]} /></Section>}
      {data.subject_average?.length > 0 && <Section title="Subject-wise average"><AppTable rows={data.subject_average} rowKey={(r: any) => r.subject} columns={[{ key: "subject", header: "Subject" }, { key: "average_percentage", header: "Average %" }, { key: "attempts", header: "Attempts" }]} /></Section>}

      {data.ai && <Section title="AI evaluation">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="Runs" value={data.ai.runs} /><Kpi label="Succeeded" value={data.ai.succeeded} /><Kpi label="Failed" value={data.ai.failed} /><Kpi label="Pages processed" value={data.ai.pages_processed} />{"attempts_needing_review" in data.ai && <Kpi label="Needing review" value={data.ai.attempts_needing_review} />}</div>
      </Section>}

      {/* student-only blocks */}
      {data.upcoming_exams && <Section title="Upcoming & open tests">
        <AppTable rows={data.upcoming_exams} rowKey={(r: any) => r.id} emptyMessage="No tests assigned yet." columns={[{ key: "name", header: "Test", render: (r: any) => <Link className="font-medium text-indigo-700 hover:underline" to="/tests">{r.name}</Link> }, { key: "phase", header: "When", render: (r: any) => r.phase === "open" ? <Pill tone="green">Open now</Pill> : when(r.starts_at) }, { key: "mode", header: "Mode" }]} />
      </Section>}
      {data.results && <Section title="Latest results"><AppTable rows={data.results} rowKey={(r: any) => r.attempt_id} emptyMessage="No published results yet." columns={[{ key: "exam", header: "Test", render: (r: any) => <Link className="text-indigo-700 hover:underline" to={`/tests/results/${r.attempt_id}`}>{r.exam}</Link> }, { key: "subject", header: "Subject" }, { key: "score", header: "Score", render: (r: any) => `${r.score} / ${r.total_marks}` }, { key: "percentage", header: "%" }]} /></Section>}
      {data.subject_performance && <Section title="Subject-wise performance"><AppTable rows={data.subject_performance} rowKey={(r: any) => r.subject} emptyMessage="Take a test to see your performance." columns={[{ key: "subject", header: "Subject" }, { key: "average_percentage", header: "Average %" }, { key: "tests", header: "Tests" }]} /></Section>}
      {data.history && <Section title="Test history"><AppTable rows={data.history} rowKey={(r: any) => r.attempt_id} emptyMessage="No attempts yet." columns={[{ key: "exam", header: "Test" }, { key: "status", header: "Status", render: (r: any) => <StatusPill status={r.status} /> }, { key: "percentage", header: "%", render: (r: any) => r.percentage ?? "—" }]} /></Section>}
      {data.purchases && <Section title="Purchases & study material"><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="Tests purchased" value={data.purchases.tests} /><Kpi label="Subscription until" value={data.purchases.active_subscription_until ? when(data.purchases.active_subscription_until) : "None"} /><Kpi label="Notes in My Downloads" value={data.study_material.downloads} /></div></Section>}
    </div>
  );
}
