import { Clock, PhoneCall, UserCheck } from "lucide-react";
import { CallbackForm } from "./CallbackForm";

/** Landing-page "Request a callback" band (anchor #callback is the target of the header phone button). */
export function CallbackSection() {
  return (
    <section id="callback" className="scroll-mt-32 bg-gradient-to-br from-blue-950 via-blue-800 to-blue-600 py-16" aria-labelledby="callback-h">
      <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-4 lg:grid-cols-2">
        <div className="text-white">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Need guidance?</p>
          <h2 id="callback-h" className="mt-2 font-display text-4xl font-bold md:text-5xl">Request a callback</h2>
          <p className="mt-3 max-w-md text-white/85">Tell us a little about you and our team will call you back to help you choose the right notes for your class.</p>
          <ul className="mt-6 space-y-3 text-sm text-white/90">
            <li className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15"><PhoneCall size={18} /></span>A real person, not a bot</li>
            <li className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15"><Clock size={18} /></span>We call you back as soon as we can</li>
            <li className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15"><UserCheck size={18} /></span>Free guidance, no obligation</li>
          </ul>
        </div>
        <div className="relative rounded-3xl bg-white p-6 shadow-2xl sm:p-8"><CallbackForm /></div>
      </div>
    </section>
  );
}
