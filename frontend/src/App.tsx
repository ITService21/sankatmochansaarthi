import { Link, Navigate, Route, Routes } from "react-router-dom";
import { AcademicConfigPage } from "./features/academic/pages/AcademicConfigPage";
import { ApiHitLogsPage } from "./features/administrator/pages/ApiHitLogsPage";
import { UsersPage } from "./features/administrator/pages/UsersPage";
import { CallbackRequestsPage } from "./features/administrator/pages/CallbackRequestsPage";
import { SettingsPage } from "./features/administrator/pages/SettingsPage";
import { ChangePasswordPage } from "./features/auth/pages/ChangePasswordPage";
import { LoginPage } from "./features/auth/pages/LoginPage";
import { OAuthCallbackPage } from "./features/auth/pages/OAuthCallbackPage";
import { RegisterPage } from "./features/auth/pages/RegisterPage";
import { LearnerShell } from "./features/learner/layouts/LearnerShell";
import { ContactPage } from "./features/learner/pages/ContactPage";
import { CoursesPage } from "./features/learner/pages/CoursesPage";
import { DownloadsPage } from "./features/learner/pages/DownloadsPage";
import { LearnPage } from "./features/learner/pages/LearnPage";
import { StudyMaterialsHomePage } from "./features/learner/pages/StudyMaterialsHomePage";
import { PurchasesPage } from "./features/purchases/pages/PurchasesPage";
import { PublicShell } from "./features/site/layouts/PublicShell";
import { LandingPage } from "./features/site/pages/LandingPage";
import { TestSeriesPage } from "./features/site/pages/TestSeriesPage";
import { AdminMaterialsPage } from "./features/study-materials/pages/AdminMaterialsPage";
import { SubscriptionsPage } from "./features/subscriptions/pages/SubscriptionsPage";
import { PermissionGuard } from "./shared/auth/PermissionGuard";
import { AdminShell, useAllowedNav } from "./shared/components";

const Forbidden = () => (
  <div className="py-16 text-center"><h1 className="text-xl font-semibold">Not allowed</h1><p className="mt-2 text-sm text-slate-600">You don't have access to that page.</p><Link className="mt-4 inline-block text-blue-700 underline" to="/">Back to home</Link></div>
);

/** /admin lands on the first page this staff member may use (an Admin with no checkboxes gets an explanation instead). */
function AdminHome() {
  const first = useAllowedNav()[0];
  if (first?.to) return <Navigate to={first.to} replace />;
  return <div className="py-16 text-center"><h1 className="text-xl font-semibold">No access granted yet</h1><p className="mt-2 text-sm text-slate-600">Ask the Super Admin to switch on the features you should manage.</p></div>;
}

/**
 * Route table. Three layouts: PublicShell (landing, test series), LearnerShell (study materials, courses, workspace, downloads…),
 * AdminShell (/admin/*). Guards are UX only — the API enforces every permission.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<PublicShell />}>
        <Route index element={<LandingPage />} />
        <Route path="test-series" element={<TestSeriesPage />} />
      </Route>

      <Route path="login" element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route path="oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="change-password" element={<PermissionGuard><ChangePasswordPage /></PermissionGuard>} />

      <Route element={<LearnerShell />}>
        <Route path="study-materials" element={<StudyMaterialsHomePage />} />
        <Route path="courses" element={<CoursesPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="learn" element={<PermissionGuard><LearnPage /></PermissionGuard>} />
        <Route path="downloads" element={<PermissionGuard><DownloadsPage /></PermissionGuard>} />
        <Route path="purchases" element={<PermissionGuard><PurchasesPage /></PermissionGuard>} />
        <Route path="subscriptions" element={<PermissionGuard><SubscriptionsPage /></PermissionGuard>} />
        <Route path="forbidden" element={<Forbidden />} />
      </Route>

      {/* Admin panel: Super Admin (everything) and Admin (only what was granted). Each page repeats the server's permission rule. */}
      <Route path="admin" element={<PermissionGuard staff><AdminShell /></PermissionGuard>}>
        <Route index element={<AdminHome />} />
        <Route path="materials" element={<PermissionGuard permission={["materials.view", "materials.create"]}><AdminMaterialsPage /></PermissionGuard>} />
        <Route path="academic" element={<PermissionGuard permission="academic.manage"><AcademicConfigPage /></PermissionGuard>} />
        <Route path="users" element={<PermissionGuard permission="users.manage"><UsersPage /></PermissionGuard>} />
        <Route path="callback-requests" element={<PermissionGuard permission="callbacks.manage"><CallbackRequestsPage /></PermissionGuard>} />
        <Route path="api-hit-logs" element={<PermissionGuard superOnly><ApiHitLogsPage /></PermissionGuard>} />
        <Route path="settings" element={<PermissionGuard permission={["settings.manage", "site_contact.manage"]}><SettingsPage /></PermissionGuard>} />
      </Route>

      <Route path="plans" element={<Navigate to="/subscriptions" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
