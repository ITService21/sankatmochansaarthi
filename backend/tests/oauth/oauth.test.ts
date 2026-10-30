import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execute, queryRows } from "../../src/infrastructure/database/database";
import { GoogleProvider, MicrosoftProvider, OAuthProfile, OAuthProvider, setOAuthProviders } from "../../src/modules/oauth/oauth.providers";
import { adminUser, api, auth, createUser, resetEnvironment, TestUser } from "../helpers/testkit";

/** Stand-in identity provider: `code` selects which profile "Google" returns. */
class FakeProvider implements OAuthProvider {
  profiles = new Map<string, OAuthProfile>();
  configured = true;
  constructor(readonly name: "google" | "microsoft", readonly label: string) {}
  isConfigured() { return this.configured; }
  authorizeUrl({ state, redirectUri }: { state: string; redirectUri: string }) { return `https://idp.example/${this.name}/authorize?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`; }
  async fetchProfile({ code }: { code: string }) {
    const p = this.profiles.get(code);
    if (!p) throw new Error("bad code");
    return p;
  }
}

const google = new FakeProvider("google", "Google");
const microsoft = new FakeProvider("microsoft", "Microsoft");
let admin: TestUser;
beforeAll(async () => { await resetEnvironment(); admin = await adminUser(); });
beforeEach(() => { setOAuthProviders({ google, microsoft }); google.configured = true; google.profiles.clear(); microsoft.profiles.clear(); });
afterAll(() => setOAuthProviders(null));

/** Runs start -> (provider) -> callback like a browser would. @returns the callback response */
async function signIn(provider: "google" | "microsoft", code: string, opts: { role?: string; tamperState?: boolean; dropCookie?: boolean } = {}) {
  const start = await api().get(`/api/v1/auth/oauth/${provider}/start${opts.role ? `?role=${opts.role}` : ""}`);
  expect(start.status).toBe(302);
  const state = new URL(start.headers.location).searchParams.get("state")!;
  const cookie = String(start.headers["set-cookie"]?.[0] ?? "").split(";")[0];
  const cb = api().get(`/api/v1/auth/oauth/${provider}/callback?code=${code}&state=${opts.tamperState ? state.slice(0, -3) + "abc" : state}`);
  if (!opts.dropCookie) cb.set("Cookie", cookie);
  return cb;
}
const tokenOf = (loc: string) => decodeURIComponent(new URL(loc, "http://x").hash.replace("#token=", ""));
const errorOf = (loc: string) => new URL(loc).searchParams.get("error");

describe("providers & start", () => {
  it("lists providers with their configured state", async () => {
    google.configured = false;
    const r = await api().get("/api/v1/auth/oauth/providers");
    expect(r.body.data).toEqual([{ name: "google", label: "Google", configured: false }, { name: "microsoft", label: "Microsoft", configured: true }]);
  });
  it("start redirects to the provider with a signed state and sets an httpOnly nonce cookie", async () => {
    const r = await api().get("/api/v1/auth/oauth/google/start");
    expect(r.status).toBe(302);
    expect(r.headers.location).toMatch(/^https:\/\/idp\.example\/google\/authorize\?state=/);
    expect(new URL(r.headers.location).searchParams.get("redirect_uri")).toMatch(/\/api\/v1\/auth\/oauth\/google\/callback$/);
    expect(String(r.headers["set-cookie"])).toMatch(/oauth_nonce=.*HttpOnly.*SameSite=Lax/i);
  });
  it("an unconfigured or unknown provider redirects back to login with an error", async () => {
    google.configured = false;
    expect(errorOf((await api().get("/api/v1/auth/oauth/google/start")).headers.location)).toBe("PROVIDER_NOT_CONFIGURED");
    expect(errorOf((await api().get("/api/v1/auth/oauth/facebook/start")).headers.location)).toBe("UNKNOWN_PROVIDER");
  });
});

