import { useLocation } from "react-router-dom";

/** The URL prefix these pages are mounted under: staff use them inside the admin panel (/admin/...), teachers and organisations under /workspace/... so each keeps its own sidebar. */
export function useWorkspaceBase(): "/admin" | "/workspace" {
  return useLocation().pathname.startsWith("/admin") ? "/admin" : "/workspace";
}
