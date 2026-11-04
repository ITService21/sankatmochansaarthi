import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppButton, ErrorState, TabBar, useToast } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { CheckoutDialog } from "../../payments/components/CheckoutDialog";
import { CatalogExam, MyExam, examsApi } from "../api/exams.api";
import { Pill, StatusPill, money, when } from "../components/ui";
import { ProfileCard } from "../components/ProfileCard";

/** Student's tests: those assigned to them, and the public catalogue (free tests start directly; paid ones go through checkout). */
export function TestsPage() {
  const [tab, setTab] = useState<"mine" | "catalog">("mine");
  const mine = useAsync(() => examsApi.myExams(), []);
  const catalog = useAsync(() => examsApi.catalog(), []);
  const [buying, setBuying] = useState<{ id: number; name: string; price: number; currency: string } | null>(null);
  const nav = useNavigate(); const toast = useToast();

  const start = async (e: { id: number; mode: string }) => {
    try { if (e.mode === "offline") return void nav(`/tests/${e.id}/sheet`); const a = await examsApi.start(e.id); nav(`/tests/attempt/${a.id}`); }
    catch (x: any) { if (x?.code === "PURCHASE_REQUIRED") { const c = catalog.data?.find((t) => t.id === e.id) ?? mine.data?.find((t) => t.id === e.id); if (c) setBuying({ id: e.id, name: c.name, price: c.price_minor_units, currency: (c as CatalogExam).currency ?? "INR" }); } else toast.error(x); }
  };
  const err = tab === "mine" ? mine.error : catalog.error;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-bold">Tests</h1><div className="flex gap-2"><Link to="/dashboard"><AppButton variant="secondary">My dashboard</AppButton></Link><Link to="/tests/progress"><AppButton variant="secondary">My progress</AppButton></Link></div></div>
      <ProfileCard />
      <TabBar tabs={[{ key: "mine", label: "My tests" }, { key: "catalog", label: "Test catalogue" }]} active={tab} onChange={(k) => setTab(k as typeof tab)} />
      {err != null ? <ErrorState error={err} /> : tab === "mine" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {(mine.data ?? []).map((e) => <TestCard key={e.id} e={e} onStart={() => void start(e)} onBuy={() => setBuying({ id: e.id, name: e.name, price: e.price_minor_units, currency: "INR" })} />)}
          {!mine.loading && !(mine.data ?? []).length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500 md:col-span-2">No tests assigned yet. Browse the catalogue.</p>}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(catalog.data ?? []).map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
              <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{c.name}</h3><Pill tone={c.is_free ? "green" : "amber"}>{money(c.price_minor_units, c.currency)}</Pill></div>
              <p className="mt-1 text-sm text-slate-600">{c.description || `${c.subject} test`}</p>
              <p className="mt-2 text-xs text-slate-500">{c.subject} · {c.total_marks} marks · {c.duration_minutes} min · {c.mode}<br />Available until {when(c.ends_at)}</p>
              <div className="mt-3">{c.owned ? <AppButton onClick={() => void start(c)}>{c.mode === "offline" ? "Open" : "Start test"}</AppButton> : <AppButton onClick={() => setBuying({ id: c.id, name: c.name, price: c.price_minor_units, currency: c.currency })}>Buy for {money(c.price_minor_units, c.currency)}</AppButton>}</div>
            </div>))}
          {!catalog.loading && !(catalog.data ?? []).length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500 md:col-span-3">No public tests right now.</p>}
        </div>)}
      {buying && <CheckoutDialog target={{ kind: "exam", exam_id: buying.id }} title={buying.name} amountMinor={buying.price} currency={buying.currency} onClose={() => setBuying(null)} onPaid={() => { setBuying(null); toast.success("Payment confirmed: the test is unlocked"); mine.reload(); catalog.reload(); }} />}
    </div>
  );
}

function TestCard({ e, onStart, onBuy }: { e: MyExam; onStart: () => void; onBuy: () => void }) {
  const a = e.latest_attempt;
  const canStart = e.phase === "open" && (e.mode === "offline" ? !a || a.status === "sheet_uploaded" : !a || a.status === "in_progress" || e.attempts_used < e.max_attempts);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{e.name}</h3>{e.phase === "open" ? <Pill tone="green">Open</Pill> : e.phase === "upcoming" ? <Pill tone="blue">Upcoming</Pill> : <Pill>{e.phase}</Pill>}</div>
      <p className="mt-1 text-xs text-slate-500">{e.mode === "offline" ? "Paper exam: upload your answer sheet" : `${e.duration_minutes} minutes`} · {e.total_marks} marks · attempts {e.attempts_used}/{e.max_attempts}<br />{when(e.starts_at)} → {when(e.ends_at)}</p>
      {a && <p className="mt-2 flex items-center gap-2 text-sm"><StatusPill status={a.status} />{a.status === "published" && <Link className="font-medium text-indigo-700 hover:underline" to={`/tests/results/${a.id}`}>{a.score} / {a.total_marks} · View result</Link>}</p>}
      <div className="mt-3 flex gap-2">
        {canStart && (e.owned ? <AppButton onClick={onStart}>{e.mode === "offline" ? "Upload answer sheet" : a?.status === "in_progress" ? "Resume" : "Start"}</AppButton> : <AppButton onClick={onBuy}>Buy {money(e.price_minor_units)}</AppButton>)}
        {!canStart && e.phase === "open" && e.mode === "offline" && a && <Link to={`/tests/${e.id}/sheet`}><AppButton variant="secondary">View submission</AppButton></Link>}
      </div>
    </div>
  );
}
