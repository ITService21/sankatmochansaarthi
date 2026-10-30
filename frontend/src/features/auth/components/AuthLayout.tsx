import { BookOpenCheck, Crown, ShieldCheck } from "lucide-react";
import { ReactNode } from "react";
import { BrandLogo } from "../../../shared/components";

/** Split-screen layout for login / register: brand panel on the left, form card on the right. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-600 to-sky-600 p-10 text-white lg:flex">
        <div className="w-fit rounded-2xl bg-white p-3 shadow-lg"><BrandLogo height={64} /></div>
        <div>
          <h2 className="text-4xl font-bold leading-tight">Learn today,<br />build tomorrow.</h2>
          <p className="mt-3 max-w-md text-indigo-100">Chapter-wise notes, instant previews and secure downloads — for every board, class and subject.</p>
          <ul className="mt-8 space-y-3 text-sm">
            {[[BookOpenCheck, "Well-structured study notes"], [Crown, "Subscribe once, unlock everything"], [ShieldCheck, "Secure payments & private files"]].map(([Icon, t]) => {
              const I = Icon as typeof BookOpenCheck;
              return <li key={t as string} className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15"><I size={17} /></span>{t as string}</li>;
            })}
          </ul>
        </div>
        <p className="text-xs text-indigo-200">© {new Date().getFullYear()} Sankatmochan Saarthi</p>
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-32 right-10 h-80 w-80 rounded-full bg-white/5" />
      </div>
      <div className="flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-center lg:hidden"><BrandLogo height={56} /></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            {subtitle && <p className="mb-5 mt-1 text-sm text-slate-500">{subtitle}</p>}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
