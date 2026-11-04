import { ClipboardCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { CallbackForm } from "../components/CallbackForm";

/** Test Series is not part of Phase 1: friendly "coming soon" with a way to register interest. */
export function TestSeriesPage() {
  return (
    <section className="mx-auto max-w-[1180px] px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600"><ClipboardCheck size={32} /></span>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">Coming soon</p>
        <h1 className="mt-2 font-display text-5xl font-bold text-slate-900">Test Series</h1>
        <p className="mt-3 text-slate-600">Chapter-wise tests with instant feedback are on the way. Leave your details and we'll tell you the moment they launch.</p>
      </div>
      <div className="mx-auto mt-10 max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-card sm:p-8"><CallbackForm defaultMessage="Please notify me when the Test Series launches." /></div>
      <p className="mt-8 text-center text-sm text-slate-500">Meanwhile, <Link to="/study-materials" className="font-semibold text-blue-700 underline">explore our study materials</Link>.</p>
    </section>
  );
}
