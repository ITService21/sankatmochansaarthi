import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { http, setUnauthorizedHandler, tokenStore } from "../api/http-client";
import { clearAllDrafts } from "../hooks/useFormDraft";
import { Role, User } from "../types";

interface AuthState {
  user: User | null;
  /** true while the stored token is being validated at startup */
  initialising: boolean;
  login: (username: string, password: string) => Promise<User>;
  register: (input: { username: string; password: string; role: Role; email?: string; full_name?: string }) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
  /** Completes a social sign-in: stores the token issued by the backend and loads the profile. */
  loginWithToken: (token: string) => Promise<User>;
  /** UX check only (the API enforces it): may the signed-in user use this feature? Super Admin = always. */
  can: (permission: string) => boolean;
  /** Super Admin (the Administrator role). */
  isSuper: boolean;
  /** Super Admin or Admin: allowed into /admin at all. */
  isStaff: boolean;
}

const Ctx = createContext<AuthState | null>(null);

/** Holds the logged-in user; validates a stored token on load and logs out on any 401. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initialising, setInitialising] = useState(!!tokenStore.get());

  const logout = useCallback(() => { tokenStore.clear(); clearAllDrafts(); setUser(null); }, []);
  const refresh = useCallback(async () => { setUser(await http.get<User>("/auth/me")); }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (tokenStore.get()) refresh().catch(logout).finally(() => setInitialising(false));
    return () => setUnauthorizedHandler(null);
  }, [logout, refresh]);

  const value = useMemo<AuthState>(() => ({
    user, initialising, logout, refresh,
    isSuper: user?.role === "Administrator",
    isStaff: user?.role === "Administrator" || user?.role === "Admin",
    can: (permission) => user?.role === "Administrator" || (user?.role === "Admin" && user.permissions.includes(permission)),
    login: async (username, password) => {
      const r = await http.post<{ token: string; user: User }>("/auth/login", { username, password });
      tokenStore.set(r.token); setUser(r.user); return r.user;
    },
    loginWithToken: async (token) => {
      tokenStore.set(token);
      const u = await http.get<User>("/auth/me");
      setUser(u);
      return u;
    },
    register: async (input) => {
      const r = await http.post<{ token: string; user: User }>("/auth/register", input);
      tokenStore.set(r.token); setUser(r.user); return r.user;
    },
  }), [user, initialising, logout, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
