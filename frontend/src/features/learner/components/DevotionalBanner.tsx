import { RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "../../../shared/components";

const QUOTES = [
  "No task in this world is too difficult when pursued with sincere devotion.",
  "All is One (Sub Ek Hai). Release anxiety and trust divine grace.",
  "Love everyone, serve everyone, remember God, and tell the truth.",
];

/** Orange header band: logo, rotating devotional quote with portrait, Hindi invocation and a "Next" quote button. */
export function DevotionalBanner() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % QUOTES.length), 15000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-[#c2410c] via-[#e2511f] to-[#b91c1c] text-amber-50"
      style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg,#c2410c,#e2511f 45%,#b91c1c)", backgroundSize: "18px 18px, 100% 100%" }}>
      <div className="mx-auto grid max-w-[1400px] items-center gap-3 px-4 py-3 md:grid-cols-[auto_1fr_auto] md:px-10">
        <Link to="/" aria-label="Sankatmochan Saarthi home" className="justify-self-start rounded-md bg-white p-1 shadow-md"><BrandLogo height={64} /></Link>
        <div className="flex flex-col items-center text-center">
          <img src="/guru.png" alt="" className="h-[72px] w-[72px] rounded-full border-[3px] border-amber-300 object-cover shadow-lg" />
          <p key={i} className="mt-1 flex items-center gap-2 font-display text-lg italic md:text-[22px]" style={{ fontVariant: "normal" }}><span aria-hidden className="text-amber-300">ॐ</span>{QUOTES[i]}</p>
        </div>
        <div className="hidden flex-col items-end gap-3 md:flex">
          <p lang="hi" className="flex items-center gap-2 font-display text-lg italic text-amber-100/90" style={{ fontVariant: "normal" }}><Sparkles size={16} className="text-amber-300" />सब दुख दूर करें संकटमोचन हनुमान जी</p>
          <button onClick={() => setI((n) => (n + 1) % QUOTES.length)} className="flex items-center gap-2 rounded-md border border-amber-200/40 bg-black/15 px-3 py-1 text-sm hover:bg-black/25"><RefreshCw size={14} />Next</button>
        </div>
      </div>
    </div>
  );
}
