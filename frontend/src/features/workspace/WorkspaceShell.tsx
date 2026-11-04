import { BarChart3, ClipboardList, FileText, HelpCircle, LayoutDashboard, UsersRound } from "lucide-react";
import { useAuth } from "../../shared/auth/AuthContext";
import { NavItem, PanelShell } from "../../shared/components";

/** Teacher / Organisation workspace: dashboard, question bank, papers, exams, reports and (organisations) people. */
export function WorkspaceShell() {
  const { user } = useAuth();
  const items: NavItem[] = [
    { to: "/workspace", label: "Dashboard", icon: LayoutDashboard, end: true },
    ...(user?.role === "Organisation" ? [{ to: "/workspace/people", label: "Teachers & Students", icon: UsersRound }] : []),
    { to: "/workspace/questions", label: "Question Bank", icon: HelpCircle },
    { to: "/workspace/papers", label: "Question Papers", icon: FileText },
    { to: "/workspace/exams", label: "Exams", icon: ClipboardList },
    { to: "/workspace/reports", label: "Reports", icon: BarChart3 },
  ];
  return <PanelShell items={items} label={user?.role === "Organisation" ? "Organisation" : "Teaching"} home="/workspace" />;
}
