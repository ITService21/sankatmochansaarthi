import { ChevronDown, Crown, Download, Flame, KeyRound, LogOut, ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../../shared/auth/AuthContext";
import { AppButton } from "../../../shared/components";
import { toRoman } from "../../../shared/utils/roman";
import { useLearnerClass } from "./useLearnerClass";

const pill = ({ isActive }: { isActive: boolean }) => `rounded-lg px-4 py-2.5 text-[15px] font-semibold transition ${isActive ? "bg-blue-800 text-white shadow" : "text-slate-700 hover:bg-white"}`;

/** Navigation bar under the banner: Home / Courses / Downloads / Contact Us, streak chip, and account menu (or Login). */
export function LearnerNav() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [cls] = useLearnerClass();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const name = user?.full_name || user?.username || "";
  const sub = user ? `${user.role}${cls?.number ? ` (Class ${toRoman(cls.number)})` : ""}` : "";
  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50";

  return (
    <div className="sticky top-0 z-30 border-b bg-white shadow-sm">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3 md:px-10">
        <nav aria-label="Learner" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          <NavLink to="/study-materials" className={pill}>Home</NavLink>
          <NavLink to="/courses" className={pill}>Courses</NavLink>
          {user && <NavLink to="/downloads" className={pill}>Downloads</NavLink>}
          <NavLink to="/contact" className={pill}>Contact Us</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <span title="Days in a row you've studied" className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"><Flame size={16} />{user.streak_days}d Streak</span>
              <div ref={ref} className="relative">
                <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50/60 px-3 py-1.5 hover:bg-orange-50">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-600 text-sm font-bold text-white">{name.charAt(0).toUpperCase()}</span>
                  <span className="hidden text-left sm:block"><span className="block text-sm font-bold leading-4 text-slate-900">{name}</span><span className="text-xs font-medium text-orange-700">{sub}</span></span>
                  <ChevronDown size={16} className="text-slate-500" />
                </button>
                {open && (
                  <div role="menu" className="absolute right-0 z-50 mt-2 w-56 rounded-xl border bg-white p-1 shadow-lg">
                    <Link role="menuitem" className={item} to="/downloads" onClick={() => setOpen(false)}><Download size={16} />My Downloads</Link>
                    <Link role="menuitem" className={item} to="/purchases" onClick={() => setOpen(false)}><ShoppingBag size={16} />My Purchases</Link>
                    <Link role="menuitem" className={item} to="/subscriptions" onClick={() => setOpen(false)}><Crown size={16} />My Subscriptions</Link>
                    <Link role="menuitem" className={item} to="/change-password" onClick={() => setOpen(false)}><KeyRound size={16} />Change password</Link>
                    {user.role === "Administrator" && <Link role="menuitem" className={item} to="/admin/materials" onClick={() => setOpen(false)}>Admin panel</Link>}
                  </div>
                )}
              </div>
              <button aria-label="Log out" title="Log out" onClick={() => { logout(); nav("/"); }} className="rounded-lg border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"><LogOut size={18} /></button>
            </>
          ) : (
            <>
              <Link to="/login"><AppButton variant="secondary">Login</AppButton></Link>
              <Link to="/register"><AppButton className="!bg-blue-800 hover:!bg-blue-900">Create account</AppButton></Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
