import { Link } from "react-router-dom";

/** Closing call-to-action band before the callback form. */
export function CtaBand() {
  return (
    <section className="mx-auto max-w-[1180px] px-4 pb-4 pt-6">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-amber-400 via-amber-300 to-orange-300 px-8 py-10 md:flex md:items-center md:justify-between md:px-12">
        <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/30" />
        <div className="relative"><h2 className="font-display text-4xl font-bold text-slate-900">Start learning today</h2><p className="mt-1 text-slate-800">Preview any note free — create your account in under a minute.</p></div>
        <div className="relative mt-5 flex gap-3 md:mt-0"><Link to="/register" className="rounded-xl bg-slate-900 px-7 py-3.5 font-bold text-white transition hover:bg-slate-800">Create free account</Link><Link to="/study-materials" className="rounded-xl bg-white/80 px-7 py-3.5 font-bold text-slate-900 transition hover:bg-white">Browse notes</Link></div>
      </div>
    </section>
  );
}
