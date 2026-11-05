import { useAsync } from "../../../shared/hooks/useAsync";
import { http, API_BASE } from "../../../shared/api/http-client";

interface Provider { name: "google" | "microsoft"; label: string; configured: boolean }

const GoogleLogo = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" /><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.2z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z" /></svg>
);
const MicrosoftLogo = () => (
  <svg width="20" height="20" viewBox="0 0 23 23" aria-hidden><path fill="#F25022" d="M1 1h10v10H1z" /><path fill="#7FBA00" d="M12 1h10v10H12z" /><path fill="#00A4EF" d="M1 12h10v10H1z" /><path fill="#FFB900" d="M12 12h10v10H12z" /></svg>
);
const LOGOS = { google: GoogleLogo, microsoft: MicrosoftLogo };

/**
 * "Continue with Google / Microsoft". Each button is a plain link: the browser navigates to the backend, which redirects
 * to the provider, then back to /oauth/callback. Buttons for providers that aren't configured on the server are disabled.
 * @param role role for a NEW account (Student | Teacher); existing users keep their role
 */
export function SocialButtons({ role }: { role?: "Student" | "Teacher" }) {
  const { data } = useAsync(() => http.get<Provider[]>("/auth/oauth/providers"), []);
  const providers: Provider[] = data ?? [{ name: "google", label: "Google", configured: false }, { name: "microsoft", label: "Microsoft", configured: false }];
  const base = "flex w-full items-center justify-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition";
  return (
    <div className="space-y-2.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        {providers.map((p) => {
          const Logo = LOGOS[p.name];
          return p.configured ? (
            <a key={p.name} href={`${API_BASE}/auth/oauth/${p.name}/start${role ? `?role=${role}` : ""}`} className={`${base} border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 hover:shadow-sm`}><Logo />{p.label}</a>
          ) : (
            <span key={p.name} aria-disabled title={`${p.label} sign-in isn't set up on this server yet`} className={`${base} cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400`}><span className="opacity-50"><Logo /></span>{p.label}</span>
          );
        })}
      </div>
      {data && data.some((p) => !p.configured) && <p className="text-center text-xs text-slate-500">Greyed-out options aren't set up yet — see the README ("Social sign-in").</p>}
    </div>
  );
}

/** "──── or ────" separator. */
export const OrDivider = ({ text = "or" }: { text?: string }) => (
  <div className="my-5 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400"><span className="h-px flex-1 bg-slate-200" />{text}<span className="h-px flex-1 bg-slate-200" /></div>
);

/** Human message for an `?error=` code returned from the social sign-in flow. */
export const OAUTH_ERRORS: Record<string, string> = {
  PROVIDER_NOT_CONFIGURED: "That sign-in option isn't set up on this server yet.",
  UNKNOWN_PROVIDER: "That sign-in option isn't available.",
  ACCESS_DENIED: "Sign-in was cancelled.",
  INVALID_STATE: "Your sign-in session expired. Please try again.",
  PROVIDER_ERROR: "We couldn't complete sign-in with the provider. Please try again.",
  ACCOUNT_BLOCKED: "This account has been blocked. Please contact support.",
  ADMIN_ACCOUNT: "Administrators must sign in with their username and password.",
};
