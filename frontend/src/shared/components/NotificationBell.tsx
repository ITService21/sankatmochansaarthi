import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { http } from "../api/http-client";
import { useAuth } from "../auth/AuthContext";

interface Item { id: number; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

/** In-app notifications for the signed-in user (new test assigned, results published, evaluation done…). Polls every minute. */
export function NotificationBell() {
  const { user } = useAuth();
  const [data, setData] = useState<{ items: Item[]; unread: number }>({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const load = () => { http.get<{ items: Item[]; unread: number }>("/notifications").then(setData, () => undefined); };
  useEffect(() => { if (!user) return; load(); const t = window.setInterval(load, 60_000); return () => window.clearInterval(t); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  if (!user) return null;
  const toPath = (l: string | null) => (l?.startsWith("/exams/") ? (user.role === "Student" ? "/tests" : `/workspace${l}`) : l?.startsWith("/attempts/") ? `/tests/results/${l.split("/")[2]}` : l ?? "#");
  return (
    <div ref={ref} className="relative">
      <button aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ""}`} onClick={() => { setOpen(!open); if (!open && data.unread) void http.post("/notifications/read").then(load); }} className="relative rounded-lg border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50">
        <Bell size={18} />{data.unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{data.unread}</span>}
      </button>
      {open && <div role="menu" className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-auto rounded-xl border bg-white p-1 shadow-lg">
        {data.items.length === 0 ? <p className="p-4 text-center text-sm text-slate-500">No notifications yet.</p> : data.items.map((n) => (
          <Link key={n.id} to={toPath(n.link)} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 hover:bg-slate-50"><p className={`text-sm ${n.read_at ? "text-slate-600" : "font-semibold text-slate-900"}`}>{n.title}</p>{n.body && <p className="text-xs text-slate-500">{n.body}</p>}<p className="text-[11px] text-slate-400">{new Date(n.created_at).toLocaleString("en-IN")}</p></Link>))}
      </div>}
    </div>
  );
}
