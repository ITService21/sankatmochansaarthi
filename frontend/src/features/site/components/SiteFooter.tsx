import { Link } from "react-router-dom";
import { Mail, MapPin, Phone } from "lucide-react";
import { BrandLogo } from "../../../shared/components";
import { telHref, useSiteContact } from "../hooks/useSiteContact";

/** Dark footer: brand, shloka, quick links and copyright (same tone as the learner footer). */
export function SiteFooter() {
  const { data: c } = useSiteContact();
  return (
    <footer className="border-t-4 border-blue-700 bg-[#171717] text-slate-300">
      <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-10 md:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
        <div>
          <div className="mb-3 inline-block rounded-lg bg-white p-1.5"><BrandLogo height={46} /></div>
          <p className="text-sm text-slate-400">Empowering Classes IX–XII with holistic conceptual mastery, tests &amp; spiritual strength.</p>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-amber-400">Explore</h3>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/study-materials">Study Materials</Link></li>
            <li><Link className="hover:text-white" to="/courses">Courses</Link></li>
            <li><Link className="hover:text-white" to="/test-series">Test Series</Link></li>
            <li><Link className="hover:text-white" to="/contact">Contact Us</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-amber-400">Account</h3>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/login">Login</Link></li>
            <li><Link className="hover:text-white" to="/register">Create an account</Link></li>
            <li><a className="hover:text-white" href="/#callback">Request a callback</a></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-amber-400">Contact</h3>
          <ul className="space-y-2 text-sm">
            {c?.phone && <li className="flex items-start gap-2"><Phone size={15} className="mt-0.5 shrink-0 text-amber-400" /><a className="hover:text-white" href={telHref(c.phone)}>{c.phone}</a></li>}
            {c?.email && <li className="flex items-start gap-2"><Mail size={15} className="mt-0.5 shrink-0 text-amber-400" /><a className="break-all hover:text-white" href={`mailto:${c.email}`}>{c.email}</a></li>}
            {c?.address && <li className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-amber-400" /><span className="whitespace-pre-line">{c.address}</span></li>}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-slate-500">
          <span lang="sa" className="italic text-amber-200/70">"मनोजवं मारुततुल्यवेगं जितेन्द्रियं बुद्धिमतां वरिष्ठम्। वातात्मजं वानरयूथमुख्यं श्रीरामदूतं शरणं प्रपद्ये॥"</span>
          <span>© {new Date().getFullYear()} Sankatmochan Saarthi. All Rights Reserved.</span>
        </div>
      </div>
    </footer>
  );
}
