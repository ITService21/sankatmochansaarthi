import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LoadingState } from "../components";
import { Role } from "../types";
import { useAuth } from "./AuthContext";

/**
 * Route guard. Not logged in -> /login; pending password change -> /change-password; otherwise one of:
 *  - `roles`: wrong role -> /forbidden (the Super Admin passes every role check, mirroring the server)
 *  - `staff`: only Super Admin / Admin (the admin panel)
 *  - `permission`: a feature checkbox (Super Admin always passes; an Admin needs it granted)
 *  - `superOnly`: Super Admin only (e.g. API logs)
 * This is UX only — the API enforces access.
 */
export function PermissionGuard({ roles, staff, permission, superOnly, children }: { roles?: Role[]; staff?: boolean; permission?: string | string[]; superOnly?: boolean; children: ReactNode }) {
  const { user, initialising, can, isStaff, isSuper } = useAuth();
  const loc = useLocation();
  if (initialising) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (user.must_change_password && loc.pathname !== "/change-password") return <Navigate to="/change-password" replace />;
  if (roles && user.role !== "Administrator" && !roles.includes(user.role)) return <Navigate to="/forbidden" replace />;
  if (staff && !isStaff) return <Navigate to="/forbidden" replace />;
  if (superOnly && !isSuper) return <Navigate to="/forbidden" replace />;
  if (permission && ![permission].flat().some(can)) return <Navigate to="/forbidden" replace />;
  return <>{children}</>;
}
