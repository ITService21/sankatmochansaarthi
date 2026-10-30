import { Clock, ExternalLink, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { ReactNode } from "react";
import { CallbackForm } from "../../site/components/CallbackForm";
import { mapEmbedHref, telHref, useSiteContact, whatsappHref } from "../../site/hooks/useSiteContact";

function InfoCard({ icon, title, children, tone }: { icon: ReactNode; title: string; children: ReactNode; tone: string }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-card transition hover:shadow-md">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
      <div className="min-w-0"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h3><div className="mt-1 break-words text-base font-semibold text-slate-900">{children}</div></div>
    </div>
  );
}

/** Contact Us: call / WhatsApp / email / address (with map) / hours / social links — all edited by the Administrator — plus the callback form. */
export function ContactPage() {
  const { data: c } = useSiteContact();
  const socials = [[c?.facebook, "Facebook"], [c?.instagram, "Instagram"], [c?.youtube, "YouTube"], [c?.x, "X"]] as const;
  const liveSocials = socials.filter(([url]) => !!url);
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-blue-950 via-blue-800 to-blue-600 px-8 py-12 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/10" />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">Contact us</p>
        <h1 className="font-display mt-2 text-5xl font-bold">We're here to help</h1>
        <p className="mt-3 max-w-xl text-blue-100">Questions about notes, plans or payments? Call, message or write to us — or leave your number and we'll call you back.</p>
      </section>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {c?.phone && <InfoCard icon={<Phone size={22} />} title="Call us" tone="bg-blue-100 text-blue-700"><a className="hover:underline" href={telHref(c.phone)}>{c.phone}</a></InfoCard>}
        {(c?.whatsapp || c?.phone) && <InfoCard icon={<MessageCircle size={22} />} title="WhatsApp" tone="bg-emerald-100 text-emerald-700"><a className="hover:underline" target="_blank" rel="noreferrer" href={whatsappHref(c.whatsapp || c.phone)}>Chat with us</a></InfoCard>}
        {c?.email && <InfoCard icon={<Mail size={22} />} title="Email" tone="bg-rose-100 text-rose-700"><a className="hover:underline" href={`mailto:${c.email}`}>{c.email}</a></InfoCard>}
        {c?.working_hours && <InfoCard icon={<Clock size={22} />} title="Working hours" tone="bg-amber-100 text-amber-700">{c.working_hours}</InfoCard>}
        {c?.address && <div className="sm:col-span-2 lg:col-span-2"><InfoCard icon={<MapPin size={22} />} title="Our address" tone="bg-violet-100 text-violet-700"><span className="whitespace-pre-line">{c.address}</span></InfoCard></div>}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card sm:p-8" aria-labelledby="cb-h">
          <h2 id="cb-h" className="font-display text-3xl font-bold text-slate-900">Request a callback</h2>
          <p className="mb-5 mt-1 text-sm text-slate-600">Share your details and our team will call you back to guide you.</p>
          <CallbackForm />
        </section>
        <div className="space-y-5">
          {c?.address ? (
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
              <iframe title="Our location on the map" src={mapEmbedHref(c.address)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-80 w-full border-0" />
              <a className="block border-t px-5 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`}>Open in Google Maps →</a>
            </div>
          ) : null}
          {liveSocials.length > 0 && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Follow us</h3>
              <div className="flex flex-wrap gap-3">{liveSocials.map(([url, label]) => (
                <a key={label} href={url} target="_blank" rel="noreferrer" aria-label={label} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50"><ExternalLink size={16} />{label}</a>))}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
