import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { SiteFooter } from "../../site/components/SiteFooter";
import { DevotionalBanner } from "../components/DevotionalBanner";
import { LearnerNav } from "../components/LearnerNav";

/** Chrome for the learner area (study materials home, courses, workspace, downloads…): banner + nav + footer. */
export function LearnerShell() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  const wide = pathname.startsWith("/learn");
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f7fc]">
      <DevotionalBanner />
      <LearnerNav />
      <main className={`mx-auto w-full flex-1 px-4 py-6 md:px-10 ${wide ? "max-w-[1600px]" : "max-w-[1400px]"}`}><Outlet /></main>
      <SiteFooter />
    </div>
  );
}
