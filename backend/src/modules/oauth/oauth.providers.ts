import { env } from "../../config/env";

/** What we need from an identity provider after a successful sign-in. */
export interface OAuthProfile {
  providerUserId: string;
  email: string | null;
  /** Only providers that vouch for the address (Google's `email_verified`) may be used to link an existing account. */
  emailVerified: boolean;
  name: string | null;
}

export interface OAuthProvider {
  readonly name: "google" | "microsoft";
  readonly label: string;
  isConfigured(): boolean;
  /** URL to send the browser to so the user can sign in and consent. */
  authorizeUrl(p: { state: string; redirectUri: string }): string;
  /** Exchanges the one-time `code` (server-to-server, using the client secret) and returns the user's profile. */
  fetchProfile(p: { code: string; redirectUri: string }): Promise<OAuthProfile>;
}

const TIMEOUT_MS = 10_000;

/** POSTs form data to a token endpoint and returns the access token. @throws on any non-2xx response */
async function exchangeCode(tokenUrl: string, form: Record<string, string>): Promise<string> {
  const res = await fetch(tokenUrl, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form), signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`token endpoint responded ${res.status}`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("token endpoint returned no access_token");
  return body.access_token;
}

async function userinfo(url: string, accessToken: string): Promise<Record<string, any>> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`userinfo endpoint responded ${res.status}`);
  return (await res.json()) as Record<string, any>;
}

/** Google Identity (OpenID Connect, authorization-code flow). */
export class GoogleProvider implements OAuthProvider {
  readonly name = "google" as const;
  readonly label = "Google";
  constructor(private readonly clientId = env.oauth.google.clientId, private readonly clientSecret = env.oauth.google.clientSecret) {}
  isConfigured() { return !!this.clientId && !!this.clientSecret; }
  authorizeUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const q = new URLSearchParams({ client_id: this.clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, prompt: "select_account" });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  async fetchProfile({ code, redirectUri }: { code: string; redirectUri: string }): Promise<OAuthProfile> {
    const token = await exchangeCode("https://oauth2.googleapis.com/token", { code, client_id: this.clientId, client_secret: this.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" });
    const p = await userinfo("https://openidconnect.googleapis.com/v1/userinfo", token);
    return { providerUserId: String(p.sub), email: p.email ?? null, emailVerified: p.email_verified === true, name: p.name ?? null };
  }
}

/** Microsoft identity platform v2 (personal, work and school accounts). */
export class MicrosoftProvider implements OAuthProvider {
  readonly name = "microsoft" as const;
  readonly label = "Microsoft";
  constructor(
    private readonly clientId = env.oauth.microsoft.clientId, private readonly clientSecret = env.oauth.microsoft.clientSecret, private readonly tenant = env.oauth.microsoft.tenant,
  ) {}
  isConfigured() { return !!this.clientId && !!this.clientSecret; }
  private base() { return `https://login.microsoftonline.com/${encodeURIComponent(this.tenant)}/oauth2/v2.0`; }
  authorizeUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const q = new URLSearchParams({ client_id: this.clientId, redirect_uri: redirectUri, response_type: "code", response_mode: "query", scope: "openid email profile", state, prompt: "select_account" });
    return `${this.base()}/authorize?${q}`;
  }
  async fetchProfile({ code, redirectUri }: { code: string; redirectUri: string }): Promise<OAuthProfile> {
    const token = await exchangeCode(`${this.base()}/token`, { code, client_id: this.clientId, client_secret: this.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", scope: "openid email profile" });
    const p = await userinfo("https://graph.microsoft.com/oidc/userinfo", token);
    // Microsoft does not assert email ownership, so the address is NEVER used to link to an existing account.
    return { providerUserId: String(p.sub), email: p.email ?? null, emailVerified: false, name: p.name ?? null };
  }
}

let registry: Record<string, OAuthProvider> | null = null;
/** The configured providers, keyed by name. */
export function getOAuthProviders(): Record<string, OAuthProvider> {
  return (registry ??= { google: new GoogleProvider(), microsoft: new MicrosoftProvider() });
}
/** Test hook: inject fake providers (null restores the real ones). */
export function setOAuthProviders(p: Record<string, OAuthProvider> | null): void { registry = p; }
