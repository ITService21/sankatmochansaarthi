import { useState } from "react";
import { AppButton, AppInput, ErrorState, LoadingState, useToast } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { examsApi } from "../../exams/api/exams.api";
import { Kpi, PageHeader, Section, openBlob } from "../../exams/components/ui";

const LABELS: Record<string, string> = { students: "Students", teachers: "Teachers", organisations: "Organisations", exams: "Exams", completed_tests: "Completed tests", purchases: "Purchases", active_subscriptions: "Active subscriptions", expired_subscriptions: "Expired subscriptions" };

/** Platform statistics for staff with a date-range filter and CSV export. Registrations, exams, purchases and revenue follow the dates. */
export function OverviewPage() {
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const { data, error, loading } = useAsync(() => examsApi.overview(from || undefined, to || undefined), [from, to]);
  const toast = useToast();
  const exportCsv = async () => { try { openBlob(await examsApi.overviewCsv(from || undefined, to || undefined), "platform-overview.csv", true); } catch (e) { toast.error((e as Error).message); } };
  return (
    <div>
      <PageHeader title="Platform overview" sub="Live statistics across every organisation."><AppButton variant="secondary" onClick={() => void exportCsv()}>Export CSV</AppButton></PageHeader>
      <div className="mb-4 grid max-w-md grid-cols-2 gap-3"><AppInput label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><AppInput label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      {loading && !data ? <LoadingState /> : error || !data ? <ErrorState error={error} /> : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">{Object.entries(data.totals as Record<string, number>).map(([k, v]) => <Kpi key={k} label={k === "revenue_minor_units" ? "Revenue (₹)" : LABELS[k] ?? k} value={k === "revenue_minor_units" ? (v / 100).toLocaleString("en-IN") : v} />)}</div>
          <Section title="AI evaluation"><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="Runs" value={data.ai.runs} /><Kpi label="Succeeded" value={data.ai.succeeded} /><Kpi label="Failed" value={data.ai.failed} /><Kpi label="Pages processed" value={data.ai.pages_processed} /></div></Section>
        </>)}
    </div>
  );
}
