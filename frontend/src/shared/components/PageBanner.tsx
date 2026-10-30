import { ReactNode } from "react";

/** Decorative stack of books used inside banners (pure SVG, no assets). */
function BooksIllustration() {
  return (
    <svg viewBox="0 0 220 140" className="h-full w-full" aria-hidden>
      <ellipse cx="120" cy="128" rx="84" ry="8" fill="#c7d2fe" opacity=".6" />
      <rect x="44" y="94" width="150" height="26" rx="5" fill="#4f46e5" /><rect x="52" y="100" width="134" height="4" rx="2" fill="#a5b4fc" />
      <rect x="58" y="66" width="128" height="26" rx="5" fill="#0ea5e9" transform="rotate(-3 120 79)" /><rect x="66" y="72" width="112" height="4" rx="2" fill="#bae6fd" transform="rotate(-3 120 79)" />
      <rect x="70" y="40" width="108" height="26" rx="5" fill="#f59e0b" transform="rotate(2 120 53)" /><rect x="78" y="46" width="92" height="4" rx="2" fill="#fde68a" transform="rotate(2 120 53)" />
      <path d="M196 96c-4-26 8-44 22-50 2 20-4 38-22 50z" fill="#22c55e" /><path d="M196 96c-14-14-18-30-12-44 12 8 16 26 12 44z" fill="#16a34a" />
      <rect x="20" y="70" width="16" height="42" rx="3" fill="#6366f1" /><rect x="26" y="52" width="4" height="22" fill="#f59e0b" /><rect x="14" y="58" width="4" height="18" fill="#ef4444" />
    </svg>
  );
}

/** Gradient hero banner with eyebrow, title, subtitle and a book illustration. `children` render under the text. */
export function PageBanner({ eyebrow, title, subtitle, children }: { eyebrow?: string; title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-sky-50 to-rose-50 px-6 py-6 shadow-card">
      <div className="relative z-10 max-w-xl">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
        {children}
      </div>
      <div className="pointer-events-none absolute bottom-0 right-4 hidden h-36 w-56 sm:block"><BooksIllustration /></div>
    </div>
  );
}
