import { MapPin, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePersistentState } from "../../../shared/hooks/usePersistentState";

export const CITY_KEY = "site.city";
const CITIES = ["Delhi", "Gurugram", "Noida", "Lucknow", "Patna", "Kanpur", "Jaipur", "Mumbai", "Kolkata", "Online / Other"];

/** Reads the city the visitor picked (used to prefill the callback form). */
export function useCity() {
  return usePersistentState<string>(CITY_KEY, "Gurugram");
}

/** "📍 Gurugram  Change ✎" pill from the reference header; the chosen city prefills "Request a callback". */
export function LocationPill() {
  const [city, setCity] = useCity();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative hidden sm:block">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="flex items-center gap-3 rounded-full bg-slate-100 px-5 py-3 text-sm">
        <MapPin size={18} className="text-slate-600" />
        <span className="font-semibold text-slate-800">{city}</span>
        <span className="font-semibold text-blue-700">Change</span>
        <Pencil size={18} className="text-blue-600" />
      </button>
      {open && (
        <ul role="listbox" aria-label="Choose your city" className="absolute left-0 z-50 mt-2 max-h-72 w-52 overflow-auto rounded-xl border bg-white p-1 shadow-lg">
          {CITIES.map((c) => (
            <li key={c} role="option" aria-selected={c === city}>
              <button onClick={() => { setCity(c); setOpen(false); }} className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${c === city ? "font-semibold text-blue-700" : "text-slate-700"}`}>{c}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
