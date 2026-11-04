import { RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "../../../shared/components";

const QUOTES = [
  "No task in this world is too difficult when pursued with sincere devotion.",
  "All is One (Sub Ek Hai). Release anxiety and trust divine grace.",
  "Love everyone, serve everyone, remember God, and tell the truth.",
  "Where there is faith, there is strength; where there is strength, nothing is impossible.",
  "Do your duty with a calm mind and leave the result to God.",
  "A steady habit of small efforts becomes a mountain of achievement.",
  "Knowledge grows when it is shared, and wisdom grows when it is lived.",
  "Begin with prayer, work with honesty, end with gratitude.",
  "Patience is the quiet companion of every success.",
  "Serve without expecting anything; the heart will fill with peace.",
  "A disciplined mind is the greatest teacher you will ever have.",
  "Today's effort is tomorrow's confidence.",
  "Truth is simple. Speak it, live it, and fear nothing.",
  "Keep learning as if the first day, and serving as if the last.",
  "Humility opens the door that pride keeps shut.",
  "Let every mistake be a lesson and every lesson a step forward.",
  "Remember God in every breath and your path will light itself.",
  "Hard work done with devotion is itself a prayer.",
  "Calm the mind and the answers will arrive on their own.",
  "Gratitude turns what we have into enough.",
  "Courage is not the absence of fear but faith that walks beside it.",
  "Kindness costs nothing yet it is worth everything.",
  "Read a little, think a lot, and practise every day.",
  "Do not compare your journey with others; walk your own with sincerity.",
  "Strength grows in the moments when you think you cannot go on.",
  "Respect your teachers, honour your parents, and love all beings.",
  "Focus on this one page, this one problem, this one moment.",
  "Give your best today and let tomorrow take care of itself.",
  "Faith in God and effort in action together move mountains.",
  "A pure heart and a clear goal make every road short.",
  "Wake up with hope, study with focus, sleep with peace.",
];

/** Index of today's quote: changes once per local calendar day, so everyone sees the same "suvichar" that day. */
function todayIndex(): number {
  const now = new Date();
  const dayNumber = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000);
  return dayNumber % QUOTES.length;
}

/** Orange header band: logo, the quote of the day with portrait, Hindi invocation and a "Next" button to browse more quotes. */
export function DevotionalBanner() {
  const [i, setI] = useState(todayIndex);
  // Keep a tab that stays open overnight in step with the new day.
  useEffect(() => {
    const t = window.setInterval(() => { const d = todayIndex(); setI((cur) => (cur === d ? cur : d)); }, 60 * 60 * 1000);
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
