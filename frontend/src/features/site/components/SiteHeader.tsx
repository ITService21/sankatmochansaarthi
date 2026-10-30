import { Phone } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../../shared/auth/AuthContext";
import { BrandLogo } from "../../../shared/components";
import { LocationPill } from "./LocationPill";

const nav = ({ isActive }: { isActive: boolean }) => `relative pb-3 text-[17px] font-medium transition hover:text-blue-700 ${isActive ? "text-blue-700 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-blue-700" : "text-slate-800"}`;

/**
 * Landing-page header modelled on the reference: logo, location pill, phone button and Login on the first row;
 * a wide-spaced navigation row below it with ONLY "Study Materials" and "Test Series".
 */
export function SiteHeader() {
  const { user } = useAuth();
  const home = user ? (user.role === "Administrator" ? "/admin/materials" : "/study-materials") : "/login";
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-[1180px] px-4">
        <div className="flex h-[76px] items-center gap-4">
          <Link to="/" aria-label="Sankatmochan Saarthi home" className="shrink-0"><BrandLogo height={50} /></Link>
          <LocationPill />
          <div className="ml-auto flex items-center gap-4">
            <a href="/#callback" aria-label="Request a callback" title="Request a callback"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-700 text-white shadow-sm transition hover:bg-blue-800"><Phone size={22} fill="currentColor" /></a>
            <Link to={home} className="rounded-full border-2 border-blue-700 px-7 py-2.5 text-base font-semibold text-slate-900 transition hover:bg-blue-50">
              {user ? "My account" : "Login"}
            </Link>
          </div>
        </div>
        <nav aria-label="Primary" className="flex gap-14 pb-1 pt-3">
          <NavLink to="/study-materials" className={nav}>Study Materials</NavLink>
          <NavLink to="/test-series" className={nav}>
            Test Series<span className="absolute -top-3 left-full -ml-4 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase leading-none text-white">Soon</span>
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
