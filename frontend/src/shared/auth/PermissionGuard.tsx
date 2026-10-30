import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LoadingState } from "../components";
import { Role } from "../types";
import { useAuth } from "./AuthContext";

/**
 * Route guard. Not logged in -> /login; pending password change -> /change-password; wrong role -> /forbidden.
 * The Administrator passes every role check (mirrors the server). This is UX only — the API enforces access.
 */
export function PermissionGuard({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, initialising } = useAuth();
  const loc = useLocation();
  if (initialising) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (user.must_change_password && loc.pathname !== "/change-password") return <Navigate to="/change-password" replace />;
  if (roles && user.role !== "Administrator" && !roles.includes(user.role)) return <Navigate to="/forbidden" replace />;
  return <>{children}</>;
}