describe("sign-in creates and reuses accounts", () => {
  it("first sign-in creates a Student with a linked identity and returns a working token in the URL fragment", async () => {
    google.profiles.set("c1", { providerUserId: "g-1", email: "Asha.Verma@gmail.com", emailVerified: true, name: "Asha Verma" });
    const r = await signIn("google", "c1");
    expect(r.status).toBe(302);
    expect(r.headers.location).toMatch(/\/oauth\/callback#token=/);
    const me = await api().get("/api/v1/auth/me").set({ Authorization: `Bearer ${tokenOf(r.headers.location)}` });
    expect(me.body.data).toMatchObject({ username: "asha.verma", role: "Student", full_name: "Asha Verma", must_change_password: false });
    expect(await queryRows("SELECT id FROM user_identities WHERE provider = 'google' AND provider_user_id = 'g-1'")).toHaveLength(1);
  });

  it("signing in again with the same Google account returns the SAME user (no duplicates)", async () => {
    google.profiles.set("c2", { providerUserId: "g-1", email: "asha.verma@gmail.com", emailVerified: true, name: "Asha V." });
    const r = await signIn("google", "c2");
    const me = await api().get("/api/v1/auth/me").set({ Authorization: `Bearer ${tokenOf(r.headers.location)}` });
    expect(me.body.data.username).toBe("asha.verma");
    expect(await queryRows("SELECT id FROM users WHERE username LIKE 'asha.verma%'")).toHaveLength(1);
  });

  it("a Teacher can be chosen for new accounts; unknown roles fall back to Student", async () => {
    microsoft.profiles.set("m1", { providerUserId: "ms-1", email: "ravi@outlook.com", emailVerified: false, name: "Ravi" });
    const me = async (code: string, role?: string) => api().get("/api/v1/auth/me").set({ Authorization: `Bearer ${tokenOf((await signIn("microsoft", code, { role })).headers.location)}` });
    expect((await me("m1", "Teacher")).body.data.role).toBe("Teacher");
    microsoft.profiles.set("m2", { providerUserId: "ms-2", email: "x@outlook.com", emailVerified: false, name: "X" });
    expect((await me("m2", "Administrator")).body.data.role).toBe("Student"); // can never self-select Administrator
  });

  it("username collisions get a unique suffix", async () => {
    await createUser("collide");
    google.profiles.set("c3", { providerUserId: "g-3", email: "collide@gmail.com", emailVerified: true, name: "Collide" });
    const me = await api().get("/api/v1/auth/me").set({ Authorization: `Bearer ${tokenOf((await signIn("google", "c3")).headers.location)}` });
    expect(me.body.data.username).toMatch(/^collide-[0-9a-f]{4}$/);
  });

  it("social accounts have an unusable password (cannot log in with a guessed one)", async () => {
    expect((await api().post("/api/v1/auth/login").send({ username: "asha.verma", password: "Anything123" })).status).toBe(401);
  });
});

describe("account linking rules", () => {
  it("links to an existing account only when the provider VERIFIES the email", async () => {
    const u = await createUser("linkme");
    await execute("UPDATE users SET email = 'link@example.com' WHERE id = ?", [u.id]);
    google.profiles.set("l1", { providerUserId: "g-link", email: "link@example.com", emailVerified: true, name: "L" });
    const me = await api().get("/api/v1/auth/me").set({ Authorization: `Bearer ${tokenOf((await signIn("google", "l1")).headers.location)}` });
    expect(me.body.data.id).toBe(u.id);
    expect((await queryRows("SELECT user_id FROM user_identities WHERE provider_user_id = 'g-link'"))[0]).toMatchObject({ user_id: u.id });
  });

  it("does NOT link on an unverified email (Microsoft) — a separate account is created instead", async () => {
    const u = await createUser("victim");
    await execute("UPDATE users SET email = 'victim@example.com' WHERE id = ?", [u.id]);
    microsoft.profiles.set("v1", { providerUserId: "ms-attacker", email: "victim@example.com", emailVerified: false, name: "Attacker" });
    const me = await api().get("/api/v1/auth/me").set({ Authorization: `Bearer ${tokenOf((await signIn("microsoft", "v1")).headers.location)}` });
    expect(me.body.data.id).not.toBe(u.id);
  });

  it("never signs in or links to an Administrator account", async () => {
    await execute("UPDATE users SET email = 'boss@example.com' WHERE id = ?", [admin.id]);
    google.profiles.set("a1", { providerUserId: "g-admin", email: "boss@example.com", emailVerified: true, name: "Boss" });
    expect(errorOf((await signIn("google", "a1")).headers.location)).toBe("ADMIN_ACCOUNT");
    expect(await queryRows("SELECT id FROM user_identities WHERE provider_user_id = 'g-admin'")).toHaveLength(0);
  });

  it("refuses blocked and deleted users", async () => {
    google.profiles.set("c1", { providerUserId: "g-1", email: "asha.verma@gmail.com", emailVerified: true, name: "Asha" });
    await execute("UPDATE users SET is_active = 0 WHERE username = 'asha.verma'");
    expect(errorOf((await signIn("google", "c1")).headers.location)).toBe("ACCOUNT_BLOCKED");
    await execute("UPDATE users SET is_active = 1 WHERE username = 'asha.verma'");
    expect((await signIn("google", "c1")).headers.location).toMatch(/#token=/);
  });
});

describe("CSRF / failure handling", () => {
  it("rejects a tampered state, a missing nonce cookie and a nonce from another browser", async () => {
    google.profiles.set("c9", { providerUserId: "g-9", email: "n9@gmail.com", emailVerified: true, name: "N" });
    expect(errorOf((await signIn("google", "c9", { tamperState: true })).headers.location)).toBe("INVALID_STATE");
    expect(errorOf((await signIn("google", "c9", { dropCookie: true })).headers.location)).toBe("INVALID_STATE");
    const start = await api().get("/api/v1/auth/oauth/google/start");
    const state = new URL(start.headers.location).searchParams.get("state")!;
    const other = await api().get("/api/v1/auth/oauth/google/start");
    const wrongCookie = String(other.headers["set-cookie"]?.[0]).split(";")[0];
    expect(errorOf((await api().get(`/api/v1/auth/oauth/google/callback?code=c9&state=${state}`).set("Cookie", wrongCookie)).headers.location)).toBe("INVALID_STATE");
    expect(await queryRows("SELECT id FROM users WHERE email = 'n9@gmail.com'")).toHaveLength(0);
  });

  it("user cancelling at the provider, or a bad code, ends back on the login page with an error", async () => {
    expect(errorOf((await api().get("/api/v1/auth/oauth/google/callback?error=access_denied")).headers.location)).toBe("ACCESS_DENIED");
    expect(errorOf((await signIn("google", "does-not-exist")).headers.location)).toBe("PROVIDER_ERROR");
  });

  it("the one-time code and state never reach the API hit log", async () => {
    google.profiles.set("secretcode", { providerUserId: "g-s", email: "s@gmail.com", emailVerified: true, name: "S" });
    await signIn("google", "secretcode");
    await new Promise((r) => setTimeout(r, 200));
    const logs = await queryRows<{ api_path: string }>("SELECT api_path FROM api_hit_logs WHERE api_path LIKE '%oauth%callback%' AND api_path LIKE '%code=%'");
    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) { expect(l.api_path).not.toContain("secretcode"); expect(l.api_path).toContain("[REDACTED]"); }
    void auth;
  });
});

describe("real provider adapters (HTTP mocked)", () => {
  it("Google: sends the right authorize URL, exchanges the code with the client secret, maps the profile", async () => {
    const g = new GoogleProvider("cid", "csecret");
    const url = new URL(g.authorizeUrl({ state: "S", redirectUri: "http://app/cb" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: "cid", redirect_uri: "http://app/cb", response_type: "code", state: "S", scope: "openid email profile" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "AT" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sub: "123", email: "a@b.com", email_verified: true, name: "A B" }) });
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect(await g.fetchProfile({ code: "CODE", redirectUri: "http://app/cb" })).toEqual({ providerUserId: "123", email: "a@b.com", emailVerified: true, name: "A B" });
      const [tokenUrl, init] = fetchMock.mock.calls[0];
      expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
      expect(Object.fromEntries(init.body)).toMatchObject({ code: "CODE", client_id: "cid", client_secret: "csecret", grant_type: "authorization_code", redirect_uri: "http://app/cb" });
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer AT");
    } finally { vi.unstubAllGlobals(); }
  });

  it("Microsoft: tenant in the URL and email is never trusted for linking", async () => {
    const m = new MicrosoftProvider("cid", "sec", "common");
    expect(m.authorizeUrl({ state: "S", redirectUri: "http://app/cb" })).toContain("https://login.microsoftonline.com/common/oauth2/v2.0/authorize?");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "AT" }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ sub: "ms", email: "x@y.com", name: "X" }) }));
    try { expect((await m.fetchProfile({ code: "c", redirectUri: "r" })).emailVerified).toBe(false); } finally { vi.unstubAllGlobals(); }
  });

  it("a failing token endpoint surfaces as an error (not a login)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }));
    try { await expect(new GoogleProvider("c", "s").fetchProfile({ code: "bad", redirectUri: "r" })).rejects.toThrow(/token endpoint/); } finally { vi.unstubAllGlobals(); }
  });

  it("providers report configured only when both id and secret are set", () => {
    expect(new GoogleProvider("", "").isConfigured()).toBe(false);
    expect(new GoogleProvider("id", "").isConfigured()).toBe(false);
    expect(new MicrosoftProvider("id", "secret", "common").isConfigured()).toBe(true);
  });
});
