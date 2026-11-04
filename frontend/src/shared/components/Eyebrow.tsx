/** Bold, colourful section label (e.g. "THE SAARTHI MISSION"). `tone` picks the colour theme. */
const TONES = {
  blue: "from-blue-700 to-indigo-600 text-white",
  amber: "from-amber-400 to-orange-400 text-slate-900",
  emerald: "from-emerald-600 to-teal-500 text-white",
  rose: "from-rose-600 to-orange-500 text-white",
};

export function Eyebrow({ children, tone = "blue", className = "" }: { children: React.ReactNode; tone?: keyof typeof TONES; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r px-4 py-1.5 text-xs font-extrabold uppercase tracking-[0.16em] shadow-sm ${TONES[tone]} ${className}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />{children}
    </span>
  );
}
