import { BarChart3, BookOpen, Building2, ClipboardList, FileText, HelpCircle, ChevronDown, ExternalLink, GraduationCap, KeyRound, LogOut, LucideIcon, Menu, PhoneCall, ScrollText, Search, Settings, ShieldCheck, Users, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { roleLabel } from "../types";
import { BrandLogo } from "./BrandLogo";
import { NotificationBell } from "./NotificationBell";

export interface NavItem { to?: string; label: string; icon: LucideIcon; end?: boolean; soon?: boolean; /** any one of these feature permissions shows the item */ permission?: string[]; superOnly?: boolean }

/** Sidebar entries; each shows only when the signed-in staff member has the matching permission (Super Admin sees all). */
export const ADMIN_NAV: NavItem[] = [
  { to: "/admin/overview", label: "Overview", icon: BarChart3, permission: ["exams.manage", "organisations.manage"] },
  { to: "/admin/organisations", label: "Organisations", icon: Building2, permission: ["organisations.manage"] },
  { to: "/admin/materials", label: "Manage Notes", icon: GraduationCap, permission: ["materials.view", "materials.create"] },
  { to: "/admin/academic", label: "Academic Setup", icon: ShieldCheck, permission: ["academic.manage"] },
  { to: "/admin/syllabus", label: "Syllabus", icon: BookOpen, permission: ["academic.manage"] },
  { to: "/admin/questions", label: "Question Bank", icon: HelpCircle, permission: ["questions.manage"] },
  { to: "/admin/papers", label: "Question Papers", icon: FileText, permission: ["exams.manage"] },
  { to: "/admin/exams", label: "Exams", icon: ClipboardList, permission: ["exams.manage"] },
  { to: "/admin/users", label: "Users", icon: Users, permission: ["users.manage"] },
  { to: "/admin/callback-requests", label: "Callback Requests", icon: PhoneCall, permission: ["callbacks.manage"] },
  { to: "/admin/api-hit-logs", label: "API Logs", icon: ScrollText, superOnly: true },
  { to: "/admin/settings", label: "Settings", icon: Settings, permission: ["settings.manage", "site_contact.manage"] },
];

/** The staff member's allowed sidebar entries. */
export function useAllowedNav(): NavItem[] {
  const { can, isSuper } = useAuth();
  return ADMIN_NAV.filter((n) => (n.superOnly ? isSuper : !n.permission || n.permission.some(can)));
}

function NavGroup({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {items.map((it) => (
        <li key={it.label}>
          {it.to ? (
            <NavLink to={it.to} end={it.end} onClick={onNavigate}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
              <it.icon size={19} />{it.label}
            </NavLink>
          ) : (
            <span aria-disabled className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400">
              <it.icon size={19} />{it.label}<span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">Soon</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Sidebar({ onNavigate, items, label }: { onNavigate?: () => void; items: NavItem[]; label: string }) {
  return (
    <nav className="space-y-6" aria-label={label}>
      <div>
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <NavGroup items={items} onNavigate={onNavigate} />
      </div>
      <NavLink to="/study-materials" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"><ExternalLink size={19} />View learner site</NavLink>
    </nav>
  );
}

/** Avatar + name button with a small dropdown (change password / log out). Closes on outside click. */
function UserMenu() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const name = user?.full_name || user?.username || "";
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">{name.charAt(0).toUpperCase()}</span>
        <span className="hidden text-left sm:block"><span className="block text-sm font-semibold leading-4 text-slate-900">{name}</span><span className="text-xs text-slate-500">{roleLabel(user?.role ?? "")}</span></span>
        <ChevronDown size={16} className="text-slate-400" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-52 rounded-xl border bg-white p-1 shadow-lg">
          <button role="menuitem" onClick={() => { setOpen(false); nav("/change-password"); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><KeyRound size={16} />Change password</button>
          <button role="menuitem" onClick={() => { logout(); nav("/"); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><LogOut size={16} />Log out</button>
        </div>
      )}
    </div>
  );
}

/** Administrator chrome: top bar (logo, search, user menu) + admin sidebar (drawer on mobile). Learner pages use LearnerShell. */
export function AdminShell() {
  const items = useAllowedNav();
  return <PanelShell items={items} label="Administration" home="/admin" noteSearch />;
}

/**
 * The shared panel chrome (top bar + sidebar drawer). AdminShell uses it for staff; the teacher / organisation workspace passes its own items.
 * @param noteSearch show the "Search notes" box (staff with note access only)
 */
export function PanelShell({ items, label, home, noteSearch = false }: { items: NavItem[]; label: string; home: string; noteSearch?: boolean }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { can } = useAuth();
  const canSearch = noteSearch && can("materials.view");
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState("");
    useEffect(() => { setDrawer(false); }, [loc.pathname]);
  const search = (e: FormEvent) => { e.preventDefault(); nav(q.trim() ? `/admin/materials?q=${encodeURIComponent(q.trim())}` : "/admin/materials"); };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-white px-4">
        <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu" onClick={() => setDrawer(true)}><Menu size={22} /></button>
        <NavLink to={home} aria-label="Home" className="shrink-0"><BrandLogo height={44} /></NavLink>
        {canSearch ? <form onSubmit={search} role="search" className="relative mx-2 hidden max-w-xl flex-1 md:block">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes…" aria-label="Search notes"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
        </form> : <span className="flex-1" />}
        <div className="ml-auto flex items-center gap-2"><NotificationBell /><UserMenu /></div>
      </header>
      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto border-r bg-white p-4 lg:block"><Sidebar items={items} label={label} /></aside>
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden" onMouseDown={() => setDrawer(false)}>
            <div className="absolute inset-0 bg-slate-900/50" />
            <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-white p-4 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between"><BrandLogo height={40} /><button aria-label="Close menu" onClick={() => setDrawer(false)} className="rounded-lg p-2 hover:bg-slate-100"><X size={20} /></button></div>
              <Sidebar items={items} label={label} onNavigate={() => setDrawer(false)} />
            </aside>
          </div>
        )}
        <main className="min-w-0 flex-1 p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
