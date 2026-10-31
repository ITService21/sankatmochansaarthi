import { Phone } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../../shared/auth/AuthContext";
import { LocationPill } from "./LocationPill";

// The link only sets colour; the underline lives on the inner label (see NavLabel) so it spans the text alone, not the badge.
const nav = ({ isActive }: { isActive: boolean }) => `group flex h-full items-center text-[17px] font-medium transition-colors hover:text-blue-700 ${isActive ? "text-blue-700" : "text-slate-800"}`;

/** Link text with an underline that slides in from the left on hover and stays on the active link; optional raised badge. */
function NavLabel({ children, active, badge }: { children: string; active: boolean; badge?: string }) {
  return (
    <span className={`relative py-1.5 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:rounded-full after:bg-blue-700 after:transition-transform after:duration-300 group-hover:after:scale-x-100 ${active ? "after:scale-x-100" : "after:scale-x-0"}`}>
      {children}
      {badge && <span className="absolute left-full top-0 ml-1.5 -translate-y-1/2 whitespace-nowrap rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white">{badge}</span>}
    </span>
  );
}

/**
 * Landing-page header: one row with ONLY "Study Materials" and "Test Series" on the left and location, call button and Login on the right
 * (the logo lives in the devotional banner above, so it is not repeated here).
 */
export function SiteHeader() {
  const { user } = useAuth();
  const home = user ? (user.role === "Administrator" ? "/admin/materials" : "/study-materials") : "/login";
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 md:px-10">
        <nav aria-label="Primary" className="flex h-full items-center gap-6 sm:gap-8">
          <NavLink to="/study-materials" className={nav}>{({ isActive }) => <NavLabel active={isActive}>Study Materials</NavLabel>}</NavLink>
          <NavLink to="/test-series" className={nav}>{({ isActive }) => <NavLabel active={isActive} badge="Coming soon">Test Series</NavLabel>}</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <LocationPill />
          <a href="/#callback" aria-label="Request a callback" title="Request a callback"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-700 text-white shadow-sm transition hover:bg-blue-800"><Phone size={20} fill="currentColor" /></a>
          <Link to={home} className="rounded-full border-2 border-blue-700 px-6 py-2 text-base font-semibold text-slate-900 transition hover:bg-blue-50">
            {user ? "My account" : "Login"}
          </Link>
        </div>
      </div>
    </header>
  );
}
